"""Pure CoBRA calculation. Effort: person-month. Currency: JPY. No I/O."""

import hashlib
import json

import numpy as np

from . import ALGORITHM_VERSION, __version__
from .domain import DriverSet, EstimateInput, Project, Scenario, Simulation


def fingerprint(value):
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False).encode()
    ).hexdigest()


def overhead(drivers: DriverSet, levels: dict, config: Simulation):
    active = sorted((d for d in drivers.drivers if d.enabled), key=lambda d: d.id)
    if any(d.id not in levels for d in active):
        raise ValueError("有効な全 Cost Driver の Level 評価が必要です。")
    if any(type(v) is not int or v not in range(4) for v in levels.values()):
        raise ValueError("Level は 0〜3 の整数で指定してください。")
    rng = np.random.Generator(np.random.PCG64(config.seed))
    total = np.zeros(config.trials)
    contributions = []
    for d in active:
        # Equal-weight expert pooling of each triangle parameter; recorded in model version.
        low, mode, high = np.mean([[e.minimum, e.mode, e.maximum] for e in d.experts], axis=0)
        sample = (
            np.full(config.trials, low)
            if low == high
            else rng.triangular(low, mode, high, config.trials)
        )
        component = sample * (levels[d.id] / 3)
        total += component
        contributions.append({"id": d.id, "name": d.name, "mean": float(component.mean())})
    return total, sorted(contributions, key=lambda d: d["mean"], reverse=True)


def fit(x, y):
    return float(np.dot(x, y) / np.dot(x, x))


def calibrate(
    projects: list[Project],
    drivers: DriverSet,
    config: Simulation,
    *,
    verification=False,
    method="TRADITIONAL",
):
    selected = sorted((p for p in projects if not p.excluded), key=lambda p: p.id)
    if len(selected) < 3 or len({p.id for p in selected}) != len(selected):
        raise ValueError("異なる対象案件が 3 件以上必要です。")
    allowed = "COBRA_PUBLIC_SAMPLE" if verification else "COMPANY_ACTUAL"
    if any(p.source_type != allowed for p in selected):
        raise ValueError(
            "実運用モデルは COMPANY_ACTUAL のみ使用できます。公開データは検証専用です。"
        )
    if any(p.method != method for p in selected):
        raise ValueError("従来開発と AI 開発を同じモデルに混在させることはできません。")
    if len({p.size_unit for p in selected}) != 1 or len({p.measurement for p in selected}) != 1:
        raise ValueError("規模単位・規模測定方法を統一してください。")
    medians = [float(np.median(overhead(drivers, p.levels, config)[0])) for p in selected]
    x = np.array([p.size * (1 + co) for p, co in zip(selected, medians)])
    y = np.array([p.actual_effort - p.fixed_effort for p in selected])
    alpha = fit(x, y)
    rows = []
    for i, p in enumerate(selected):
        mask = np.arange(len(x)) != i
        fold_alpha = fit(x[mask], y[mask])
        prediction = fold_alpha * x[i]
        rows.append(
            {
                "id": p.id,
                "name": p.name,
                "size": p.size,
                "overhead_median": medians[i],
                "adjusted_size": float(x[i]),
                "actual_scaling": float(y[i]),
                "fixed_effort": p.fixed_effort,
                "fitted": float(alpha * x[i]),
                "loo_alpha": fold_alpha,
                "estimate": float(prediction),
                "mre": float(abs(y[i] - prediction) / y[i]),
            }
        )
    errors = np.array([r["mre"] for r in rows])
    return {
        "alpha": alpha,
        "rows": rows,
        "metrics": {
            "mmre": float(errors.mean()),
            "std": float(errors.std(ddof=0)),
            "pred25": float((errors <= 0.25).mean()),
            "total_error_ratio": float(
                sum(abs(r["actual_scaling"] - r["estimate"]) for r in rows) / y.sum()
            ),
        },
        "warnings": ["対象案件が 10 件未満です。精度評価の不確実性に注意してください。"]
        if len(selected) < 10
        else [],
        "size_unit": selected[0].size_unit,
        "method": method,
        "source_type": allowed,
        "drivers": drivers.model_dump(),
        "projects": [p.model_dump(mode="json") for p in selected],
        "simulation": config.model_dump(),
        "algorithm_version": ALGORITHM_VERSION,
        "application_version": __version__,
        "numpy_version": np.__version__,
    }


