// /api/voice.js
// Twilioからの着信を受けてTwiMLで自動音声応答・録音開始

const twilio = require("twilio");

module.exports = async (req, res) => {
  // POSTのみ受け付け
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  // Twilioリクエスト署名検証
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioSignature = req.headers["x-twilio-signature"];
  const url =
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}/api/voice`
      : `${req.headers["x-forwarded-proto"]}://${req.headers["x-forwarded-host"]}/api/voice`;

  const isValid = twilio.validateRequest(
    authToken,
    twilioSignature,
    url,
    req.body
  );

  if (!isValid) {
    console.warn("[voice] Invalid Twilio signature");
    return res.status(403).send("Forbidden");
  }

  const twiml = new twilio.twiml.VoiceResponse();

  // 自動音声応答
  twiml.say(
    {
      language: "ja-JP",
      voice: "Polly.Mizuki",
    },
    "お電話ありがとうございます。イグミ設備です。ただいま担当者が不在のため、ご用件をお聞かせください。発信音の後にお話しください。"
  );

  // 録音開始（最大3分、無音5秒で自動終了）
  twiml.record({
    action: "/api/recording",
    method: "POST",
    maxLength: 180,
    timeout: 5,
    transcribe: false, // Whisperで行うのでTwilio文字起こしはOFF
    recordingStatusCallback: "/api/recording",
    recordingStatusCallbackMethod: "POST",
    playBeep: true,
  });

  // 録音後の締め言葉
  twiml.say(
    {
      language: "ja-JP",
      voice: "Polly.Mizuki",
    },
    "ありがとうございました。担当者より折り返しご連絡いたします。"
  );

  res.setHeader("Content-Type", "text/xml");
  res.status(200).send(twiml.toString());
};
