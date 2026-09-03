# CoBRA Web 見積・AI導入効果分析システム

## 要件・機能仕様書

**文書バージョン:** 0.2\
**作成日:** 2026-09-03\
**対象:** MVP ～ AI導入効果分析版\
**位置付け:**
要件・機能仕様書（実装方式・クラス設計・関数設計は本書の対象外）

------------------------------------------------------------------------

# 1. 背景

ソフトウェア開発の見積りは、開発規模だけでは決定できない。

同一規模のシステムであっても、要求の不確実性、顧客との調整難易度、開発チームの経験、品質要求、開発期間制約等により実績工数は大きく変動する。

また、生成AIの導入により
Coding、設計書作成、既存システム調査、テスト作成等の生産性が変化し始めている一方、

> 「AIで Coding が50%速くなったため、案件価格も50%下げられる」

とは限らない。

本システムでは CoBRA（Cost estimation, Benchmarking and Risk
Assessment）法を基礎として、

-   組織固有の開発生産性
-   プロジェクト固有の工数変動要因
-   見積りの不確実性
-   日本市場の Benchmark
-   生成AI導入による工程別生産性変化
-   AI利用に伴う追加レビュー・手戻り・ツール費用

を分離して管理し、ソフトウェア開発工数・原価・見積価格への影響を定量化する。

------------------------------------------------------------------------

# 2. システム目的

本システムの目的は以下の4点とする。

## 2.1 CoBRAによる見積り

過去プロジェクト実績と熟練者の知識から組織固有の CoBRA Model
を構築し、新規案件の開発工数を見積る。

## 2.2 見積リスクの可視化

一点の見積値だけでなく、Monte Carlo Simulation
により工数分布を生成し、見積りの不確実性を可視化する。

## 2.3 日本市場との比較

IPA が公開する日本のソフトウェア開発統計を Benchmark
として保持し、自組織の生産性・工数構造との比較を可能にする。

## 2.4 AI導入効果分析

従来開発と AI-Assisted Development を比較し、

-   工数
-   原価
-   見積価格
-   粗利
-   AI費用
-   ROI

への影響を工程別に分析する。

------------------------------------------------------------------------

# 3. 対象範囲

## 3.1 MVP対象

-   Historical Project 管理
-   Cost Driver 定義
-   Expert Assessment
-   CoBRA Model Calibration
-   Cross Validation
-   新規案件見積
-   Monte Carlo Simulation
-   見積分布表示
-   日本 Benchmark
-   AI Scenario 比較
-   CSV Import / Export

## 3.2 対象外

初期リリースでは以下を実装しない。

-   LLM による自動見積
-   ソースコードからの自動 FP 算定
-   Cost Driver の AI 自動判定
-   Jira / GitHub 自動連携
-   機械学習によるブラックボックス見積
-   Cost Driver 間の Causal Network
-   大規模 SaaS 向けマルチテナント機能

------------------------------------------------------------------------

# 4. CoBRA法の採用範囲

本システムの初期 CoBRA Model は、IPA / CoBRA研究会で公開されている日本版
CoBRA の基本モデルを基準とする。

基本式を以下とする。

\[ C = `\alpha `{=tex}`\times `{=tex}S `\times `{=tex}(1 +
`\sum`{=tex}\_{i=1}\^{n} CO_i) \]

  ------------------------------------------------------------------------------------------------
  記号                                定義
  ----------------------------------- ------------------------------------------------------------
  \(C\)                               開発コスト。本システムでは原則として開発工数

  (`\alpha`{=tex})                    工数変動要因が存在しない理想状態における単位規模当たり工数

  \(S\)                               ソフトウェア開発規模

  (CO_i)                              第 i Cost Driver による Cost Overhead

  (`\sum `{=tex}CO_i)                 当該案件の総 Cost Overhead
  ------------------------------------------------------------------------------------------------

本システムでは Cost Driver
を原則として「工数を増加させる要因」として定義する。

AIによる工数削減効果は、初期版では Cost Driver
に負値として混在させず、後述する AI Productivity Model として分離する。

------------------------------------------------------------------------

# 5. ソフトウェア規模

