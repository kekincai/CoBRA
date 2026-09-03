import json
from pathlib import Path

import numpy as np
import pytest
from pydantic import ValidationError

from cobra_web.domain import DriverSet, EstimateInput, Pricing, Project, Scenario, Simulation
from cobra_web.engine import ai_impact, calibrate, estimate, overhead

DATA = json.loads((Path(__file__).parents[1] / "src/cobra_web/data/public_sample.json").read_text())


def sample():
    return [Project(**p) for p in DATA["projects"]], DriverSet(**DATA["drivers"])


def test_public_sample_against_independent_inverse_cdf_and_lstsq():
    projects, drivers = sample()
    config = Simulation(seed=42)
    result = calibrate(projects, drivers, config, verification=True)
    # Independent inverse-CDF implementation on the same PCG64 uniforms.
    medians = []
    for p in projects:
        rng = np.random.Generator(np.random.PCG64(42))
        draws = np.zeros(10000)
        for d in sorted(drivers.drivers, key=lambda d: d.id):
            a, b, c = d.experts[0].minimum, d.experts[0].mode, d.experts[0].maximum
            u = rng.random(10000)
            values = np.where(
                u < (b - a) / (c - a),
                a + np.sqrt(u * (b - a) * (c - a)),
                c - np.sqrt((1 - u) * (c - b) * (c - a)),
            )
            draws += values * p.levels[d.id] / 3
        medians.append(np.median(draws))
    x = np.array([p.size * (1 + m) for p, m in zip(projects, medians)])
    y = np.array([p.actual_effort for p in projects])
    assert result["alpha"] == pytest.approx(np.linalg.lstsq(x[:, None], y, rcond=None)[0][0])
    for i, row in enumerate(result["rows"]):
        mask = np.arange(3) != i
        prediction = float(np.linalg.lstsq(x[mask, None], y[mask], rcond=None)[0][0] * x[i])
        assert row["estimate"] == pytest.approx(prediction)
    assert result["size_unit"] == "千円"


def test_fixed_effort_and_leave_one_out_analytical():
    _, ds = sample()
    zero = {d.id: 0 for d in ds.drivers}
    ps = [
        Project(
            id=str(i),
            name=str(i),
            size=i,
            size_unit="FP",
            actual_effort=i * 2 + 5,
            fixed_effort=5,
            levels=zero,
        )
        for i in [1, 2, 3]
    ]
    model = calibrate(ps, ds, Simulation())
    assert model["alpha"] == 2
    assert model["metrics"] == {"mmre": 0, "std": 0, "pred25": 1, "total_error_ratio": 0}
    inputs = EstimateInput(
        name="検証", model_id="x", size=4, size_unit="FP", fixed_effort=5, levels=zero
    )
    result = estimate(model, inputs)
    assert result["statistics"]["p80"] == 13
    assert sum(result["statistics"]["histogram"]["counts"]) == 10000


def test_reproducibility_and_distribution_moments():
    ps, ds = sample()
    conf = Simulation()
    co, _ = overhead(ds, ps[0].levels, conf)
    assert np.array_equal(co, overhead(ds, ps[0].levels, conf)[0])
    assert not np.array_equal(co, overhead(ds, ps[0].levels, Simulation(seed=43))[0])
    mean = sum(
        (e.minimum + e.mode + e.maximum) / 3 * p / 3
        for d in ds.drivers
        for e in d.experts
        for p in [ps[0].levels[d.id]]
    )
    assert co.mean() == pytest.approx(mean, abs=0.01)


@pytest.mark.parametrize("kind", ["DEMO", "SYNTHETIC", "IPA_BENCHMARK", "COBRA_PUBLIC_SAMPLE"])
def test_foreign_data_cannot_calibrate_company(kind):
    ps, ds = sample()
    for p in ps:
        p.source_type = kind
    with pytest.raises(ValueError, match="COMPANY_ACTUAL"):
        calibrate(ps, ds, Simulation())


def test_mixed_units_methods_measurements_and_missing_levels_rejected():
    ps, ds = sample()
    for p in ps:
        p.source_type = "COMPANY_ACTUAL"
    for field, value in [
        ("size_unit", "FP"),
        ("method", "AI_ASSISTED"),
        ("measurement", "different"),
    ]:
        changed = [p.model_copy(deep=True) for p in ps]
        setattr(changed[0], field, value)
        with pytest.raises(ValueError):
            calibrate(changed, ds, Simulation())
    ps[0].levels = {}
    with pytest.raises(ValueError):
        calibrate(ps, ds, Simulation())


@pytest.mark.parametrize(
    "kwargs", [{"trials": 999}, {"trials": 100001}, {"seed": -1}, {"trials": True}]
)
def test_simulation_bounds(kwargs):
    with pytest.raises(ValidationError):
        Simulation(**kwargs)


def test_ai_review_rework_cost_roi_and_fixed_preservation():
    scenario = Scenario(
        name="仮説",
        phases=[
            {
                "name": "Coding",
                "weight": 0.2,
                "adoption": 1,
                "improvement": 0.5,
                "review": 0.1,
                "rework": 0.05,
            },
            {"name": "他工程", "weight": 0.8},
        ],
        tool_cost=10,
        infrastructure_cost=20,
        other_cost=30,
        investment=50,
    )
    r = ai_impact(110, 10, scenario, Pricing(unit_cost=100, target_margin=0.2))
    assert r["after"]["effort"] == 103
    assert r["after"]["cost"] == 10360
    assert r["benefit"] == 640
    assert r["roi"] == 11.8
    assert r["phases"][0]["review"] == 2
    assert (
        ai_impact(110, 10, scenario.model_copy(update={"investment": 0}), Pricing())["roi"] is None
    )


def test_bad_phase_allocation_and_margin_rejected():
    with pytest.raises(ValidationError):
        Scenario(name="bad", phases=[{"name": "a", "weight": 0.8}])
    with pytest.raises(ValidationError):
        Pricing(target_margin=1)
