// /api/recording.js
const twilio = require("twilio");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioSignature = req.headers["x-twilio-signature"];
  const url = "https://igumi-kanri.vercel.app/api/recording";

  const isValid = twilio.validateRequest(
    authToken,
    twilioSignature,
    url,
    req.body
  );

  if (!isValid) {
    console.warn("[recording] Invalid Twilio signature");
    return res.status(403).send("Forbidden");
  }

  const { RecordingUrl, RecordingSid, CallSid, From, RecordingStatus } = req.body;

  if (RecordingStatus && RecordingStatus !== "completed") {
    console.log(`[recording] Status: ${RecordingStatus} – skipping`);
    return res.status(200).send("OK");
  }

  if (!RecordingUrl) {
    console.error("[recording] RecordingUrl missing");
    return res.status(400).send("Bad Request: no RecordingUrl");
  }

  const recordingMp3 = `${RecordingUrl}.mp3`;
  console.log(`[recording] New recording: ${RecordingSid} from ${From}`);

  res.status(200).send("OK");

  try {
    const { transcribeRecording } = require("./transcribe");
    const transcript = await transcribeRecording(recordingMp3);
    console.log(`[recording] Transcript done (${transcript.length} chars)`);

    const { analyzeAndRegister } = require("./analyze");
    await analyzeAndRegister({
      transcript,
      recordingUrl: recordingMp3,
      callSid: CallSid,
      fromNumber: From,
    });

    console.log(`[recording] Pipeline complete for ${RecordingSid}`);
  } catch (err) {
    console.error("[recording] Pipeline error:", err);
  }
};