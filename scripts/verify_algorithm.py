"""Generate the auditable Stage 1 report from the official CoBRA inputs."""

import json
from pathlib import Path

from cobra_web.domain import DriverSet, Project, Simulation
from cobra_web.engine import calibrate

root = Path(__file__).resolve().parents[1]
data = json.loads((root / "src/cobra_web/data/public_sample.json").read_text())
r = calibrate(
    [Project(**p) for p in data["projects"]],
    DriverSet(**data["drivers"]),
    Simulation(),
    verification=True,
)
report = {
    "source_url": data["source_url"],
    "archive_sha256": data["archive_sha256"],
    "original_cached_accuracy": data["original_accuracy"],
    "verification": r,
    "comparison_note": "原ファイルのキャッシュ指標には計算条件・Seed・α がなく、Excel 側の各案件の計算欄も未計算。数値一致の基準には使わず、原入力と独立逆CDF・最小二乗実装で検証。旧ツールとの完全互換を主張しない。",
}
(root / "docs/algorithm-verification.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2) + "\n"
)
print(
    json.dumps(
        {"alpha": r["alpha"], "metrics": r["metrics"], "rows": r["rows"]},
        ensure_ascii=False,
        indent=2,
    )
)
