/* global require, module, process */
// /api/task-notify.js
// タスクの追加・担当者指名の直後に、関わる人のON端末へすぐプッシュ通知を送る(第8弾テーマ27-2)。
// タスクの内容(タイトル・期限・担当者・共有)はSupabaseから読み直して使う(なりすまし防止。
// 画面から受け取った文字列をそのまま通知には使わない)。
const { createClient } = require("@supabase/supabase-js");
const { PushAdminError, ensureVapidConfigured, sendPushToOne } = require("./_pushLib");

let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_KEY not set");
  _supabase = createClient(url, key);
  return _supabase;
}

// 簡易レート制限(push-subscribe.jsと同じやり方。同一IPから1時間20件まで)
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 20;
const rateMap = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const hits = (rateMap.get(ip) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  rateMap.set(ip, hits);
  return hits.length <= RATE_LIMIT_MAX;
}

function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

function formatDueShort(due) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due || "");
  if (!m) return "";
  return `${Number(m[2])}/${Number(m[3])}`;
}

function buildPayload(task) {
  const dueShort = formatDueShort(task.due);
  return {
    title: "📋 新しいタスク",
    body: dueShort ? `${task.title}(期限: ${dueShort})` : task.title,
    url: "/",
  };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: "しばらく時間をおいてから、もう一度お試しください" });
  }

  const body = req.body || {};
  const { taskId, excludeEndpoint } = body;
  const notifyNames = Array.isArray(body.notifyNames) ? body.notifyNames.filter(n => typeof n === "string") : [];

  if (!taskId || typeof taskId !== "string") {
    return res.status(400).json({ error: "taskIdが必要です" });
  }

  try {
    const supabase = getSupabase();

    const { data: task, error: taskErr } = await supabase
      .from("tasks")
      .select("id, title, due, assignees, shared")
      .eq("id", taskId)
      .maybeSingle();
    if (taskErr) throw taskErr;
    if (!task) return res.status(404).json({ error: "タスクが見つかりません" });

    // 宛先の絞り込み。sharedなら全員、そうでなければ「実際の担当者」に含まれる名前だけに限定する
    // (notifyNamesはクライアントからの「今回通知してほしい相手」の希望に過ぎず、タスクの
    // 本当の担当者(Supabaseの値)に含まれないものは無視する=なりすまし防止)
    let targetStaffNames = null; // null = 全員(共有)
    if (!task.shared) {
      const assignees = Array.isArray(task.assignees) ? task.assignees : [];
      if (!assignees.length) {
        return res.status(200).json({ ok: true, results: [], skipped: "no-assignees" });
      }
      targetStaffNames = notifyNames.length ? notifyNames.filter(n => assignees.includes(n)) : assignees;
      if (!targetStaffNames.length) {
        return res.status(200).json({ ok: true, results: [], skipped: "notify-names-not-in-assignees" });
      }
    }

    let query = supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("enabled", true);
    if (targetStaffNames) query = query.in("staff_name", targetStaffNames);
    const { data: subs, error: subsErr } = await query;
    if (subsErr) throw subsErr;

    let targets = subs || [];
    if (excludeEndpoint && typeof excludeEndpoint === "string") {
      targets = targets.filter(s => s.endpoint !== excludeEndpoint);
    }
    if (!targets.length) {
      return res.status(200).json({ ok: true, results: [] });
    }

    ensureVapidConfigured();

    const payload = buildPayload(task);
    const options = { TTL: 60 * 60, urgency: "normal", timeout: 8000 };
    const deactivate = async (id) => {
      await supabase.from("push_subscriptions").update({ enabled: false, updated_at: new Date().toISOString() }).eq("id", id);
    };

    const results = await Promise.allSettled(targets.map(sub => sendPushToOne(sub, payload, options, deactivate)));
    const okCount = results.filter(r => r.status === "fulfilled" && r.value?.success).length;
    console.log(`[task-notify] ${okCount}/${targets.length} 件送信 (task: ${taskId})`);

    return res.status(200).json({ ok: true, sent: okCount, total: targets.length });
  } catch (err) {
    if (err instanceof PushAdminError) {
      console.error("[task-notify] push admin error:", err.message);
      return res.status(500).json({ error: err.message });
    }
    console.error("[task-notify] error:", err?.constructor?.name || "unknown");
    return res.status(500).json({ error: "通知に失敗しました" });
  }
};
