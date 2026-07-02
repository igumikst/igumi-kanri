import { createClient } from "@supabase/supabase-js";

const BASE_PERSONA = `あなたは株式会社IGUMI（緊急水道・配管・リフォーム工事会社）の先輩社員AIです。IGUMIの理念：①誠実さ（分からないことは分からないと言う）②管理会社様が理事会・オーナー・居住者に説明しやすい状態を作ることが仕事の本質 ③AIは答えを押し付けず、考える材料を提供して本人の判断を支える。現場スタッフに対して、優しく具体的に、専門用語は噛み砕いて話してください。`;

const SYSTEM_PROMPTS = {
  "mentor:report": `${BASE_PERSONA}

あなたは報告書作成の相談相手です。何が起きたか・原因・今後の対応・費用負担（共用部/専有部）の整理を、質問を投げかけながら一緒に組み立ててください。一度に全部聞き出そうとせず、会話の流れで自然に深掘りしてください。`,
  "mentor:estimate": `${BASE_PERSONA}

あなたは見積作成の相談相手です。工事範囲の漏れ、項目の抜け、説明の仕方を一緒に考えてください。スタッフの状況を聞きながら、具体的な確認ポイントを提案してください。`,
  "review:report": `${BASE_PERSONA}

貼り付けられた報告書を「管理会社が第三者に説明できるか」の観点でチェックしてください。フィードバックは必ず次の順番で、見出し付きで具体的に書いてください：
1. 良い点
2. 不足している情報
3. 改善案`,
  "review:estimate": `${BASE_PERSONA}

貼り付けられた見積を項目漏れ・説明不足・誤解を招く表現の観点でチェックしてください。フィードバックは必ず次の順番で、見出し付きで具体的に書いてください：
1. 良い点
2. 不足している情報
3. 改善案`,
};

const KNOWLEDGE_MAX_CHARS = 50000;

function buildSystemPrompt(mode, context) {
  const key = `${mode}:${context}`;
  return SYSTEM_PROMPTS[key] || BASE_PERSONA;
}

async function fetchKnowledgeBlock() {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return "";

    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from("ai_knowledge")
      .select("title, content")
      .eq("is_active", true)
      .order("updated_at", { ascending: false });

    if (error || !data?.length) return "";

    const lines = data.map((row) => `${row.title || "（無題）"}：${row.content || ""}`);
    let block = `【IGUMIの理念・知識ベース】\n${lines.join("\n\n")}`;
    if (block.length > KNOWLEDGE_MAX_CHARS) {
      block = block.slice(0, KNOWLEDGE_MAX_CHARS);
    }
    return `\n\n${block}`;
  } catch (e) {
    console.error("[ai-assist] knowledge fetch failed:", e);
    return "";
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  try {
    const { mode, context, messages } = req.body || {};

    if (!mode || !context || !Array.isArray(messages)) {
      return res.status(400).json({ error: "mode, context, messages が必要です" });
    }

    if (!["mentor", "review"].includes(mode)) {
      return res.status(400).json({ error: "mode は mentor または review を指定してください" });
    }

    if (!["report", "estimate"].includes(context)) {
      return res.status(400).json({ error: "context は report または estimate を指定してください" });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "AI設定が完了していません（APIキー未設定）" });
    }

    const claudeMessages = messages
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .map((m) => ({ role: m.role, content: m.content.trim() }));

    if (claudeMessages.length === 0) {
      return res.status(400).json({ error: "メッセージが空です" });
    }

    const knowledgeBlock = await fetchKnowledgeBlock();
    const systemPrompt = buildSystemPrompt(mode, context) + knowledgeBlock;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: systemPrompt,
        messages: claudeMessages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[ai-assist] Claude API error:", response.status, errText);
      return res.status(500).json({ error: "AIからの応答を取得できませんでした" });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text?.trim();

    if (!text) {
      return res.status(500).json({ error: "AIからの応答が空でした" });
    }

    return res.status(200).json({ text });
  } catch (e) {
    console.error("[ai-assist] error:", e);
    return res.status(500).json({ error: e.message || "予期しないエラーが発生しました" });
  }
}