## 5.1 対応単位

以下の規模指標を利用可能とする。

-   FP（Function Point）
-   SLOC
-   KSLOC
-   組織独自規模指標

## 5.2 モデル内統一

一つの CoBRA Model 内では同一の規模指標を使用しなければならない。

FP と SLOC 等の異なる規模指標を同一 Calibration Model
内で混在させてはならない。

## 5.3 CoBRAの責任範囲

CoBRA は規模そのものを推定する方法ではない。

したがって本システムは、

> 規模見積りの妥当性

と

> 規模から工数を推定する CoBRA Model の妥当性

を別々に管理する。

------------------------------------------------------------------------

# 6. Cost Driver

## 6.1 定義

Cost Driver は、開発規模以外で開発工数を増加させる要因とする。

Cost Driver は組織ごとに定義可能とする。

例：

-   要求仕様の不明確性
-   要求変更頻度
-   顧客とのコミュニケーション難易度
-   開発期間制約
-   システム複雑度
-   非機能要件
-   品質要求
-   開発チームの業務知識不足
-   技術経験不足
-   既存システム理解不足

## 6.2 Level

各 Cost Driver は Level 0 ～ Level 3 の4段階で評価する。

    Level 意味                     Level Factor
  ------- ---------------------- --------------
        0 当該要因の影響がない                0
        1 小さい                            1/3
        2 中程度                            2/3
        3 最大                                1

各 Level の判定条件は Cost Driver
ごとに文章で明確に定義しなければならない。

例：

**開発期間の制約**

    Level 定義例
  ------- ---------------------------
        0 標準工期から10%未満の短縮
        1 10%以上20%未満の短縮
        2 20%以上30%未満の短縮
        3 30%以上の短縮

Level の意味を単に「低・中・高」としてはならない。

------------------------------------------------------------------------

# 7. Expert Assessment

## 7.1 目的

Cost Driver
の最大影響量を、当該組織の開発経験を持つ複数の熟練者の知識から定量化する。

## 7.2 評価値

各 Cost Driver の Level 3 について以下の3値を定義する。

-   Minimum
-   Most Likely
-   Maximum

単位は工数増加率とする。

例：

  Driver                 Minimum   Most Likely   Maximum
  -------------------- --------- ------------- ---------
  要求仕様の不明確性         10%           25%       45%

## 7.3 分布

上記3値から三角分布を構成する。

\[ X_i `\sim `{=tex}Triangular(Min_i, Mode_i, Max_i) \]

ここで (X_i) は当該 Cost Driver が Level 3 の場合の Cost Overhead Sample
である。

## 7.4 Level補正

案件の Driver Level を (L_i) とすると、

\[ F(L_i)=
```{=tex}
\begin{cases}
0 & L_i=0 \\
1/3 & L_i=1 \\
2/3 & L_i=2 \\
1 & L_i=3
\end{cases}
```
\]

各 Simulation Trial における Cost Overhead は、

\[ CO_i=X_i `\times `{=tex}F(L_i) \]

とする。

------------------------------------------------------------------------

# 8. Cost Overhead Simulation

1回の Simulation Trial における総 Cost Overhead は、

\[ CO\_{total}=`\sum`{=tex}\_{i=1}\^{n}CO_i \]

とする。

同一案件について多数回 Sampling を行い、

\[ CO\_{total}\^{(1)}, CO\_{total}^{(2)},...,CO\_{total}^{(N)} \]

の分布を生成する。

## 8.1 Trial数

標準値：

**10,000回**

ユーザー設定可能範囲：

**1,000 ～ 100,000回**

IPA / CoBRA研究会資料で例示される 5,000 回も選択可能とする。

## 8.2 代表値

Historical Project の Calibration で使用する Cost Overhead
の代表値は、Simulation Distribution の **中央値（Median）** とする。

\[ `\widetilde{CO}`{=tex}*{total}=Median(CO*{total}) \]

------------------------------------------------------------------------

# 9. Historical Project

## 9.1 必須データ

