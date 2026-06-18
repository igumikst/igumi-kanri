// /api/transcribe.js
const https = require("https");
const http = require("http");

async function transcribeRecording(recordingUrl) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  console.log(`[transcribe] Fetching audio from Twilio...`);
  const audioBuffer = await fetchWithAuth(recordingUrl, accountSid, authToken);
  console.log(`[transcribe] Got ${audioBuffer.length} bytes`);

  // multipart/form-dataを手動で組み立てる
  const boundary = "----FormBoundary" + Math.random().toString(36).slice(2);
  
  const header = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="recording.mp3"\r\n` +
    `Content-Type: audio/mpeg\r\n\r\n`
  );
  
  const modelPart = Buffer.from(
    `\r\n--${boundary}\r\n` +
    `Content-Disposition: form-data; name="model"\r\n\r\n` +
    `whisper-1` +
    `\r\n--${boundary}\r\n` +
    `Content-Disposition: form-data; name="language"\r\n\r\n` +
    `ja` +
    `\r\n--${boundary}\r\n` +
    `Content-Disposition: form-data; name="response_format"\r\n\r\n` +
    `text` +
    `\r\n--${boundary}--\r\n`
  );

  const body = Buffer.concat([header, audioBuffer, modelPart]);

  console.log(`[transcribe] Sending to Whisper...`);

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": body.length,
    },
    body: body,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Whisper API error ${response.status}: ${errText}`);
  }

  const transcript = await response.text();
  console.log(`[transcribe] Result: ${transcript}`);
  return transcript.trim();
}

function fetchWithAuth(url, user, pass) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${user}:${pass}`).toString("base64");
    const protocol = url.startsWith("https") ? https : http;

    protocol.get(url, { headers: { Authorization: `Basic ${auth}` } }, (res) => {
      console.log(`[transcribe] Twilio HTTP status: ${res.statusCode}`);
      
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchNoAuth(res.headers.location).then(resolve).catch(reject);
      }
      
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

function fetchNoAuth(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    protocol.get(url, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

module.exports = { transcribeRecording };