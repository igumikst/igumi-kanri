// /api/mail-feed.js
// Gmail APIで受信トレイの最新3件をJSONで返す
// 必要な環境変数: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN

function parseFrom(fromHeader) {
  if (!fromHeader) return { name: "", email: "" };
  const match = fromHeader.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) return { name: match[1].replace(/"/g, "").trim(), email: match[2] };
  if (fromHeader.includes("@")) return { name: "", email: fromHeader.trim() };
  return { name: fromHeader, email: "" };
}

async function getAccessToken() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token || null;
}

async function fetchEmailPreviews(token) {
  const listRes = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=3&labelIds=INBOX",
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!listRes.ok) return [];
  const list = await listRes.json();
  if (!list.messages?.length) return [];

  const emails = await Promise.all(
    list.messages.map(async (m) => {
      try {
        const detailRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!detailRes.ok) return null;
        const detail = await detailRes.json();
        const headers = detail.payload?.headers || [];
        const getH = (name) => headers.find((h) => h.name === name)?.value || "";
        const from = parseFrom(getH("From"));
        return {
          id: m.id,
          subject: getH("Subject") || "(件名なし)",
          from_name: from.name,
          from: from.email,
          date: getH("Date"),
          snippet: detail.snippet || "",
          url: `https://mail.google.com/mail/u/0/#inbox/${m.id}`,
        };
      } catch {
        return null;
      }
    })
  );

  return emails.filter(Boolean);
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=300");

  if (req.method !== "GET") {
    return res.status(405).json({ emails: [] });
  }

  try {
    const token = await getAccessToken();
    if (!token) return res.status(200).json({ emails: [] });

    const emails = await fetchEmailPreviews(token);
    return res.status(200).json({ emails });
  } catch (_) {
    return res.status(200).json({ emails: [] });
  }
};
