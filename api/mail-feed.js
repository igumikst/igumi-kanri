// /api/mail-feed.js
// さくらインターネットIMAPから受信トレイのメールを取得

const { ImapFlow } = require("imapflow");

function parseIntParam(val, fallback, min, max) {
  const n = parseInt(Array.isArray(val) ? val[0] : val, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function formatFrom(from) {
  if (!from?.length) return "";
  const entry = from[0];
  if (entry.name) return entry.name;
  return entry.address || "";
}

function decodeBodyPart(text) {
  return text
    .replace(/=\r?\n/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractBody(raw, maxLen) {
  const str = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw || "");
  const headerEnd = str.search(/\r?\n\r?\n/);
  let body = headerEnd >= 0 ? str.slice(headerEnd).replace(/^\r?\n\r?\n/, "") : str;

  const plainMatch = body.match(
    /Content-Type:\s*text\/plain[^\r\n]*[\s\S]*?\r?\n\r?\n([\s\S]*?)(?:\r?\n--[^\r\n]+|$)/i
  );
  if (plainMatch) body = plainMatch[1];
  else {
    body = body.replace(/Content-Transfer-Encoding:\s*base64[\s\S]*?(?=\r?\n--|$)/gi, "");
  }

  body = decodeBodyPart(body);
  if (maxLen && body.length > maxLen) return `${body.slice(0, maxLen)}…`;
  return body;
}

function createClient() {
  const host = process.env.MAIL_HOST;
  const port = Number(process.env.MAIL_PORT || 993);
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASS;

  if (!host || !user || !pass) {
    throw new Error("Mail credentials not configured");
  }

  return new ImapFlow({
    host,
    port,
    secure: port === 993 || process.env.MAIL_SECURE === "true",
    auth: { user, pass },
    logger: false,
  });
}

async function withInbox(fn) {
  const client = createClient();
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      return await fn(client);
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

async function fetchMailList(limit, offset) {
  return withInbox(async (client) => {
    const uids = await client.search({ all: true });
    const total = uids.length;
    if (!total) return { mails: [], total: 0 };

    const newestFirst = [...uids].reverse();
    const pageUids = newestFirst.slice(offset, offset + limit);
    const mails = [];

    for await (const message of client.fetch(pageUids, { envelope: true, source: true, uid: true }, { uid: true })) {
      mails.push({
        uid: message.uid,
        subject: message.envelope?.subject || "(件名なし)",
        from: formatFrom(message.envelope?.from),
        date: message.envelope?.date ? message.envelope.date.toISOString() : "",
        snippet: message.source ? extractBody(message.source, 100) : "",
      });
    }

    return { mails, total };
  });
}

async function fetchMailFull(uid) {
  return withInbox(async (client) => {
    let message = null;
    for await (const msg of client.fetch(String(uid), { envelope: true, source: true, uid: true }, { uid: true })) {
      message = msg;
      break;
    }
    if (!message) return null;

    return {
      uid: message.uid,
      subject: message.envelope?.subject || "(件名なし)",
      from: formatFrom(message.envelope?.from),
      date: message.envelope?.date ? message.envelope.date.toISOString() : "",
      body: message.source ? extractBody(message.source) : "",
    };
  });
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "GET") {
    return res.status(405).json({ mails: [], error: "Method Not Allowed" });
  }

  const query = req.query || {};
  const limit = parseIntParam(query.limit, 5, 1, 50);
  const offset = parseIntParam(query.offset, 0, 0, 10000);
  const full = String(Array.isArray(query.full) ? query.full[0] : query.full).toLowerCase() === "true";
  const uid = parseIntParam(query.uid, 0, 1, 999999999);

  try {
    if (full && uid) {
      const mail = await fetchMailFull(uid);
      if (!mail) return res.status(200).json({ mail: null, error: "Mail not found" });
      return res.status(200).json({ mail });
    }

    const { mails, total } = await fetchMailList(limit, offset);
    return res.status(200).json({ mails, total });
  } catch (err) {
    return res.status(200).json({ mails: [], total: 0, error: err.message || "Failed to fetch mail" });
  }
};
