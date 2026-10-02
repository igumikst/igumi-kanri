// /api/cybozu-calendar.js
// サイボウズ Office の公開 ICS を取得し、JSON 予定一覧に変換する

const DEFAULT_ICS_URL =
  process.env.CYBOZU_ICS_URL ||
  "https://product-pro.p.cybozu.com/o/98662ade1b029ff2872267fe8efb9cd80c6ef7c7";

function unfoldIcs(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]/g, "");
}

function splitProps(block) {
  const map = {};
  for (const line of block.split("\n")) {
    if (!line || line.startsWith("BEGIN:") || line.startsWith("END:")) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const left = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const semi = left.indexOf(";");
    const key = (semi >= 0 ? left.slice(0, semi) : left).toUpperCase();
    // 同一キーが複数ある場合は最初を優先
    if (map[key] == null) map[key] = { raw: left, value };
  }
  return map;
}

function isInvalidCybozuEnd(value) {
  // Cybozu は終了未設定時に T-1-1-1 を返すことがある
  return /-1-1-1/.test(value || "");
}

function parseIcsDateTime(prop) {
  if (!prop?.value) return null;
  const value = prop.value.trim();
  if (isInvalidCybozuEnd(value)) return null;

  // VALUE=DATE:20260925
  if (/^\d{8}$/.test(value)) {
    const y = value.slice(0, 4);
    const m = value.slice(4, 6);
    const d = value.slice(6, 8);
    return {
      iso: `${y}-${m}-${d}T00:00:00+09:00`,
      allDay: true,
      dateKey: `${y}-${m}-${d}`,
    };
  }

  // 20260925T090000Z
  const zulu = value.match(/^(\d{8})T(\d{6})Z$/);
  if (zulu) {
    const [, ymd, hms] = zulu;
    const iso = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T${hms.slice(0, 2)}:${hms.slice(2, 4)}:${hms.slice(4, 6)}Z`;
    const dateKey = new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    return { iso: new Date(iso).toISOString(), allDay: false, dateKey };
  }

  // 20260925T090000 (TZID=Asia/Tokyo 想定)
  const local = value.match(/^(\d{8})T(\d{6})$/);
  if (local) {
    const [, ymd, hms] = local;
    const y = ymd.slice(0, 4);
    const m = ymd.slice(4, 6);
    const d = ymd.slice(6, 8);
    const hh = hms.slice(0, 2);
    const mm = hms.slice(2, 4);
    const ss = hms.slice(4, 6);
    const isoLocal = `${y}-${m}-${d}T${hh}:${mm}:${ss}+09:00`;
    return {
      iso: new Date(isoLocal).toISOString(),
      allDay: false,
      dateKey: `${y}-${m}-${d}`,
    };
  }

  return null;
}

function inferCategory(summary) {
  const s = String(summary || "");
  if (s.startsWith("現調")) return "現調";
  if (s.startsWith("調査")) return "調査";
  if (s.startsWith("工事") || s.startsWith("報告済")) return "工事";
  if (s.startsWith("打ち合わせ") || s.startsWith("打合")) return "打ち合わせ";
  if (s.startsWith("緊急")) return "緊急当番";
  if (s.startsWith("事務")) return "事務";
  if (s.startsWith("外出")) return "外出";
  if (s.startsWith("他社")) return "他社";
  if (s.startsWith("休み")) return "休み";
  if (s.startsWith("その他")) return "その他";
  return "サイボウズ";
}

function cleanSummary(summary) {
  return String(summary || "")
    .replace(/\\n/g, " ")
    .replace(/\\,/g, ",")
    .replace(/\\\\/g, "\\")
    .trim();
}

function extractUrl(description) {
  const text = String(description || "").replace(/\\n/g, "\n");
  const m = text.match(/https?:\/\/[^\s\\]+/);
  return m ? m[0] : "";
}

function parseIcsEvents(icsText) {
  const unfolded = unfoldIcs(icsText);
  const blocks = unfolded.split("BEGIN:VEVENT").slice(1);
  const events = [];

  for (const chunk of blocks) {
    const body = chunk.split("END:VEVENT")[0] || "";
    const props = splitProps(body);
    const start = parseIcsDateTime(props.DTSTART);
    if (!start) continue;
    const end = props.DTEND ? parseIcsDateTime(props.DTEND) : null;
    const summary = cleanSummary(props.SUMMARY?.value);
    if (!summary) continue;
    const uid = props.UID?.value || `cybozu-${start.iso}-${summary}`;
    const description = cleanSummary(props.DESCRIPTION?.value || "");
    const category = inferCategory(summary);

    events.push({
      id: `cybozu:${uid}`,
      uid,
      title: summary,
      start_at: start.iso,
      end_at: end?.iso || null,
      all_day: !!(start.allDay || (end && end.allDay)),
      date_key: start.dateKey,
      category,
      color: null,
      memo: description,
      location: "",
      assignees: [],
      source: "cybozu",
      readonly: true,
      external_url: extractUrl(props.DESCRIPTION?.value || ""),
    });
  }

  events.sort((a, b) => String(a.start_at).localeCompare(String(b.start_at)));
  return events;
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ events: [], error: "GET only" });

  const feedUrl = typeof req.query?.url === "string" && req.query.url.startsWith("https://")
    ? req.query.url
    : DEFAULT_ICS_URL;

  // 公開トークン付き Cybozu ICS 以外は拒否
  if (!/^https:\/\/([\w-]+\.)?p\.cybozu\.com\//.test(feedUrl) &&
      !/^https:\/\/product-pro\.p\.cybozu\.com\//.test(feedUrl)) {
    return res.status(400).json({ events: [], error: "unsupported feed url" });
  }

  try {
    const response = await fetch(feedUrl, {
      headers: {
        "User-Agent": "IGUMI-OS-CybozuCalendar/1.0",
        Accept: "text/calendar,text/plain,*/*",
      },
    });
    if (!response.ok) {
      return res.status(200).json({ events: [], error: `feed status ${response.status}` });
    }
    const text = await response.text();
    if (!/BEGIN:VCALENDAR/i.test(text)) {
      return res.status(200).json({ events: [], error: "not an ics feed" });
    }
    const events = parseIcsEvents(text);
    return res.status(200).json({
      events,
      count: events.length,
      calendar_name: "サイボウズ Office",
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[cybozu-calendar]", err);
    return res.status(200).json({ events: [], error: "fetch failed" });
  }
};
