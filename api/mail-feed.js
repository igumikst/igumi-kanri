// /api/mail-feed.js
// さくらインターネットIMAPから受信トレイ最新5件を取得

const { ImapFlow } = require("imapflow");

function formatFrom(from) {
  if (!from?.length) return "";
  const entry = from[0];
  if (entry.name) return entry.name;
  return entry.address || "";
}

function extractSnippet(raw, maxLen = 100) {
  const str = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw || "");
  const headerEnd = str.search(/\r?\n\r?\n/);
  let body = headerEnd >= 0 ? str.slice(headerEnd).replace(/^\r?\n\r?\n/, "") : str;

  const plainMatch = body.match(
    /Content-Type:\s*text\/plain[^\r\n]*[\s\S]*?\r?\n\r?\n([\s\S]*?)(?:\r?\n--[^\r\n]+|$)/i
  );
  if (plainMatch) body = plainMatch[1];

  body = body
    .replace(/Content-Transfer-Encoding:\s*base64[\s\S]*?(?=\r?\n--|$)/gi, "")
    .replace(/=\r?\n/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#?\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (body.length <= maxLen) return body;
  return `${body.slice(0, maxLen)}…`;
}

async function fetchLatestMails() {
  const host = process.env.MAIL_HOST;
  const port = Number(process.env.MAIL_PORT || 993);
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASS;

  if (!host || !user || !pass) {
    throw new Error("Mail credentials not configured");
  }

  const client = new ImapFlow({
    host,
    port,
    secure: port === 993 || process.env.MAIL_SECURE === "true",
    auth: { user, pass },
    logger: false,
  });

  await client.connect();

  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ all: true });
      if (!uids.length) return [];

      const latestUids = uids.slice(-5).reverse();
      const mails = [];

      for await (const message of client.fetch(latestUids, { envelope: true, source: true })) {
        mails.push({
          subject: message.envelope?.subject || "(件名なし)",
          from: formatFrom(message.envelope?.from),
          date: message.envelope?.date ? message.envelope.date.toISOString() : "",
          snippet: message.source ? extractSnippet(message.source) : "",
        });
      }

      return mails;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "GET") {
    return res.status(405).json({ mails: [], error: "Method Not Allowed" });
  }

  try {
    const mails = await fetchLatestMails();
    return res.status(200).json({ mails });
  } catch (err) {
    return res.status(200).json({ mails: [], error: err.message || "Failed to fetch mail" });
  }
};
