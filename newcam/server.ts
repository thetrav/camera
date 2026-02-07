import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PassThrough } from "node:stream";
import * as ftp from "basic-ftp";

const PORT = 8080;
const STATIC_DIR = path.dirname(new URL(import.meta.url).pathname);

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
};

// Load .env file
function loadEnv() {
  const envPath = path.join(STATIC_DIR, ".env");
  if (!fs.existsSync(envPath)) {
    console.error(
      "Missing .env file — create one with CAM_IP, CAM_USER, CAM_PASS",
    );
    process.exit(1);
  }
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    process.env[key] = val;
  }
}

loadEnv();

const CAM_IP = process.env.CAM_IP!;
const CAM_USER = process.env.CAM_USER!;
const CAM_PASS = process.env.CAM_PASS!;

if (!CAM_IP || !CAM_USER || !CAM_PASS) {
  console.error("Missing CAM_IP, CAM_USER, or CAM_PASS in .env");
  process.exit(1);
}

const BASIC_AUTH =
  "Basic " + Buffer.from(`${CAM_USER}:${CAM_PASS}`).toString("base64");

// --- Digest Auth ---

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

let nonceCount = 0;

function buildDigestAuth(
  method: string,
  uri: string,
  challenge: Record<string, string>,
): string {
  const realm = challenge.realm;
  const nonce = challenge.nonce;
  const qop = challenge.qop;
  nonceCount++;
  const nc = nonceCount.toString(16).padStart(8, "0");
  const cnonce = crypto.randomBytes(16).toString("hex");

  const ha1 = md5(`${CAM_USER}:${realm}:${CAM_PASS}`);
  const ha2 = md5(`${method}:${uri}`);
  const response = qop
    ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${nonce}:${ha2}`);

  let header = `Digest username="${CAM_USER}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
  if (qop) {
    header += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
  }
  return header;
}

// --- Reusable Digest Request Helper ---

function camRequest(
  method: string,
  camPath: string,
  headers: Record<string, string>,
  body?: Buffer,
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: CAM_IP, port: 80, path: camPath, method, headers },
      resolve,
    );
    req.on("error", reject);
    if (body) req.end(body);
    else req.end();
  });
}

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function readResponse(res: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    res.on("data", (chunk: Buffer) => chunks.push(chunk));
    res.on("end", () => resolve(Buffer.concat(chunks)));
    res.on("error", reject);
  });
}

async function digestRequest(
  method: string,
  camPath: string,
  referer: string,
  body?: string,
  contentType?: string,
): Promise<{ status: number; body: string }> {
  const headers: Record<string, string> = {
    Referer: `http://${CAM_IP}/${referer}`,
  };
  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  // First request to get challenge
  const buf = body ? Buffer.from(body) : undefined;
  const res1 = await camRequest(method, camPath, headers, buf);
  const body1 = (await readResponse(res1)).toString();

  if (res1.statusCode !== 401) {
    return { status: res1.statusCode ?? 0, body: body1 };
  }

  const wwwAuth = res1.headers["www-authenticate"] ?? "";
  if (!wwwAuth.startsWith("Digest")) {
    return { status: res1.statusCode ?? 0, body: body1 };
  }

  const challenge = parseDigestChallenge(wwwAuth);
  headers.Authorization = buildDigestAuth(method, camPath, challenge);

  const res2 = await camRequest(method, camPath, headers, buf);
  const body2 = (await readResponse(res2)).toString();
  return { status: res2.statusCode ?? 0, body: body2 };
}

// --- Session Key Helper ---

