export default async function handler(req, res) {
  console.log("LINE Webhook受信:", JSON.stringify(req.body, null, 2));
  
  if (req.body?.events) {
    for (const event of req.body.events) {
      if (event.source?.groupId) {
        console.log("グループID取得:", event.source.groupId);
      }
    }
  }
  
  res.status(200).json({ ok: true });
}
