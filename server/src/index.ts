import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { FtpSrv } from "ftp-srv";
import type { CameraConfig } from "./camera.js";
import { createRouter } from "./router.js";
import { FtpFileSystem } from "./ftp-filesystem.js";

const PORT = 8080;

function loadEnv() {
  if (process.env.FROM_ENV) {
    return;
  }
  const envPath = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    ".env",
  );
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
  basicAuth:
    "Basic " + Buffer.from(`${CAM_USER}:${CAM_PASS}`).toString("base64"),
  sshHost: process.env.SSH_HOST,
  sshUser: process.env.SSH_USER,
  sshKeyPath: process.env.SSH_KEY_PATH,
  sshFtpRoot: process.env.SSH_FTP_ROOT,
};

const server = http.createServer(createRouter(config));

server.listen(PORT, () => {
  console.log(`Camera: ${config.ip} (user: ${config.user})`);
  console.log(`Serving on http://localhost:${PORT}`);
  console.log("Press Ctrl+C to stop");
});

const FTP_ROOT = process.env.FTP_ROOT;
const FTP_USER = process.env.FTP_USER;
const FTP_PASS = process.env.FTP_PASS;
const FTP_PORT = 21;

if (FTP_ROOT && FTP_USER && FTP_PASS) {
  if (!fs.existsSync(FTP_ROOT)) {
    console.error(`FTP root directory does not exist: ${FTP_ROOT}`);
  } else {
    const ftpServer = new FtpSrv({
      url: `ftp://0.0.0.0:${FTP_PORT}`,
      pasv_url: "0.0.0.0",
      pasv_min: 30000,
      pasv_max: 30100,
    });

    ftpServer.on("client-error", (data) => {
      console.error("FTP client error:", data.context, data.error);
    });

    ftpServer.on("login", (data, resolve, reject) => {
      if (data.username === FTP_USER && data.password === FTP_PASS) {
        resolve({
          root: FTP_ROOT,
          fs: new FtpFileSystem(data.connection, { root: FTP_ROOT, cwd: "." }),
        });
      } else {
        reject(new Error("Invalid credentials"));
      }
    });

    ftpServer.listen().then(() => {
      console.log(`FTP server listening on port ${FTP_PORT}`);
      console.log(`FTP root: ${FTP_ROOT}`);
    });
  }
} else if (FTP_ROOT || FTP_USER || FTP_PASS) {
  console.error(
    "Missing FTP_ROOT, FTP_USER, or FTP_PASS in .env - FTP server not started",
  );
}
