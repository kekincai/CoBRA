import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize("delta,passes", [(1e-16, True), (1e-6, False)])
def test_report_tolerance_detects_material_drift(tmp_path, delta, passes):
    report = json.loads((ROOT / "docs/algorithm-verification.json").read_text())
    report["verification"]["alpha"] += delta
    reference = tmp_path / "report.json"
    reference.write_text(json.dumps(report))
    result = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts/verify_algorithm.py"),
            "--check",
            "--reference",
            str(reference),
        ],
        capture_output=True,
        text=True,
    )
    assert (result.returncode == 0) is passes


def test_source_metadata_requires_exact_match(tmp_path):
    report = json.loads((ROOT / "docs/algorithm-verification.json").read_text())
    report["archive_sha256"] = "different-source"
    reference = tmp_path / "report.json"
    reference.write_text(json.dumps(report))
    result = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts/verify_algorithm.py"),
            "--check",
            "--reference",
            str(reference),
        ],
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0
    assert "archive_sha256" in result.stderr
