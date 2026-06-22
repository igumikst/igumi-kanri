// /api/analyze.js
const { createClient } = require("@supabase/supabase-js");

async function analyzeAndRegister({ transcript, recordingUrl, callSid, fromNumber }) {
  const analysis = await analyzeWithClaude(transcript);
  console.log("[analyze] Claude analysis:", JSON.stringify(analysis));

  const caseNumber = await generateCaseNumber();

  const call = await registerToSupabase({
    caseNumber, analysis, transcript, recordingUrl, fromNumber,
  });
  console.log("[analyze] Registered to Supabase:", call.id);

  await sendLineNotification({ caseNumber, analysis, fromNumber });
  console.log("[analyze] LINE notification sent");

  return call;
}

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
      model: "claude-sonnet-4-6",
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
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude returned no JSON");
  return JSON.parse(jsonMatch[0]);
}

async function generateCaseNumber() {
  const supabase = getSupabase();
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
  const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
  const { count } = await supabase
    .from("calls")
    .select("*", { count: "exact", head: true })
    .gte("received_at", startOfDay);
  const seq = String((count || 0) + 1).padStart(3, "0");
  return `TEL-${dateStr}-${seq}`;
}

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
  // 同じ案件番号が既にあればスキップ
  const { data: existing } = await supabase
    .from("calls")
    .select("id")
    .eq("case_number", caseNumber)
    .single();
  if (existing) {
    console.log("[analyze] 既存案件のためスキップ:", caseNumber);
    return existing;
  }

  const { data, error } = await supabase.from("calls").insert([record]).select().single();
  if (error) throw new Error(`Supabase insert error: ${error.message}`);
  return data;
}

async function sendLineNotification({ caseNumber, analysis, fromNumber }) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.warn("[analyze] LINE credentials missing – skipping notification");
    return;
  }

  const supabase = getSupabase();

  // キーワードルールとスタッフ情報を取得
  const [rulesRes, staffNamesRes, staffIdsRes] = await Promise.all([
    supabase.from("home_settings").select("value").eq("id", "line_keyword_rules").single(),
    supabase.from("home_settings").select("value").eq("id", "line_staff_names").single(),
    supabase.from("home_settings").select("value").eq("id", "line_staff_ids").single(),
  ]);

  const rules = rulesRes.data?.value || [];
  const staffNames = staffNamesRes.data?.value || [];
  const allStaffIds = staffIdsRes.data?.value || [];

  // アクティブなスタッフのIDだけ抽出
  const activeStaffIds = staffNames
    .filter(s => s.active !== false)
    .map(s => s.id);

  // キーワードマッチング
  // 文字起こし・会社名・AI要約を対象にキーワードを検索
  const searchText = [
    analysis.company_name || "",
    analysis.ai_summary || "",
    analysis.contact_name || "",
  ].join(" ");

  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  let targetIds = null; // nullのとき全員に送る

  for (const rule of rules) {
    // キーワードマッチ確認
    if (!searchText.includes(rule.keyword)) continue;

    // 緊急度フィルター
    if (rule.urgency && rule.urgency !== "すべて" && rule.urgency !== analysis.urgency) continue;

    // 時間帯フィルター
    const start = rule.timeStart || "00:00";
    const end = rule.timeEnd || "23:59";
    if (currentTime < start || currentTime > end) continue;

    // マッチした！対象スタッフを設定
    if (rule.staffIds && rule.staffIds.length > 0) {
      targetIds = rule.staffIds.filter(id => activeStaffIds.includes(id));
    }
    console.log(`[analyze] Keyword matched: "${rule.keyword}" → ${targetIds}`);
    break; // 最初にマッチしたルールを使う
  }

  // 送信先を決定
  let sendToIds;
  if (targetIds !== null) {
    sendToIds = targetIds;
  } else {
    // マッチなし → アクティブなスタッフ全員
    sendToIds = activeStaffIds.length > 0 ? activeStaffIds : allStaffIds;
  }

  // フォールバック
  if (sendToIds.length === 0 && process.env.LINE_USER_ID) {
    sendToIds = [process.env.LINE_USER_ID];
  }

  if (sendToIds.length === 0) {
    console.warn("[analyze] No LINE user IDs found – skipping notification");
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

  for (const userId of sendToIds) {
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
      console.error(`LINE API error for ${userId}: ${response.status}: ${errText}`);
    } else {
      console.log(`[analyze] LINE notification sent to ${userId}`);
    }
  }
}

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