import csv
import io

import pytest
from fastapi.testclient import TestClient

from cobra_web.main import PUBLIC, create_app


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path / "test.sqlite3")) as c:
        yield c


def setup_company(client, method="TRADITIONAL"):
    # Analytical fixtures, confined to a pytest temporary database; never shipped as company data.
    levels = {d["id"]: 0 for d in PUBLIC["drivers"]["drivers"]}
    for i in (1, 2, 3):
        result = client.post(
            "/api/projects",
            json={
                "id": f"fixture-{i}",
                "name": f"TEST ONLY {i}",
                "size": i * 100,
                "size_unit": "FP",
                "actual_effort": i * 20 + 2,
                "fixed_effort": 2,
                "levels": levels,
                "method": method,
            },
        )
        assert result.status_code == 201, result.text
    result = client.post(
        "/api/calibrations",
        json={
            "name": "Test model",
            "driver_version": "ipa-template",
            "project_ids": [f"fixture-{i}" for i in (1, 2, 3)],
            "method": method,
        },
    )
    assert result.status_code == 201, result.text
    return result.json(), levels


def make_estimate(client, model, levels):
    result = client.post(
        "/api/estimates",
        json={
            "name": "TEST estimate",
            "model_id": model["id"],
            "size": 200,
            "size_unit": "FP",
            "fixed_effort": 3,
            "levels": levels,
            "trials": 1000,
            "pricing": {"unit_cost": 100, "target_margin": 0.2},
        },
    )
    assert result.status_code == 201, result.text
    return result.json()


def test_full_workflow_and_snapshot_replay_after_changes(client):
    model, levels = setup_company(client)
    assert model["data"]["alpha"] == 0.2
    assert model["data"]["metrics"]["mmre"] == 0
    saved = make_estimate(client, model, levels)
    assert saved["data"]["statistics"]["p80"] == 43
    changed = {
        **PUBLIC["drivers"],
        "name": "Changed",
        "drivers": [{**d, "enabled": i == 0} for i, d in enumerate(PUBLIC["drivers"]["drivers"])],
    }
    assert client.post("/api/drivers", json=changed).status_code == 201
    updated = client.get("/api/state").json()["projects"][0]["data"]
    updated["actual_effort"] = 1000
    client.post("/api/projects", json=updated)
    replay = client.post("/api/estimates/" + saved["id"] + "/replay", json={})
    assert replay.json()["identical"] is True
    read = client.get("/api/estimates/" + saved["id"]).json()
    assert read["data"]["statistics"]["p80"] == 43
    assert read["data"]["model_snapshot"] == saved["data"]["model_snapshot"]
    out = client.get("/api/estimates/" + saved["id"] + "/csv")
    rows = list(csv.DictReader(io.StringIO(out.text)))
    assert len(rows) == 1000 and float(rows[0]["effort_person_month"]) == 43
    assert rows[0]["model_version"] == model["id"]
    # Original project revision and model are still present in the backup.
    backup = client.get("/api/backup").json()["records"]
    assert len(backup["project"]) == 4 and len(backup["model"]) == 1
    assert len(backup["estimate"][0]["data"]["samples"]) == 1000


def test_scenario_costs_and_actual_learning(client):
    model, levels = setup_company(client, method="AI_ASSISTED")
    saved = make_estimate(client, model, levels)
    scenario = client.post(
        "/api/scenarios",
        json={
            "name": "Test AI",
            "phases": [
                {
                    "name": "Coding",
                    "weight": 1,
                    "adoption": 0.5,
                    "improvement": 0.5,
                    "review": 0.1,
                    "rework": 0.1,
                }
            ],
            "tool_cost": 20,
            "infrastructure_cost": 30,
            "other_cost": 10,
            "investment": 100,
        },
    ).json()
    result = client.post(
        "/api/impacts",
        json={"estimate_id": saved["id"], "scenario_id": scenario["id"], "percentile": "p80"},
    )
    assert result.status_code == 201, result.text
    data = result.json()["data"]["result"]
    assert data["after"]["effort"] == 37
    assert data["after"]["cost"] == 3760
    assert data["roi"] == 4.4
    actual = {
        "project_id": "fixture-1",
        "scenario_id": scenario["id"],
        "estimate_id": saved["id"],
        "tools": "TEST",
        "phase": "Coding",
        "adoption": 0.5,
        "usage_hours": 12,
        "actual_effort": 40,
        "review_effort": 2,
        "rework_effort": 1,
        "tool_cost": 20,
        "defects": 3,
    }
    response = client.post("/api/ai-actuals", json=actual)
    assert response.status_code == 201, response.text
    assert response.json()["data"]["model_prediction"] == 34
    assert response.json()["data"]["prediction_error"] == 6
    bad = {**actual, "review_effort": 100}
    assert client.post("/api/ai-actuals", json=bad).status_code == 422


