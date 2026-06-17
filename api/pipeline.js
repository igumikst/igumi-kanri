// /api/pipeline.js
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const { recordingUrl, callSid, fromNumber } = req.body;

  try {
    console.log(`[pipeline] Start: ${recordingUrl}`);
    console.log(`[pipeline] TWILIO_ACCOUNT_SID exists: ${!!process.env.TWILIO_ACCOUNT_SID}`);
    console.log(`[pipeline] TWILIO_AUTH_TOKEN exists: ${!!process.env.TWILIO_AUTH_TOKEN}`);
    console.log(`[pipeline] OPENAI_API_KEY exists: ${!!process.env.OPENAI_API_KEY}`);
    console.log(`[pipeline] ANTHROPIC_API_KEY exists: ${!!process.env.ANTHROPIC_API_KEY}`);
    console.log(`[pipeline] SUPABASE_URL exists: ${!!process.env.SUPABASE_URL}`);
    console.log(`[pipeline] SUPABASE_SERVICE_KEY exists: ${!!process.env.SUPABASE_SERVICE_KEY}`);

    const { transcribeRecording } = require("./transcribe");
    const transcript = await transcribeRecording(recordingUrl);
    console.log(`[pipeline] Transcript done: ${transcript}`);

    const { analyzeAndRegister } = require("./analyze");
    await analyzeAndRegister({
      transcript,
      recordingUrl,
      callSid,
      fromNumber,
    });

    console.log(`[pipeline] Complete!`);
    return res.status(200).send("OK");
  } catch (err) {
    console.error("[pipeline] Error:", err.message);
    console.error("[pipeline] Stack:", err.stack);
    return res.status(500).send("Error");
  }
};