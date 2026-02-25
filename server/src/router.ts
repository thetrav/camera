import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import type { CameraConfig } from "./camera.js";
import { proxyToCamera } from "./camera.js";
import { handleGetMotion, handlePostMotion } from "./motion.js";
import { handleGetFtp, handlePostFtp, handleTestFtp } from "./ftp-config.js";
import { handleFtpWriteTest, handleFtpFiles, handleFtpDownload, handleFtpBasePath, handleFtpDelete } from "./ftp-browser.js";
import { handleTranscode, handleTranscodeDir } from "./ssh-transcode.js";

const STATIC_DIR = process.env.STATIC_DIR || "";

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, url: string): boolean {
  if (!STATIC_DIR) return false;

  let filePath = path.join(STATIC_DIR, url === "/" ? "index.html" : url);
  const ext = path.extname(filePath);
  const contentTypes: Record<string, string> = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
  };

  if (!ext || !contentTypes[ext]) {
    filePath = path.join(filePath, "index.html");
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.writeHead(200, { "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream" });
    res.end(fs.readFileSync(filePath));
    return true;
  }
  return false;
}

export function sendJson(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

export function createRouter(config: CameraConfig): http.RequestListener {
  return async (req, res) => {
    const url = req.url ?? "/";
    const method = req.method ?? "GET";

    try {
      if (url.startsWith("/cam/")) {
        await proxyToCamera(config, req, res);
      } else if (url === "/api/motion" && method === "GET") {
        await handleGetMotion(config, res);
      } else if (url === "/api/motion" && method === "POST") {
        await handlePostMotion(config, req, res);
      } else if (url === "/api/ftp" && method === "GET") {
        await handleGetFtp(config, res);
      } else if (url === "/api/ftp" && method === "POST") {
        await handlePostFtp(config, req, res);
      } else if (url === "/api/ftp/test" && method === "POST") {
        await handleTestFtp(config, res);
      } else if (url === "/api/ftp/write-test" && method === "POST") {
        await handleFtpWriteTest(config, res);
      } else if (url.startsWith("/api/ftp/base-path") && method === "GET") {
        await handleFtpBasePath(config, res);
      } else if (url.startsWith("/api/ftp/files") && method === "GET") {
        await handleFtpFiles(config, req, res);
      } else if (url.startsWith("/api/ftp/files") && method === "DELETE") {
        await handleFtpDelete(config, req, res);
      } else if (url.startsWith("/api/ftp/download") && method === "GET") {
        await handleFtpDownload(config, req, res);
      } else if (url === "/api/ftp/transcode" && method === "POST") {
        await handleTranscode(config, req, res);
      } else if (url === "/api/ftp/transcode-dir" && method === "POST") {
        await handleTranscodeDir(config, req, res);
      } else if (serveStatic(req, res, url)) {
        // static file served
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
  };
}
