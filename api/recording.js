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

  const { RecordingUrl, RecordingSid, CallSid, From, Caller, RecordingStatus } = req.body;

  // <Record>のactionコールバック(録音直後。RecordingStatusが無い)は、録音ファイルの
  // 準備がまだ保証されていないため、ここでは文字起こし・AI分析・通知は行わない。
  // 案内を読み上げて電話を終えるTwiMLだけ返す。実際のパイプラインは、ファイルの準備が
  // 保証されるrecordingStatusCallback(RecordingStatus === "completed")側だけで動かす
  // (第8弾: LINE・プッシュ通知が毎回2回届く不具合の修正。action/recordingStatusCallback
  // の両方が同じURLを向いていたため、1回の電話でこの処理が2回動いていた)
  if (!RecordingStatus) {
    console.log(`[recording] action callback (${RecordingSid || "no sid"}) – 読み上げのみ、分析は行わない`);
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say(
      { language: "ja-JP", voice: "Google.ja-JP-Wavenet-A" },
      "ありがとうございました。担当者より折り返しご連絡いたします。"
    );
    res.setHeader("Content-Type", "text/xml");
    return res.status(200).send(twiml.toString());
  }

  if (RecordingStatus !== "completed") {
    console.log(`[recording] Status: ${RecordingStatus} – skipping`);
    return res.status(200).send("OK");
  }

  if (!RecordingUrl) {
    console.error("[recording] RecordingUrl missing");
    return res.status(400).send("Bad Request: no RecordingUrl");
  }

  const recordingMp3 = `${RecordingUrl}.mp3`;
  console.log(`[recording] New recording: ${RecordingSid} from ${From || Caller || "unknown"}`);

  try {
    let fromNumber = "";
    try {
      const { resolveCallerNumber } = require("./analyze");
      fromNumber = await resolveCallerNumber({ rawNumber: From || Caller, callSid: CallSid });
      if (fromNumber) {
        console.log(`[recording] Resolved caller number: ${fromNumber}`);
      }
    } catch (callerErr) {
      console.warn("[recording] Failed to resolve caller number:", callerErr.message);
    }

    console.log(`[recording] Starting transcription...`);
    const { transcribeRecording } = require("./transcribe");
    const transcript = await transcribeRecording(recordingMp3);
    console.log(`[recording] Transcript: ${transcript}`);

    const { analyzeAndRegister } = require("./analyze");
    await analyzeAndRegister({
      transcript,
      recordingUrl: recordingMp3,
      callSid: CallSid,
      fromNumber,
    });

    console.log(`[recording] Pipeline complete!`);
    return res.status(200).send("OK");
  } catch (err) {
    console.error("[recording] Pipeline error:", err.message);
    console.error("[recording] Stack:", err.stack);
    return res.status(500).send("Error");
  }
};