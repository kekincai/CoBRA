# Contributing

変更は Issue → 作業ブランチ → Pull Request で管理します。小さく、目的が分かるコミットを作成してください。

```sh
uv sync --locked
uv run ruff check .
uv run ruff format --check .
node --check src/cobra_web/static/app.js
uv run pytest -q
uv run python scripts/verify_algorithm.py
uv build
```

CI は Python 3.12 / 3.13 で実行します。公開サンプルの検証レポートが変わった場合、理由を説明してください。

計算の変更には独立した数値根拠が必要です。単なるスナップショットの更新では受け入れません。
Algorithm Version、単位、固定工数、CV の分母、三角分布の熟練者統合方針、乱数順序をレビュー対象に含めます。

UI は日本語。キーボード操作、モバイル、エラー状態、空のデータ状態を確認してください。
JavaScript/CSS の整形には `npm exec --yes --package=prettier@3.9.6 -- prettier --write src/cobra_web/static/app.js src/cobra_web/static/app.css` を使えます。

実績・顧客名・データベース・バックアップ・秘密情報は公開 Issue / PR に含めないでください。
テストの解析用 fixture は一時 DB にのみ作成し、Company Historical Data として配布しないでください。
