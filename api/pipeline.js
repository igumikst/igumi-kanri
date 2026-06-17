// /api/pipeline.js
// 文字起こし→解析→Supabase登録→LINE通知のメインパイプライン

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  // すぐ200を返してVercelのタイムアウトを回避
  res.status(200).send("OK");

  const { recordingUrl, callSid, fromNumber } = req.body;

  try {
    console.log(`[pipeline] Start: ${recordingUrl}`);

    const { transcribeRecording } = require("./transcribe");
    const transcript = await transcribeRecording(recordingUrl);
    console.log(`[pipeline] Transcript: ${transcript}`);

    const { analyzeAndRegister } = require("./analyze");
    await analyzeAndRegister({
      transcript,
      recordingUrl,
      callSid,
      fromNumber,
    });

    console.log(`[pipeline] Complete!`);
  } catch (err) {
    console.error("[pipeline] Error:", err);
  }
};