// ノートから見積の下書きを作るときの決まりごと(定数)。変えるときは、ここだけを直す。
// 人工への丸め(決定事項7・調査報告への回答2)と、卸値・定価の読み取り(回答3)もここに置く。

export const PREFERRED_PRICE_SET_NAME = "工事見積用"; // 先に探す単価セット。無ければ全部のセットから探す
export const LABOR_ITEM_NAME = "新規配管施工費"; // 「人数×時間」から作る人工の行(単価表の labor_manual の項目)
// 作業のうち、これに当てはまるもの(新規の配管)は、人工の行にまとめる(別の行にしない。調査報告への回答1)
export const LABOR_WORK_PATTERN = /新規.*配管|配管.*新規/;
export const MALL_ITEM_NAME = "配管モール施工費"; // 配管モールの材料は拾わず、この1行にまとめる(決定事項8)
export const DEFAULT_LABOR_UNIT_PRICE = 26000; // app_settings の labor_unit_price が読めなかったときだけ使う

// 人工の丸め方
export const LABOR_HALF_DAY = 0.5; // 半日 = 0.5人工
export const LABOR_FULL_DAY = 1; // 1日 = 1人工
export const HALF_DAY_MAX_HOURS = 4; // 4時間以下 = 半日、4時間より長い = 1日
export const FULL_DAY_HOURS = 8; // 9:00〜17:00 のような「1日」の長さ。これと4時間以下は確定、間の時間は人の確認(黄)

const toMinutes = t => {
  const m = String(t ?? "").normalize("NFKC").match(/^(\d{1,2})[:時](\d{2})?/);
  return m ? Number(m[1]) * 60 + Number(m[2] || 0) : null;
};

// 1件の人数・時間から人工を計算する。status: "ok"(確定)/ "check"(丸めたので人が確認)/ "unknown"(計算できない)
export function laborFromCrew(c) {
  const people = Number(c?.people);
  if (!Number.isFinite(people) || people <= 0) return { manDays: null, status: "unknown", reason: "人数が読み取れません" };
  const word = String(c.day_word ?? "").normalize("NFKC");
  if (/半日/.test(word)) return { manDays: people * LABOR_HALF_DAY, status: "ok", reason: `${people}名 半日` };
  if (/^1日|^一日|終日/.test(word)) return { manDays: people * LABOR_FULL_DAY, status: "ok", reason: `${people}名 1日` };

  let hours = null, ranged = false;
  const s = toMinutes(c.start), e = toMinutes(c.end);
  if (s != null && e != null && e > s) hours = (e - s) / 60;
  else if (c.hours_min != null || c.hours_max != null) {
    const lo = Number(c.hours_min ?? c.hours_max), hi = Number(c.hours_max ?? c.hours_min);
    if (Number.isFinite(lo) && Number.isFinite(hi)) { hours = hi; ranged = hi > lo; }
  }
  if (hours == null) return { manDays: null, status: "unknown", reason: "時間が読み取れません" };

  // 幅のある時間(1〜2時間など)は半日に丸める。ただし幅の上が4時間を超えるときは人が確認
  if (ranged) {
    if (hours <= HALF_DAY_MAX_HOURS) return { manDays: people * LABOR_HALF_DAY, status: "ok", reason: `${people}名 ${c.hours_min}〜${c.hours_max}時間 → 半日` };
    return { manDays: people * LABOR_FULL_DAY, status: "check", reason: `${people}名 ${c.hours_min}〜${c.hours_max}時間 → 1日として仮置き(要確認)` };
  }
  if (hours <= HALF_DAY_MAX_HOURS) return { manDays: people * LABOR_HALF_DAY, status: "ok", reason: `${people}名 ${hours}時間 → 半日` };
  if (hours === FULL_DAY_HOURS) return { manDays: people * LABOR_FULL_DAY, status: "ok", reason: `${people}名 ${hours}時間 → 1日` };
  return { manDays: people * LABOR_FULL_DAY, status: "check", reason: `${people}名 ${hours}時間 → 1日として仮置き(半日か1日か要確認)` };
}

// 人数・時間が複数書いてあるときは足し合わせる。1つでも確定でなければ、全体を確定にしない
export function laborFromCrews(crews) {
  const list = (crews || []).map(laborFromCrew);
  if (!list.length) return { manDays: null, status: "unknown", reason: "人数・時間の記載がありません" };
  if (list.some(x => x.status === "unknown")) return { manDays: null, status: "unknown", reason: list.map(x => x.reason).join(" / ") };
  const manDays = list.reduce((s, x) => s + x.manDays, 0);
  const status = list.length > 1 || list.some(x => x.status === "check") ? "check" : "ok";
  return { manDays, status, reason: list.map(x => x.reason).join(" / ") + (list.length > 1 ? "(複数の記載を合計。要確認)" : "") };
}

// 卸値・定価の文字を円にする。「¥9.447」のように点のあとが3桁なら桁の区切り(9,447円)。
// 「¥9.5」のように点のあとが3桁でないものは、読み違えないよう ok:false(赤)にする
export function parseYen(raw) {
  if (raw == null || String(raw).trim() === "") return { value: null, ok: true, empty: true };
  const s = String(raw).normalize("NFKC").replace(/[¥\\円\s]/g, "").replace(/^(卸値|定価|卸|税込|税抜)[:：]?/, "");
  if (/^\d{1,3}(,\d{3})+$/.test(s)) return { value: Number(s.replace(/,/g, "")), ok: true };
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return { value: Number(s.replace(/\./g, "")), ok: true };
  if (/^\d+$/.test(s)) return { value: Number(s), ok: true };
  return { value: null, ok: false };
}
