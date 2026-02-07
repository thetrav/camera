import http from "node:http";
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

const AUTH = "Basic " + Buffer.from(`${CAM_USER}:${CAM_PASS}`).toString("base64");

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

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function jsonResponse(res: http.ServerResponse, data: unknown, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function proxyToCamera(req: http.IncomingMessage, res: http.ServerResponse) {
  const camPath = req.url!.slice(4); // strip /cam
  const body = req.method === "POST" ? await readBody(req) : undefined;

  const headers: Record<string, string> = { Authorization: AUTH };
  if (req.headers["content-type"]) {
    headers["Content-Type"] = req.headers["content-type"];
  }

  const camReq = http.request(
    {
      hostname: CAM_IP,
      port: 80,
      path: camPath,
      method: req.method,
      headers,
    },
    (camRes) => {
      res.writeHead(camRes.statusCode ?? 200, {
        "Content-Type": camRes.headers["content-type"] || "application/octet-stream",
      });
      camRes.pipe(res);
    }
  );

  camReq.on("error", (err) => {
    if (!res.headersSent) {
      res.writeHead(502);
      res.end(err.message);
    }
  });

  res.on("close", () => camReq.destroy());

  if (body) {
    camReq.end(body);
  } else {
    camReq.end();
  }
}

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
