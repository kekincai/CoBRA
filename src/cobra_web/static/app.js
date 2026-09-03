"use strict";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const number = (v, digits = 1) =>
  typeof v === "number" && Number.isFinite(v)
    ? v.toLocaleString("ja-JP", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      })
    : "—";
const percent = (v) => (typeof v === "number" ? number(v * 100, 1) + "%" : "—");
const yen = (v) => (typeof v === "number" ? "¥" + number(v, 0) : "—");
const date = (v) =>
  v
    ? new Date(v).toLocaleString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "初期テンプレート";
const query = new URLSearchParams(location.search);
let mode = query.get("workspace") === "sample" ? "sample" : "company";
let state,
  chartInstances = [],
  selectedResult = null,
  selectedImpact = null;
const page = document.body.dataset.page;
const isCompany = (r) => r.data.source_type === "COMPANY_ACTUAL";
const visibleModels = () =>
  state.models.filter((r) =>
    mode === "sample" ? r.id === "public-v1" : isCompany(r),
  );
const currentModel = () =>
  visibleModels().find((r) => r.id === query.get("model")) ||
  visibleModels()[0];
const currentDrivers = () =>
  mode === "sample"
    ? state.drivers.find((r) => r.id === "ipa-template")
    : state.drivers[0];
const visibleEstimates = () =>
  state.estimates.filter((r) =>
    mode === "sample" ? !isCompany(r) : isCompany(r),
  );
const path = (p) => "/" + p + (mode === "sample" ? "?workspace=sample" : "");
const sourceBadge = (type) =>
  `<span class="badge ${type === "COMPANY_ACTUAL" ? "good" : "warm"}">${esc({ COMPANY_ACTUAL: "自社実績", COBRA_PUBLIC_SAMPLE: "公開サンプル · 検証", IPA_BENCHMARK: "IPA 統計", DEMO: "デモ", SYNTHETIC: "合成データ" }[type] || type)}</span>`;
const btn = (label, action, primary = false, extra = "") =>
  `<button type="button" class="button ${primary ? "primary" : ""}" data-action="${action}" ${extra}>${label}</button>`;
const link = (label, p, primary = false) =>
  `<a class="button ${primary ? "primary" : ""}" href="${path(p)}">${label}</a>`;
const head = (en, title, sub, action = "") =>
  `<div class="page-head"><div><div class="eyebrow">${en}</div><h1>${title}</h1><p class="subtitle">${sub}</p></div><div class="actions">${action}</div></div>`;
const sampleNotice = () =>
  mode === "sample"
    ? '<div class="notice info">IPA の公開サンプルによる検証用ワークスペースです。規模単位「千円」は原資料のまま保持しています。実案件の見積りには自社実績モデルをご利用ください。</div>'
    : "";
const notice = (warnings) =>
  warnings?.length
    ? `<div class="notice">${warnings.map((w) => `<p>${esc(w)}</p>`).join("")}</div>`
    : "";
const kpi = (label, value, unit = "", detail = "", blue = false) =>
  `<div class="kpi ${blue ? "blue" : ""}"><div class="kpi-label">${label}</div><div class="kpi-value">${value}<small>${unit}</small></div><div class="kpi-detail">${detail}</div></div>`;
const panel = (title, sub, content, action = "") =>
  `<section class="panel"><div class="panel-head"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ""}</div>${action}</div>${content}</section>`;
