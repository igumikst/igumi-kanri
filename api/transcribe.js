// /api/transcribe.js
// OpenAI Whisperで録音ファイルを文字起こし

const https = require("https");
const http = require("http");
const FormData = require("form-data");

/**
 * TwilioのRecordingURLからmp3を取得してWhisperに渡す
 * @param {string} recordingUrl - Twilio録音URL（.mp3付き）
 * @returns {Promise<string>} - 文字起こしテキスト
 */
async function transcribeRecording(recordingUrl) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  // TwilioのBasic認証付きURLで録音を取得
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  console.log(`[transcribe] Fetching recording: ${recordingUrl}`);
  const audioBuffer = await fetchWithAuth(recordingUrl, accountSid, authToken);
  console.log(`[transcribe] Audio fetched: ${audioBuffer.length} bytes`);

  // FormDataでWhisper APIに送信
  const form = new FormData();
  form.append("file", audioBuffer, {
    filename: "recording.mp3",
    contentType: "audio/mpeg",
  });
  form.append("model", "whisper-1");
  form.append("language", "ja");
  form.append("response_format", "text");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...form.getHeaders(),
    },
    body: form,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Whisper API error ${response.status}: ${errText}`);
  }

  const transcript = await response.text();
  return transcript.trim();
}

/**
 * Basic認証付きでURLからBufferを取得
 */
function fetchWithAuth(url, user, pass) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${user}:${pass}`).toString("base64");
    const protocol = url.startsWith("https") ? https : http;

    protocol.get(
      url,
      { headers: { Authorization: `Basic ${auth}` } },
      (res) => {
        // リダイレクト対応
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchWithAuth(res.headers.location, user, pass)
            .then(resolve)
            .catch(reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} fetching recording`));
        }
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      }
    ).on("error", reject);
  });
}

module.exports = { transcribeRecording };
