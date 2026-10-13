/* global process */
// /api/_noteParseCore.js
// 現調ノート(LINEのノートの文字)を、AI(Claude)で「分解だけ」する処理の本体。
// ファイル名が _ で始まるので、Vercel の関数(URL)にはならない。api/note-parse.js と回帰テストから使う。
//
// 役割分担(決定事項3・5): AIはノートを物件・営業担当・人数と時間・作業・材料に分けるだけ。
// 単価表への当てはめ・人工への丸め・金額の読み取りは、画面側のプログラム(src/lib/noteDraft/)で行う。
// AIには単価表・AIナレッジを送らない(結果をぶらさず、費用も抑えるため)。
import Anthropic from "@anthropic-ai/sdk";

export const NOTE_PARSE_DEFAULT_MODEL = "claude-sonnet-5-5";
export const NOTE_MAX_CHARS = 5000;
const MAX_TOKENS = 8000;
const API_TIMEOUT_MS = 45000; // Vercel の maxDuration(60秒)より先に、分かりやすいエラーで返す

// server-side fallbacks("default" の形)が使えるモデル。Haiku 5.5 には無い
const FALLBACK_MODELS = new Set(["claude-sonnet-5-5", "claude-opus-5-5"]);

const str = { type: "string" };
const nullableStr = { anyOf: [{ type: "string" }, { type: "null" }] };
const nullableNum = { anyOf: [{ type: "number" }, { type: "null" }] };
const obj = (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const arr = (items) => ({ type: "array", items });

// AIが返す形(すべての項目に raw = ノートの元の文字をそのまま付ける)
export const NOTE_SCHEMA = obj({
  property: obj({ raw: str, name: str, place: str }),
  work_title: obj({ raw: str, name: str }),
  sales_rep: obj({ raw: str, name: str }),
  crew: arr(obj({ raw: str, people: nullableNum, start: nullableStr, end: nullableStr, hours_min: nullableNum, hours_max: nullableNum, day_word: nullableStr })),
  works: arr(obj({ raw: str, text: str, qty: nullableNum, unit: str, detail_raw: nullableStr })),
  conditions: arr(obj({ raw: str })),
  materials: arr(obj({ raw: str, name: str, qty: nullableNum, unit: str, qty_certain: { type: "boolean" }, spec_raw: nullableStr, breakdown_raw: nullableStr, list_price_raw: nullableStr, wholesale_price_raw: nullableStr })),
  mall_materials: arr(obj({ raw: str, name: str, qty: nullableNum, unit: str })),
  markup_75: obj({ status: { type: "string", enum: ["unknown", "included", "not_included"] }, raw: nullableStr }),
  subcontract: arr(obj({ raw: str })),
  unparsed: arr(str),
  questions: arr(str),
});

export const NOTE_SYSTEM_PROMPT = `あなたは設備工事会社の事務アシスタントです。現場スタッフが書いた「現調ノート」(工事前の下見のメモ)を読み、決められたJSONの形に分けてください。
あなたの仕事は「書いてあることを分けること」だけです。見積の単価・金額・品番の当てはめは、あとでプログラムと人が行います。

# 絶対に守ること
- ノートに書いていないことを足さない。特に「養生」「撤去」「復旧」「処分」などの作業を、書いていないのに足さない。
- 「〜無し」「〜しない」「〜の為不要」と書いてある行は、作業(works)に入れず、conditions に入れる。1行の中に作業と「無し」が両方あるとき(例:「新規配管施工(既存配管撤去無し)」)は、作業は works に、「無し」の部分は conditions に分ける。
- 数量を推測しない。「5m程」「約」「位」「〜」のように曖昧な数量、数量が書いていない材料は qty を null にし、qty_certain を false にする。
- 単価・売価・原価を作らない。金額は、ノートに書いてある「卸値」「定価」の文字を、そのまま *_price_raw に入れるだけ(数字に直さない)。
- 7.5% や掛け率について、はっきり書いていなければ markup_75.status は "unknown"。
- 外注・他社見積の記述は、中身を変えずに subcontract に raw のまま入れる(項目・数量・仕様を足す・消す・変えるのは禁止)。
- どこにも分けられない行は unparsed に、元の文字のまま入れる。迷ったことは questions に短い日本語で書く。

# raw について
- すべての項目の raw には、ノートの元の文字をそのまま(1文字も変えずに)入れる。1つの品が複数行にまたがるときは、品名の行を raw にする。
- name / text には、記号(・ ↑ 先頭の空白)を外した、書いてあるとおりの言葉を入れる。言い換え・正式名称への変換・略語の展開はしない(「オスアダ」は「オスアダ」のまま)。

# 各項目
- property: 物件名と部屋番号・場所。name=建物名(書いてあるとおり)、place=部屋番号や場所(「311」「805号室」「2Fテナント」「管理人室地下ピット」など。無ければ空文字)。物件名と工事名が1行にくっついているときは分ける(raw はその行)。
- work_title: 工事名(「〜工事」の行)。name=工事名だけ。
- sales_rep: 「○○さん案件」の行。name は「さん案件」を外した名前(「加藤超さん案件」→「加藤超」)。無ければ raw も name も空文字。
- crew: 人数と時間の行(「2名作業9:00〜17:00」「1名1〜2時間」「2名1日」など)。people=人数、start/end=時刻("9:00" の形。無ければ null)、hours_min/hours_max=「1〜2時間」のような時間の幅(1つだけなら両方同じ。無ければ null)、day_word=「1日」「半日」などの言葉(無ければ null)。丸めや人工の計算はしない。
- works: 「内容」「作業」の見出しの下の作業。qty は「×3」のように書いてあるときだけ。detail_raw は、続く括弧書きや次の行の補足(「(リビング×2・化粧台×1)」「(調査時の開口)」)。「↑」で始まる行は、その行を1つの作業として入れる。
- materials: 「材料」の見出しの下の材料。name はサイズ込みの品名(「13ポリ管」「20×13オスアダ」「25A VBニップル150」「洗浄管38mm エルボ」)。qty と unit は「×5本」なら 5 と "本"、「×1」なら 1 と ""。spec_raw は寸法などの括弧書き(「(500×700)」)。breakdown_raw は数量の内訳の括弧書き(「13継手×15(チーズ×2)」の「(チーズ×2)」)。卸値・定価は、その品の list_price_raw / wholesale_price_raw に元の文字のまま(「¥ 9.447」「¥60,450」)。
- mall_materials: 「配管モール材料」の見出しの下の材料。materials には入れない。

# 例(架空のノート)
ノート:
サンプルハイツ101
洗面排水管交換工事
1名2時間
山田さん案件
作業
洗面台脱着(排水トラップ再利用の為交換無し)
材料
32排水ホース1m程
32エルボ×2
卸値¥500
返すJSONの要点: property={raw:"サンプルハイツ101",name:"サンプルハイツ",place:"101"}、work_title.name="洗面排水管交換工事"、sales_rep.name="山田"、crew=[{people:1,hours_min:2,hours_max:2,start:null,end:null,day_word:null}]、works=[{text:"洗面台脱着",detail_raw:null}]、conditions=[{raw:"(排水トラップ再利用の為交換無し)"}]、materials=[{name:"32排水ホース",qty:null,qty_certain:false,unit:""},{name:"32エルボ",qty:2,qty_certain:true,wholesale_price_raw:"¥500"}]、markup_75.status="unknown"。`;

export class NoteParseError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

const READ_FAIL = "AIが読み取れませんでした。もう一度試すか、手で入力してください";

// ノートの文字を分解する。text は電話番号を伏せたあとのもの(伏せる処理は画面側の maskPhone.js)
export async function parseNote({ text, model = NOTE_PARSE_DEFAULT_MODEL, apiKey = process.env.ANTHROPIC_API_KEY }) {
  if (typeof text !== "string" || !text.trim()) throw new NoteParseError("ノートの文字が空です", 400);
  if (text.length > NOTE_MAX_CHARS) throw new NoteParseError(`ノートが長すぎます(上限 ${NOTE_MAX_CHARS} 文字)`, 413);
  if (!apiKey) throw new NoteParseError("AI設定が完了していません(APIキー未設定)", 500);

  const client = new Anthropic({ apiKey, timeout: API_TIMEOUT_MS, maxRetries: 1 });
  const useFallback = FALLBACK_MODELS.has(model);
  const started = Date.now();
  let response;
  try {
    response = await client.beta.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: NOTE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `次の現調ノートを分けてください。\n\n<note>\n${text}\n</note>` }],
      output_config: { effort: "low", format: { type: "json_schema", schema: NOTE_SCHEMA } },
      ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
    });
  } catch (e) {
    if (e instanceof Anthropic.APIConnectionTimeoutError) throw new NoteParseError("AIの応答が時間内に返りませんでした。もう一度試してください", 504);
    if (e instanceof Anthropic.RateLimitError) throw new NoteParseError("AIが混み合っています。少し待ってからもう一度試してください", 503);
    if (e instanceof Anthropic.APIError) throw new NoteParseError(`${READ_FAIL}(AIのエラー ${e.status ?? ""})`, 502);
    throw new NoteParseError(READ_FAIL, 502);
  }
  const ms = Date.now() - started;
  if (response.stop_reason === "refusal") throw new NoteParseError(`${READ_FAIL}(AIが処理を断りました)`, 502);
  if (response.stop_reason === "max_tokens") throw new NoteParseError(`${READ_FAIL}(AIの返事が途中で切れました)`, 502);
  const textBlock = response.content.find(b => b.type === "text");
  let draft;
  try { draft = JSON.parse(textBlock?.text || ""); } catch { throw new NoteParseError(`${READ_FAIL}(返事の形が正しくありません)`, 502); }
  return {
    draft,
    meta: { model: response.model, ms, input_tokens: response.usage?.input_tokens ?? null, output_tokens: response.usage?.output_tokens ?? null },
  };
}
