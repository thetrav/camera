import net from "node:net";
import crypto from "node:crypto";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

// Load .env
const envPath = path.join(path.dirname(new URL(import.meta.url).pathname), ".env");
const env: Record<string, string> = {};
for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
}

const CAM_IP = env.CAM_IP!;
const CAM_USER = env.CAM_USER!;
const CAM_PASS = env.CAM_PASS!;
const basicAuth = Buffer.from(`${CAM_USER}:${CAM_PASS}`).toString("base64");

function rawRequest(method: string, path: string, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let response = "";

    socket.connect(80, CAM_IP, () => {
      let request = `${method} ${path} HTTP/1.0\r\n`;
      request += `Content-length: ${body.length}\r\n`;
      request += `User-Agent: user\r\n`;
      request += `Authorization: Basic ${basicAuth}\r\n`;
      request += `\r\n`;
      request += body;

      console.log("--- SENDING ---");
      console.log(JSON.stringify(request));

      socket.write(request, "latin1");
    });

    socket.on("data", (data) => { response += data.toString(); });
    socket.on("end", () => resolve(response));
    socket.on("error", reject);
    socket.setTimeout(5000, () => { socket.destroy(); reject(new Error("Timeout")); });
  });
}

// Digest auth helpers
function md5(s: string): string {
  return crypto.createHash("md5").update(s).digest("hex");
}

function parseDigestChallenge(header: string): Record<string, string> {
  const params: Record<string, string> = {};
  const regex = /(\w+)=(?:"([^"]+)"|([^\s,]+))/g;
  let match;
  while ((match = regex.exec(header)) !== null) {
    params[match[1]] = match[2] ?? match[3];
  }
  return params;
}

function httpRequest(method: string, reqPath: string, headers: Record<string, string>, body?: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: CAM_IP, port: 80, path: reqPath, method, headers }, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => data += chunk.toString());
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    if (body) req.end(body);
    else req.end();
  });
}

async function digestRequest(method: string, reqPath: string, body?: string): Promise<{ status: number; body: string }> {
  const headers: Record<string, string> = {
    Referer: `http://${CAM_IP}/motion.htm`,
    "Content-Type": "application/x-www-form-urlencoded",
  };

  // First request to get challenge
  const res1 = await httpRequest(method, reqPath, headers, body);
  if (res1.status !== 401) return { status: res1.status, body: res1.body };

  const wwwAuth = res1.headers["www-authenticate"] ?? "";
  if (!wwwAuth.startsWith("Digest")) return { status: res1.status, body: res1.body };

  const challenge = parseDigestChallenge(wwwAuth);
  const nc = "00000001";
  const cnonce = crypto.randomBytes(16).toString("hex");
  const ha1 = md5(`${CAM_USER}:${challenge.realm}:${CAM_PASS}`);
  const ha2 = md5(`${method}:${reqPath}`);
  const response = challenge.qop
    ? md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${challenge.qop}:${ha2}`)
    : md5(`${ha1}:${challenge.nonce}:${ha2}`);

  let authHeader = `Digest username="${CAM_USER}", realm="${challenge.realm}", nonce="${challenge.nonce}", uri="${reqPath}", response="${response}"`;
  if (challenge.qop) authHeader += `, qop=${challenge.qop}, nc=${nc}, cnonce="${cnonce}"`;

  headers.Authorization = authHeader;
  const res2 = await httpRequest(method, reqPath, headers, body);
  return { status: res2.status, body: res2.body };
}

// Fetch SessionKey from motion.htm
async function getSessionKey(): Promise<string> {
  const res = await digestRequest("GET", "/motion.htm");
  const match = res.body.match(/SessionKey" value="([^"]+)"/);
  if (!match) throw new Error("Could not find SessionKey");
  return match[1];
}

async function main() {
  const blockSet = process.argv[2] || null;

  // Read current state via motion.cgi (Basic auth)
  console.log("=== READ via /motion.cgi (Basic auth) ===");
  const getResp = await rawRequest("GET", "/motion.cgi", "");
  const blockLine = getResp.split("\n").find(l => l.includes("BlockSet"));
  console.log(blockLine?.trim());

  if (!blockSet) return;

  // Try 1: via /setSystemMotion with Digest auth + SessionKey + BlockSet
  console.log("\n=== TRY: /setSystemMotion with Digest + SessionKey + BlockSet ===");
  const sessionKey = await getSessionKey();
  console.log(`SessionKey: ${sessionKey.slice(0, 20)}...`);
  const body1 = `MotionDetectionEnable=1&MotionDetectionScheduleMode=0&MotionDetectionScheduleDay=127&MotionDetectionSensitivity=90&MotionDetectionScheduleTimeStart=20:00:00&MotionDetectionScheduleTimeStop=06:00:00&MotionDetectionBlockSet=${blockSet}&SessionKey=${sessionKey}&ReplySuccessPage=&ReplyErrorPage=&ConfigSystemMotion=Save`;
  const res1 = await digestRequest("POST", "/setSystemMotion", body1);
  console.log(`Status: ${res1.status}`);
  // Check response for BlockSet
  const bl1 = res1.body.split("\n").find(l => l.includes("BlockSet"));
  if (bl1) console.log(bl1.trim());

  // Read back
  console.log("\n=== READ back via /motion.cgi ===");
  const verify = await rawRequest("GET", "/motion.cgi", "");
  const bl2 = verify.split("\n").find(l => l.includes("BlockSet"));
  console.log(bl2?.trim());
}

main().catch(console.error);