CoBRA Model の Calibration に使用する Historical Project
は最低限以下を保持する。

  項目                   必須
  ---------------------- ------
  Project ID             ○
  Project Name           ○
  Size                   ○
  Size Unit              ○
  Actual Effort          ○
  各 Cost Driver Level   ○
  Project Type           推奨
  Industry               任意
  Technology             任意
  Start / End            任意
  Notes                  任意

## 9.2 必要件数

システム上の最低件数：

**3件**

実運用上の推奨：

**10件以上**

3件以上10件未満の場合は Warning を表示する。

## 9.3 データ品質

以下の案件は Calibration 対象から除外可能とする。

-   実績工数が不明
-   規模測定方法が他案件と異なる
-   大規模な固定作業が工数に含まれる
-   Cost Driver Level を評価できない
-   通常案件と明らかに異なる特殊案件
-   データ入力ミスの疑いがある

除外理由を保存する。

------------------------------------------------------------------------

# 10. 固定工数の取扱い

CoBRA の基本モデルは開発規模と工数の比例関係を仮定する。

そのため、

-   環境移行
-   固定的なプロジェクト管理作業
-   一回限りの基盤構築
-   規模に依存しない外部調整

等の「規模に比例しない工数」は、可能な限り Scaling Effort と分離する。

本システムでは、

\[ TotalEffort = ScalingEffort + FixedEffort \]

として管理可能とする。

CoBRA Calibration は原則として Scaling Effort を対象とする。

------------------------------------------------------------------------

# 11. 補正规模

Historical Project (j) の規模を (S_j)、Cost Overhead Distribution
の中央値を (`\widetilde{CO_j}`{=tex}) とする。

補正规模を、

\[ AdjustedSize_j=S_j(1+`\widetilde{CO_j}`{=tex}) \]

と定義する。

------------------------------------------------------------------------

# 12. α Calibration

Historical Project が N 件ある場合、

\[ (AdjustedSize_1,ActualEffort_1) \]

から

\[ (AdjustedSize_N,ActualEffort_N) \]

までの N 組を用いて直線回帰を行う。

CoBRA の仮説、

> Cost Driver が存在しない理想状態では工数は規模に比例する

に基づき、

\[ ActualEffort=`\alpha `{=tex}`\times `{=tex}AdjustedSize \]

を Calibration Model とする。

算出した (`\alpha`{=tex}) は Model Version と共に保存する。

Calibration 実行時には以下を保存する。

-   Historical Project Set
-   Cost Driver Version
-   Expert Assessment Version
-   Simulation Trial Count
-   Random Seed
-   α
-   Calibration Date
-   Application Version

------------------------------------------------------------------------

# 13. 新規案件見積

新規案件について、

1.  開発規模 (S) を入力
2.  各 Cost Driver Level を評価
3.  Monte Carlo Simulation を実行
4.  Cost Overhead Distribution を生成
5.  工数分布へ変換

する。

各 Trial の工数を、

\[ Effort\^{(k)} = `\alpha `{=tex}S(1+CO\_{total}\^{(k)}) \]

とする。

Fixed Effort が存在する場合、

\[ TotalEffort\^{(k)} = Effort\^{(k)}+FixedEffort \]

とする。

------------------------------------------------------------------------

# 14. 見積分布

見積結果として最低限以下を算出する。

-   Mean
-   Median
-   Standard Deviation
-   P10
-   P25
-   P50
-   P75
-   P80
-   P90
-   P95

画面では Histogram と Cumulative Distribution を表示する。

## 14.1 Percentile の意味

例えば、

**P80 = 48人月**

の場合、

> Model 上、約80%の Simulation Result が48人月以下となる

ことを意味する。

P80 を「80%の確率で必ず48人月以内」と断定表示してはならない。

------------------------------------------------------------------------

# 15. 見積価格

単価を (R) とした場合、

\[ EstimatedCost_p=Effort_p`\times `{=tex}R \]

とする。

ここで (p) は P50、P80、P90 等である。

価格には必要に応じて、

-   Management Cost
-   AI Tool Cost
-   Infrastructure Cost
-   Contingency
-   Target Margin

を追加可能とする。

「工数見積」「原価」「顧客提示価格」は別項目として保持する。

