import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

async function replyToLine(replyToken, message) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text: message }],
    }),
  });
}

export default async function handler(req, res) {
  console.log("LINE Webhook受信:", JSON.stringify(req.body, null, 2));

  if (req.body?.events) {
    for (const event of req.body.events) {
      const userId = event.source?.userId;
      const replyToken = event.replyToken;
      const text = event.message?.text?.trim();

      if (!userId || !text) continue;

      // 現在の名前付きスタッフリストを取得
      const { data } = await supabase
        .from('home_settings')
        .select('value')
        .eq('id', 'line_staff_names')
        .single();

      let staffList = data?.value || [];
      const existing = staffList.find(s => s.id === userId);

      if (existing) {
        // すでに登録済み → 名前を更新
        staffList = staffList.map(s => s.id === userId ? { ...s, name: text } : s);
        await supabase.from('home_settings').upsert({ id: 'line_staff_names', value: staffList });
        await replyToLine(replyToken, `✅ 名前を「${text}」に更新しました！`);
      } else {
        // 新規登録
        staffList.push({ id: userId, name: text });
        await supabase.from('home_settings').upsert({ id: 'line_staff_names', value: staffList });

        // line_staff_idsにも追加
        const { data: idsData } = await supabase
          .from('home_settings')
          .select('value')
          .eq('id', 'line_staff_ids')
          .single();
        let ids = idsData?.value || [];
        if (!ids.includes(userId)) {
          ids.push(userId);
          await supabase.from('home_settings').upsert({ id: 'line_staff_ids', value: ids });
        }

        await replyToLine(replyToken, `✅ 「${text}」さんを通知スタッフに登録しました！\n\nこれで電話案件の通知が届きます📱`);
      }
    }
  }

  res.status(200).json({ ok: true });
}