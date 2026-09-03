import { test, expect } from '@playwright/test';

const labels = ['PMのコミュニケーション能力','システムの習熟度','チームの経験・知識','プロジェクトマネージャの経験・知識','プロジェクト目標の明確さ・共有度合い','メンバのスキル','システムの再利用可能度合い','システムの複雑さ','信頼性要求のレベル','見積り時の要求内容の曖昧さ','要求変更の発生想定時期','業務の複雑さ','顧客の参画度合い','統制の取れた要求管理','開発期間の厳しさ','関係者の数','チーム内の役割分担や責任の明確さ','品質管理に対する要求','並行開発案件の本数'];

test('three analytical fixtures → calibration → LOOCV; form id must not be clobbered', async ({ page }) => {
  const errors=[]; page.on('pageerror', error=>errors.push(error.message));
  await page.goto('/projects');
  for(const i of [1,2,3]) {
    await page.getByRole('button',{name:'＋ プロジェクト登録'}).click();
    await page.getByRole('textbox',{name:'Project ID 英数字・ハイフン・アンダースコア'}).fill('ci-fixture-'+i);
    await page.getByRole('textbox',{name:'プロジェクト名',exact:true}).fill('CI TEST ONLY '+i);
    await page.getByRole('spinbutton',{name:'開発規模',exact:true}).fill(String(i*100));
    await page.getByRole('spinbutton',{name:'実績工数 / 人月 固定工数を含む総工数'}).fill(String(i*20+2));
    await page.getByRole('spinbutton',{name:'うち固定工数 / 人月'}).fill('2');
    for(const label of labels) await page.getByRole('combobox',{name:label,exact:true}).selectOption('0');
    await page.getByRole('button',{name:'実績を保存',exact:true}).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('cell',{name:'CI TEST ONLY '+i,exact:false})).toBeVisible();
  }
  await page.getByRole('link',{name:'モデル校正',exact:true}).click();
  await page.getByRole('textbox',{name:'モデル名',exact:true}).fill('CI analytical model');
  await page.getByRole('button',{name:'校正・交差検証を実行'}).click();
  await expect(page.getByRole('status')).toHaveText('モデル校正と交差検証が完了しました。');
  await page.getByRole('link',{name:'精度検証',exact:true}).click();
  await expect(page.getByRole('heading',{name:'案件別の検証結果'})).toBeVisible();
  const rows=page.getByRole('table').getByRole('row');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(1)).toContainText('0.0%');
  await expect(rows.nth(1)).toContainText('0.2000000');
  expect(errors).toEqual([]);
});

test('official sample → saved estimate → exact replay → CDF → AI comparison', async ({ page }) => {
  const errors=[]; page.on('pageerror', error=>errors.push(error.message));
  await page.goto('/estimate?workspace=sample');
  await page.getByRole('button',{name:'シミュレーションを実行・保存'}).click();
  await expect(page.getByRole('heading',{name:'公開サンプル検証見積り'})).toBeVisible();
  await expect(page.getByText('183.6', {exact:false}).first()).toBeVisible();
  await page.getByRole('button',{name:'同一 Seed で再検証'}).click();
  await expect(page.getByRole('status')).toHaveText('保存時の全 trial と完全に一致しました。');
  await page.getByRole('button',{name:'CDF',exact:true}).click();
  await expect(page.getByRole('button',{name:'CDF',exact:true})).toHaveClass('selected');
  await page.getByRole('link',{name:'AI 導入効果',exact:true}).click();
  await page.getByRole('button',{name:'Baseline と比較・保存'}).click();
  await expect(page.getByRole('heading',{name:'工程別の内訳'})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading',{name:'工程別の内訳'})).toBeVisible();
  expect(errors).toEqual([]);
});

test('expert validation and immutable driver version', async ({ page }) => {
  await page.goto('/drivers');
  await page.getByRole('row').filter({hasText:'PMのコミュニケーション能力'}).getByRole('button').click();
  await page.getByRole('spinbutton',{name:'minimum / %',exact:true}).fill('60');
  await page.getByRole('button',{name:'新しい版として保存',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('最小値 ≤ 最頻値 ≤ 最大値');
  await page.getByRole('spinbutton',{name:'minimum / %',exact:true}).fill('10');
  await page.getByRole('spinbutton',{name:'mode / %',exact:true}).fill('22');
  await page.getByRole('button',{name:'新しい版として保存',exact:true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('row').filter({hasText:'PMのコミュニケーション能力'})).toContainText('22.0%');
});

test('benchmark missing data, source cells, and responsive layout', async ({ page }) => {
  await page.goto('/benchmark');
  await expect(page.getByRole('heading',{name:'自社実績と日本市場'})).toBeVisible();
  await expect(page.getByRole('table').first()).toContainText('3.7641');
  await expect(page.getByRole('table').first()).toContainText('0.1513');
  await page.getByRole('combobox',{name:'業種',exact:true}).selectOption('製造業');
  await page.getByRole('button',{name:'比較を更新'}).click();
  await expect(page.getByRole('table').first()).toContainText('未収録');
  await page.setViewportSize({width:390,height:844});
  await page.goto('/dashboard?workspace=sample');
  await expect(page.getByRole('heading',{name:'ダッシュボード',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
});
