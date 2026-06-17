// /api/transcribe.js
const https = require("https");
const http = require("http");
const FormData = require("form-data");

async function transcribeRecording(recordingUrl) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  console.log(`[transcribe] Fetching: ${recordingUrl}`);
  console.log(`[transcribe] AccountSID exists: ${!!accountSid}`);
  console.log(`[transcribe] AuthToken exists: ${!!authToken}`);

  let audioBuffer;
  try {
    audioBuffer = await fetchWithAuth(recordingUrl, accountSid, authToken);
    console.log(`[transcribe] Audio fetched: ${audioBuffer.length} bytes`);
  } catch (err) {
    console.error(`[transcribe] Fetch error: ${err.message}`);
    throw err;
  }

  const form = new FormData();
  form.append("file", audioBuffer, {
    filename: "recording.mp3",
    contentType: "audio/mpeg",
  });
  form.append("model", "whisper-1");
  form.append("language", "ja");
  form.append("response_format", "text");

  console.log(`[transcribe] Sending to Whisper...`);

  let response;
  try {
    response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...form.getHeaders(),
      },
      body: form,
    });
  } catch (err) {
    console.error(`[transcribe] Whisper fetch error: ${err.message}`);
    throw err;
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Whisper API error ${response.status}: ${errText}`);
  }

  const transcript = await response.text();
  console.log(`[transcribe] Done: ${transcript}`);
  return transcript.trim();
}

function fetchWithAuth(url, user, pass) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${user}:${pass}`).toString("base64");
    const protocol = url.startsWith("https") ? https : http;

    const req = protocol.get(
      url,
      { headers: { Authorization: `Basic ${auth}` } },
      (res) => {
        console.log(`[transcribe] HTTP status: ${res.statusCode}`);
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          console.log(`[transcribe] Redirecting to: ${res.headers.location}`);
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
    );
    req.on("error", reject);
  });
}

module.exports = { transcribeRecording };