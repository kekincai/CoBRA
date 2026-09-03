# Third-party data and software

本プロジェクトは IPA の公式製品ではありません。

| 対象 | 出所・版 | 条件・保存場所 |
|---|---|---|
| CoBRA 19 Driver / 3 ケース | [IPA CoBRA ツール 64 bit データあり](https://www.ipa.go.jp/archive/digital/tools/cobra.html), 2017 | Copyright (c) 2017 Information-technology Promotion Agency, Japan (IPA). MIT。`src/cobra_web/data/IPA-CoBRA-LICENSE.txt` |
| 日本ベンチマーク集計値 | [IPA ソフトウェア開発分析データ集2022](https://www.ipa.go.jp/digital/software-survey/metrics/metrics2022.html), グラフデータ 2023-01-17 | Copyright 2022 IPA。`src/cobra_web/data/IPA-Benchmark-TERMS.txt` |
| Apache ECharts | [Apache ECharts](https://echarts.apache.org/), 6.1.0 | Apache-2.0。`src/cobra_web/static/vendor/ECHARTS-LICENSE.txt` / `ECHARTS-NOTICE.txt` |

CoBRA の XML は元の数値・判定基準・単位を JSON へ抽出しました。キャッシュされた精度値は別項目で保持しています。
Benchmark は公開集計セルを JSON 化し、開発期間のみ同梱の公開点データの数値列から分位点を再集計しています。
フィット曲線の値を観測値として利用せず、画像からの読み取り・合成・補間によるデータ補充は行いません。
加工箇所の責任主体は CoBRA Web contributors です。加工部分について著作者人格権を行使しません。
元データの著作権条件は、アプリケーションコードの MIT ライセンスとは別に適用されます。
取得 URL と ZIP SHA-256、元ファイル・シート・セルは JSON に記録しています。