------------------------------------------------------------------------

# 16. Cross Validation

Model の精度評価には Leave-One-Out Cross Validation を使用する。

Historical Project が N 件の場合、各案件 (j) について、

1.  案件 (j) を Calibration Set から除外
2.  残り N-1 件から (`\alpha`{=tex}\_{-j}) を算出
3.  案件 (j) の工数を推定
4.  実績値と比較
5.  N案件すべてについて繰り返す

ものとする。

------------------------------------------------------------------------

# 17. 精度評価指標

## 17.1 MRE

案件 (j) の見積誤差率：

\[ MRE_j= `\frac{|Actual_j-Estimate_j|}{Actual_j}`{=tex} \]

## 17.2 MMRE

\[ MMRE= `\frac{1}{N}`{=tex}`\sum`{=tex}\_{j=1}\^{N}MRE_j \]

## 17.3 Pred.25

\[ Pred(25)= `\frac{\#\{j:MRE_j\leq0.25\}}{N}`{=tex} \]

## 17.4 STD

Cross Validation による案件別見積誤差率の標準偏差を算出する。

## 17.5 Total Error Ratio

\[ TotalErrorRatio= `\frac{\sum_j|Actual_j-Estimate_j|}`{=tex}
{`\sum`{=tex}\_j Actual_j} \]

## 17.6 評価表示

システムは以下を同時表示する。

-   MMRE
-   STD
-   Pred.25
-   Total Error Ratio
-   Actual vs Estimated Plot

単一指標のみで Model の良否を判定してはならない。

------------------------------------------------------------------------

# 18. Model改善

Validation 結果が不十分な場合、以下を確認する。

1.  実績工数の計測誤り
2.  規模データの計測誤り
3.  Cost Driver Level の評価誤り
4.  Cost Driver 定義の曖昧さ
5.  Cost Driver の見落とし
6.  Expert Assessment の Min / Mode / Max
7.  異質な Project の混在
8.  固定工数の混入
9.  Project Type の層別可能性

Model 改善前後の Version を保持し、過去 Model を上書きしない。

------------------------------------------------------------------------

# 19. 日本参考データ

本システムでは日本の公開データを以下の3用途に分けて扱う。

## 19.1 CoBRA Reference

CoBRA の計算規則・Model 構築手順を確認するための Reference。

主な資料：

1.  IPA「CoBRA法に基づく見積り支援ツール」
2.  CoBRA研究会「CoBRA法とは」
3.  CoBRA研究会「CoBRA法の概要説明資料」
4.  IPA「先進的見積り手法実証と普及展開の調査報告書」
5.  SEC Journal の CoBRA 関連論文

これらは Algorithm Reference であり、自社 Historical Data ではない。

## 19.2 Japan Software Benchmark

IPA「ソフトウェア開発分析データ集2022」を初期 Benchmark Source とする。

同資料は IPA が長期に収集した日本の Enterprise Software Project
データを基礎としており、累積 **5,546 Project**
のデータを保有し、主要分析では直近6年間の **1,479 Project**
を使用している。

主な利用項目：

-   開発工数
-   開発期間
-   FP
-   SLOC
-   FP生産性
-   SLOC生産性
-   工程別工数
-   新規開発 / 改良開発
-   業種
-   信頼性

業種 Benchmark は少なくとも以下を区別する。

-   金融・保険業
-   情報通信業
-   製造業

## 19.3 CoBRA Demonstration Data

IPA CoBRA Tool の「データあり」版には、Cost Driver と Sample Case
が同梱されている。

これらを利用する場合は、

**Demo / Verification Data**

として登録し、

**Company Historical Data**

とは明確に区別する。

------------------------------------------------------------------------

# 20. Benchmark と Calibration Data の分離

データには必ず Source Type を持たせる。

  Source Type           Calibration 使用
  --------------------- ------------------
  COMPANY_ACTUAL        ○
  COBRA_PUBLIC_SAMPLE   原則 ×
  IPA_BENCHMARK         ×
  DEMO                  ×
  SYNTHETIC             ×