async function getSessionKey(htmPage: string): Promise<string> {
  const res = await digestRequest("GET", `/${htmPage}`, htmPage);
  const match = res.body.match(/SessionKey"\s*value="([^"]+)"/);
  if (!match) throw new Error(`Could not find SessionKey in ${htmPage}`);
  return match[1];
}

// --- AES-128 Encryption (matching camera's function.js) ---

const AES_Sbox = [
  99, 124, 119, 123, 242, 107, 111, 197, 48, 1, 103, 43, 254, 215, 171, 118,
  202, 130, 201, 125, 250, 89, 71, 240, 173, 212, 162, 175, 156, 164, 114, 192,
  183, 253, 147, 38, 54, 63, 247, 204, 52, 165, 229, 241, 113, 216, 49, 21, 4,
  199, 35, 195, 24, 150, 5, 154, 7, 18, 128, 226, 235, 39, 178, 117, 9, 131, 44,
  26, 27, 110, 90, 160, 82, 59, 214, 179, 41, 227, 47, 132, 83, 209, 0, 237, 32,
  252, 177, 91, 106, 203, 190, 57, 74, 76, 88, 207, 208, 239, 170, 251, 67, 77,
  51, 133, 69, 249, 2, 127, 80, 60, 159, 168, 81, 163, 64, 143, 146, 157, 56,
  245, 188, 182, 218, 33, 16, 255, 243, 210, 205, 12, 19, 236, 95, 151, 68, 23,
  196, 167, 126, 61, 100, 93, 25, 115, 96, 129, 79, 220, 34, 42, 144, 136, 70,
  238, 184, 20, 222, 94, 11, 219, 224, 50, 58, 10, 73, 6, 36, 92, 194, 211, 172,
  98, 145, 149, 228, 121, 231, 200, 55, 109, 141, 213, 78, 169, 108, 86, 244,
  234, 101, 122, 174, 8, 186, 120, 37, 46, 28, 166, 180, 198, 232, 221, 116, 31,
  75, 189, 139, 138, 112, 62, 181, 102, 72, 3, 246, 14, 97, 53, 87, 185, 134,
  193, 29, 158, 225, 248, 152, 17, 105, 217, 142, 148, 155, 30, 135, 233, 206,
  85, 40, 223, 140, 161, 137, 13, 191, 230, 66, 104, 65, 153, 45, 15, 176, 84,
  187, 22,
];
const AES_ShiftRowTab = [0, 5, 10, 15, 4, 9, 14, 3, 8, 13, 2, 7, 12, 1, 6, 11];

let AES_Sbox_Inv: number[];
let AES_ShiftRowTab_Inv: number[];
let AES_xtime: number[];

function AES_Init() {
  AES_Sbox_Inv = new Array(256);
  for (let i = 0; i < 256; i++) AES_Sbox_Inv[AES_Sbox[i]] = i;
  AES_ShiftRowTab_Inv = new Array(16);
  for (let i = 0; i < 16; i++) AES_ShiftRowTab_Inv[AES_ShiftRowTab[i]] = i;
  AES_xtime = new Array(256);
  for (let i = 0; i < 128; i++) {
    AES_xtime[i] = i << 1;
    AES_xtime[128 + i] = (i << 1) ^ 0x1b;
  }
}

function AES_SubBytes(state: number[], sbox: number[]) {
  for (let i = 0; i < 16; i++) state[i] = sbox[state[i]];
}

function AES_AddRoundKey(state: number[], rkey: number[]) {
  for (let i = 0; i < 16; i++) state[i] ^= rkey[i];
}

function AES_ShiftRows(state: number[], shifttab: number[]) {
  const h = state.slice();
  for (let i = 0; i < 16; i++) state[i] = h[shifttab[i]];
}

function AES_MixColumns(state: number[]) {
  for (let i = 0; i < 16; i += 4) {
    const s0 = state[i],
      s1 = state[i + 1],
      s2 = state[i + 2],
      s3 = state[i + 3];
    const h = s0 ^ s1 ^ s2 ^ s3;
    state[i] ^= h ^ AES_xtime[s0 ^ s1];
    state[i + 1] ^= h ^ AES_xtime[s1 ^ s2];
    state[i + 2] ^= h ^ AES_xtime[s2 ^ s3];
    state[i + 3] ^= h ^ AES_xtime[s3 ^ s0];
  }
}

function AES_EncryptBlock(block: number[], key: number[]): number[] {
  const l = key.length;
  AES_AddRoundKey(block, key.slice(0, 16));
  let i: number;
  for (i = 16; i < l - 16; i += 16) {
    AES_SubBytes(block, AES_Sbox);
    AES_ShiftRows(block, AES_ShiftRowTab);
    AES_MixColumns(block);
    AES_AddRoundKey(block, key.slice(i, i + 16));
  }
  AES_SubBytes(block, AES_Sbox);
  AES_ShiftRows(block, AES_ShiftRowTab);
  AES_AddRoundKey(block, key.slice(i, l));
  return block;
}

function hexstr2array(input: string, length: number): number[] {
  const output = new Array(length);
  for (let i = 0; i < length; i++) {
    if (i < input.length / 2) output[i] = parseInt(input.substr(i * 2, 2), 16);
    else output[i] = 0;
  }
  return output;
}

function array2hexstr(input: number[]): string {
  let output = "";
  for (let i = 0; i < input.length; i++) {
    const tmp = input[i].toString(16);
    output += tmp.length === 1 ? "0" + tmp : tmp;
  }
  return output;
}

function str2hexstr(input: string): string {
  let output = "";
  for (let a = 0; a < input.length; a++) {
    output += input.charCodeAt(a).toString(16);
  }
  return output;
}

function encryptPass(password: string, sessionKey: string): string {
  const inputHex = str2hexstr(password);
  const keyHex = str2hexstr(sessionKey);
  const privateKeyByte = hexstr2array(keyHex, 32);
  const passwdByte = hexstr2array(inputHex, 64);
  const outputByte = new Array(64);

  AES_Init();
  for (let i = 0; i < 4; i++) {
    const block = new Array(16);
    for (let j = 0; j < 16; j++) block[j] = passwdByte[i * 16 + j];
    const encrypted = AES_EncryptBlock(block, privateKeyByte);
    for (let j = 0; j < 16; j++) outputByte[i * 16 + j] = encrypted[j];
  }

  return array2hexstr(outputByte);
}

// --- Static files ---

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse) {
  let urlPath = req.url === "/" ? "/index.html" : req.url!;
  urlPath = urlPath.split("?")[0];

  const filePath = path.join(STATIC_DIR, urlPath);
  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403);
    res.end();
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

// --- Camera Proxy ---

async function proxyToCamera(
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  const camPath = req.url!.slice(4); // strip /cam
  const method = req.method ?? "GET";
  const body = method === "POST" ? await readBody(req) : undefined;

  const headers: Record<string, string> = {
    Authorization: BASIC_AUTH,
    Referer: `http://${CAM_IP}/home.htm`,
  };
  if (req.headers["content-type"]) {
    headers["Content-Type"] = req.headers["content-type"];
  }

  // First attempt with Basic auth
  const camRes = await camRequest(method, camPath, headers, body);

  // If 401 with Digest challenge, retry with Digest auth
  if (camRes.statusCode === 401) {
    await readResponse(camRes); // drain
    const wwwAuth = camRes.headers["www-authenticate"] ?? "";
    if (wwwAuth.startsWith("Digest")) {
      const challenge = parseDigestChallenge(wwwAuth);
      headers.Authorization = buildDigestAuth(method, camPath, challenge);
      const camRes2 = await camRequest(method, camPath, headers, body);
      res.writeHead(camRes2.statusCode ?? 200, {
        "Content-Type":
          camRes2.headers["content-type"] || "application/octet-stream",
      });
      camRes2.pipe(res);
      res.on("close", () => camRes2.destroy());
      return;
    }
  }

  // Stream the response (Basic auth worked, or non-401)
  res.writeHead(camRes.statusCode ?? 200, {
    "Content-Type":
      camRes.headers["content-type"] || "application/octet-stream",
  });
  camRes.pipe(res);
  res.on("close", () => camRes.destroy());
}

// --- API: Motion Detection ---

async function handleGetMotion(res: http.ServerResponse) {
  // Read motion.cgi with Basic auth
  const headers: Record<string, string> = { Authorization: BASIC_AUTH };
  const camRes = await camRequest("GET", "/motion.cgi", headers);
  const body = (await readResponse(camRes)).toString();

  const result: Record<string, string> = {};
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    result[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(result));
}

async function handlePostMotion(
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  const body = (await readBody(req)).toString();
  const data = JSON.parse(body);

  // Fetch fresh SessionKey from motion.htm
  const sessionKey = await getSessionKey("motion.htm");

  // Build form body with all fields
  const params = new URLSearchParams();
  params.set("MotionDetectionEnable", data.MotionDetectionEnable ?? "1");
  params.set(
    "MotionDetectionScheduleMode",
    data.MotionDetectionScheduleMode ?? "0",
  );
  params.set(
    "MotionDetectionScheduleDay",
    data.MotionDetectionScheduleDay ?? "127",
  );
  params.set(
    "MotionDetectionSensitivity",
    data.MotionDetectionSensitivity ?? "50",
  );
  params.set(
    "MotionDetectionScheduleTimeStart",
    data.MotionDetectionScheduleTimeStart ?? "00:00:00",
  );
  params.set(
    "MotionDetectionScheduleTimeStop",
    data.MotionDetectionScheduleTimeStop ?? "00:00:00",
  );
  params.set(
    "MotionDetectionBlockSet",
    data.MotionDetectionBlockSet ?? "1111111111111111111111111",
  );
  params.set("SessionKey", sessionKey);
  params.set("ReplySuccessPage", "");
  params.set("ReplyErrorPage", "");
  params.set("ConfigSystemMotion", "Save");

  const result = await digestRequest(
    "POST",
    "/setSystemMotion",
    "motion.htm",
    params.toString(),
    "application/x-www-form-urlencoded",
  );

  // Read back to verify
  const headers2: Record<string, string> = { Authorization: BASIC_AUTH };
  const verifyRes = await camRequest("GET", "/motion.cgi", headers2);
  const verifyBody = (await readResponse(verifyRes)).toString();

  const verified: Record<string, string> = {};
  for (const line of verifyBody.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    verified[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({ saved: true, status: result.status, current: verified }),
  );
}

// --- API: FTP ---

function parseFtpHtml(html: string): Record<string, string> {
  const result: Record<string, string> = {};
  // Parse hidden inputs and text/password inputs with name and value
  const inputRegex =
    /<(?:INPUT|input|select|SELECT)[^>]*name="([^"]+)"[^>]*value="([^"]*)"/gi;
  let match;
  while ((match = inputRegex.exec(html)) !== null) {
    result[match[1]] = match[2];
  }
  // Also try value before name pattern
  const inputRegex2 =
    /<(?:INPUT|input)[^>]*value="([^"]*)"[^>]*name="([^"]+)"/gi;
  while ((match = inputRegex2.exec(html)) !== null) {
    if (!result[match[2]]) result[match[2]] = match[1];
  }
  // Parse checked radio buttons
  const radioRegex =
    /<input[^>]*type=radio[^>]*name="([^"]+)"[^>]*value=(\d+)[^>]*checked/gi;
  while ((match = radioRegex.exec(html)) !== null) {
    result[match[1]] = match[2];
  }
  // Parse checked checkboxes (ScheduleFtp, ScheduleFtpVideo)
  const checkRegex =
    /<input[^>]*type="checkbox"[^>]*id="(ScheduleFtp(?:Video)?)"[^>]*value=(\d+)[^>]*checked/gi;
  while ((match = checkRegex.exec(html)) !== null) {
    // Map checkbox id to hidden field name
    if (match[1] === "ScheduleFtp") result["FTPScheduleEnable"] = match[2];
    else if (match[1] === "ScheduleFtpVideo")
      result["FTPScheduleEnableVideo"] = match[2];
  }
  return result;
}

