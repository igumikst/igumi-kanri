// ノートの物件名・営業担当から、既存の案件(projects)の候補を探す。AIは案件を決めない。必ず人が選ぶ。
// 物件名の比べ方は、見積ファイルの取り込みと同じ(片方がもう片方を含めば 1、それ以外は類似度。0.5以上の上位)。
import { normalizeText, similarity } from "../priceMatch";
import { visibleProjects } from "../projectMerge";

export const PROJECT_MIN_SCORE = 0.5;
export const PROJECT_MAX_CANDIDATES = 5;

// 部屋番号らしい数字(2〜4桁)を取り出す。「311」「805号室」「202」
const roomNumbers = s => (String(s || "").normalize("NFKC").match(/\d{2,4}/g) || []);

const nameScore = (target, projectName) => {
  const t = normalizeText(target), n = normalizeText(projectName);
  if (!t || !n) return 0;
  return n.includes(t) || t.includes(n) ? 1 : similarity(target, projectName);
};

export function findProjectCandidates({ pjs, salesReps, header }) {
  const targets = [header.propertyRaw, `${header.propertyName}${header.place}`, header.propertyName].filter(s => s && s.trim());
  const rep = normalizeText(header.repName);
  const repIds = new Set((salesReps || []).filter(s => rep && normalizeText(s.name).startsWith(rep)).map(s => s.id));
  const noteRooms = roomNumbers(`${header.place} ${header.propertyRaw}`);
  // 統合済み(統合元になって隠れた)案件は候補から除く(テーマ32)
  return visibleProjects(pjs).map(p => {
    const score = Math.max(0, ...targets.map(t => nameScore(t, p.name)));
    const repMatch = !!rep && (repIds.has(p.salesRepId) || normalizeText(p.salesRep).startsWith(rep));
    const pRooms = roomNumbers(p.name);
    const roomMismatch = noteRooms.length > 0 && pRooms.length > 0 && !noteRooms.some(r => pRooms.includes(r));
    return { p, score, repMatch, roomMismatch };
  })
    .filter(x => x.score >= PROJECT_MIN_SCORE)
    .sort((a, b) => (b.score + (b.repMatch ? 0.1 : 0)) - (a.score + (a.repMatch ? 0.1 : 0)))
    .slice(0, PROJECT_MAX_CANDIDATES);
}

// 営業担当の候補(同じ名字が複数いるときは全部出す)
export function findRepCandidates(salesReps, repName) {
  const rep = normalizeText(repName);
  if (!rep) return [];
  return (salesReps || []).filter(s => normalizeText(s.name).startsWith(rep));
}