def test_csv_roundtrip_atomicity_and_formula_neutralization(client):
    setup_company(client)
    p = client.get("/api/state").json()["projects"][0]["data"]
    p["name"] = '=HYPERLINK("bad")'
    client.post("/api/projects", json=p)
    exported = client.get("/api/projects/csv").text
    assert "'=HYPERLINK" in exported
    count = len(client.app.state.store.all("project"))
    response = client.post("/api/projects/import", json={"content": exported})
    assert response.status_code == 201, response.text
    assert response.json()["count"] == 3
    assert len(client.app.state.store.all("project")) == count + 3
    invalid = exported.replace("100.0", "NaN", 1)
    before = len(client.app.state.store.all("project"))
    assert client.post("/api/projects/import", json={"content": invalid}).status_code == 422
    assert len(client.app.state.store.all("project")) == before
    assert next(
        r["data"]["name"]
        for r in client.get("/api/state").json()["projects"]
        if r["data"]["id"] == p["id"]
    ).startswith("=")


def test_public_source_not_silently_promoted(client):
    for p in PUBLIC["projects"]:
        assert client.post("/api/projects", json=p).status_code == 201
    response = client.post(
        "/api/calibrations",
        json={
            "name": "invalid",
            "driver_version": "ipa-template",
            "project_ids": [p["id"] for p in PUBLIC["projects"]],
        },
    )
    assert response.status_code == 422 and "COMPANY_ACTUAL" in response.text
    assert not client.app.state.store.all("model")


@pytest.mark.parametrize(
    "page",
    [
        "",
        "dashboard",
        "projects",
        "drivers",
        "calibration",
        "validation",
        "estimate",
        "benchmark",
        "ai",
        "history",
    ],
)
def test_pages_and_no_external_assets(client, page):
    response = client.get("/" + page)
    assert response.status_code == 200
    assert 'lang="ja"' in response.text
    assert "Content-Security-Policy" in response.headers
    assert "https://" not in response.text


def test_local_origin_host_and_body_limits(client):
    assert (
        client.post(
            "/api/projects", json={}, headers={"Origin": "https://attacker.test"}
        ).status_code
        == 403
    )
    assert client.post("/api/projects", content="{}").status_code == 415
    assert client.get("/api/state", headers={"Host": "attacker.test"}).status_code == 400
    assert (
        client.post(
            "/api/projects", content="x" * 2_500_001, headers={"Content-Type": "application/json"}
        ).status_code
        == 413
    )
    assert client.get("/api/estimates/not-here").status_code == 404


def test_missing_level_and_wrong_model_unit_are_rejected(client):
    model, levels = setup_company(client)
    for changes in [
        {"levels": {}},
        {"size_unit": "SLOC"},
        {"size": -1},
        {"levels": {**levels, "1": 1.5}},
    ]:
        response = client.post(
            "/api/estimates",
            json={
                "name": "invalid",
                "model_id": model["id"],
                "size": 200,
                "size_unit": "FP",
                "levels": levels,
                **changes,
            },
        )
        assert response.status_code == 422, response.text


def test_benchmark_company_comparison_and_filters(client):
    setup_company(client)
    comparison = client.get("/api/benchmark/compare").json()
    assert comparison["organization"]["FP"]["n"] == 3
    assert comparison["organization"]["SLOC"]["median"] is None
    assert (
        client.get("/api/benchmark/compare?industry=製造業").json()["organization"]["FP"]["n"] == 0
    )
    assert client.get("/api/benchmark/compare?hours_per_month=NaN").status_code == 422
    benchmark = client.get("/api/state").json()["benchmark"]
    assert benchmark["source_type"] == "IPA_BENCHMARK"
    assert len({r["industry"] for r in benchmark["records"]}) == 4
    sloc = next(
        r for r in benchmark["records"] if r["industry"] == "業種全体" and r["metric"] == "sloc_new"
    )
    assert sloc["n"] == 307 and sloc["median"] == pytest.approx(3.7641321214808245)


def test_model_and_estimate_survive_server_restart(tmp_path):
    path = tmp_path / "durable.sqlite3"
    with TestClient(create_app(path)) as client:
        model, levels = setup_company(client)
        saved = make_estimate(client, model, levels)
    with TestClient(create_app(path)) as client:
        assert client.get("/api/estimates/" + saved["id"]).json()["data"]["statistics"]["p80"] == 43
        assert client.post("/api/estimates/" + saved["id"] + "/replay", json={}).json()["identical"]
