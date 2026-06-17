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

  // pipelineを呼ぶ
  const pipelineUrl = "https://igumi-kanri.vercel.app/api/pipeline";
  console.log(`[recording] Calling pipeline: ${pipelineUrl}`);
  
  try {
    const https = require("https");
    const body = JSON.stringify({
      recordingUrl: recordingMp3,
      callSid: CallSid,
      fromNumber: From,
    });

    const options = {
      hostname: "igumi-kanri.vercel.app",
      path: "/api/pipeline",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const pipelineReq = https.request(options, (pipelineRes) => {
      console.log(`[recording] Pipeline response: ${pipelineRes.statusCode}`);
    });

    pipelineReq.on("error", (err) => {
      console.error("[recording] Pipeline request error:", err);
    });

    pipelineReq.write(body);
    pipelineReq.end();
  } catch (err) {
    console.error("[recording] Failed to call pipeline:", err);
  }

  return res.status(200).send("OK");
};