function decryptPass(encrypted: string, sessionKey: string): string {
  const keyHex = str2hexstr(sessionKey);
  const privateKeyByte = hexstr2array(keyHex, 32);
  const encryptedByte = hexstr2array(encrypted, 64);
  const outputByte = new Array(64);

  // AES_Decrypt inline
  AES_Init();
  const AES_Sbox_Inv_local = AES_Sbox_Inv;
  const AES_ShiftRowTab_Inv_local = AES_ShiftRowTab_Inv;

  for (let i = 0; i < 4; i++) {
    const block = new Array(16);
    for (let j = 0; j < 16; j++) block[j] = encryptedByte[i * 16 + j];

    // AES_Decrypt block
    const key = privateKeyByte;
    const l = key.length;
    AES_AddRoundKey(block, key.slice(l - 16, l));
    AES_ShiftRows(block, AES_ShiftRowTab_Inv_local);
    AES_SubBytes(block, AES_Sbox_Inv_local);
    for (let k = l - 32; k >= 16; k -= 16) {
      AES_AddRoundKey(block, key.slice(k, k + 16));
      // AES_MixColumns_Inv
      for (let m = 0; m < 16; m += 4) {
        const s0 = block[m],
          s1 = block[m + 1],
          s2 = block[m + 2],
          s3 = block[m + 3];
        const h = s0 ^ s1 ^ s2 ^ s3;
        const xh = AES_xtime[h];
        const h1 = AES_xtime[AES_xtime[xh ^ s0 ^ s2]] ^ h;
        const h2 = AES_xtime[AES_xtime[xh ^ s1 ^ s3]] ^ h;
        block[m] ^= h1 ^ AES_xtime[s0 ^ s1];
        block[m + 1] ^= h2 ^ AES_xtime[s1 ^ s2];
        block[m + 2] ^= h1 ^ AES_xtime[s2 ^ s3];
        block[m + 3] ^= h2 ^ AES_xtime[s3 ^ s0];
      }
      AES_ShiftRows(block, AES_ShiftRowTab_Inv_local);
      AES_SubBytes(block, AES_Sbox_Inv_local);
    }
    AES_AddRoundKey(block, key.slice(0, 16));

    for (let j = 0; j < 16; j++) outputByte[i * 16 + j] = block[j];
  }

  const hex = array2hexstr(outputByte);
  // Convert hex to ASCII, stopping at 00
  let result = "";
  for (let i = 0; i < hex.length; i += 2) {
    const hexByte = hex.substr(i, 2);
    if (hexByte === "00") break;
    result += String.fromCharCode(parseInt(hexByte, 16));
  }
  return result;
}

