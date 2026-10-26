// /api/voice.js
const twilio = require("twilio");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioSignature = req.headers["x-twilio-signature"];
  
  const url = "https://igumi-kanri.vercel.app/api/voice";

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

 twiml.pause({ length:7});
twiml.say(
  {
    language: "ja-JP",
    voice: "Google.ja-JP-Wavenet-A",
  },
 "がとうございます。株式会社いぐみです。直接共有いたしますのでご用件をお話しください。"
);

  // action(録音直後)とrecordingStatusCallback(ファイルの準備ができたとき)は、
  // どちらも/api/recordingを呼ぶが、分析を行うのはrecordingStatusCallback側だけ。
  // actionが呼ばれたときは、recording.js側で案内を読み上げて電話を終えるTwiMLを返す
  // (この後に続く案内のtwiml.sayは、actionが設定されていると実行されないため不要)
  twiml.record({
    action: "/api/recording",
    method: "POST",
    maxLength: 180,
    timeout: 5,
    transcribe: false,
    recordingStatusCallback: "/api/recording",
    recordingStatusCallbackMethod: "POST",
    playBeep: true,
  });

  res.setHeader("Content-Type", "text/xml");
  res.status(200).send(twiml.toString());
};