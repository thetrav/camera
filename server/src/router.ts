import http from "node:http";
import type { CameraConfig } from "./camera.js";
import { proxyToCamera } from "./camera.js";
import { handleGetMotion, handlePostMotion } from "./motion.js";
import { handleGetFtp, handlePostFtp, handleTestFtp } from "./ftp-config.js";
import { handleFtpWriteTest, handleFtpFiles, handleFtpDownload } from "./ftp-browser.js";

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
      } else if (url.startsWith("/api/ftp/files") && method === "GET") {
        await handleFtpFiles(config, req, res);
      } else if (url.startsWith("/api/ftp/download") && method === "GET") {
        await handleFtpDownload(config, req, res);
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
