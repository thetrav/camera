import http from "node:http";
import path from "node:path";
import { PassThrough } from "node:stream";
import * as ftp from "basic-ftp";
import type { CameraConfig } from "./camera.js";
import { digestRequest } from "./camera.js";
import { decryptPass } from "./crypto.js";
import { parseFtpHtml } from "./ftp-config.js";

function sendJson(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

async function getFtpCredentials(config: CameraConfig): Promise<{
  host: string;
  port: number;
  user: string;
  password: string;
  basePath: string;
  passive: boolean;
}> {
  const htmRes = await digestRequest(config, "GET", "/upload.htm", "upload.htm");
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
  config: CameraConfig,
  fn: (client: ftp.Client, basePath: string) => Promise<T>,
): Promise<T> {
  const creds = await getFtpCredentials(config);
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

export async function handleFtpWriteTest(
  config: CameraConfig,
  res: http.ServerResponse,
) {
  try {
    await withFtpClient(config, async (client, basePath) => {
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

export async function handleFtpFiles(
  config: CameraConfig,
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  const urlObj = new URL(req.url!, `http://${req.headers.host}`);
  const requestedPath = urlObj.searchParams.get("path");

  try {
    const entries = await withFtpClient(config, async (client, basePath) => {
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

export async function handleFtpDownload(
  config: CameraConfig,
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
    const buffer = await withFtpClient(config, async (client) => {
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
