import http from "node:http";
import fs from "node:fs";
import { Client } from "ssh2";
import type { CameraConfig } from "./camera.js";
import { readBody } from "./camera.js";
import { sendJson } from "./router.js";

interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

function sshExec(config: CameraConfig, command: string): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    if (!config.sshHost || !config.sshUser || !config.sshKeyPath) {
      return reject(new Error("SSH not configured"));
    }

    const conn = new Client();
    conn.on("ready", () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          conn.end();
          return reject(err);
        }
        let stdout = "";
        let stderr = "";
        stream.on("data", (data: Buffer) => {
          stdout += data.toString();
        });
        stream.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });
        stream.on("close", (code: number) => {
          conn.end();
          resolve({ stdout, stderr, code: code ?? 0 });
        });
      });
    });
    conn.on("error", reject);
    conn.connect({
      host: config.sshHost,
      username: config.sshUser,
      privateKey: fs.readFileSync(config.sshKeyPath),
    });
  });
}

export async function handleTranscode(
  config: CameraConfig,
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  if (!config.sshHost || !config.sshUser || !config.sshKeyPath || !config.sshFtpRoot) {
    return sendJson(res, 500, { ok: false, error: "SSH not configured" });
  }

  const body = JSON.parse((await readBody(req)).toString());
  const ftpPath: string = body.path;

  if (!ftpPath || !ftpPath.endsWith(".avi")) {
    return sendJson(res, 400, { ok: false, error: "Path must be an .avi file" });
  }

  const fsInput = config.sshFtpRoot + ftpPath;
  const fsOutput = fsInput.replace(/\.avi$/i, ".mp4");
  const mp4Path = ftpPath.replace(/\.avi$/i, ".mp4");

  const cmd = `test -f "${fsOutput}" || (ffmpeg -y -i "${fsInput}" -c:v copy -c:a aac "${fsOutput}" && chmod 777 "${fsOutput}" && rm -f "${fsInput}")`;

  try {
    const result = await sshExec(config, cmd);
    if (result.code !== 0) {
      return sendJson(res, 500, { ok: false, error: result.stderr || "ffmpeg failed" });
    }
    return sendJson(res, 200, { ok: true, mp4Path });
  } catch (err: any) {
    return sendJson(res, 500, { ok: false, error: err.message });
  }
}

export async function handleTranscodeDir(
  config: CameraConfig,
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  if (!config.sshHost || !config.sshUser || !config.sshKeyPath || !config.sshFtpRoot) {
    return sendJson(res, 500, { ok: false, error: "SSH not configured" });
  }

  const body = JSON.parse((await readBody(req)).toString());
  const dirPath: string = body.path;

  if (!dirPath) {
    return sendJson(res, 400, { ok: false, error: "Path is required" });
  }

  const fsDir = config.sshFtpRoot + dirPath;

  const script = `
converted=0
skipped=0
errors=""
for avi in $(find "${fsDir}" -type f -iname '*.avi'); do
  mp4="\${avi%.*}.mp4"
  if [ -f "$mp4" ]; then
    skipped=$((skipped + 1))
  else
    if ffmpeg -y -i "$avi" -c:v copy -c:a aac "$mp4" 2>/dev/null && chmod 777 "$mp4" && rm -f "$avi"; then
      converted=$((converted + 1))
    else
      errors="$errors\n$avi"
    fi
  fi
done
echo "{\\"converted\\": $converted, \\"skipped\\": $skipped, \\"errors\\": \\"$errors\\"}"
`;

  try {
    const result = await sshExec(config, script);
    if (result.code !== 0) {
      return sendJson(res, 500, { ok: false, error: result.stderr || "batch transcode failed" });
    }

    try {
      const parsed = JSON.parse(result.stdout.trim());
      const errorList = parsed.errors
        ? parsed.errors.split("\\n").filter((s: string) => s.trim())
        : [];
      return sendJson(res, 200, {
        ok: true,
        converted: parsed.converted,
        skipped: parsed.skipped,
        errors: errorList,
      });
    } catch {
      return sendJson(res, 200, {
        ok: true,
        converted: 0,
        skipped: 0,
        errors: [],
        raw: result.stdout,
      });
    }
  } catch (err: any) {
    return sendJson(res, 500, { ok: false, error: err.message });
  }
}