def summarize(samples):
    quantiles = {
        f"p{q}": float(np.percentile(samples, q, method="linear"))
        for q in [10, 25, 50, 75, 80, 90, 95]
    }
    counts, edges = np.histogram(samples, bins=40)
    order = np.sort(samples)
    indices = np.unique(np.linspace(0, len(order) - 1, 201, dtype=int))
    return {
        "mean": float(np.mean(samples)),
        "median": quantiles["p50"],
        "std": float(np.std(samples)),
        **quantiles,
        "histogram": {"counts": counts.tolist(), "edges": edges.tolist()},
        "cdf": [[float(order[i]), float((i + 1) / len(order))] for i in indices],
    }


def price(effort, pricing, extra=0):
    labor = effort * pricing.unit_cost
    cost = labor + pricing.management_cost + pricing.infrastructure_cost + extra
    quote = (cost + pricing.contingency) / (1 - pricing.target_margin)
    return {
        "effort": effort,
        "labor_cost": labor,
        "cost": cost,
        "price": quote,
        "gross_profit": quote - cost,
        "margin": (quote - cost) / quote if quote else 0,
    }


def estimate(model: dict, inputs: EstimateInput):
    if inputs.size_unit != model["size_unit"]:
        raise ValueError("モデルと見積りの規模単位が一致しません。")
    if model["algorithm_version"] != ALGORITHM_VERSION:
        raise ValueError(
            "このアルゴリズム版の再計算は現在の実行環境でサポートされていません。保存結果をご覧ください。"
        )
    drivers = DriverSet.model_validate(model["drivers"])
    co, contributions = overhead(drivers, inputs.levels, inputs)
    samples = model["alpha"] * inputs.size * (1 + co) + inputs.fixed_effort
    stats = summarize(samples)
    warnings = list(model["warnings"])
    if model["source_type"] != "COMPANY_ACTUAL":
        warnings.append("公開サンプルによる検証結果です。実案件の見積りには使用しないでください。")
    sizes = [p["size"] for p in model["projects"]]
    if not min(sizes) <= inputs.size <= max(sizes):
        warnings.append("学習案件の規模範囲外です。規模の妥当性を別途確認してください。")
    for field, label in [
        ("industry", "業種"),
        ("technology", "技術"),
        ("project_type", "開発種別"),
        ("method", "開発方式"),
    ]:
        value = getattr(inputs, field)
        if value and value not in {p[field] for p in model["projects"]}:
            warnings.append(f"{label}がモデルの実績範囲にありません。")
    return {
        "statistics": stats,
        "pricing": {key: price(stats[key], inputs.pricing) for key in ["p50", "p80", "p90"]},
        "contributions": contributions,
        "warnings": warnings,
        "sample_hash": hashlib.sha256(samples.astype("<f8").tobytes()).hexdigest(),
        "samples": samples.tolist(),
        "input": inputs.model_dump(),
        "algorithm_version": ALGORITHM_VERSION,
        "application_version": __version__,
        "numpy_version": np.__version__,
    }


def ai_impact(baseline: float, fixed_effort: float, scenario: Scenario, pricing):
    scaling = baseline - fixed_effort
    if scaling < 0:
        raise ValueError("固定工数が Baseline 工数を超えています。")
    rows = []
    for p in scenario.phases:
        base = scaling * p.weight
        applied = base * p.adoption
        review_base = applied if scenario.review_basis == "AI_APPLIED" else base
        reduction = applied * p.improvement
        review, rework = review_base * p.review, review_base * p.rework
        after = base - reduction + review + rework + p.fixed
        rows.append(
            {
                "name": p.name,
                "baseline": base,
                "reduction": reduction,
                "review": review,
                "rework": rework,
                "fixed": p.fixed,
                "after": after,
            }
        )
    total = sum(r["after"] for r in rows) + fixed_effort
    extra = scenario.tool_cost + scenario.infrastructure_cost + scenario.other_cost
    before, after = price(baseline, pricing), price(total, pricing, extra)
    benefit = before["cost"] - after["cost"]
    investment = scenario.investment
    return {
        "phases": rows,
        "unchanged_fixed_effort": fixed_effort,
        "baseline": before,
        "after": after,
        "ai_cost": extra,
        "benefit": benefit,
        "investment": investment,
        "net_benefit": benefit - investment,
        "roi": (benefit - investment) / investment if investment else None,
        "effort_reduction_rate": 1 - total / baseline if baseline else 0,
        "fixed_price_gross_profit": before["price"] - after["cost"],
        "review_basis": scenario.review_basis,
    }
