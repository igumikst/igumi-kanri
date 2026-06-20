import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  console.log("LINE Webhook受信:", JSON.stringify(req.body, null, 2));

  if (req.body?.events) {
    for (const event of req.body.events) {
      const userId = event.source?.userId;
      if (userId) {
        console.log("USER ID取得:", userId);

        // Supabaseのhome_settingsにスタッフのUSER IDを保存
        const { data } = await supabase
          .from('home_settings')
          .select('value')
          .eq('id', 'line_staff_ids')
          .single();

        let ids = data?.value || [];
        if (!ids.includes(userId)) {
          ids.push(userId);
          await supabase
            .from('home_settings')
            .upsert({ id: 'line_staff_ids', value: ids });
          console.log("新しいスタッフID保存:", userId);
        }
      }
    }
  }

  res.status(200).json({ ok: true });
}