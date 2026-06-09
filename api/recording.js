// /api/recording.js
// Twilioからの録音完了webhookを受け取り、文字起こし→解析パイプラインを起動

const twilio = require("twilio");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  // Twilioリクエスト署名検証
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioSignature = req.headers["x-twilio-signature"];
  const url =
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}/api/recording`
      : `${req.headers["x-forwarded-proto"]}://${req.headers["x-forwarded-host"]}/api/recording`;

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

  const {
    RecordingUrl,
    RecordingSid,
    CallSid,
    From,
    RecordingStatus,
  } = req.body;

  // completed のみ処理
  if (RecordingStatus && RecordingStatus !== "completed") {
    console.log(`[recording] Status: ${RecordingStatus} – skipping`);
    return res.status(200).send("OK");
  }

  if (!RecordingUrl) {
    console.error("[recording] RecordingUrl missing");
    return res.status(400).send("Bad Request: no RecordingUrl");
  }

  // Twilioの録音URLはmp3/wavが選べる。mp3を明示
  const recordingMp3 = `${RecordingUrl}.mp3`;

  console.log(`[recording] New recording: ${RecordingSid} from ${From}`);

  // 非同期でtranscribe→analyzeパイプラインを起動（Vercelのタイムアウト回避）
  // レスポンスを先に返してから処理
  res.status(200).send("OK");

  try {
    // 文字起こし
    const { transcribeRecording } = require("./transcribe");
    const transcript = await transcribeRecording(recordingMp3);
    console.log(`[recording] Transcript done (${transcript.length} chars)`);

    // 解析・登録・通知
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