IPA の公開統計を、個別 Project の Cost Driver Level が不明なまま自社
CoBRA Model の Calibration Data として使用してはならない。

------------------------------------------------------------------------

# 21. Benchmark画面

以下を比較表示する。

``` text
Our Organization
       vs
Japan Benchmark
```

比較候補：

-   FP Productivity
-   SLOC Productivity
-   Effort / FP
-   Phase Effort Ratio
-   Development Duration
-   Project Type
-   Industry

Benchmark は CoBRA 見積値を直接補正する目的ではなく、

> 自社 Model が日本市場全体から見てどの位置にあるか

を理解するために使用する。

------------------------------------------------------------------------

# 22. AI導入効果分析の基本原則

AI 効果は、

\[ CoBRA CostDriver \]

に単純な負の Cost Overhead として追加しない。

初期版では、

``` text
Traditional CoBRA Model
        ↓
Baseline Effort
        ↓
Phase Allocation
        ↓
AI Productivity Adjustment
        ↓
AI-Assisted Effort
```

の順序で計算する。

これにより、

**従来開発の組織生産性**

と

**AIによる生産性変化**

を分離して観測する。

------------------------------------------------------------------------

# 23. 開発工程

AI 効果を以下の工程単位で管理する。

1.  現行システム調査
2.  要件定義
3.  基本設計
4.  詳細設計
5.  Coding
6.  Unit Test
7.  Integration Test
8.  System Test
9.  Review
10. Project Management
11. 顧客対応

組織ごとに工程を追加・統合可能とする。

------------------------------------------------------------------------

# 24. Baseline Phase Effort

CoBRA により算出された Baseline Effort を、

\[ E\_{base} \]

とする。

工程 (p) の工数比率を (w_p) とし、

\[ `\sum`{=tex}\_p w_p=1 \]

を満たすものとする。

工程別 Baseline Effort は、

\[ E\_{base,p}=E\_{base}`\times `{=tex}w_p \]

とする。

工程比率は、

-   組織実績
-   Project Type
-   日本 Benchmark
-   Manual Setting

のいずれから取得したかを記録する。

------------------------------------------------------------------------

# 25. AI Productivity Model

工程 (p) について以下を設定可能とする。

-   AI Adoption Rate (A_p)
-   Productivity Improvement (G_p)
-   Additional Review Rate (V_p)
-   AI Rework Rate (W_p)
-   Fixed AI Effort (F_p)

AI Adoption Rate は、当該工程のうち AI の影響を受ける作業割合を表す。

Productivity Improvement は AI 適用部分の工数削減率を表す。

基本削減工数を、

\[ Reduction_p = E\_{base,p}`\times `{=tex}A_p`\times `{=tex}G_p \]

とする。

AI 適用後工程工数は、

\[ E\_{AI,p} = E\_{base,p} - Reduction_p + Review_p + Rework_p + F_p \]

とする。

Review と Rework の定義は Scenario Version と共に保存する。

------------------------------------------------------------------------

# 26. AI Scenario

標準 Scenario：

-   Baseline
-   Conservative
-   Standard
-   Aggressive
-   Custom

ただし Conservative / Standard / Aggressive
の数値をシステム固定値として扱ってはならない。

初期値は仮説であることを表示し、組織の AI Project
実績が蓄積された場合は実績値から更新する。

------------------------------------------------------------------------

# 27. AI Cost

AI導入後の原価には以下を含める。

\[ AI TotalCost = LaborCost +AIToolCost +AIInfrastructureCost
+OtherAICost \]

対象：

-   AI Coding Assistant License
-   LLM API Cost
-   Agent Execution Cost
-   GPU / Infrastructure
-   RAG / Knowledge Base
-   Security / Governance
-   AI Review Cost

単純な人件費削減だけで AI ROI を算出してはならない。

------------------------------------------------------------------------

# 28. AI ROI

Baseline Cost を (C_B)、AI Total Cost を (C_A)、AI導入に必要な追加投資を
(I_A) とした場合、

\[ Benefit=C_B-C_A \]

\[ ROI= `\frac{Benefit-I_A}{I_A}`{=tex} \]

を基本指標とする。

