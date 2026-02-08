export interface MotionSettings {
  MotionDetectionEnable: string;
  MotionDetectionScheduleMode: string;
  MotionDetectionScheduleDay: string;
  MotionDetectionSensitivity: string;
  MotionDetectionScheduleTimeStart: string;
  MotionDetectionScheduleTimeStop: string;
  MotionDetectionBlockSet: string;
}

export interface FtpSettings {
  FTPHostAddress: string;
  FTPPortNumber: string;
  FTPUserName: string;
  FTPPassword: string;
  FTPDirectoryPath: string;
  FTPPassiveMode: string;
  FTPScheduleEnable: string;
  FTPScheduleMode: string;
  FTPScheduleDay: string;
  FTPScheduleTimeStart: string;
  FTPScheduleTimeStop: string;
  FTPScheduleBaseFileName: string;
  FTPScheduleFileMode: string;
  FTPScheduleMaxFileSequenceNumber: string;
  FTPScheduleFramePerSecond: string;
  FTPScheduleSecondPerFrame: string;
  FTPScheduleVideoFrequencyMode: string;
  FTPCreateFolderInterval: string;
  FTPScheduleEnableVideo: string;
  FTPScheduleModeVideo: string;
  FTPScheduleDayVideo: string;
  FTPScheduleTimeStartVideo: string;
  FTPScheduleTimeStopVideo: string;
  FTPScheduleBaseFileNameVideo: string;
  FTPScheduleVideoLimitSize: string;
  FTPScheduleVideoLimitTime: string;
}

export interface FtpFile {
  name: string;
  type: "file" | "dir";
  size: number;
  date: string | null;
}

export async function ptz(direction: number): Promise<void> {
  await fetch("/cam/setControlPanTilt", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `PanSingleMoveDegree=5&TiltSingleMoveDegree=5&PanTiltSingleMove=${direction}`,
  });
}

export async function setAudioMute(muted: boolean): Promise<void> {
  await fetch("/cam/setControlAudio", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `AudioMute=${muted ? "1" : "0"}`,
  });
}

export async function setNightMode(on: boolean): Promise<void> {
  await fetch("/cam/setControlDayNight", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `IRLed=${on ? "1" : "0"}`,
  });
}

export async function getMotionSettings(): Promise<MotionSettings> {
  const res = await fetch("/api/motion");
  return res.json();
}

export async function saveMotionSettings(data: Partial<MotionSettings>): Promise<{ saved: boolean; status: number; current: MotionSettings }> {
  const res = await fetch("/api/motion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function getFtpSettings(): Promise<FtpSettings> {
  const res = await fetch("/api/ftp");
  return res.json();
}

export async function saveFtpSettings(data: Partial<FtpSettings>): Promise<{ saved: boolean; status: number }> {
  const res = await fetch("/api/ftp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function testFtp(): Promise<{ tested: boolean; status: number }> {
  const res = await fetch("/api/ftp/test", { method: "POST" });
  return res.json();
}

export async function writeTestFtp(): Promise<{ ok?: boolean; error?: string }> {
  const res = await fetch("/api/ftp/write-test", { method: "POST" });
  return res.json();
}

export async function listFtpFiles(path: string): Promise<FtpFile[]> {
  const res = await fetch(`/api/ftp/files?path=${encodeURIComponent(path)}`);
  return res.json();
}

export function getFtpDownloadUrl(path: string): string {
  return `/api/ftp/download?path=${encodeURIComponent(path)}`;
}

export async function getFtpBasePath(): Promise<{ basePath: string }> {
  const res = await fetch("/api/ftp/base-path");
  return res.json();
}

export async function deleteFtpItem(path: string, type: "file" | "dir"): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/ftp/files?path=${encodeURIComponent(path)}&type=${type}`, {
    method: "DELETE",
  });
  return res.json();
}
