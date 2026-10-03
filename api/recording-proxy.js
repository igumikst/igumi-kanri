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

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${credentials}`,
      },
    });

    if (!response.ok) {
      return res.status(response.status).send("Twilio fetch failed");
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    let contentType = response.headers.get("content-type") || "audio/mpeg";
    // Android Chrome は application/octet-stream や曖昧な MIME で再生に失敗しやすい
    if (!contentType.startsWith("audio/")) {
      contentType = "audio/mpeg";
    }

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).send(buffer);
  } catch (err) {
    console.error("[recording-proxy]", err);
    return res.status(500).send("Recording proxy error");
  }
}
