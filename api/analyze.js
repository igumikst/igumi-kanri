// /api/analyze.js
// Claude APIでテキスト解析 → Supabaseに案件登録 → LINE通知

const { createClient } = require("@supabase/supabase-js");

/**
 * メインパイプライン
 * @param {Object} params
 * @param {string} params.transcript     - Whisperの文字起こし結果
 * @param {string} params.recordingUrl   - 録音ファイルURL
 * @param {string} params.callSid        - TwilioのCallSid
 * @param {string} params.fromNumber     - 発信者番号
 */
async function analyzeAndRegister({ transcript, recordingUrl, callSid, fromNumber }) {
  // 1. Claude APIで解析
  const analysis = await analyzeWithClaude(transcript);
  console.log("[analyze] Claude analysis:", JSON.stringify(analysis));

  // 2. 案件番号生成（TEL-YYYYMMDD-XXX形式）
  const caseNumber = await generateCaseNumber();

  // 3. Supabaseに登録
  const call = await registerToSupabase({
    caseNumber,
    analysis,
    transcript,
    recordingUrl,
    fromNumber,
  });
  console.log("[analyze] Registered to Supabase:", call.id);

  // 4. LINE通知
  await sendLineNotification({ caseNumber, analysis, fromNumber });
  console.log("[analyze] LINE notification sent");

  return call;
}

// ─────────────────────────────────────────
// Claude API解析
// ─────────────────────────────────────────
async function analyzeWithClaude(transcript) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const prompt = `以下は不動産管理会社（管理会社）からの電話の文字起こしです。
内容を分析して、以下の情報をJSON形式で抽出してください。

【文字起こし】
${transcript}

【抽出項目】
- company_name: 会社名（管理会社名）。不明の場合は空文字
- contact_name: 担当者名。不明の場合は空文字
- phone_number: 折返し先電話番号。不明の場合は空文字
- property_name: 物件名。不明の場合は空文字
- room_number: 部屋番号。不明の場合は空文字
- case_type: 用件の種類（例：水漏れ、鍵紛失、エアコン故障、設備修理、その他）
- urgency: 緊急度（「緊急」「通常」「低」のいずれか）
- ai_summary: 用件の要約（100文字以内）
- tags: 案件に関連するタグの配列（例：["水漏れ", "1階", "応急対応"]）

必ずJSON形式のみで返してください。説明文は不要です。`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const rawText = data.content[0].text.trim();

  // JSON抽出（```json ... ``` の場合も対応）
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude returned no JSON");

  return JSON.parse(jsonMatch[0]);
}

// ─────────────────────────────────────────
// 案件番号生成
// ─────────────────────────────────────────
async function generateCaseNumber() {
  const supabase = getSupabase();
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD

  // 今日の案件数を取得してシーケンス番号を決定
  const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
  const { count } = await supabase
    .from("calls")
    .select("*", { count: "exact", head: true })
    .gte("received_at", startOfDay);

  const seq = String((count || 0) + 1).padStart(3, "0");
  return `TEL-${dateStr}-${seq}`;
}

// ─────────────────────────────────────────
// Supabase登録
// ─────────────────────────────────────────
async function registerToSupabase({ caseNumber, analysis, transcript, recordingUrl, fromNumber }) {
  const supabase = getSupabase();

  const record = {
    case_number: caseNumber,
    received_at: new Date().toISOString(),
    company_name: analysis.company_name || "",
    contact_name: analysis.contact_name || "",
    phone_number: analysis.phone_number || fromNumber || "",
    property_name: analysis.property_name || "",
    room_number: analysis.room_number || "",
    case_type: analysis.case_type || "その他",
    urgency: analysis.urgency || "通常",
    ai_summary: analysis.ai_summary || "",
    transcript: transcript,
    recording_url: recordingUrl,
    status: "未対応",
    billing_checked: false,
    tags: analysis.tags || [],
  };

  const { data, error } = await supabase.from("calls").insert([record]).select().single();
  if (error) throw new Error(`Supabase insert error: ${error.message}`);
  return data;
}

// ─────────────────────────────────────────
// LINE通知
// ─────────────────────────────────────────
async function sendLineNotification({ caseNumber, analysis, fromNumber }) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const userId = process.env.LINE_USER_ID;
  if (!token || !userId) {
    console.warn("[analyze] LINE credentials missing – skipping notification");
    return;
  }

  const urgencyEmoji = analysis.urgency === "緊急" ? "🚨" : analysis.urgency === "通常" ? "⚡" : "📋";

  const message =
    `【IGUMI】新規案件が入電しました\n\n` +
    `📋 案件番号：${caseNumber}\n` +
    `🏢 管理会社：${analysis.company_name || "不明"}\n` +
    `👤 担当者：${analysis.contact_name ? analysis.contact_name + "様" : "不明"}\n` +
    `📞 折返し先：${analysis.phone_number || fromNumber || "不明"}\n` +
    `🏠 物件：${analysis.property_name || "不明"}${analysis.room_number ? " " + analysis.room_number : ""}\n` +
    `${urgencyEmoji} 緊急度：${analysis.urgency || "通常"}\n` +
    `📝 用件：${analysis.ai_summary || "詳細は録音を確認してください"}\n\n` +
    `🔗 案件詳細：https://igumi-kanri.vercel.app/calls`;

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: userId,
      messages: [{ type: "text", text: message }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LINE API error ${response.status}: ${errText}`);
  }
}

// ─────────────────────────────────────────
// Supabaseクライアント（シングルトン）
// ─────────────────────────────────────────
let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_KEY not set");
  _supabase = createClient(url, key);
  return _supabase;
}

module.exports = { analyzeAndRegister };