async function handleGetFtp(res: http.ServerResponse) {
  const htmRes = await digestRequest("GET", "/upload.htm", "upload.htm");
  const fields = parseFtpHtml(htmRes.body);

  // Decrypt password if present
  const sessionKeyMatch = htmRes.body.match(/SessionKey"\s*value="([^"]+)"/);
  if (fields.FTPPassword && sessionKeyMatch) {
    try {
      fields.FTPPassword = decryptPass(fields.FTPPassword, sessionKeyMatch[1]);
    } catch {
      // Leave encrypted if decryption fails
    }
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(fields));
}

async function handlePostFtp(
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  const body = (await readBody(req)).toString();
  const data = JSON.parse(body);

  // Fetch fresh SessionKey from upload.htm
  const sessionKey = await getSessionKey("upload.htm");

  // Encrypt password with SessionKey
  const encryptedPassword = encryptPass(data.FTPPassword ?? "", sessionKey);

  // Build form body
  const params = new URLSearchParams();
  params.set("ReplySuccessPage", "upload.htm");
  params.set("ReplyErrorPage", "errrftp.htm");
  params.set("FTPHostAddress", data.FTPHostAddress ?? "");
  params.set("FTPPortNumber", data.FTPPortNumber ?? "21");
  params.set("FTPUserName", data.FTPUserName ?? "");
  params.set("FTPPassword", encryptedPassword);
  params.set("FTPDirectoryPath", data.FTPDirectoryPath ?? "/");
  params.set("FTPPassiveMode", data.FTPPassiveMode ?? "1");
  params.set("FTPScheduleEnable", data.FTPScheduleEnable ?? "0");
  params.set("FTPScheduleMode", data.FTPScheduleMode ?? "0");
  params.set("FTPScheduleDay", data.FTPScheduleDay ?? "0");
  params.set("FTPScheduleTimeStart", data.FTPScheduleTimeStart ?? "00:00:00");
  params.set("FTPScheduleTimeStop", data.FTPScheduleTimeStop ?? "00:00:00");
  params.set(
    "FTPScheduleVideoFrequencyMode",
    data.FTPScheduleVideoFrequencyMode ?? "0",
  );
  params.set(
    "FTPScheduleFramePerSecond",
    data.FTPScheduleFramePerSecond ?? "1",
  );
  params.set(
    "FTPScheduleSecondPerFrame",
    data.FTPScheduleSecondPerFrame ?? "1",
  );
  params.set(
    "FTPScheduleBaseFileName",
    data.FTPScheduleBaseFileName ?? "DCS-5020L",
  );
  params.set("FTPScheduleFileMode", data.FTPScheduleFileMode ?? "1");
  params.set(
    "FTPScheduleMaxFileSequenceNumber",
    data.FTPScheduleMaxFileSequenceNumber ?? "1024",
  );
  params.set("FTPCreateFolderInterval", data.FTPCreateFolderInterval ?? "0");
  params.set("FTPScheduleEnableVideo", data.FTPScheduleEnableVideo ?? "0");
  params.set("FTPScheduleModeVideo", data.FTPScheduleModeVideo ?? "0");
  params.set("FTPScheduleDayVideo", data.FTPScheduleDayVideo ?? "0");
  params.set(
    "FTPScheduleTimeStartVideo",
    data.FTPScheduleTimeStartVideo ?? "00:00:00",
  );
  params.set(
    "FTPScheduleTimeStopVideo",
    data.FTPScheduleTimeStopVideo ?? "00:00:00",
  );
  params.set(
    "FTPScheduleBaseFileNameVideo",
    data.FTPScheduleBaseFileNameVideo ?? "DCS-5020L",
  );
  params.set(
    "FTPScheduleVideoLimitSize",
    data.FTPScheduleVideoLimitSize ?? "2048",
  );
  params.set(
    "FTPScheduleVideoLimitTime",
    data.FTPScheduleVideoLimitTime ?? "10",
  );
  params.set("SessionKey", sessionKey);
  params.set("ConfigSystemFTP", " Save ");

  const result = await digestRequest(
    "POST",
    "/setSystemFTP",
    "upload.htm",
    params.toString(),
    "application/x-www-form-urlencoded",
  );

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ saved: true, status: result.status }));
}

