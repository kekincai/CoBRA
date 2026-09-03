import csv
import hashlib
import io
import json
import os
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field, ValidationError
from starlette.middleware.trustedhost import TrustedHostMiddleware

from . import __version__
from .domain import (
    AIActual,
    CalibrationInput,
    DriverSet,
    EstimateInput,
    Pricing,
    Project,
    Scenario,
    Simulation,
)
from .engine import ai_impact, calibrate, estimate, fingerprint
from .store import Store

BASE = Path(__file__).parent
PUBLIC = json.loads((BASE / "data/public_sample.json").read_text())
BENCHMARK = json.loads((BASE / "data/benchmark.json").read_text())
PAGES = {
    "dashboard": "ダッシュボード",
    "projects": "実績プロジェクト",
    "drivers": "コストドライバー",
    "calibration": "モデル校正",
    "validation": "精度検証",
    "estimate": "新規見積り",
    "benchmark": "日本ベンチマーク",
    "ai": "AI 導入効果",
    "history": "見積り履歴",
}


@lru_cache
def public_model():
    result = calibrate(
        [Project(**p) for p in PUBLIC["projects"]],
        DriverSet(**PUBLIC["drivers"]),
        Simulation(),
        verification=True,
    )
    result.update(
        name="IPA 公開サンプル検証モデル",
        driver_version="ipa-template",
        expert_version="ipa-template",
        scope_notes="公開サンプルによる検証専用",
    )
    return {"id": "public-v1", "created_at": "2017-07-20T00:00:00+00:00", "data": result}


def presets():
    names = [
        "現行システム調査",
        "要件定義",
        "基本設計",
        "詳細設計",
        "Coding",
        "Unit Test",
        "Integration Test",
        "System Test",
        "Review",
        "Project Management",
        "顧客対応",
    ]
    weights = [0.05, 0.10, 0.10, 0.10, 0.20, 0.10, 0.08, 0.07, 0.07, 0.08, 0.05]
    output = []
    for kind, adoption, improvement in [
        ("Baseline", 0, 0),
        ("Conservative", 0.3, 0.2),
        ("Standard", 0.5, 0.3),
        ("Aggressive", 0.7, 0.5),
    ]:
        phases = [
            {
                "name": n,
                "weight": w,
                "adoption": adoption if i < 9 else 0,
                "improvement": improvement if i < 9 else 0,
                "review": 0.08 if adoption else 0,
                "rework": 0.04 if adoption else 0,
                "fixed": 0,
            }
            for i, (n, w) in enumerate(zip(names, weights))
        ]
        output.append(
            {
                "id": f"preset-{kind}",
                "created_at": None,
                "data": Scenario(name=kind, category=kind, phases=phases).model_dump(),
            }
        )
    return output


class CSVInput(BaseModel):
    content: str = Field(max_length=2_000_000)


class ImpactInput(BaseModel):
    estimate_id: str
    scenario_id: str
    percentile: str = Field(default="p80", pattern=r"^p(50|80|90)$")