投資が案件単位ではなく年間契約等の場合は、Allocation Rule を明示する。

------------------------------------------------------------------------

# 29. AI実績データ

AI Project について以下を追加記録する。

-   使用 AI Tool
-   AI利用工程
-   AI Adoption Rate
-   AI利用時間
-   実績工程別工数
-   Review 工数
-   Rework 工数
-   AI Tool Cost
-   Defect
-   Productivity
-   Model Prediction
-   Actual Result

AI効果は予測値だけでなく実績値を蓄積する。

------------------------------------------------------------------------

# 30. Traditional / AI Model の将来分離

AI Project の実績が十分蓄積された場合、

``` text
Traditional Model
AI-Assisted Model
```

を別 Model として Calibration できるよう拡張可能とする。

AI Project を無条件に Traditional Historical Data
と混在させてはならない。

Model ごとに対象期間・開発方式・AI利用条件を記録する。

------------------------------------------------------------------------

# 31. 主要画面

## 31.1 Dashboard

-   Active CoBRA Model
-   Historical Project Count
-   α
-   MMRE
-   Pred.25
-   Total Error Ratio
-   最近の見積
-   AI Scenario 効果

## 31.2 Historical Projects

-   一覧
-   登録
-   編集
-   Calibration対象/対象外
-   Cost Driver Level
-   CSV Import / Export

## 31.3 Cost Driver Model

-   Driver一覧
-   Level定義
-   Expert Assessment
-   Min / Mode / Max
-   Version
-   有効/無効

## 31.4 Calibration

-   Historical Project
-   Adjusted Size
-   Actual Effort
-   α
-   Regression Chart
-   Model Version

## 31.5 Validation

-   Actual
-   Estimate
-   MRE
-   MMRE
-   STD
-   Pred.25
-   Total Error Ratio
-   Actual vs Estimated Plot

## 31.6 Estimate

入力：

-   Size
-   Size Unit
-   Cost Driver Level
-   Fixed Effort
-   Unit Price

出力：

-   Effort Distribution
-   P50
-   P80
-   P90
-   Cost
-   Driver Contribution

## 31.7 Benchmark

-   Organization vs Japan
-   FP Productivity
-   SLOC Productivity
-   Phase Distribution
-   Industry Comparison

## 31.8 AI Impact

``` text
Baseline | AI Scenario
```

を比較し、

-   Total Effort
-   Phase Effort
-   Cost
-   Price
-   Margin
-   AI Cost
-   ROI

を表示する。

------------------------------------------------------------------------

# 32. データのVersion管理

以下は Version 管理対象とする。

-   Cost Driver Definition
-   Expert Assessment
-   CoBRA Model
-   Calibration Result
-   Benchmark Dataset
-   AI Scenario
-   Phase Allocation
-   Estimate

過去の見積を再表示した場合、現在の Model ではなく、当時使用した Version
で結果を再現できなければならない。

------------------------------------------------------------------------

# 33. 再現性

Simulation 実行ごとに以下を保存する。

-   Model Version
-   Input Data
-   Cost Driver Version
-   Expert Assessment Version
-   Trial Count
-   Random Seed
-   Simulation Date
-   Application Version

同一 Version・同一 Input・同一 Seed
の場合、同一結果を再現できることを要求する。

------------------------------------------------------------------------

# 34. Model適用範囲

新規案件が Historical Project と著しく異なる場合、システムは Warning
を表示する。

例：

-   Historical Data にない規模帯
-   新しい開発方式
-   未経験技術
-   AI First Development
-   異なる業種
-   異なる Project Type

CoBRA の数値が算出可能であっても、

> Model の適用範囲内である

ことを保証するものではない。

------------------------------------------------------------------------

# 35. 初期受入条件

MVP は以下を満たした時点で受入可能とする。

### AC-01

3件以上の Historical Project を登録できる。

### AC-02

Cost Driver ごとに Level 0～3 の定義と Min / Mode / Max を登録できる。

### AC-03

Historical Project に対して Monte Carlo Simulation を実行し、Cost
Overhead Median を算出できる。

### AC-04

