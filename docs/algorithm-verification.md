# Stage 1 — 公開データによる計算検証

入力: IPA CoBRA 64 bit「データあり」版の `model_data_Open.xml`。19 Driver / 3案件。
抽出スクリプトは取得 URL、ZIP/XML SHA-256、元の単位を保存する。

10,000試行・Seed 42 / PCG64 の結果:

- α = 0.0007226366751989662 人月/千円
- MMRE = 0.17303218785681682
- STD（ddof=0）= 0.029686743782881327
- Pred.25 = 1.0
- 総誤差率 = 0.17906809396438422

三角分布は独立した逆 CDF 実装、回帰と全 LOOCV fold は `numpy.linalg.lstsq` で照合。
固定工数を含む解析的に解けるケース、Seed 再現性、混在禁止、入力境界、AI 原価の手計算もテストする。

## 原ツールとの相違 / ALG-001

XML と Excel にはキャッシュ済み MMRE 0.175、STD 0.034、Pred.25 1、総誤差率 0.18 がある。
しかし Seed・試行数・α が保存されておらず、Excel の案件別計算欄も「未計算」である。
その数値を期待値としてハードコードしない。原ツールのマクロは実行していないため、完全な互換性は未検証。
本実装は要件 v0.2 の原点回帰・中央値・独立三角分布を採用し、アルゴリズムを `cobra-origin-ols-pcg64-v1` と識別する。
入力データの再現と内部数学の検証が Stage 1 の合格範囲であり、原ツールのビット単位一致を意味しない。

再実行: `uv run pytest tests/test_engine.py` / `uv run python scripts/verify_algorithm.py`
詳細: [JSON report](algorithm-verification.json)

## クロスプラットフォーム CI

BLAS の CPU 別の演算順序により、α や誤差指標の最下位桁（例: α の差 1e-19）が変わることがあります。
`verify_algorithm.py --check` は、出典・設定を一致確認し、計算値を相対 1e-12 / 絶対 1e-15 の許容誤差で照合します。
この検証はアプリ内の同一環境・全 trial のハッシュ一致検証とは別です。許容誤差を超える変化と出典変更はテストで検出します。