const table = (headers, rows) =>
  `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
const field = (label, name, value = "", type = "text", hint = "", attrs = "") =>
  `<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${attrs}>${hint ? `<small>${hint}</small>` : ""}</label>`;
const select = (label, name, options, value = "", attrs = "") =>
  `<label class="field">${label}<select name="${name}" ${attrs}>${options
    .map((o) => {
      const [v, t] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(v)}" ${String(v) === String(value) ? "selected" : ""}>${esc(t)}</option>`;
    })
    .join("")}</select></label>`;
const area = (label, name, value = "", hint = "") =>
  `<label class="field">${label}<textarea name="${name}">${esc(value)}</textarea>${hint ? `<small>${hint}</small>` : ""}</label>`;
const submit = (label) =>
  `<div class="form-error" hidden role="alert"></div><button type="submit" class="button primary">${label}</button>`;
const empty = (title, text, actions = "") =>
  `<div class="empty"><div class="empty-icon">⌁</div><h2>${title}</h2><p>${text}</p><div class="actions" style="justify-content:center">${actions}</div></div>`;
const modelBar = (m) =>
  m
    ? `<div class="model-bar"><div><div class="model-name">${esc(m.data.name)} ${sourceBadge(m.data.source_type)}</div><div class="model-meta">${esc(m.id)} &nbsp; / &nbsp; ${m.data.projects.length} 案件 &nbsp; / &nbsp; ${esc(m.data.size_unit)} &nbsp; / &nbsp; ${number(m.data.simulation.trials, 0)} trials · Seed ${m.data.simulation.seed}</div></div><select id="model-selector" class="inline-select model-selection" aria-label="参照モデル">${visibleModels()
        .map(
          (r) =>
            `<option value="${r.id}" ${r.id === m.id ? "selected" : ""}>${esc(r.data.name)} · ${r.id.slice(-6)}</option>`,
        )
        .join("")}</select></div>`
    : "";

async function api(url, body) {
  const response = await fetch(
    url,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("応答を読み取れません。サーバーの状態を確認してください。");
  }
  if (!response.ok)
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "入力内容を確認してください。",
    );
  return data;
}
async function refresh() {
  state = await api("/api/state");
}
function toast(text, error = false) {
  const el = $("#toast");
  el.textContent = text;
  el.className = "toast" + (error ? " error" : "");
  el.hidden = false;
  setTimeout(() => (el.hidden = true), 6500);
}
function openDialog(title, body) {
  $("#dialog-title").textContent = title;
  $("#dialog-body").innerHTML = body;
  $("#editor").showModal();
}
function closeDialog() {
  $("#editor").close();
}
function chart(id, options) {
  const el = $("#" + id);
  if (!el) return;
  const instance = echarts.init(el, null, { renderer: "svg" });
  chartInstances.push(instance);
  instance.setOption({
    animationDuration: 450,
    color: ["#3d65dc", "#afbdde", "#789596", "#c4cbd5"],
    textStyle: { fontFamily: "sans-serif", fontSize: 10, color: "#7c8798" },
    aria: {
      enabled: true,
      label: {
        description:
          {
            regression: "補正规模と実績変動工数。破線は原点回帰線です。",
            "validation-chart":
              "実績工数と留一法による推定工数。詳細は案件別の検証結果表をご確認ください。",
            distribution:
              "工数のシミュレーション分布。代表値は P50・P80・P90 の欄をご確認ください。",
            "ai-chart":
              "工程別 Baseline と AI 適用後の工数比較。詳細は工程別内訳表をご確認ください。",
            "benchmark-chart": "業種別 SLOC 生産性の中央値。",
            "phase-benchmark": "IPA 工程別工数比率の平均。",
          }[id] || "数値の比較図。対応する表もご確認ください。",
      },
    },
    tooltip: { trigger: "axis", confine: true },
    grid: { left: 45, right: 24, top: 26, bottom: 36 },
    ...options,
  });
}
function disposeCharts() {
  chartInstances.forEach((c) => c.dispose());
  chartInstances = [];
}
const axis = (name) => ({
  type: "value",
  name,
  nameTextStyle: { fontSize: 9 },
  axisLine: { show: false },
  axisTick: { show: false },
  splitLine: { lineStyle: { color: "#edf0f5", type: "dashed" } },
  axisLabel: { fontSize: 10 },
});
function distribution(result, id = "distribution", cdf = false) {
  const s = result.statistics;
  chart(
    id,
    cdf
      ? {
          xAxis: axis("人月"),
          yAxis: {
            ...axis("累積比率"),
            min: 0,
            max: 1,
            axisLabel: { formatter: (v) => Math.round(v * 100) + "%" },
          },
          series: [
            {
              type: "line",
              showSymbol: false,
              smooth: false,
              data: s.cdf,
              lineStyle: { width: 2.5 },
              areaStyle: { opacity: 0.06 },
            },
          ],
        }
      : {
          xAxis: {
            type: "category",
            data: s.histogram.counts.map((_, i) =>
              number((s.histogram.edges[i] + s.histogram.edges[i + 1]) / 2, 1),
            ),
            axisLabel: { interval: 7, fontSize: 9 },
            axisTick: { show: false },
            axisLine: { lineStyle: { color: "#dfe4ed" } },
            name: "人月",
          },
          yAxis: axis("頻度"),
          series: [
            {
              type: "bar",
              barCategoryGap: "12%",
              data: s.histogram.counts,
              itemStyle: { color: "#6d8be8", borderRadius: [2, 2, 0, 0] },
            },
          ],
        },
  );
}
function regression(m, id = "regression", validation = false) {
  const r = m.data.rows;
  const max =
    Math.max(
      ...r.map((p) =>
        validation ? Math.max(p.actual_scaling, p.estimate) : p.adjusted_size,
      ),
    ) * 1.12;
  chart(id, {
    tooltip: { trigger: "item" },
    xAxis: axis(validation ? "実績工数 / 人月" : "補正规模"),
    yAxis: axis(validation ? "推定工数 / 人月" : "変動工数 / 人月"),
    series: [
      {
        type: "line",
        data: [
          [0, 0],
          [max, validation ? max : max * m.data.alpha],
        ],
        showSymbol: false,
        lineStyle: { color: "#b7c8ef", type: "dashed", width: 1.5 },
        silent: true,
      },
      {
        name: validation ? "LOOCV" : "実績",
        type: "scatter",
        symbolSize: 10,
        data: r.map((p) => ({
          name: p.name,
          value: [
            validation ? p.actual_scaling : p.adjusted_size,
            validation ? p.estimate : p.actual_scaling,
          ],
        })),
        itemStyle: { color: "#3f68dc", borderColor: "#fff", borderWidth: 2 },
        tooltip: {
          formatter: (p) =>
            `${esc(p.name)}<br>${number(p.value[0])} → ${number(p.value[1])} 人月`,
        },
      },
    ],
  });
}
function estimateRows(entries) {
  return entries.map(
    (r) =>
      `<tr><td><button class="table-link" data-action="view-estimate" data-id="${r.id}">${esc(r.data.input.name)} ↗</button><small>${date(r.created_at)}</small></td><td>${esc(r.data.input.size_unit)}</td><td>${number(r.data.statistics.p50)}</td><td><strong>${number(r.data.statistics.p80)}</strong></td><td>${number(r.data.statistics.p90)}</td><td>${yen(r.data.pricing.p80.price)}</td><td>${sourceBadge(r.data.source_type)}</td></tr>`,
  );
}

function dashboard() {
  const m = currentModel(),
    saved = visibleEstimates(),
    latest = saved[0];
  let html =
    head(
      "OVERVIEW",
      "ダッシュボード",
      "実績に基づく見積りと、AI 導入効果をひとつのワークスペースで。",
      link("＋ 新規見積り", "estimate", true),
    ) + sampleNotice();
  if (!m) {
    html += panel(
      "組織の見積りモデルをつくる",
      "まずは過去のプロジェクトを登録してください。",
      empty(
        "自社モデルはまだありません",
        "3 件以上の実績とコストドライバーの評価から、組織固有の生産性を求めます。",
        btn("＋ 実績を登録", "new-project", true) +
          btn("公開サンプルを試す ↗", "sample"),
      ) +
        `<div class="onboarding"><div><div class="step-num">01 / DATA</div><h3>実績を集める</h3><p>規模・工数・変動要因を登録。固定工数は分けて扱います。</p></div><div><div class="step-num">02 / MODEL</div><h3>モデルを校正する</h3><p>熟練者の知識と実績から α を推定し、留一法で精度を確認します。</p></div><div><div class="step-num">03 / ESTIMATE</div><h3>幅を持って見積もる</h3><p>P50・P80・P90 と工程別の AI 効果を比較します。</p></div></div>`,
    );
    html += `<div class="kpis">${kpi("登録済み実績", number(state.projects.filter(isCompany).length, 0), "件", "自社データのみ")}${kpi("モデル校正", "—", "", "3 件以上から実行")}${kpi("日本ベンチマーク", "2022", "", "IPA 公開統計を収録")}${kpi("保存済み見積り", number(saved.length, 0), "件", "モデル版と一緒に保存")}</div>`;
    return html;
  }
  html +=
    modelBar(m) +
    `<div class="kpis">${kpi("校正に使用した実績", m.data.projects.length, "件", m.data.projects.length < 10 ? "推奨 10 件以上" : "Company historical data")}${kpi("基本生産性 α", number(m.data.alpha, m.data.alpha < 0.01 ? 7 : 3), "", `人月 / ${esc(m.data.size_unit)}`, true)}${kpi("平均相対誤差 · MMRE", number(m.data.metrics.mmre * 100), "%", "Leave-one-out cross validation")}${kpi("25% 以内の見積り · Pred.25", number(m.data.metrics.pred25 * 100, 0), "%", `総誤差率 ${percent(m.data.metrics.total_error_ratio)}`)}</div>`;
  html += `<div class="grid-2">${panel("モデルの適合状況", "補正规模と実績工数の関係", `<div id="regression" class="chart" role="img" aria-label="補正规模と実績工数の散布図"></div><p class="chart-note">原点を通る回帰線。固定工数を除いた変動工数でモデルを校正しています。</p>`, link("モデルを確認 ↗", "calibration"))}${panel("モデルの状態", "見積りに使用する条件", `<div class="metric-list"><div class="metric-row"><span>規模の適用範囲</span><strong>${number(Math.min(...m.data.projects.map((p) => p.size)), 0)}–${number(Math.max(...m.data.projects.map((p) => p.size)), 0)}</strong></div><div class="metric-row"><span>誤差の標準偏差</span><strong>${percent(m.data.metrics.std)}</strong></div><div class="metric-row"><span>試行回数</span><strong>${number(m.data.simulation.trials, 0)}</strong></div><div class="metric-row"><span>乱数 Seed</span><strong>${m.data.simulation.seed}</strong></div></div>${notice(m.data.warnings)}<div class="source-note">${esc(m.data.scope_notes || "校正に使用した案件の範囲を確認してください。")}</div>`)}</div>`;
  if (latest)
    html += `<div class="grid-2">${panel("直近の見積分布", esc(latest.data.input.name), '<div id="distribution" class="chart"></div>', '<span class="badge">Monte Carlo</span>')}${panel("見積りの代表値", "モデルのシミュレーション分布", `<div class="metric-list">${["p50", "p80", "p90"].map((k) => `<div class="metric-row"><span>${k.toUpperCase()}</span><strong>${number(latest.data.statistics[k])} 人月</strong></div>`).join("")}</div><p class="chart-note">P80 はモデル上の結果の約 80% がこの値以下になることを表します。納期や工数の保証ではありません。</p>`)}</div>`;
  const impact = state.impacts.find((r) =>
    visibleEstimates().some(
      (e) =>
        e.id === r.data.input.estimate_id && e.data.input.model_id === m.id,
    ),
  );
  if (impact) {
    const ai = impact.data.result;
    html += `<div class="section">${panel("直近の AI 導入効果", esc(impact.data.scenario_snapshot.data.name) + " · 保存済みの仮説比較", `<div class="comparison-strip"><span>Baseline <strong>${number(ai.baseline.effort)}</strong> 人月</span><span>AI 適用後 <strong>${number(ai.after.effort)}</strong> 人月</span><span>削減率 <strong>${percent(ai.effort_reduction_rate)}</strong></span></div>`, link("工程別に確認 ↗", "ai"))}</div>`;
  }
  html += panel(
    "最近の見積り",
    "保存時のモデル・入力から再表示",
    saved.length
      ? table(
          [
            "案件名",
            "規模単位",
            "P50 / 人月",
            "P80 / 人月",
            "P90 / 人月",
            "P80 提示価格",
            "データ",
          ],
          estimateRows(saved.slice(0, 5)),
        )
      : empty(
          "見積りを作成できます",
          "モデルを選び、規模と Cost Driver Level を入力してください。",
          link("新規見積りへ ↗", "estimate"),
        ),
    link("すべて見る ↗", "history"),
  );
  return html;
}

function projectsPage() {
  const ps =
    mode === "sample"
      ? state.public_projects
      : state.projects.map((r) => r.data);
  return (
    head(
      "HISTORICAL PROJECTS",
      "実績プロジェクト",
      "規模・実績工数・変動要因を記録し、校正に使うデータを整えます。",
      mode === "company" ? btn("＋ プロジェクト登録", "new-project", true) : "",
    ) +
    sampleNotice() +
    `<div class="toolbar"><div class="actions"><span class="badge neutral">${ps.length} projects</span><span class="subtitle">固定工数を分離して校正</span></div>${mode === "company" ? `<div class="actions"><a class="button small" href="/api/projects/csv?template=true">CSV テンプレート</a>${btn("CSV インポート", "import-csv")}<a class="button" href="/api/projects/csv">エクスポート ↗</a></div>` : ""}</div>` +
    panel(
      "プロジェクト一覧",
      "同じ規模単位・測定方法の案件でモデルを作成します。",
      ps.length
        ? table(
            [
              "プロジェクト",
              "規模",
              "実績 / 人月",
              "固定 / 人月",
              "開発方式",
              "データ",
              "校正対象",
              "",
            ],
            ps.map(
              (p) =>
                `<tr><td>${esc(p.name)}<small>${esc(p.id)} · ${esc(p.industry || p.project_type)}</small></td><td>${number(p.size, 0)} ${esc(p.size_unit)}</td><td>${number(p.actual_effort)}</td><td>${number(p.fixed_effort)}</td><td>${p.method === "AI_ASSISTED" ? "AI 利用" : "従来開発"}</td><td>${sourceBadge(p.source_type)}</td><td><span class="badge ${p.excluded ? "warm" : "neutral"}">${p.excluded ? "除外" : "対象候補"}</span>${p.excluded ? `<small>${esc(p.exclusion_reason)}</small>` : ""}</td><td>${mode === "company" ? `<button class="table-link" data-action="edit-project" data-id="${esc(p.id)}">編集 ↗</button>` : ""}</td></tr>`,
            ),
          )
        : empty(
            "実績を登録してください",
            "CSV からまとめて読み込むこともできます。",
            btn("最初の実績を登録", "new-project", true),
          ),
    )
  );
}

function levelFields(ds, levels = {}, prefix = "level_") {
  return ds.drivers
    .filter((d) => d.enabled)
    .map(
      (d) =>
        `<div class="level-row"><span>${esc(d.name)}</span>${select(
          "",
          prefix + d.id,
          d.levels.map((t, i) => [i, `L${i} · ${t}`]),
          levels[d.id] ?? "",
          "required",
        )
          .replace("<select ", `<select aria-label="${esc(d.name)}" `)
          .replace("<select aria-label", "<select aria-label")
          .replace(
            /(<select[^>]*>)/,
            '$1<option value="">評価を選択してください</option>',
          )}</div>`,
    )
    .join("");
}
function projectEditor(id) {
  const p = state.projects.find((r) => r.data.id === id)?.data || {};
  const ds = currentDrivers().data;
  openDialog(
    id ? "実績プロジェクトを編集" : "実績プロジェクトを登録",
    `<form id="project-form"><div class="form-grid">${field("Project ID", "id", p.id || "", "text", "英数字・ハイフン・アンダースコア", 'required pattern="[A-Za-z0-9_-]{1,64}" ' + (id ? "readonly" : ""))}${field("プロジェクト名", "name", p.name || "", "text", "", "required")}${field("開発規模", "size", p.size || "", "number", "", 'required min="0.000001" step="any"')}${field("規模単位", "size_unit", p.size_unit || "FP", "text", "FP / SLOC / KSLOC / 組織独自単位", "required")}${field("実績工数 / 人月", "actual_effort", p.actual_effort || "", "number", "固定工数を含む総工数", 'required min="0.000001" step="any"')}${field("うち固定工数 / 人月", "fixed_effort", p.fixed_effort ?? 0, "number", "", 'required min="0" step="any"')}${select(
      "開発方式",
      "method",
      [
        ["TRADITIONAL", "従来開発"],
        ["AI_ASSISTED", "AI 利用開発"],
      ],
      p.method || "TRADITIONAL",
    )}${select("開発種別", "project_type", ["新規開発", "改良開発"], p.project_type || "新規開発")}${field("業種", "industry", p.industry || "")}${field("使用技術", "technology", p.technology || "")}${field("規模測定方法", "measurement", p.measurement || "組織標準", "text", "", "required")}${select(
      "データ出所",
      "source_type",
      [
        ["COMPANY_ACTUAL", "自社実績"],
        ["COBRA_PUBLIC_SAMPLE", "CoBRA 公開サンプル"],
        ["IPA_BENCHMARK", "IPA ベンチマーク"],
        ["DEMO", "デモ"],
        ["SYNTHETIC", "合成データ"],
      ],
      p.source_type || "COMPANY_ACTUAL",
    )}${field("開始日", "start", p.start || "", "date")}${field("終了日", "end", p.end || "", "date")}${field("開発期間 / 月", "duration_months", p.duration_months || "", "number", "", 'min="0.01" step="any"')}</div><details open><summary>Cost Driver Level · ${esc(currentDrivers().id)}</summary>${levelFields(ds, p.levels)}</details><hr class="form-divider"><label class="check-label"><input name="excluded" type="checkbox" ${p.excluded ? "checked" : ""}>この案件を校正対象から除外する</label>${field("除外理由", "exclusion_reason", p.exclusion_reason || "")}${area("備考", "notes", p.notes || "")}${submit("実績を保存")}</form>`,
  );
}

function driversPage() {
  const ds = currentDrivers();
  return (
    head(
      "COST DRIVER MODEL",
      "コストドライバー",
      "Level の判定基準と熟練者の評価を、モデルの知識として保存します。",
      mode === "company" ? btn("＋ ドライバーを追加", "new-driver", true) : "",
    ) +
    `<div class="model-bar"><div><div class="model-name">${esc(ds.data.name)}</div><div class="model-meta">${esc(ds.id)} · ${date(ds.created_at)}</div></div><span class="badge neutral">${ds.data.drivers.filter((d) => d.enabled).length} active drivers</span></div>` +
    (mode === "sample"
      ? '<div class="notice info">公開サンプルの定義と評価は読み取り専用です。組織の評価を編集する場合は「自社データ」に切り替えてください。</div>'
      : ds.id === "ipa-template"
        ? '<div class="notice info">IPA 公開値を初期テンプレートとして表示しています。組織の熟練者で確認し、編集すると新しい版として保存されます。</div>'
        : "") +
    panel(
      "要因と最大影響量",
      "Level 3 の増加率。個別熟練者の 3 値をそれぞれ等重みで平均します。",
      table(
        ["要因", "状態", "最小", "最頻", "最大", "評価者", ""],
        ds.data.drivers.map((d, i) => {
          const avg = (k) =>
            d.experts.reduce((s, e) => s + e[k], 0) / d.experts.length;
          return `<tr><td><span class="driver-number">${String(i + 1).padStart(2, "0")}</span>${esc(d.name)}</td><td><span class="badge ${d.enabled ? "neutral" : "warm"}">${d.enabled ? "有効" : "無効"}</span></td><td>${percent(avg("minimum"))}</td><td>${percent(avg("mode"))}</td><td>${percent(avg("maximum"))}</td><td>${d.experts.length} 名</td><td><button class="table-link" data-action="edit-driver" data-id="${esc(d.id)}">${mode === "sample" ? "定義・評価を確認 ↗" : "定義・評価を編集 ↗"}</button></td></tr>`;
        }),
      ),
    ) +
    `<details><summary>保存済みの Driver / Expert Assessment 版 (${mode === "sample" ? 1 : state.drivers.length})</summary>${table(
      ["版", "名前", "保存日時"],
      (mode === "sample" ? [ds] : state.drivers).map(
        (r) =>
          `<tr><td class="mono">${esc(r.id)}</td><td>${esc(r.data.name)}</td><td>${date(r.created_at)}</td></tr>`,
      ),
    )}</details>`
  );
}
function expertRow(e = { name: "", minimum: 0, mode: 0, maximum: 0 }) {
  return `<tr class="expert-row"><td><input name="expert_name" value="${esc(e.name)}" aria-label="評価者名" required></td>${["minimum", "mode", "maximum"].map((k) => `<td><input name="expert_${k}" type="number" value="${e[k] * 100}" aria-label="${k} / %" min="0" step="any" required></td>`).join("")}<td><button type="button" class="table-link" data-action="remove-row">削除</button></td></tr>`;
}
function driverEditor(id) {
  if (mode === "sample") {
    const d = currentDrivers().data.drivers.find((d) => d.id === id);
    if (!d) return;
    openDialog(
      d.name,
      `<p class="subtitle">${esc(d.description)}</p>${table(
        ["Level", "判定条件"],
        d.levels.map(
          (text, i) =>
            `<tr><td>L${i}</td><td class="driver-detail">${esc(text)}</td></tr>`,
        ),
      )}<p class="source-note">IPA 公開サンプル · 読み取り専用</p>`,
    );
    return;
  }
  const d = currentDrivers().data.drivers.find((d) => d.id === id) || {
    id: "",
    name: "",
    description: "",
    levels: ["", "", "", ""],
    experts: [{ name: "", minimum: 0, mode: 0, maximum: 0 }],
    enabled: true,
  };
  openDialog(
    id ? "コストドライバーを編集" : "コストドライバーを追加",
    `<form id="driver-form" data-old-id="${esc(id || "")}"><div class="form-grid">${field("Driver ID", "id", d.id, "text", "", 'required pattern="[A-Za-z0-9_-]{1,64}" ' + (id ? "readonly" : ""))}${field("要因名", "name", d.name, "text", "", "required")}</div>${area("要因の説明", "description", d.description)}${d.levels.map((t, i) => field(`Level ${i} の判定条件`, `definition_${i}`, t, "text", "具体的な条件を記述してください。", "required")).join("")}<h3>熟練者評価 · Level 3 の工数増加率</h3><div class="table-wrap"><table class="compact-numbers"><thead><tr><th>評価者名</th><th>Min / %</th><th>Mode / %</th><th>Max / %</th><th></th></tr></thead><tbody id="experts-body">${d.experts.map(expertRow).join("")}</tbody></table></div>${btn("＋ 評価者を追加", "add-expert")}<label class="check-label"><input name="enabled" type="checkbox" ${d.enabled ? "checked" : ""}>このドライバーを有効にする</label>${field("新しい版の名前", "version_name", `${currentDrivers().data.name} · 改訂`, "text", "", "required")}${submit("新しい版として保存")}</form>`,
  );
}

function calibrationPage() {
  const m = currentModel();
  let html =
    head(
      "MODEL CALIBRATION",
      "モデル校正",
      "補正规模と変動工数から、原点を通る回帰で基本生産性 α を推定します。",
    ) + sampleNotice();
  if (mode === "company") {
    const candidates = state.projects.filter(
      (r) => !r.data.excluded && r.data.source_type === "COMPANY_ACTUAL",
    );
    html += panel(
      "モデルを構築する",
      "同じ単位・測定方法・開発方式の案件を 3 件以上選択してください。",
      `<form id="calibration-form"><div class="form-grid three">${field("モデル名", "name", "組織モデル", "text", "", "required")}${select(
        "Driver / Expert 版",
        "driver_version",
        state.drivers.map((d) => [d.id, d.data.name + " · " + d.id.slice(-6)]),
        currentDrivers().id,
      )}${select("開発方式", "method", [
        ["TRADITIONAL", "従来開発"],
        ["AI_ASSISTED", "AI 利用開発"],
      ])}${field("試行回数", "trials", 10000, "number", "1,000〜100,000 / 5,000 回も指定可能", 'min="1000" max="100000" required')}${field("Random Seed", "seed", 42, "number", "", 'min="0" max="4294967295" required')}${field("適用範囲・AI 利用条件", "scope_notes", "", "text", "モデルが対象とする期間・方法など")}</div>${
        candidates.length
          ? table(
              [
                "選択",
                "プロジェクト",
                "規模",
                "変動工数 / 人月",
                "方式・測定方法",
              ],
              candidates.map(
                (r) =>
                  `<tr><td><input type="checkbox" name="project_ids" value="${esc(r.data.id)}" aria-label="${esc(r.data.name)}を選択" checked></td><td>${esc(r.data.name)}</td><td>${number(r.data.size, 0)} ${esc(r.data.size_unit)}</td><td>${number(r.data.actual_effort - r.data.fixed_effort)}</td><td>${esc(r.data.method)} · ${esc(r.data.measurement)}</td></tr>`,
              ),
            )
          : empty(
              "校正対象の自社実績がありません",
              "実績データを登録してから校正を実行してください。",
              link("実績データへ", "projects"),
            )
      }<div class="section">${submit("校正・交差検証を実行")}</div></form>`,
    );
  }
  if (m) {
    html +=
      `<div class="section">${modelBar(m)}</div><div class="grid-2">${panel("補正规模と実績工数", "C = α × Adjusted Size", '<div id="regression" class="chart"></div>')}${panel("校正結果", "固定工数を除いた原点通過 OLS", `<div class="kpi blue">${kpi("α", number(m.data.alpha, 7), "", `人月 / ${esc(m.data.size_unit)}`, true)}</div><div class="metric-row"><span>使用案件</span><strong>${m.data.projects.length} 件</strong></div>${notice(m.data.warnings)}`)}</div>` +
      panel(
        "案件別の補正結果",
        "総 Cost Overhead の中央値を使って規模を補正します。",
        table(
          ["案件", "規模", "CO 中央値", "補正规模", "実績変動工数"],
          m.data.rows.map(
            (r) =>
              `<tr><td>${esc(r.name)}</td><td>${number(r.size, 0)}</td><td>${percent(r.overhead_median)}</td><td>${number(r.adjusted_size)}</td><td>${number(r.actual_scaling)} 人月</td></tr>`,
          ),
        ),
      );
  }
  return html;
}
function validationPage() {
  const m = currentModel();
  let html =
    head(
      "CROSS VALIDATION",
      "精度検証",
      "1 件ずつ学習対象から外して予測し、未知の案件への見積り誤差を確認します。",
    ) + sampleNotice();
  if (!m)
    return (
      html +
      panel(
        "モデルの準備",
        null,
        empty(
          "校正済みモデルが必要です",
          "3 件以上の実績からモデルを作成してください。",
          link("モデル校正へ", "calibration", true),
        ),
      )
    );
  html += modelBar(m);
  const v = m.data.metrics;
  html += `<div class="kpis">${kpi("平均相対誤差 · MMRE", number(v.mmre * 100), "%", "案件別 MRE の平均", true)}${kpi("誤差の標準偏差 · STD", number(v.std * 100), "%", "MRE の母標準偏差")}${kpi("Pred.25", number(v.pred25 * 100), "%", "MRE ≤ 25% の案件比率")}${kpi("総誤差率", number(v.total_error_ratio * 100), "%", "絶対誤差合計 / 実績工数合計")}</div>`;
  html += `<div class="grid-2">${panel("実績 vs. 推定工数", "破線は実績と推定が一致する線", '<div id="validation-chart" class="chart"></div>')}${panel("評価の読み方", null, `<p class="subtitle">単一の指標でモデルの良否を決めず、案件別の誤差とデータの条件を合わせて確認します。</p>${notice(m.data.warnings)}<div class="metric-list"><div class="metric-row"><span>検証方式</span><strong>Leave-One-Out</strong></div><div class="metric-row"><span>工数の対象</span><strong>変動工数のみ</strong></div><div class="metric-row"><span>検証案件数</span><strong>${m.data.rows.length}</strong></div></div>`)}</div>`;
  return (
    html +
    panel(
      "案件別の検証結果",
      "各 fold で α を再推定。対象案件はその fold の学習に含めません。",
      table(
        ["案件", "実績 / 人月", "LOOCV 推定 / 人月", "MRE", "α (対象案件除外)"],
        m.data.rows.map(
          (r) =>
            `<tr><td>${esc(r.name)}</td><td>${number(r.actual_scaling)}</td><td>${number(r.estimate)}</td><td><span class="badge ${r.mre <= 0.25 ? "good" : "warm"}">${percent(r.mre)}</span></td><td class="mono">${number(r.loo_alpha, 7)}</td></tr>`,
        ),
      ),
    )
  );
}

function estimatePage() {
  const m = currentModel();
  let html =
    head(
      "MONTE CARLO ESTIMATE",
      "新規見積り",
      "規模と変動要因から工数の分布を生成し、モデル版と一緒に保存します。",
    ) + sampleNotice();
  if (!m)
    return (
      html +
      panel(
        "見積りの準備",
        null,
        empty(
          "先に組織モデルを作成してください",
          "公開サンプルを使って、見積りの操作を試すこともできます。",
          link("モデル校正へ", "calibration", true) +
            btn("公開サンプルを試す", "sample"),
        ),
      )
    );
  const example = mode === "sample" ? state.public_projects[0] : null;
  return (
    html +
    modelBar(m) +
    `<div class="split-form"><section class="panel"><form id="estimate-form"><h3>案件条件</h3><input type="hidden" name="model_id" value="${m.id}"><div class="form-grid">${field("案件名", "name", example ? "公開サンプル検証見積り" : "", "text", "", "required")}${field("開発規模", "size", example?.size || "", "number", "", 'required min="0.000001" step="any"')}${field("規模単位", "size_unit", m.data.size_unit, "text", "", "readonly required")}${field("固定工数 / 人月", "fixed_effort", 0, "number", "", 'required min="0" step="any"')}${select("開発種別", "project_type", example ? ["公開テストケース", "新規開発", "改良開発"] : ["新規開発", "改良開発"], example?.project_type || "新規開発")}${select(
      "開発方式",
      "method",
      [
        ["TRADITIONAL", "従来開発"],
        ["AI_ASSISTED", "AI 利用開発"],
        ["AI_FIRST", "AI First"],
      ],
    )}${field("業種", "industry", "")}${field("使用技術", "technology", "")}</div>${area("規模見積りの根拠", "size_notes", "", "CoBRA は規模そのものの妥当性を検証しません。")}<details ${example ? "" : "open"}><summary>Cost Driver Level · ${m.data.drivers.drivers.filter((d) => d.enabled).length} 要因</summary>${levelFields(m.data.drivers, example?.levels)}</details><hr class="form-divider"><h3>原価と提示価格</h3><div class="form-grid">${field("人月原価 / 円", "unit_cost", 1000000, "number", "", 'required min="0" step="any"')}${field("目標粗利率 / %", "target_margin", 25, "number", "", 'required min="0" max="99.99" step="any"')}${field("追加管理費 / 円", "management_cost", 0, "number", "工数に含めた費用との二重計上に注意", 'required min="0" step="any"')}${field("インフラ費 / 円", "infrastructure_cost", 0, "number", "", 'required min="0" step="any"')}${field("予備費 / 円", "contingency", 0, "number", "", 'required min="0" step="any"')}</div><details><summary>シミュレーション設定</summary><div class="form-grid">${field("試行回数", "trials", 10000, "number", "", 'min="1000" max="100000" required')}${field("Random Seed", "seed", 42, "number", "", 'min="0" max="4294967295" required')}</div></details>${submit("シミュレーションを実行・保存")}</form></section><div id="estimate-result">${selectedResult ? resultHTML(selectedResult) : panel("見積り結果", "入力条件からシミュレーションを実行すると、ここに結果を表示します。", `<div class="result-placeholder">${empty("工数の不確実性を確認する", "P50 / P80 / P90、ヒストグラム、累積分布、提示価格を計算します。")}</div>`)}</div></div>`
  );
}
function resultHTML(rec) {
  const r = rec.data,
    s = r.statistics;
  return `<div class="result-heading"><h2>${esc(r.input.name)}</h2><span class="badge">保存済み</span></div><div class="kpis">${["p50", "p80", "p90"].map((k) => kpi(k.toUpperCase(), number(s[k]), "人月", "", k === "p80")).join("")}${kpi("標準偏差", number(s.std), "人月")}</div>${panel("工数分布", `${number(r.input.trials, 0)} trials · Seed ${r.input.seed}`, `<div id="distribution" class="chart"></div><p class="chart-note">P80: モデル上、約 80% のシミュレーション結果が ${number(s.p80)} 人月以下です。実績工数を保証する値ではありません。</p>`, `<div class="pill-tabs"><button class="selected" data-action="histogram">Histogram</button><button data-action="cdf">CDF</button></div>`)}<div class="section">${panel(
    "原価と顧客提示価格",
    "単価・費用・目標粗利率を反映",
    table(
      ["代表値", "原価", "提示価格", "粗利"],
      ["p50", "p80", "p90"].map(
        (k) =>
          `<tr><td>${k.toUpperCase()}</td><td>${yen(r.pricing[k].cost)}</td><td>${yen(r.pricing[k].price)}</td><td>${yen(r.pricing[k].gross_profit)}</td></tr>`,
      ),
    ),
  )}</div><details><summary>全統計量と Driver 寄与</summary>${table(
    ["統計量", "人月"],
    [
      "mean",
      "median",
      "std",
      "p10",
      "p25",
      "p50",
      "p75",
      "p80",
      "p90",
      "p95",
    ].map(
      (k) => `<tr><td>${k.toUpperCase()}</td><td>${number(s[k], 4)}</td></tr>`,
    ),
  )}${table(
    ["Driver", "平均 CO 寄与"],
    r.contributions.map(
      (c) => `<tr><td>${esc(c.name)}</td><td>${percent(c.mean)}</td></tr>`,
    ),
  )}</details>${notice(r.warnings)}<div class="actions"><a class="button small" href="/api/estimates/${rec.id}/csv">全 trial を CSV 保存 ↗</a>${btn("同一 Seed で再検証", "replay", false, `data-id="${rec.id}"`)}${link("AI 効果を比較 ↗", "ai")}</div><p class="status-line mono">${esc(rec.id)} · ${esc(r.input.model_id)}<br>${esc(r.algorithm_version)}</p>`;
}

function historyPage() {
  const entries = visibleEstimates();
  return (
    head(
      "ESTIMATE HISTORY",
      "見積り履歴",
      "保存時のモデル版・入力・乱数 Seed を保持した見積りです。",
      link("＋ 新規見積り", "estimate", true),
    ) +
    sampleNotice() +
    panel(
      "保存済み見積り",
      `${entries.length} estimates`,
      entries.length
        ? table(
            [
              "案件名",
              "規模単位",
              "P50 / 人月",
              "P80 / 人月",
              "P90 / 人月",
              "P80 提示価格",
              "データ",
            ],
            estimateRows(entries),
          )
        : empty(
            "保存済み見積りはありません",
            "シミュレーションを実行すると、結果は自動で保存されます。",
          ),
    ) +
    (selectedResult
      ? `<div class="section">${resultHTML(selectedResult)}</div>`
      : "")
  );
}

function benchmarkPage() {
  return (
    head(
      "JAPAN SOFTWARE BENCHMARK",
      "日本ベンチマーク",
      "IPA の公開統計と自社実績を、単位・業種・開発種別をそろえて比較します。",
    ) +
    `<div class="model-bar"><div><div class="model-name">ソフトウェア開発分析データ集 2022 <span class="badge neutral">IPA_BENCHMARK</span></div><div class="model-meta">2023/01/17 修正版 · 主要分析 1,479 件 / 累積 5,546 件 · 比較対象ごとの N は下表に表示</div></div><a class="button small" href="https://www.ipa.go.jp/digital/software-survey/metrics/metrics2022.html" target="_blank" rel="noreferrer">出典を確認 ↗</a></div><form id="benchmark-filter" class="filter-row">${select("業種", "industry", ["業種全体", "金融保険業", "情報通信業", "製造業"])}${select("開発種別", "project_type", ["新規開発", "改良開発"])}${field("1 人月の換算時間 / 人時", "hours_per_month", 160, "number", "自社データの人時換算に使用", 'min="1" max="744" required')}<div class="field">${submit("比較を更新")}</div></form><div id="benchmark-result"></div><div class="notice info">Benchmark は市場の参考値です。CoBRA の校正・α の補正には使用しません。対象期間、測定方法、工数範囲が異なる可能性があります。FP の業種別統計など、原資料にない値は補完しません。</div><details><summary>出典・加工・利用条件</summary><p class="source-note">Copyright 2022 IPA。公開 Excel の集計セルから抜粋して再表示しています。個別統計の出典セルは下表に表示。加工・表示の責任主体は CoBRA Web contributors です。加工部分について著作者人格権を行使しません。</p><a href="/static/ipa-benchmark-terms.txt">IPA グラフデータ使用条件全文 ↗</a></details>`
  );
}
async function renderBenchmark(
  industry = "業種全体",
  projectType = "新規開発",
  hours = 160,
) {
  const compare = await api(
    `/api/benchmark/compare?industry=${encodeURIComponent(industry)}&project_type=${encodeURIComponent(projectType)}&hours_per_month=${hours}`,
  );
  const suffix = projectType === "新規開発" ? "new" : "enhancement";
  const rows = state.benchmark.records.filter(
    (r) => r.industry === industry && r.metric.endsWith(suffix),
  );
  const sloc = rows.find((r) => r.metric === "sloc_" + suffix),
    fp = rows.find((r) => r.metric === "fp_" + suffix),
    dur = rows.find((r) => r.metric === "duration_" + suffix);
  const stats = [
    ["SLOC 生産性", sloc, compare.organization.SLOC, "SLOC/人時"],
    ["FP 生産性", fp, compare.organization.FP, "FP/人時"],
    ["開発期間", dur, compare.organization.duration, "月"],
  ];
  $("#benchmark-result").innerHTML =
    panel(
      "自社実績と日本市場",
      "中央値による比較。自社の比較対象は、選択した業種・開発種別の従来開発案件です。",
      table(
        ["指標", "自社 / 中央値", "自社 N", "IPA / 中央値", "IPA N", "単位"],
        stats.map(
          ([label, r, org, unit]) =>
            `<tr><td>${label}</td><td>${number(org.median, 4)}</td><td>${org.n}</td><td>${number(r?.median, 4)}</td><td>${r?.n ?? "未収録"}</td><td>${unit}</td></tr>`,
        ),
      ),
    ) +
    `<div class="grid-2 equal">${panel("業種別 SLOC 生産性", `${projectType} · SLOC / 人時`, '<div id="benchmark-chart" class="chart"></div>')}${panel("工程別工数比率", `${projectType} · IPA 各工程の平均`, '<div id="phase-benchmark" class="chart"></div><p class="chart-note">IPA の工程区分を保持しています。「製作」を Coding だけに読み替えません。</p>')}</div>` +
    panel(
      "統計の出典",
      "出典ごとの件数・単位・四分位範囲",
      table(
        ["指標・工程", "N", "P25", "中央値", "P75", "元ファイル / セル"],
        rows.map(
          (r) =>
            `<tr><td>${esc(r.metric)} · ${esc(r.label)}</td><td>${r.n}</td><td>${number(r.p25, 4)}</td><td>${number(r.median, 4)}</td><td>${number(r.p75, 4)}</td><td>${esc(r.workbook)}<small>${esc(r.sheet)}!${esc(r.cells)}</small></td></tr>`,
        ),
      ),
    );
  const inds = state.benchmark.records.filter(
    (r) => r.metric === "sloc_" + suffix,
  );
  chart("benchmark-chart", {
    grid: { left: 100, right: 25, top: 25, bottom: 30 },
    xAxis: axis(""),
    yAxis: {
      type: "category",
      data: inds.map((r) => r.industry),
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        type: "bar",
        barWidth: 17,
        data: inds.map((r) => r.median),
        itemStyle: { color: "#6886df", borderRadius: [0, 3, 3, 0] },
      },
    ],
  });
  const phases = rows.filter((r) => r.metric === "phase_" + suffix);
  chart("phase-benchmark", {
    grid: { left: 90, right: 35, top: 25, bottom: 30 },
    xAxis: {
      ...axis(""),
      axisLabel: { formatter: (v) => Math.round(v * 100) + "%" },
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: phases.map((r) => r.label),
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        type: "bar",
        barWidth: 14,
        data: phases.map((r) => r.mean),
        itemStyle: { color: "#9bafe4", borderRadius: [0, 3, 3, 0] },
      },
    ],
  });
}

function phaseRow(p) {
  return `<tr class="phase-row"><td><input class="phase-name" name="phase_name" value="${esc(p.name)}" aria-label="工程名" required></td>${["weight", "adoption", "improvement", "review", "rework", "fixed"].map((k) => `<td><input name="phase_${k}" type="number" aria-label="${esc(p.name)} ${k}" value="${k === "fixed" ? p[k] : Number((p[k] * 100).toFixed(6))}" min="0" ${k === "fixed" ? "" : 'max="100"'} step="any" required></td>`).join("")}<td><button type="button" class="table-link" data-action="remove-row">削除</button></td></tr>`;
}
function scenarioForm(s) {
  return `<form id="scenario-form"><div class="form-grid three">${field("Scenario 名", "name", s.name, "text", "", "required")}${select("Scenario 分類", "category", ["Baseline", "Conservative", "Standard", "Aggressive", "Custom"], s.category)}${select(
    "Review / Rework の分母",
    "review_basis",
    [
      ["AI_APPLIED", "Baseline × AI 適用率"],
      ["BASELINE", "工程 Baseline 全体"],
    ],
    s.review_basis,
  )}</div><div class="table-wrap"><table class="compact-numbers"><thead><tr><th>工程名</th><th>配分 %</th><th>AI適用 %</th><th>削減 %</th><th>Review %</th><th>Rework %</th><th>固定 / 人月</th><th></th></tr></thead><tbody id="phases-body">${s.phases.map(phaseRow).join("")}</tbody></table></div><div class="toolbar"><span class="subtitle" id="phase-total">工程配分 合計 100%</span>${btn("＋ 工程を追加", "add-phase")}</div><details><summary>工程配分の出所・費用・投資</summary><div class="form-grid three">${select(
    "工程配分の出所",
    "phase_source",
    [
      ["MANUAL", "手動設定"],
      ["COMPANY_ACTUAL", "組織実績"],
      ["PROJECT_TYPE", "開発種別"],
      ["IPA_BENCHMARK", "日本ベンチマーク"],
    ],
    s.phase_source,
  )}${field("配分の根拠", "phase_source_note", s.phase_source_note, "text", "", "required")}${field("投資の配賦ルール", "allocation_rule", s.allocation_rule, "text", "", "required")}${field("AI ツール費 / 円", "tool_cost", s.tool_cost, "number", "License / API / Agent", 'min="0" step="any" required')}${field("AI インフラ費 / 円", "infrastructure_cost", s.infrastructure_cost, "number", "GPU / RAG 等", 'min="0" step="any" required')}${field("その他 AI 費 / 円", "other_cost", s.other_cost, "number", "Governance 等。工数と二重計上しない", 'min="0" step="any" required')}${field("追加導入投資 / 円", "investment", s.investment, "number", "運用原価とは別に ROI へ反映", 'min="0" step="any" required')}</div><label class="check-label"><input type="checkbox" name="hypothesis" ${s.hypothesis ? "checked" : ""}>パラメータは未検証の仮説</label></details>${submit("Scenario を新しい版として保存")}</form>`;
}
function aiPage() {
  const estimates = visibleEstimates();
  const scenario =
    state.scenarios.find((r) => r.id === query.get("scenario")) ||
    state.scenarios.find((r) => r.id === "preset-Standard");
  const impacts = state.impacts.filter((r) =>
    mode === "sample" ? !isCompany(r) : isCompany(r),
  );
  if (!selectedImpact) selectedImpact = impacts[0] || null;
  return (
    head(
      "AI IMPACT ANALYSIS",
      "AI 導入効果",
      "工程ごとの削減効果と、レビュー・手戻り・AI 費用を含めて比較します。",
    ) +
    sampleNotice() +
    `<div class="notice info">初期 Scenario と工程比率は手動の仮説です。実績に基づく効果として扱わず、組織のデータで更新してください。</div>` +
    panel(
      "比較条件",
      "保存済み見積りの Baseline から AI 効果を計算します。",
      `<form id="impact-form" class="form-grid three">${select(
        "Baseline 見積り",
        "estimate_id",
        estimates.map((r) => [
          r.id,
          r.data.input.name + " · " + r.id.slice(-6),
        ]),
        estimates[0]?.id,
        "required",
      )}${select(
        "AI Scenario",
        "scenario_id",
        state.scenarios.map((r) => [
          r.id,
          r.data.name + " · " + (r.created_at ? r.id.slice(-6) : "初期仮説"),
        ]),
        scenario.id,
        'id="scenario-selector"',
      )}${select("見積り代表値", "percentile", ["p50", "p80", "p90"], "p80")}<div class="span-all">${submit("Baseline と比較・保存")}</div></form>`,
    ) +
    (estimates.length
      ? ""
      : `<p class="status-line">先に <a href="${path("estimate")}">見積りを保存</a> してください。</p>`) +
    (impacts.length
      ? `<details><summary>保存済みの比較 (${impacts.length})</summary>${table(
          ["保存日時", "Scenario", "基準値", ""],
          impacts.map(
            (r) =>
              `<tr><td>${date(r.created_at)}</td><td>${esc(r.data.scenario_snapshot.data.name)}</td><td>${esc(r.data.input.percentile.toUpperCase())}</td><td><button class="table-link" data-action="view-impact" data-id="${r.id}">保存結果を表示 ↗</button></td></tr>`,
          ),
        )}</details>`
      : "") +
    `<div class="section" id="impact-result">${selectedImpact ? impactHTML(selectedImpact) : ""}</div><div class="section">${panel("工程別 AI パラメータ", "削減 = Baseline 工数 × AI 適用率 × 削減率。元の固定工数は削減対象外です。", `<div id="scenario-editor">${scenarioForm(scenario.data)}</div>`)}</div><div class="section">${panel(
      "AI 実績を蓄積する",
      "予測と実績工程工数を記録し、次の Scenario 改訂に活用します。",
      state.ai_actuals.length
        ? table(
            [
              "案件 / 工程",
              "AI Tool",
              "予測 / 人月",
              "実績 / 人月",
              "差分 / 人月",
              "Review / Rework",
            ],
            state.ai_actuals.map(
              (r) =>
                `<tr><td>${esc(r.data.project_id)} / ${esc(r.data.phase)}</td><td>${esc(r.data.tools)}</td><td>${number(r.data.model_prediction)}</td><td>${number(r.data.actual_result)}</td><td>${number(r.data.prediction_error)}</td><td>${number(r.data.review_effort)} / ${number(r.data.rework_effort)}</td></tr>`,
            ),
          )
        : empty(
            "AI 実績は未登録です",
            "自社の AI 利用案件と予測見積りを紐づけて、工程別に記録できます。",
          ),
      btn("＋ AI 実績を登録", "new-ai-actual"),
    )}</div>`
  );
}
function impactHTML(rec) {
  const r = rec.data.result;
  return `<div class="kpis">${kpi("Baseline 工数", number(r.baseline.effort), "人月")}${kpi("AI 適用後工数", number(r.after.effort), "人月", `削減率 ${percent(r.effort_reduction_rate)}`, true)}${kpi("原価差額", number(r.benefit / 10000), "万円", "追加投資を差し引く前")}${kpi("AI ROI", r.roi === null ? "—" : percent(r.roi), "", r.roi === null ? "追加投資が 0 のため算出不可" : "追加投資を差し引いた便益 / 投資")}</div><div class="grid-2">${panel("工程別の工数比較", "Baseline / AI 適用後", '<div id="ai-chart" class="chart tall"></div>', '<div class="legend"><span><i class="gray"></i>Baseline</span><span><i></i>AI</span></div>')}${panel(
    "コストと価格",
    `原価に AI 費用 ${yen(r.ai_cost)} を含む`,
    table(
      ["項目", "Baseline", "AI"],
      [
        [
          "工数",
          number(r.baseline.effort) + " 人月",
          number(r.after.effort) + " 人月",
        ],
        ["原価", yen(r.baseline.cost), yen(r.after.cost)],
        ["提示価格", yen(r.baseline.price), yen(r.after.price)],
        ["粗利", yen(r.baseline.gross_profit), yen(r.after.gross_profit)],
      ].map((a) => `<tr>${a.map((v) => `<td>${v}</td>`).join("")}</tr>`),
    ) +
      `<div class="metric-row"><span>導入投資を差し引いた便益</span><strong>${yen(r.net_benefit)}</strong></div><div class="metric-row"><span>従来価格を維持した場合の粗利</span><strong>${yen(r.fixed_price_gross_profit)}</strong></div><p class="chart-note">提示価格は同じ目標粗利率で再計算。価格維持の場合を別途表示しています。</p>`,
  )}</div>${panel(
    "工程別の内訳",
    `元の固定工数 ${number(r.unchanged_fixed_effort)} 人月はそのまま加算。配賦ルール: ${esc(rec.data.scenario_snapshot.data.allocation_rule)}`,
    table(
      ["工程", "Baseline", "削減", "Review", "Rework", "固定AI", "AI後"],
      r.phases.map(
        (p) =>
          `<tr><td>${esc(p.name)}</td>${["baseline", "reduction", "review", "rework", "fixed", "after"].map((k) => `<td>${number(p[k], 2)}</td>`).join("")}</tr>`,
      ),
    ),
  )}<p class="status-line">保存版 ${esc(rec.id)} · Scenario ${esc(rec.data.scenario_snapshot.id)} · ${esc(rec.data.input.percentile.toUpperCase())}</p>`;
}
function aiChart() {
  if (!selectedImpact) return;
  const ps = selectedImpact.data.result.phases;
  chart("ai-chart", {
    grid: { left: 125, right: 25, top: 20, bottom: 30 },
    xAxis: axis("人月"),
    yAxis: {
      type: "category",
      inverse: true,
      data: ps.map((p) => p.name),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { fontSize: 10 },
    },
    series: [
      {
        name: "Baseline",
        type: "bar",
        data: ps.map((p) => p.baseline),
        barWidth: 7,
        itemStyle: { color: "#c6cddb", borderRadius: [0, 2, 2, 0] },
      },
      {
        name: "AI 適用後",
        type: "bar",
        data: ps.map((p) => p.after),
        barWidth: 7,
        itemStyle: { color: "#4c72df", borderRadius: [0, 2, 2, 0] },
      },
    ],
  });
}
function actualEditor() {
  const ps = state.projects.filter(
    (r) => r.data.method === "AI_ASSISTED" && isCompany(r),
  );
  const es = state.estimates.filter(isCompany);
  openDialog(
    "AI 工程実績を登録",
    `<form id="actual-form"><div class="form-grid">${select(
      "AI 利用プロジェクト",
      "project_id",
      ps.map((p) => [p.data.id, p.data.name]),
      "",
      "required",
    )}${select(
      "予測見積り",
      "estimate_id",
      es.map((e) => [e.id, e.data.input.name]),
      "",
      "required",
    )}${select(
      "Scenario",
      "scenario_id",
      state.scenarios.map((s) => [s.id, s.data.name]),
    )}${field("工程名", "phase", "", "text", "Scenario と同じ工程名を入力", "required")}${field("使用 AI Tool", "tools", "", "text", "", "required")}${field("AI 適用率 / %", "adoption", 0, "number", "", 'required min="0" max="100" step="any"')}${field("AI 利用時間 / h", "usage_hours", 0, "number", "", 'required min="0" step="any"')}${field("実績工程工数 / 人月", "actual_effort", "", "number", "Review と Rework を含む", 'required min="0.000001" step="any"')}${field("Review 工数 / 人月", "review_effort", 0, "number", "", 'required min="0" step="any"')}${field("Rework 工数 / 人月", "rework_effort", 0, "number", "", 'required min="0" step="any"')}${field("AI ツール費 / 円", "tool_cost", 0, "number", "", 'required min="0" step="any"')}${field("不具合数", "defects", 0, "number", "", 'required min="0"')}</div>${area("備考", "notes", "")}${submit("実績を保存")}</form>`,
  );
}

async function render() {
  disposeCharts();
  if (page === "history" && !selectedResult)
    selectedResult =
      visibleEstimates().find((r) => r.id === query.get("estimate")) || null;
  $("#workspace-mode").value = mode;
  $$(".nav-link,.brand").forEach((a) => {
    const u = new URL(a.href);
    if (mode === "sample") u.searchParams.set("workspace", "sample");
    else u.searchParams.delete("workspace");
    a.href = u.pathname + u.search;
  });
  const views = {
    dashboard,
    projects: projectsPage,
    drivers: driversPage,
    calibration: calibrationPage,
    validation: validationPage,
    estimate: estimatePage,
    benchmark: benchmarkPage,
    ai: aiPage,
    history: historyPage,
  };
  $("#app").innerHTML = views[page]();
  $("#app").className = "fade-in";
  const m = currentModel();
  if (m) {
    regression(m);
    regression(m, "validation-chart", true);
  }
  if (page === "dashboard" && visibleEstimates()[0])
    distribution(visibleEstimates()[0].data);
  if (selectedResult && page !== "dashboard") distribution(selectedResult.data);
  if (page === "benchmark") await renderBenchmark();
  if (page === "ai") aiChart();
}
function formObject(form) {
  return Object.fromEntries(new FormData(form));
}
function numeric(obj, names) {
  for (const k of names) obj[k] = Number(obj[k]);
  return obj;
}
function readLevels(form) {
  return Object.fromEntries(
    [...new FormData(form)]
      .filter(([k]) => k.startsWith("level_"))
      .map(([k, v]) => [k.slice(6), Number(v)]),
  );
}
function changeQuery(key, value) {
  const params = new URLSearchParams(location.search);
  params.set(key, value);
  location.href = location.pathname + "?" + params;
}

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (
    !form.getAttribute("id").endsWith("-form") &&
    form.getAttribute("id") !== "benchmark-filter"
  )
    return;
  event.preventDefault();
  const button = $('button[type="submit"]', form);
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "処理中…";
  const error = $(".form-error", form);
  if (error) error.hidden = true;
  try {
    let data = formObject(form);
    if (form.getAttribute("id") === "project-form") {
      const levels = readLevels(form);
      Object.keys(data)
        .filter((k) => k.startsWith("level_"))
        .forEach((k) => delete data[k]);
      numeric(data, ["size", "actual_effort", "fixed_effort"]);
      data.levels = levels;
      data.excluded = $('[name="excluded"]', form).checked;
      for (const k of ["start", "end", "duration_months"])
        if (!data[k]) delete data[k];
      if (data.duration_months)
        data.duration_months = Number(data.duration_months);
      await api("/api/projects", data);
      closeDialog();
      await refresh();
      await render();
      toast("実績を保存しました。");
    } else if (form.getAttribute("id") === "driver-form") {
      const ds = structuredClone(currentDrivers().data);
      const driver = {
        id: data.id,
        name: data.name,
        description: data.description,
        levels: [0, 1, 2, 3].map((i) => data["definition_" + i]),
        experts: $$(".expert-row", form).map((row) => ({
          name: $('[name="expert_name"]', row).value,
          ...Object.fromEntries(
            ["minimum", "mode", "maximum"].map((k) => [
              k,
              Number($(`[name="expert_${k}"]`, row).value) / 100,
            ]),
          ),
        })),
        enabled: $('[name="enabled"]', form).checked,
      };
      const index = ds.drivers.findIndex((d) => d.id === form.dataset.oldId);
      if (index >= 0) ds.drivers[index] = driver;
      else ds.drivers.push(driver);
      ds.name = data.version_name;
      await api("/api/drivers", ds);
      closeDialog();
      await refresh();
      await render();
      toast("Driver と Expert Assessment の新しい版を保存しました。");
    } else if (form.getAttribute("id") === "calibration-form") {
      data.project_ids = new FormData(form).getAll("project_ids");
      numeric(data, ["trials", "seed"]);
      const saved = await api("/api/calibrations", data);
      query.set("model", saved.id);
      await refresh();
      await render();
      toast("モデル校正と交差検証が完了しました。");
    } else if (form.getAttribute("id") === "estimate-form") {
      const levels = readLevels(form);
      Object.keys(data)
        .filter((k) => k.startsWith("level_"))
        .forEach((k) => delete data[k]);
      data.levels = levels;
      numeric(data, ["size", "fixed_effort", "trials", "seed"]);
      const pricing = {};
      for (const k of [
        "unit_cost",
        "target_margin",
        "management_cost",
        "infrastructure_cost",
        "contingency",
      ]) {
        pricing[k] = Number(data[k]);
        delete data[k];
      }
      pricing.target_margin /= 100;
      data.pricing = pricing;
      selectedResult = await api("/api/estimates", data);
      await refresh();
      disposeCharts();
      $("#estimate-result").innerHTML = resultHTML(selectedResult);
      distribution(selectedResult.data);
      $("#estimate-result").scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      toast("見積りをモデル版と一緒に保存しました。");
    } else if (form.getAttribute("id") === "scenario-form") {
      const phases = $$(".phase-row", form).map((row) => ({
        name: $('[name="phase_name"]', row).value,
        ...Object.fromEntries(
          [
            "weight",
            "adoption",
            "improvement",
            "review",
            "rework",
            "fixed",
          ].map((k) => [
            k,
            Number($(`[name="phase_${k}"]`, row).value) /
              (k === "fixed" ? 1 : 100),
          ]),
        ),
      }));
      Object.keys(data)
        .filter(
          (k) =>
            k.startsWith("phase_") &&
            !["phase_source", "phase_source_note"].includes(k),
        )
        .forEach((k) => delete data[k]);
      data.phases = phases;
      data.hypothesis = $('[name="hypothesis"]', form).checked;
      numeric(data, [
        "tool_cost",
        "infrastructure_cost",
        "other_cost",
        "investment",
      ]);
      const saved = await api("/api/scenarios", data);
      query.set("scenario", saved.id);
      await refresh();
      await render();
      toast("工程配分・AI パラメータを新しい版として保存しました。");
    } else if (form.getAttribute("id") === "impact-form") {
      selectedImpact = await api("/api/impacts", data);
      await refresh();
      disposeCharts();
      $("#impact-result").innerHTML = impactHTML(selectedImpact);
      aiChart();
      toast("AI 導入効果の比較を保存しました。");
    } else if (form.getAttribute("id") === "actual-form") {
      numeric(data, [
        "adoption",
        "usage_hours",
        "actual_effort",
        "review_effort",
        "rework_effort",
        "tool_cost",
        "defects",
      ]);
      data.adoption /= 100;
      await api("/api/ai-actuals", data);
      closeDialog();
      await refresh();
      await render();
      toast("AI 工程実績を保存しました。");
    } else if (form.getAttribute("id") === "import-form") {
      const file = $('[name="file"]', form).files[0];
      if (!file) throw new Error("CSV ファイルを選択してください。");
      const result = await api("/api/projects/import", {
        content: await file.text(),
      });
      closeDialog();
      await refresh();
      await render();
      toast(`${result.count} 件の実績を読み込みました。`);
    } else if (form.getAttribute("id") === "benchmark-filter") {
      disposeCharts();
      await renderBenchmark(
        data.industry,
        data.project_type,
        Number(data.hours_per_month),
      );
    }
  } catch (e) {
    if (error) {
      error.textContent = e.message;
      error.hidden = false;
      error.scrollIntoView({ block: "nearest" });
    } else toast(e.message, true);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
});

document.addEventListener("click", async (event) => {
  const el = event.target.closest("[data-action]");
  if (!el) return;
  try {
    switch (el.dataset.action) {
      case "sample":
        changeQuery("workspace", "sample");
        break;
      case "new-project":
        projectEditor();
        break;
      case "edit-project":
        projectEditor(el.dataset.id);
        break;
      case "new-driver":
        driverEditor();
        break;
      case "edit-driver":
        driverEditor(el.dataset.id);
        break;
      case "add-expert":
        $("#experts-body").insertAdjacentHTML("beforeend", expertRow());
        break;
      case "remove-row":
        el.closest("tr").remove();
        updatePhaseTotal();
        break;
      case "add-phase":
        $("#phases-body").insertAdjacentHTML(
          "beforeend",
          phaseRow({
            name: "追加工程",
            weight: 0,
            adoption: 0,
            improvement: 0,
            review: 0,
            rework: 0,
            fixed: 0,
          }),
        );
        break;
      case "import-csv":
        openDialog(
          "CSV をインポート",
          `<form id="import-form"><p class="subtitle">全行を検証後にまとめて保存します。同じ ID の案件は新しい履歴として更新されます。</p>${field("CSV ファイル", "file", "", "file", "UTF-8 / levels 列は Driver ID と Level の JSON", 'accept=".csv,text/csv" required')}${submit("読み込む")}</form>`,
        );
        break;
      case "view-estimate":
        selectedResult = await api("/api/estimates/" + el.dataset.id);
        if (page === "history") {
          await render();
          $("#distribution")?.scrollIntoView({ behavior: "smooth" });
        } else {
          const params = new URLSearchParams();
          if (mode === "sample") params.set("workspace", "sample");
          params.set("estimate", selectedResult.id);
          location.href = "/history?" + params;
        }
        break;
      case "replay":
        el.disabled = true;
        const replay = await api(
          "/api/estimates/" + el.dataset.id + "/replay",
          {},
        );
        toast(
          replay.identical
            ? "保存時の全 trial と完全に一致しました。"
            : "再計算結果が一致しません。保存時の実行環境を確認してください。",
          !replay.identical,
        );
        el.disabled = false;
        break;
      case "histogram":
      case "cdf": {
        const rec = selectedResult || visibleEstimates()[0];
        const existing = echarts.getInstanceByDom($("#distribution"));
        if (existing) existing.dispose();
        distribution(rec.data, "distribution", el.dataset.action === "cdf");
        $$(".pill-tabs button").forEach((b) =>
          b.classList.toggle("selected", b === el),
        );
        break;
      }
      case "view-impact":
        selectedImpact = state.impacts.find((r) => r.id === el.dataset.id);
        disposeCharts();
        $("#impact-result").innerHTML = impactHTML(selectedImpact);
        aiChart();
        break;
      case "new-ai-actual":
        actualEditor();
        break;
    }
  } catch (e) {
    toast(e.message, true);
    el.disabled = false;
  }
});
function updatePhaseTotal() {
  const display = $("#phase-total");
  if (!display) return;
  const total = $$('[name="phase_weight"]').reduce(
    (s, e) => s + Number(e.value),
    0,
  );
  display.textContent = "工程配分 合計 " + number(total, 2) + "%";
  display.style.color = Math.abs(total - 100) > 0.00001 ? "#a33c35" : "";
}
document.addEventListener("input", (event) => {
  if (event.target.name === "phase_weight") updatePhaseTotal();
});
document.addEventListener("change", (event) => {
  if (event.target.id === "workspace-mode")
    changeQuery("workspace", event.target.value);
  if (event.target.id === "model-selector")
    changeQuery("model", event.target.value);
  if (event.target.id === "scenario-selector") {
    const rec = state.scenarios.find((r) => r.id === event.target.value);
    $("#scenario-editor").innerHTML = scenarioForm(rec.data);
  }
});
$("#close-dialog").addEventListener("click", closeDialog);
window.addEventListener("resize", () =>
  chartInstances.filter((c) => !c.isDisposed()).forEach((c) => c.resize()),
);
(async () => {
  try {
    await refresh();
    await render();
  } catch (e) {
    $("#app").innerHTML = empty(
      "ワークスペースを読み込めませんでした",
      esc(e.message),
      '<a class="button" href="">再読み込み</a>',
    );
  }
})();