Adjusted Size と Actual Effort から α を Calibration できる。

### AC-05

Leave-One-Out Cross Validation を実行できる。

### AC-06

MMRE、STD、Pred.25、Total Error Ratio を表示できる。

### AC-07

新規案件について工数分布を生成できる。

### AC-08

P50 / P80 / P90 を表示できる。

### AC-09

同一 Seed により Simulation Result を再現できる。

### AC-10

IPA Benchmark と Company Historical Data を区別できる。

### AC-11

Baseline と AI Scenario の工程別工数を比較できる。

### AC-12

AI Tool Cost、Review、Rework を含む AI Cost を算出できる。

### AC-13

過去 Estimate が使用 Model Version と共に保存される。

------------------------------------------------------------------------

# 36. Model検証用データ方針

開発開始時に以下の3 Dataset を準備する。

## Dataset A --- CoBRA Public Sample

目的：

**CoBRA Algorithm の再現確認**

IPA CoBRA Tool または CoBRA研究会の公開 Sample を使用する。

## Dataset B --- IPA Japan Benchmark

目的：

**日本市場との比較**

IPA「ソフトウェア開発分析データ集2022」の公開統計・グラフデータを使用する。

## Dataset C --- Company Data

目的：

**実運用 Model Calibration**

ユーザー組織の実績 Project を使用する。

Dataset A/B/C は物理的・論理的に区別する。

------------------------------------------------------------------------

# 37. 開発順序

## Stage 1 --- Algorithm Verification

最初に Web 画面を作らない。

公開 CoBRA Sample を用いて、

-   Cost Driver
-   Triangular Distribution
-   Monte Carlo
-   Adjusted Size
-   α
-   Cross Validation
-   Accuracy Metrics

の計算結果を確認する。

## Stage 2 --- CoBRA MVP

Historical Project → Calibration → Validation → Estimate を Web 化する。

## Stage 3 --- Japan Benchmark

IPA Data を取り込み、日本市場との比較機能を追加する。

## Stage 4 --- AI Impact

工程別 AI Productivity Model を追加する。

## Stage 5 --- Actual AI Learning

実案件データを蓄積し、AI Productivity Parameter を実績ベースに更新する。

------------------------------------------------------------------------

# 38. 技術構成方針

実装技術は基本設計で確定するが、本プロジェクトでは分析機能を重視するため、初期候補を以下とする。

``` text
Python
FastAPI
NumPy
pandas
SciPy
statsmodels
SQLAlchemy
SQLite → PostgreSQL
HTMX / Jinja2
Apache ECharts
pytest
```

ただし、本仕様書で規定する CoBRA 計算規則・データ要件・結果要件は、特定
Framework の実装方法には依存しない。

------------------------------------------------------------------------

# 39. 参考資料

本仕様策定時の主要 Reference：

1.  独立行政法人情報処理推進機構（IPA）\
    「CoBRA法に基づく見積り支援ツール」

2.  CoBRA研究会\
    「CoBRA法とは」

3.  CoBRA研究会\
    「CoBRA法の概要説明資料」

4.  IPA\
    「先進的見積り手法実証と普及展開の調査報告書」

5.  IPA\
    「ソフトウェア開発分析データ集2022」

6.  SEC Journal\
    CoBRA法関連論文・適用事例

参考資料の内容と本システムの仕様に差異が判明した場合、差異を Issue
として記録し、Algorithm Version を変更した上で対応する。

------------------------------------------------------------------------

# 40. 最終的に検証したい仮説

本システムを利用して最終的に検証する主要仮説は以下とする。

### H1

生成AIは Coding 工数を大幅に削減しても、Project Total Effort
を同率では削減しない。

### H2

AI導入効果は工程ごとに大きく異なる。

### H3

AIによる工数削減の一部は Review / Rework / Governance Cost
により相殺される。

### H4

AI利用経験の蓄積により組織の Baseline Productivity 自体が変化する。

### H5

AI導入後の適正な顧客提示価格は、単純な工数削減率だけでは決定できない。

本システムは、これらを感覚ではなく Historical Data
と実績値から継続的に検証可能にすることを最終目的とする。