async function handleTestFtp(res: http.ServerResponse) {
  const params = new URLSearchParams();
  params.set("ReplySuccessPage", "replyu.htm");
  params.set("FTPServerTest", " Test ");

  const result = await digestRequest(
    "POST",
    "/setTestFTP",
    "upload.htm",
    params.toString(),
    "application/x-www-form-urlencoded",
  );

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ tested: true, status: result.status }));
}

// --- FTP File Browser ---

async function getFtpCredentials(): Promise<{
  host: string;
  port: number;
  user: string;
  password: string;
  basePath: string;
  passive: boolean;
}> {
  const htmRes = await digestRequest("GET", "/upload.htm", "upload.htm");
  const fields = parseFtpHtml(htmRes.body);

  const sessionKeyMatch = htmRes.body.match(/SessionKey"\s*value="([^"]+)"/);
  let password = fields.FTPPassword || "";
  if (password && sessionKeyMatch) {
    try {
      password = decryptPass(password, sessionKeyMatch[1]);
    } catch {
      // Leave encrypted if decryption fails
    }
  }

  return {
    host: fields.FTPHostAddress || "",
    port: parseInt(fields.FTPPortNumber || "21", 10),
    user: fields.FTPUserName || "",
    password,
    basePath: fields.FTPDirectoryPath || "/",
    passive: fields.FTPPassiveMode !== "0",
  };
}

async function withFtpClient<T>(
  fn: (client: ftp.Client, basePath: string) => Promise<T>,
): Promise<T> {
  const creds = await getFtpCredentials();
  const client = new ftp.Client();
  try {
    await client.access({
      host: creds.host,
      port: creds.port,
      user: creds.user,
      password: creds.password,
      secure: false,
    });
    if (!creds.passive) {
      client.ftp.socket; // basic-ftp uses passive by default
    }
    return await fn(client, creds.basePath);
  } finally {
    client.close();
  }
}

async function handleFtpWriteTest(res: http.ServerResponse) {
  try {
    await withFtpClient(async (client, basePath) => {
      const timestamp = new Date().toISOString();
      const content = `FTP write test from camera control server at ${timestamp}\n`;
      const stream = new PassThrough();
      stream.end(Buffer.from(content));
      const remotePath =
        basePath.replace(/\/?$/, "/") + `ftp-test-${Date.now()}.txt`;
      console.log(`writing to `, remotePath);
      await client.uploadFrom(stream, remotePath);
    });
    sendJson(res, 200, { ok: true });
  } catch (err: any) {
    console.error("FTP write test error:", err);
    sendJson(res, 500, { error: err.message || "FTP write failed" });
  }
}

async function handleFtpFiles(
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  const urlObj = new URL(req.url!, `http://${req.headers.host}`);
  const requestedPath = urlObj.searchParams.get("path");

  try {
    const entries = await withFtpClient(async (client, basePath) => {
      const browsePath = requestedPath || basePath;
      const list = await client.list(browsePath);
      return list.map((entry) => ({
        name: entry.name,
        type: entry.isDirectory ? "dir" : "file",
        size: entry.size,
        date: entry.modifiedAt?.toISOString() ?? entry.rawModifiedAt ?? null,
      }));
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(entries));
  } catch (err: any) {
    console.error("FTP browse error:", err);
    sendJson(res, 500, { error: err.message || "FTP connection failed" });
  }
}

const EXT_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".avi": "video/x-msvideo",
  ".mp4": "video/mp4",
  ".mkv": "video/x-matroska",
  ".txt": "text/plain",
};

async function handleFtpDownload(
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  const urlObj = new URL(req.url!, `http://${req.headers.host}`);
  const filePath = urlObj.searchParams.get("path");

  if (!filePath) {
    sendJson(res, 400, { error: "Missing path parameter" });
    return;
  }

  try {
    const buffer = await withFtpClient(async (client) => {
      const stream = new PassThrough();
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      await client.downloadTo(stream, filePath);
      return Buffer.concat(chunks);
    });

    const ext = path.extname(filePath).toLowerCase();
    const contentType = EXT_MIME[ext] || "application/octet-stream";
    const filename = path.basename(filePath);

    const headers: Record<string, string> = { "Content-Type": contentType };
    // Trigger download for non-image types
    if (!contentType.startsWith("image/")) {
      headers["Content-Disposition"] = `attachment; filename="${filename}"`;
    }

    res.writeHead(200, headers);
    res.end(buffer);
  } catch (err: any) {
    console.error("FTP download error:", err);
    sendJson(res, 500, { error: err.message || "FTP download failed" });
  }
}

// --- Server ---

function sendJson(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = req.url ?? "/";
  const method = req.method ?? "GET";

  try {
    if (url.startsWith("/cam/")) {
      await proxyToCamera(req, res);
    } else if (url === "/api/motion" && method === "GET") {
      await handleGetMotion(res);
    } else if (url === "/api/motion" && method === "POST") {
      await handlePostMotion(req, res);
    } else if (url === "/api/ftp" && method === "GET") {
      await handleGetFtp(res);
    } else if (url === "/api/ftp" && method === "POST") {
      await handlePostFtp(req, res);
    } else if (url === "/api/ftp/test" && method === "POST") {
      await handleTestFtp(res);
    } else if (url === "/api/ftp/write-test" && method === "POST") {
      await handleFtpWriteTest(res);
    } else if (url.startsWith("/api/ftp/files") && method === "GET") {
      await handleFtpFiles(req, res);
    } else if (url.startsWith("/api/ftp/download") && method === "GET") {
      await handleFtpDownload(req, res);
    } else if (method === "GET") {
      serveStatic(req, res);
    } else {
      res.writeHead(404);
      res.end();
    }
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      sendJson(res, 500, { error: "Internal server error" });
    }
  }
});

server.listen(PORT, () => {
  console.log(`Camera: ${CAM_IP} (user: ${CAM_USER})`);
  console.log(`Serving on http://localhost:${PORT}`);
  console.log("Press Ctrl+C to stop");
});
