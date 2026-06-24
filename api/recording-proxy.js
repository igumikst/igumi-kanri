// /api/recording-proxy.js
// Twilioの録音URLをプロキシして認証ポップアップを回避する

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: "url parameter required" });
  }

  // TwilioのURLかチェック（セキュリティ対策）
  if (!url.startsWith("https://api.twilio.com/")) {
    return res.status(403).json({ error: "Invalid URL" });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    return res.status(500).json({ error: "Twilio credentials not set" });
  }

  // Basic認証でTwilioにアクセス
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${credentials}`,
    },
  });

  if (!response.ok) {
    return res.status(response.status).json({ error: "Twilio fetch failed" });
  }

  // Content-Typeをそのまま返す
  const contentType = response.headers.get("content-type") || "audio/mpeg";
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "private, max-age=3600");

  // 音声データをストリームで返す
  const buffer = await response.arrayBuffer();
  res.send(Buffer.from(buffer));
}