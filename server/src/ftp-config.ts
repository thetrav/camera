import http from "node:http";
import type { CameraConfig } from "./camera.js";
import { readBody, digestRequest, getSessionKey } from "./camera.js";
import { encryptPass, decryptPass } from "./crypto.js";

export function parseFtpHtml(html: string): Record<string, string> {
  const result: Record<string, string> = {};
  const inputRegex =
    /<(?:INPUT|input|select|SELECT)[^>]*name="([^"]+)"[^>]*value="([^"]*)"/gi;
  let match;
  while ((match = inputRegex.exec(html)) !== null) {
    result[match[1]] = match[2];
  }
  const inputRegex2 =
    /<(?:INPUT|input)[^>]*value="([^"]*)"[^>]*name="([^"]+)"/gi;
  while ((match = inputRegex2.exec(html)) !== null) {
    if (!result[match[2]]) result[match[2]] = match[1];
  }
  const radioRegex =
    /<input[^>]*type=radio[^>]*name="([^"]+)"[^>]*value=(\d+)[^>]*checked/gi;
  while ((match = radioRegex.exec(html)) !== null) {
    result[match[1]] = match[2];
  }
  const checkRegex =
    /<input[^>]*type="checkbox"[^>]*id="(ScheduleFtp(?:Video)?)"[^>]*value=(\d+)[^>]*checked/gi;
  while ((match = checkRegex.exec(html)) !== null) {
    if (match[1] === "ScheduleFtp") result["FTPScheduleEnable"] = match[2];
    else if (match[1] === "ScheduleFtpVideo")
      result["FTPScheduleEnableVideo"] = match[2];
  }
  return result;
}

export async function handleGetFtp(
  config: CameraConfig,
  res: http.ServerResponse,
) {
  const htmRes = await digestRequest(config, "GET", "/upload.htm", "upload.htm");
  const fields = parseFtpHtml(htmRes.body);

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

export async function handlePostFtp(
  config: CameraConfig,
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  const body = (await readBody(req)).toString();
  const data = JSON.parse(body);

  const sessionKey = await getSessionKey(config, "upload.htm");
  const encryptedPassword = encryptPass(data.FTPPassword ?? "", sessionKey);

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
    config,
    "POST",
    "/setSystemFTP",
    "upload.htm",
    params.toString(),
    "application/x-www-form-urlencoded",
  );

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ saved: true, status: result.status }));
}

export async function handleTestFtp(
  config: CameraConfig,
  res: http.ServerResponse,
) {
  const params = new URLSearchParams();
  params.set("ReplySuccessPage", "replyu.htm");
  params.set("FTPServerTest", " Test ");

  const result = await digestRequest(
    config,
    "POST",
    "/setTestFTP",
    "upload.htm",
    params.toString(),
    "application/x-www-form-urlencoded",
  );

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ tested: true, status: result.status }));
}
