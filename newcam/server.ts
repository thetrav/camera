import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

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
    console.error("Missing .env file — create one with CAM_IP, CAM_USER, CAM_PASS");
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

const BASIC_AUTH = "Basic " + Buffer.from(`${CAM_USER}:${CAM_PASS}`).toString("base64");

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

function buildDigestAuth(method: string, uri: string, challenge: Record<string, string>): string {
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

// --- Helpers ---

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

function camRequest(
  method: string,
  camPath: string,
  headers: Record<string, string>,
  body?: Buffer
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: CAM_IP, port: 80, path: camPath, method, headers },
      resolve
    );
    req.on("error", reject);
    if (body) req.end(body);
    else req.end();
  });
}

// --- Proxy ---

async function proxyToCamera(req: http.IncomingMessage, res: http.ServerResponse) {
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
        "Content-Type": camRes2.headers["content-type"] || "application/octet-stream",
      });
      camRes2.pipe(res);
      res.on("close", () => camRes2.destroy());
      return;
    }
  }

  // Stream the response (Basic auth worked, or non-401)
  res.writeHead(camRes.statusCode ?? 200, {
    "Content-Type": camRes.headers["content-type"] || "application/octet-stream",
  });
  camRes.pipe(res);
  res.on("close", () => camRes.destroy());
}

// --- Server ---

const server = http.createServer(async (req, res) => {
  const url = req.url ?? "/";
  const method = req.method ?? "GET";

  try {
    if (url.startsWith("/cam/")) {
      await proxyToCamera(req, res);
    } else if (method === "GET") {
      serveStatic(req, res);
    } else {
      res.writeHead(404);
      res.end();
    }
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.writeHead(500);
      res.end("Internal server error");
    }
  }
});

server.listen(PORT, () => {
  console.log(`Camera: ${CAM_IP} (user: ${CAM_USER})`);
  console.log(`Serving on http://localhost:${PORT}`);
  console.log("Press Ctrl+C to stop");
});