def create_app(db_path=None):
    app = FastAPI(title="CoBRA Web", version=__version__)
    app.add_middleware(
        TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "[::1]", "testserver"]
    )
    store = Store(db_path or os.environ.get("COBRA_DB_PATH", "data/company/cobra.sqlite3"))
    app.state.store = store
    templates = Jinja2Templates(directory=BASE / "templates")
    app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")

    @app.middleware("http")
    async def local_protection(request, call_next):
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            origin = request.headers.get("origin")
            if origin and urlparse(origin).netloc != request.headers.get("host"):
                return JSONResponse(
                    {"detail": "異なる Origin からの書き込みは許可されていません。"},
                    status_code=403,
                )
            if not request.headers.get("content-type", "").startswith("application/json"):
                return JSONResponse({"detail": "JSON リクエストが必要です。"}, status_code=415)
            # Bound chunked as well as Content-Length bodies before parsing.
            body = bytearray()
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body) > 2_500_000:
                    return JSONResponse(
                        {"detail": "入力サイズが上限を超えています。"}, status_code=413
                    )
            request._body = bytes(body)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        )
        response.headers["Cache-Control"] = (
            "no-store" if not request.url.path.startswith("/static/") else "no-cache"
        )
        return response

    @app.exception_handler(ValueError)
    async def value_error(request, exc):
        return JSONResponse({"detail": str(exc)}, status_code=422)

    @app.exception_handler(KeyError)
    async def key_error(request, exc):
        return JSONResponse({"detail": str(exc)}, status_code=404)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        errors = [f"{'.'.join(str(x) for x in e['loc'][1:])}: {e['msg']}" for e in exc.errors()]
        return JSONResponse({"detail": " / ".join(errors)}, status_code=422)

    def models():
        return store.all("model") + [public_model()]

    def get_model(identifier):
        return public_model() if identifier == "public-v1" else store.get(identifier, "model")

    def get_drivers(identifier):
        return (
            {"id": "ipa-template", "data": PUBLIC["drivers"]}
            if identifier == "ipa-template"
            else store.get(identifier, "drivers")
        )

    def get_scenario(identifier):
        return next((s for s in presets() if s["id"] == identifier), None) or store.get(
            identifier, "scenario"
        )

    @app.get("/api/health")
    def health():
        return {"status": "ok", "version": __version__}

    @app.get("/api/state")
    def state():
        saved = store.all("estimate")
        for entry in saved:
            entry["data"].pop("samples", None)
            entry["data"].pop("model_snapshot", None)
        return {
            "version": __version__,
            "projects": store.all("project", latest=True),
            "public_projects": [Project(**p).model_dump(mode="json") for p in PUBLIC["projects"]],
            "drivers": store.all("drivers")
            + [{"id": "ipa-template", "created_at": None, "data": PUBLIC["drivers"]}],
            "models": models(),
            "estimates": saved,
            "scenarios": store.all("scenario") + presets(),
            "impacts": store.all("impact"),
            "ai_actuals": store.all("ai-actual"),
            "benchmark": BENCHMARK,
        }

    @app.post("/api/projects", status_code=201)
    def save_project(project: Project):
        return store.add("project", project.model_dump(mode="json"))

    @app.post("/api/drivers", status_code=201)
    def save_drivers(drivers: DriverSet):
        return store.add("drivers", drivers.model_dump())

    @app.post("/api/calibrations", status_code=201)
    def save_calibration(inputs: CalibrationInput):
        current = {r["data"]["id"]: r["data"] for r in store.all("project", latest=True)}
        if len(set(inputs.project_ids)) != len(inputs.project_ids):
            raise ValueError("案件 ID が重複しています。")
        selected = [Project(**current[k]) for k in inputs.project_ids]
        drivers = DriverSet(**get_drivers(inputs.driver_version)["data"])
        result = calibrate(
            selected,
            drivers,
            Simulation(trials=inputs.trials, seed=inputs.seed),
            method=inputs.method,
        )
        result.update(
            name=inputs.name,
            driver_version=inputs.driver_version,
            expert_version=inputs.driver_version,
            scope_notes=inputs.scope_notes,
        )
        if inputs.driver_version == "ipa-template":
            result["warnings"].append(
                "熟練者評価が IPA の初期テンプレートです。組織固有の評価に更新してください。"
            )
        result["input_hash"] = fingerprint(inputs.model_dump())
        return store.add("model", result)

    @app.post("/api/estimates", status_code=201)
    def save_estimate(inputs: EstimateInput):
        model = get_model(inputs.model_id)
        result = estimate(model["data"], inputs)
        result["model_snapshot"] = model
        result["source_type"] = model["data"]["source_type"]
        result["input_hash"] = fingerprint(inputs.model_dump())
        entry = store.add("estimate", result)
        entry["data"].pop("samples")
        return entry

    @app.get("/api/estimates/{identifier}")
    def get_estimate(identifier: str):
        entry = store.get(identifier, "estimate")
        entry["data"].pop("samples")
        return entry

    @app.post("/api/estimates/{identifier}/replay")
    def replay(identifier: str):
        saved = store.get(identifier, "estimate")["data"]
        result = estimate(saved["model_snapshot"]["data"], EstimateInput(**saved["input"]))
        return {
            "identical": result["sample_hash"] == saved["sample_hash"],
            "saved_hash": saved["sample_hash"],
            "replayed_hash": result["sample_hash"],
            "statistics": result["statistics"],
        }

    @app.get("/api/estimates/{identifier}/csv")
    def export_trials(identifier: str):
        saved = store.get(identifier, "estimate")["data"]
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(
            ["trial", "effort_person_month", "model_version", "seed", "algorithm_version"]
        )
        writer.writerows(
            (
                i + 1,
                v,
                saved["input"]["model_id"],
                saved["input"]["seed"],
                saved["algorithm_version"],
            )
            for i, v in enumerate(saved["samples"])
        )
        return Response(
            output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="estimate-trials.csv"'},
        )

    @app.post("/api/scenarios", status_code=201)
    def save_scenario(scenario: Scenario):
        return store.add("scenario", scenario.model_dump())

    @app.post("/api/impacts", status_code=201)
    def impact(inputs: ImpactInput):
        saved = store.get(inputs.estimate_id, "estimate")["data"]
        scenario_record = get_scenario(inputs.scenario_id)
        scenario = Scenario(**scenario_record["data"])
        config = EstimateInput(**saved["input"])
        result = ai_impact(
            saved["statistics"][inputs.percentile], config.fixed_effort, scenario, config.pricing
        )
        return store.add(
            "impact",
            {
                "input": inputs.model_dump(),
                "scenario_snapshot": scenario_record,
                "result": result,
                "source_type": saved["source_type"],
                "application_version": __version__,
            },
        )

    @app.post("/api/ai-actuals", status_code=201)
    def save_actual(inputs: AIActual):
        project = next(
            (
                r["data"]
                for r in store.all("project", latest=True)
                if r["data"]["id"] == inputs.project_id
            ),
            None,
        )
        if (
            project is None
            or project["source_type"] != "COMPANY_ACTUAL"
            or project["method"] != "AI_ASSISTED"
        ):
            raise ValueError("AI 実績は自社の AI_ASSISTED 案件に紐づけてください。")
        saved = store.get(inputs.estimate_id, "estimate")["data"]
        if saved["source_type"] != "COMPANY_ACTUAL":
            raise ValueError("公開例の見積りを自社 AI 実績に紐づけることはできません。")
        scenario = get_scenario(inputs.scenario_id)
        if inputs.phase not in {p["name"] for p in scenario["data"]["phases"]}:
            raise ValueError("Scenario に存在する工程名を指定してください。")
        prediction = ai_impact(
            saved["statistics"]["p80"],
            saved["input"]["fixed_effort"],
            Scenario(**scenario["data"]),
            Pricing(**saved["input"]["pricing"]),
        )
        predicted_phase = next(
            p["after"] for p in prediction["phases"] if p["name"] == inputs.phase
        )
        return store.add(
            "ai-actual",
            {
                **inputs.model_dump(),
                "model_prediction": predicted_phase,
                "actual_result": inputs.actual_effort,
                "prediction_error": inputs.actual_effort - predicted_phase,
                "scenario_snapshot": scenario,
                "project_snapshot": project,
            },
        )

    @app.get("/api/projects/csv")
    def export_projects(template: bool = False):
        output = io.StringIO()
        fields = list(Project.model_fields)
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        if not template:
            for record in reversed(store.all("project", latest=True)):
                row = record["data"]
                row["levels"] = json.dumps(row["levels"], ensure_ascii=False)
                # Neutralize spreadsheet formulas; importer reverses only this exact prefix.
                row = {
                    k: (
                        "'" + v
                        if isinstance(v, str) and v.startswith(("=", "+", "-", "@", "\t", "\r"))
                        else v
                    )
                    for k, v in row.items()
                }
                writer.writerow(row)
        return Response(
            "\ufeff" + output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="projects.csv"'},
        )

    @app.post("/api/projects/import", status_code=201)
    def import_projects(inputs: CSVInput):
        reader = csv.DictReader(io.StringIO(inputs.content.lstrip("\ufeff")))
        if not reader.fieldnames or "levels" not in reader.fieldnames:
            raise ValueError(
                "CSV ヘッダーに levels などの必須列が必要です。テンプレートをご利用ください。"
            )
        output = []
        for line, row in enumerate(reader, start=2):
            if line > 1001:
                raise ValueError("CSV は 1,000 案件以内にしてください。")
            try:
                row = {
                    k: (
                        v[1:]
                        if isinstance(v, str) and len(v) > 1 and v[0] == "'" and v[1] in "=+-@\t\r"
                        else v
                    )
                    for k, v in row.items()
                }
                row["levels"] = json.loads(row["levels"])
                for optional in ("start", "end", "duration_months"):
                    if not row.get(optional):
                        row.pop(optional, None)
                output.append(Project.model_validate(row).model_dump(mode="json"))
            except (ValueError, TypeError, ValidationError) as exc:
                raise ValueError(f"CSV {line} 行目: {exc}") from exc
        if not output or len({p["id"] for p in output}) != len(output):
            raise ValueError("CSV が空、または案件 ID が重複しています。")
        return {"count": len(store.add_many("project", output))}

    @app.get("/api/backup")
    def backup():
        data = {
            kind: store.all(kind)
            for kind in [
                "project",
                "drivers",
                "model",
                "estimate",
                "scenario",
                "impact",
                "ai-actual",
            ]
        }
        return Response(
            json.dumps({"application_version": __version__, "records": data}, ensure_ascii=False),
            media_type="application/json",
            headers={"Content-Disposition": 'attachment; filename="cobra-private-backup.json"'},
        )

    @app.get("/api/benchmark/compare")
    def benchmark_compare(
        industry: str = "業種全体", project_type: str = "新規開発", hours_per_month: float = 160
    ):
        if not np.isfinite(hours_per_month) or not 1 <= hours_per_month <= 744:
            raise ValueError("1 人月の換算時間は 1〜744 人時で指定してください。")
        values = {"SLOC": [], "FP": [], "duration": []}
        for rec in store.all("project", latest=True):
            p = Project(**rec["data"])
            if (
                p.source_type != "COMPANY_ACTUAL"
                or p.excluded
                or p.method != "TRADITIONAL"
                or p.project_type != project_type
                or (industry != "業種全体" and p.industry != industry)
            ):
                continue
            effort_hours = p.actual_effort * hours_per_month
            if p.size_unit in ("SLOC", "KSLOC"):
                values["SLOC"].append(
                    p.size * (1000 if p.size_unit == "KSLOC" else 1) / effort_hours
                )
            elif p.size_unit == "FP":
                values["FP"].append(p.size / effort_hours)
            if p.duration_months:
                values["duration"].append(p.duration_months)
        return {
            "industry": industry,
            "project_type": project_type,
            "hours_per_month": hours_per_month,
            "organization": {
                k: {"n": len(v), "median": float(np.median(v)) if v else None}
                for k, v in values.items()
            },
        }

    @app.get("/", response_class=HTMLResponse)
    @app.get("/{page}", response_class=HTMLResponse)
    def page(request: Request, page: str = "dashboard"):
        if page not in PAGES:
            raise HTTPException(404, "ページが見つかりません。")
        return templates.TemplateResponse(
            request=request,
            name="app.html",
            context={
                "page": page,
                "pages": PAGES,
                "title": PAGES[page],
                "asset_version": hashlib.sha256(
                    (BASE / "static/app.js").read_bytes() + (BASE / "static/app.css").read_bytes()
                ).hexdigest()[:12],
                "version": __version__,
            },
        )

    return app


app = create_app()
