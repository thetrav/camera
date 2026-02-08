import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import type { CameraConfig } from "./camera.js";
import { createRouter } from "./router.js";

const PORT = 8080;

function loadEnv() {
  const envPath = path.join(path.dirname(new URL(import.meta.url).pathname), "..", ".env");
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

const config: CameraConfig = {
  ip: CAM_IP,
  user: CAM_USER,
  pass: CAM_PASS,
  basicAuth: "Basic " + Buffer.from(`${CAM_USER}:${CAM_PASS}`).toString("base64"),
};

const server = http.createServer(createRouter(config));

server.listen(PORT, () => {
  console.log(`Camera: ${config.ip} (user: ${config.user})`);
  console.log(`Serving on http://localhost:${PORT}`);
  console.log("Press Ctrl+C to stop");
});
