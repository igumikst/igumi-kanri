// /api/mail-feed.js
// さくらインターネットIMAPから受信トレイのメールを取得

const { ImapFlow } = require("imapflow");
const iconv = require("iconv-lite");

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

function getHeaderValue(headerBlock, name) {
  const re = new RegExp(`^${name}:\\s*([^\\r\\n]*(?:\\r?\\n[ \\t][^\\r\\n]*)*)`, "im");
  const match = headerBlock.match(re);
  return match ? match[1].replace(/\r?\n[ \t]/g, " ").trim() : "";
}

function getCharset(headerBlock) {
  const contentType = getHeaderValue(headerBlock, "Content-Type");
  const match = contentType.match(/charset=["']?([^"';\s]+)/i);
  return match ? match[1].trim() : "utf-8";
}

function normalizeCharset(charset) {
  const c = (charset || "utf-8").toLowerCase().replace(/[_\s]/g, "-");
  if (c === "utf8" || c === "utf-8") return "utf8";
  if (c === "iso-2022-jp" || c === "iso2022-jp") return "ISO-2022-JP";
  if (c === "shift-jis" || c === "sjis" || c === "cp932" || c === "windows-31j" || c === "x-sjis") return "Shift_JIS";
  return charset;
}

function decodeQuotedPrintable(bodyStr) {
  const cleaned = bodyStr.replace(/=\r?\n/g, "");
  const bytes = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    if (cleaned[i] === "=" && i + 2 < cleaned.length) {
      bytes.push(parseInt(cleaned.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(cleaned.charCodeAt(i) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

function decodeBodyBytes(bodyStr, transferEncoding) {
  const enc = (transferEncoding || "7bit").toLowerCase().trim();
  if (enc === "base64") {
    return Buffer.from(bodyStr.replace(/\s/g, ""), "base64");
  }
  if (enc === "quoted-printable") {
    return decodeQuotedPrintable(bodyStr);
  }
  return Buffer.from(bodyStr, "binary");
}

function decodeBuffer(buf, charset) {
  const normalized = normalizeCharset(charset);
  if (iconv.encodingExists(normalized)) {
    return iconv.decode(buf, normalized);
  }

  for (const fallback of ["utf8", "ISO-2022-JP", "Shift_JIS"]) {
    if (!iconv.encodingExists(fallback)) continue;
    const text = iconv.decode(buf, fallback);
    if (!text.includes("\uFFFD")) return text;
  }

  return iconv.decode(buf, "utf8");
}

function splitMimeParts(body, boundary) {
  const escaped = boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return body.split(new RegExp(`--${escaped}(?:--)?`));
}

function decodeMimePart(partHeaders, partBody) {
  const charset = getCharset(partHeaders);
  const transferEncoding = getHeaderValue(partHeaders, "Content-Transfer-Encoding");
  const bytes = decodeBodyBytes(partBody, transferEncoding);
  return decodeBuffer(bytes, charset);
}

function findTextPart(raw, preferredType) {
  const str = Buffer.isBuffer(raw) ? raw.toString("binary") : String(raw || "");
  const headerEnd = str.search(/\r?\n\r?\n/);
  const headerBlock = headerEnd >= 0 ? str.slice(0, headerEnd) : "";
  const body = headerEnd >= 0 ? str.slice(headerEnd).replace(/^\r?\n\r?\n/, "") : str;

  const boundaryMatch = headerBlock.match(/boundary="?([^"\r\n;]+)"?/i);
  if (boundaryMatch) {
    const parts = splitMimeParts(body, boundaryMatch[1]);
    for (const part of parts) {
      const trimmed = part.replace(/^\r?\n/, "");
      if (!trimmed.trim()) continue;
      const partHeaderEnd = trimmed.search(/\r?\n\r?\n/);
      if (partHeaderEnd < 0) continue;
      const partHeaders = trimmed.slice(0, partHeaderEnd);
      const partBody = trimmed.slice(partHeaderEnd).replace(/^\r?\n\r?\n/, "");

      if (/Content-Type:\s*multipart\//i.test(partHeaders)) {
        const nested = findTextPart(Buffer.from(`${partHeaders}\r\n\r\n${partBody}`, "binary"), preferredType);
        if (nested) return nested;
        continue;
      }

      if (!new RegExp(`Content-Type:\\s*${preferredType}`, "i").test(partHeaders)) continue;
      return decodeMimePart(partHeaders, partBody);
    }
    return null;
  }

  if (new RegExp(`Content-Type:\\s*${preferredType}`, "i").test(headerBlock)) {
    return decodeMimePart(headerBlock, body);
  }
  return null;
}

function extractBody(raw, maxLen) {
  let body = findTextPart(raw, "text/plain") || findTextPart(raw, "text/html") || "";

  if (!body) {
    const str = Buffer.isBuffer(raw) ? raw.toString("binary") : String(raw || "");
    const headerEnd = str.search(/\r?\n\r?\n/);
    const headerBlock = headerEnd >= 0 ? str.slice(0, headerEnd) : "";
    const rawBody = headerEnd >= 0 ? str.slice(headerEnd).replace(/^\r?\n\r?\n/, "") : str;
    body = decodeMimePart(headerBlock, rawBody);
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
