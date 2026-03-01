import http from "node:http";
import { exec } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { CameraConfig } from "./camera.js";
import { readBody } from "./camera.js";
import { sendJson } from "./router.js";

const execAsync = promisify(exec);

interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

function localExec(command: string): Promise<ExecResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const child = exec(command, { maxBuffer: 1024 * 1024 * 1024 }, (err) => {
      resolve({ stdout, stderr, code: err ? 1 : 0 });
    });
    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });
  });
}

export async function handleTranscode(
  config: CameraConfig,
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  if (!config.ftpRoot) {
    return sendJson(res, 500, { ok: false, error: "FTP root not configured" });
  }

  const body = JSON.parse((await readBody(req)).toString());
  const ftpPath: string = body.path;

  if (!ftpPath || !ftpPath.endsWith(".avi")) {
    return sendJson(res, 400, { ok: false, error: "Path must be an .avi file" });
  }

  const fsInput = path.join(config.ftpRoot, ftpPath);
  const fsOutput = fsInput.replace(/\.avi$/i, ".mp4");
  const mp4Path = ftpPath.replace(/\.avi$/i, ".mp4");

  const cmd = `test -f "${fsOutput}" || (ffmpeg -y -i "${fsInput}" -c:v copy -c:a aac "${fsOutput}" && chmod 777 "${fsOutput}" && rm -f "${fsInput}")`;

  try {
    const result = await localExec(cmd);
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
  if (!config.ftpRoot) {
    return sendJson(res, 500, { ok: false, error: "FTP root not configured" });
  }

  const body = JSON.parse((await readBody(req)).toString());
  const dirPath: string = body.path;

  if (!dirPath) {
    return sendJson(res, 400, { ok: false, error: "Path is required" });
  }

  const fsDir = path.join(config.ftpRoot, dirPath);

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
    const result = await localExec(script);
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
