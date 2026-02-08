import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save, Loader2 } from "lucide-react";
import {
  getFtpSettings,
  saveFtpSettings,
  getMotionSettings,
  saveMotionSettings,
  type FtpSettings,
  type MotionSettings,
} from "@/lib/api";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const FILE_MODES = [
  { value: "0", label: "Overwrite" },
  { value: "1", label: "Date/Time" },
  { value: "2", label: "Sequence" },
];

function DayPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {DAYS.map((day, i) => (
        <button
          key={day}
          onClick={() => onChange(value ^ (1 << i))}
          className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
            value & (1 << i)
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground"
          }`}
        >
          {day}
        </button>
      ))}
    </div>
  );
}

export function UploadAutomation() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // Active hours (from motion detection schedule)
  const [activeHoursMode, setActiveHoursMode] = useState<"always" | "scheduled">("always");
  const [activeHoursDays, setActiveHoursDays] = useState(127);
  const [activeHoursStart, setActiveHoursStart] = useState("00:00:00");
  const [activeHoursStop, setActiveHoursStop] = useState("00:00:00");

  // Existing motion settings we need to preserve on save
  const [motionEnable, setMotionEnable] = useState("0");
  const [motionSensitivity, setMotionSensitivity] = useState("50");
  const [motionBlockSet, setMotionBlockSet] = useState("1111111111111111111111111");

  // FTP config (connection fields preserved on save)
  const [ftpConfig, setFtpConfig] = useState<FtpSettings | null>(null);

  // Image upload
  const [imgEnabled, setImgEnabled] = useState(false);
  const [imgMotion, setImgMotion] = useState(false);
  const [imgBaseFileName, setImgBaseFileName] = useState("DCS-5020L");
  const [imgFileMode, setImgFileMode] = useState("1");

  // Video upload
  const [vidEnabled, setVidEnabled] = useState(false);
  const [vidMotion, setVidMotion] = useState(false);
  const [vidBaseFileName, setVidBaseFileName] = useState("DCS-5020L");
  const [vidLimitSize, setVidLimitSize] = useState("2048");
  const [vidLimitTime, setVidLimitTime] = useState("10");

  useEffect(() => {
    Promise.all([getMotionSettings(), getFtpSettings()]).then(([motion, ftp]) => {
      // Active hours from motion schedule
      if (motion.MotionDetectionScheduleMode === "1") {
        setActiveHoursMode("scheduled");
      } else {
        setActiveHoursMode("always");
      }
      setActiveHoursDays(parseInt(motion.MotionDetectionScheduleDay) || 127);
      setActiveHoursStart(motion.MotionDetectionScheduleTimeStart);
      setActiveHoursStop(motion.MotionDetectionScheduleTimeStop);

      // Preserve motion fields
      setMotionEnable(motion.MotionDetectionEnable);
      setMotionSensitivity(motion.MotionDetectionSensitivity);
      setMotionBlockSet(motion.MotionDetectionBlockSet || "1111111111111111111111111");

      // FTP config (full object for preserving connection fields)
      setFtpConfig(ftp);

      // Image upload
      setImgEnabled(ftp.FTPScheduleEnable === "1");
      setImgMotion(ftp.FTPScheduleMode === "2");
      setImgBaseFileName(ftp.FTPScheduleBaseFileName);
      setImgFileMode(ftp.FTPScheduleFileMode);

      // Video upload
      setVidEnabled(ftp.FTPScheduleEnableVideo === "1");
      setVidMotion(ftp.FTPScheduleModeVideo === "2");
      setVidBaseFileName(ftp.FTPScheduleBaseFileNameVideo);
      setVidLimitSize(ftp.FTPScheduleVideoLimitSize);
      setVidLimitTime(ftp.FTPScheduleVideoLimitTime);

      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);

    const motionScheduleMode = activeHoursMode === "scheduled" ? "1" : "0";

    // Image mode: "2" for motion/sound, "0" for always
    const imgMode = imgMotion ? "2" : "0";
    // Video mode: "2" for motion/sound, "0" for always
    const vidMode = vidMotion ? "2" : "0";

    const [motionRes, ftpRes] = await Promise.all([
      saveMotionSettings({
        MotionDetectionEnable: motionEnable,
        MotionDetectionSensitivity: motionSensitivity,
        MotionDetectionBlockSet: motionBlockSet,
        MotionDetectionScheduleMode: motionScheduleMode,
        MotionDetectionScheduleDay: String(activeHoursDays),
        MotionDetectionScheduleTimeStart: activeHoursStart,
        MotionDetectionScheduleTimeStop: activeHoursStop,
      }),
      saveFtpSettings({
        // Preserve connection fields
        ...(ftpConfig || {}),
        // Image upload settings
        FTPScheduleEnable: imgEnabled ? "1" : "0",
        FTPScheduleMode: imgMode,
        FTPScheduleBaseFileName: imgBaseFileName,
        FTPScheduleFileMode: imgFileMode,
        // Video upload settings
        FTPScheduleEnableVideo: vidEnabled ? "1" : "0",
        FTPScheduleModeVideo: vidMode,
        FTPScheduleBaseFileNameVideo: vidBaseFileName,
        FTPScheduleVideoLimitSize: vidLimitSize,
        FTPScheduleVideoLimitTime: vidLimitTime,
      }),
    ]);

    if (motionRes.saved && ftpRes.saved) {
      setStatus("Saved successfully");
    } else {
      const errors: string[] = [];
      if (!motionRes.saved) errors.push(`motion (status ${motionRes.status})`);
      if (!ftpRes.saved) errors.push(`ftp (status ${ftpRes.status})`);
      setStatus(`Save failed: ${errors.join(", ")}`);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading upload settings...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold">Upload Automation</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure when and what the camera uploads to FTP.
        </p>
      </div>

      {/* Active Hours */}
      <div className="space-y-4 rounded-lg border border-border bg-card p-5">
        <Label className="text-xs font-mono uppercase text-muted-foreground">Active Hours</Label>
        <p className="text-xs text-muted-foreground">
          When scheduled, motion detection and uploads only run during these hours.
        </p>
        <div className="flex gap-4">
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="radio"
              name="activeHours"
              checked={activeHoursMode === "always"}
              onChange={() => setActiveHoursMode("always")}
              className="accent-primary"
            />
            Always
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="radio"
              name="activeHours"
              checked={activeHoursMode === "scheduled"}
              onChange={() => setActiveHoursMode("scheduled")}
              className="accent-primary"
            />
            Scheduled
          </label>
        </div>
        {activeHoursMode === "scheduled" && (
          <div className="space-y-3">
            <DayPicker value={activeHoursDays} onChange={setActiveHoursDays} />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-mono uppercase text-muted-foreground">Start</Label>
                <Input
                  value={activeHoursStart}
                  onChange={(e) => setActiveHoursStart(e.target.value)}
                  placeholder="00:00:00"
                  className="font-mono text-sm bg-secondary border-border"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-mono uppercase text-muted-foreground">Stop</Label>
                <Input
                  value={activeHoursStop}
                  onChange={(e) => setActiveHoursStop(e.target.value)}
                  placeholder="00:00:00"
                  className="font-mono text-sm bg-secondary border-border"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Image Upload */}
      <div className="space-y-4 rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-mono uppercase text-muted-foreground">Image Upload</Label>
          <Switch
            checked={imgEnabled}
            onCheckedChange={setImgEnabled}
          />
        </div>

        {imgEnabled && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Switch checked={imgMotion} onCheckedChange={setImgMotion} />
              <Label className="text-sm">Motion/Sound Triggered</Label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-mono uppercase text-muted-foreground">Base Filename</Label>
                <Input
                  value={imgBaseFileName}
                  onChange={(e) => setImgBaseFileName(e.target.value)}
                  className="font-mono text-sm bg-secondary border-border"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-mono uppercase text-muted-foreground">File Mode</Label>
                <select
                  value={imgFileMode}
                  onChange={(e) => setImgFileMode(e.target.value)}
                  className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm font-mono"
                >
                  {FILE_MODES.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Video Upload */}
      <div className="space-y-4 rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-mono uppercase text-muted-foreground">Video Upload</Label>
          <Switch
            checked={vidEnabled}
            onCheckedChange={setVidEnabled}
          />
        </div>

        {vidEnabled && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Switch checked={vidMotion} onCheckedChange={setVidMotion} />
              <Label className="text-sm">Motion/Sound Triggered</Label>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase text-muted-foreground">Base Filename</Label>
              <Input
                value={vidBaseFileName}
                onChange={(e) => setVidBaseFileName(e.target.value)}
                className="font-mono text-sm bg-secondary border-border"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-mono uppercase text-muted-foreground">Max Size (KB)</Label>
                <Input
                  type="number"
                  min="1"
                  max="3072"
                  value={vidLimitSize}
                  onChange={(e) => setVidLimitSize(e.target.value)}
                  className="font-mono text-sm bg-secondary border-border"
                />
                <p className="text-xs text-muted-foreground">Max 3072 KB</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-mono uppercase text-muted-foreground">Max Time (sec)</Label>
                <Input
                  type="number"
                  min="1"
                  max="15"
                  value={vidLimitTime}
                  onChange={(e) => setVidLimitTime(e.target.value)}
                  className="font-mono text-sm bg-secondary border-border"
                />
                <p className="text-xs text-muted-foreground">Max 15 seconds</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save
      </button>

      {status && (
        <p className="text-sm font-mono text-muted-foreground">{status}</p>
      )}
    </div>
  );
}
