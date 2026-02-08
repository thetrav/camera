import http from "node:http";
import type { CameraConfig } from "./camera.js";
import { camRequest, readBody, readResponse, digestRequest, getSessionKey } from "./camera.js";

export async function handleGetMotion(
  config: CameraConfig,
  res: http.ServerResponse,
) {
  const headers: Record<string, string> = { Authorization: config.basicAuth };
  const camRes = await camRequest(config, "GET", "/motion.cgi", headers);
  const body = (await readResponse(camRes)).toString();

  const result: Record<string, string> = {};
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    result[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(result));
}

export async function handlePostMotion(
  config: CameraConfig,
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  const body = (await readBody(req)).toString();
  const data = JSON.parse(body);

  const sessionKey = await getSessionKey(config, "motion.htm");

  const params = new URLSearchParams();
  params.set("MotionDetectionEnable", data.MotionDetectionEnable ?? "1");
  params.set(
    "MotionDetectionScheduleMode",
    data.MotionDetectionScheduleMode ?? "0",
  );
  params.set(
    "MotionDetectionScheduleDay",
    data.MotionDetectionScheduleDay ?? "127",
  );
  params.set(
    "MotionDetectionSensitivity",
    data.MotionDetectionSensitivity ?? "50",
  );
  params.set(
    "MotionDetectionScheduleTimeStart",
    data.MotionDetectionScheduleTimeStart ?? "00:00:00",
  );
  params.set(
    "MotionDetectionScheduleTimeStop",
    data.MotionDetectionScheduleTimeStop ?? "00:00:00",
  );
  params.set(
    "MotionDetectionBlockSet",
    data.MotionDetectionBlockSet ?? "1111111111111111111111111",
  );
  params.set("SessionKey", sessionKey);
  params.set("ReplySuccessPage", "");
  params.set("ReplyErrorPage", "");
  params.set("ConfigSystemMotion", "Save");

  const result = await digestRequest(
    config,
    "POST",
    "/setSystemMotion",
    "motion.htm",
    params.toString(),
    "application/x-www-form-urlencoded",
  );

  const headers2: Record<string, string> = { Authorization: config.basicAuth };
  const verifyRes = await camRequest(config, "GET", "/motion.cgi", headers2);
  const verifyBody = (await readResponse(verifyRes)).toString();

  const verified: Record<string, string> = {};
  for (const line of verifyBody.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    verified[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({ saved: true, status: result.status, current: verified }),
  );
}
