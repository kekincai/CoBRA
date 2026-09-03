"""Generate/check the Stage 1 report without assuming identical BLAS CPU reductions."""

import argparse
import json
import math
from pathlib import Path

from cobra_web.domain import DriverSet, Project, Simulation
from cobra_web.engine import calibrate

ROOT = Path(__file__).resolve().parents[1]


def make_report():
    data = json.loads((ROOT / "src/cobra_web/data/public_sample.json").read_text())
    result = calibrate(
        [Project(**p) for p in data["projects"]],
        DriverSet(**data["drivers"]),
        Simulation(),
        verification=True,
    )
    return {
        "source_url": data["source_url"],
        "archive_sha256": data["archive_sha256"],
        "original_cached_accuracy": data["original_accuracy"],
        "verification": result,
        "comparison_note": "原ファイルのキャッシュ指標には計算条件・Seed・α がなく、Excel 側の各案件の計算欄も未計算。数値一致の基準には使わず、原入力と独立逆CDF・最小二乗実装で検証。旧ツールとの完全互換を主張しない。",
    }


def compare(actual, expected, path="report"):
    if isinstance(expected, dict):
        assert isinstance(actual, dict) and actual.keys() == expected.keys(), path
        for key in expected:
            compare(actual[key], expected[key], f"{path}.{key}")
    elif isinstance(expected, list):
        assert isinstance(actual, list) and len(actual) == len(expected), path
        for i, (a, e) in enumerate(zip(actual, expected)):
            compare(a, e, f"{path}[{i}]")
    elif isinstance(expected, float) and path.startswith("report.verification"):
        assert isinstance(actual, (int, float)) and math.isfinite(actual), path
        assert math.isclose(actual, expected, rel_tol=1e-12, abs_tol=1e-15), (
            f"{path}: {actual} != {expected}"
        )
    else:
        assert actual == expected, f"{path}: {actual!r} != {expected!r}"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Compare without changing the report")
    parser.add_argument("--reference", type=Path, default=ROOT / "docs/algorithm-verification.json")
    args = parser.parse_args()
    report = make_report()
    if args.check:
        compare(report, json.loads(args.reference.read_text()))
        print("Official sample report verified: relative tolerance 1e-12, absolute 1e-15.")
    else:
        args.reference.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
        result = report["verification"]
        print(json.dumps({"alpha": result["alpha"], "metrics": result["metrics"]}, indent=2))


if __name__ == "__main__":
    main()
