import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save, TestTube, FileText, Loader2 } from "lucide-react";
import { getFtpSettings, saveFtpSettings, testFtp, writeTestFtp, type FtpSettings } from "@/lib/api";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Decode camera API mode ("0"=always, "1"=schedule, "2"=motion/sound)
// into two independent UI concepts: scheduled (bool) and motionTriggered (bool).
// When mode is "2" (motion), infer scheduled from whether day/time fields
// have non-default values, since the camera API merges both into one field.
function decodeModeFlags(mode: string, days: string, timeStart: string, timeStop: string): { scheduled: boolean; motionTriggered: boolean } {
  const hasDays = parseInt(days) > 0;
  const hasTime = (timeStart !== "00:00:00" && timeStart !== "") || (timeStop !== "00:00:00" && timeStop !== "");
  return {
    scheduled: mode === "1" || (mode === "2" && (hasDays || hasTime)),
    motionTriggered: mode === "2",
  };
}

// Encode the two UI toggles back to camera API mode value
// Motion/sound takes priority (mode "2"), then scheduled ("1"), else always ("0")
function encodeModeValue(scheduled: boolean, motionTriggered: boolean): string {
  if (motionTriggered) return "2";
  if (scheduled) return "1";
  return "0";
}

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

function ScheduleControls({
  scheduled,
  onScheduledChange,
  motionTriggered,
  onMotionTriggeredChange,
  days,
  onDaysChange,
  timeStart,
  onTimeStartChange,
  timeStop,
  onTimeStopChange,
  radioName,
}: {
  scheduled: boolean;
  onScheduledChange: (v: boolean) => void;
  motionTriggered: boolean;
  onMotionTriggeredChange: (v: boolean) => void;
  days: number;
  onDaysChange: (v: number) => void;
  timeStart: string;
  onTimeStartChange: (v: string) => void;
  timeStop: string;
  onTimeStopChange: (v: string) => void;
  radioName: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-4">
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="radio"
              name={radioName}
              checked={!scheduled}
              onChange={() => onScheduledChange(false)}
              className="accent-primary"
            />
            Always
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="radio"
              name={radioName}
              checked={scheduled}
              onChange={() => onScheduledChange(true)}
              className="accent-primary"
            />
            Scheduled
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={motionTriggered}
            onCheckedChange={onMotionTriggeredChange}
          />
          <Label className="text-sm">Motion/Sound</Label>
        </div>
      </div>

      {scheduled && (
        <>
          <DayPicker value={days} onChange={onDaysChange} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase text-muted-foreground">Start</Label>
              <Input value={timeStart} onChange={(e) => onTimeStartChange(e.target.value)} className="font-mono text-sm bg-secondary border-border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase text-muted-foreground">Stop</Label>
              <Input value={timeStop} onChange={(e) => onTimeStopChange(e.target.value)} className="font-mono text-sm bg-secondary border-border" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function FTPConfig() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [writeTesting, setWriteTesting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // Separate UI state for image schedule
  const [imgScheduled, setImgScheduled] = useState(false);
  const [imgMotion, setImgMotion] = useState(false);

  // Separate UI state for video schedule
  const [vidScheduled, setVidScheduled] = useState(false);
  const [vidMotion, setVidMotion] = useState(false);

  const [config, setConfig] = useState<FtpSettings>({
    FTPHostAddress: "",
    FTPPortNumber: "21",
    FTPUserName: "",
    FTPPassword: "",
    FTPDirectoryPath: "/",
    FTPPassiveMode: "1",
    FTPScheduleEnable: "0",
    FTPScheduleMode: "0",
    FTPScheduleDay: "0",
    FTPScheduleTimeStart: "00:00:00",
    FTPScheduleTimeStop: "00:00:00",
    FTPScheduleBaseFileName: "DCS-5020L",
    FTPScheduleFileMode: "1",
    FTPScheduleMaxFileSequenceNumber: "1024",
    FTPScheduleFramePerSecond: "1",
    FTPScheduleSecondPerFrame: "1",
    FTPScheduleVideoFrequencyMode: "0",
    FTPCreateFolderInterval: "0",
    FTPScheduleEnableVideo: "0",
    FTPScheduleModeVideo: "0",
    FTPScheduleDayVideo: "0",
    FTPScheduleTimeStartVideo: "00:00:00",
    FTPScheduleTimeStopVideo: "00:00:00",
    FTPScheduleBaseFileNameVideo: "DCS-5020L",
    FTPScheduleVideoLimitSize: "2048",
    FTPScheduleVideoLimitTime: "10",
  });

  useEffect(() => {
    getFtpSettings().then((s) => {
      setConfig(s);
      const imgFlags = decodeModeFlags(s.FTPScheduleMode, s.FTPScheduleDay, s.FTPScheduleTimeStart, s.FTPScheduleTimeStop);
      setImgScheduled(imgFlags.scheduled);
      setImgMotion(imgFlags.motionTriggered);
      const vidFlags = decodeModeFlags(s.FTPScheduleModeVideo, s.FTPScheduleDayVideo, s.FTPScheduleTimeStartVideo, s.FTPScheduleTimeStopVideo);
      setVidScheduled(vidFlags.scheduled);
      setVidMotion(vidFlags.motionTriggered);
      setLoading(false);
    });
  }, []);

  const update = (key: keyof FtpSettings, value: string) =>
    setConfig((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    const res = await saveFtpSettings({
      ...config,
      FTPScheduleMode: encodeModeValue(imgScheduled, imgMotion),
      FTPScheduleModeVideo: encodeModeValue(vidScheduled, vidMotion),
    });
    setStatus(res.saved ? "Saved successfully" : `Save failed (status ${res.status})`);
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setStatus(null);
    const res = await testFtp();
    setStatus(res.tested ? "Test image sent to FTP" : `Test failed (status ${res.status})`);
    setTesting(false);
  };

  const handleWriteTest = async () => {
    setWriteTesting(true);
    setStatus(null);
    const res = await writeTestFtp();
    setStatus(res.ok ? "Write test succeeded" : `Write test failed: ${res.error}`);
    setWriteTesting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading FTP settings...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold">FTP Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure where camera snapshots and recordings are uploaded.
        </p>
      </div>

      {/* Connection */}
      <div className="space-y-4 rounded-lg border border-border bg-card p-5">
        <Label className="text-xs font-mono uppercase text-muted-foreground">Connection</Label>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs font-mono uppercase text-muted-foreground">Host</Label>
            <Input
              value={config.FTPHostAddress}
              onChange={(e) => update("FTPHostAddress", e.target.value)}
              placeholder="192.168.1.100"
              className="font-mono text-sm bg-secondary border-border"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-mono uppercase text-muted-foreground">Port</Label>
            <Input
              value={config.FTPPortNumber}
              onChange={(e) => update("FTPPortNumber", e.target.value)}
              className="font-mono text-sm bg-secondary border-border"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-mono uppercase text-muted-foreground">Username</Label>
            <Input
              value={config.FTPUserName}
              onChange={(e) => update("FTPUserName", e.target.value)}
              className="font-mono text-sm bg-secondary border-border"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-mono uppercase text-muted-foreground">Password</Label>
            <Input
              type="password"
              value={config.FTPPassword}
              onChange={(e) => update("FTPPassword", e.target.value)}
              className="font-mono text-sm bg-secondary border-border"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-mono uppercase text-muted-foreground">Remote Path</Label>
          <Input
            value={config.FTPDirectoryPath}
            onChange={(e) => update("FTPDirectoryPath", e.target.value)}
            className="font-mono text-sm bg-secondary border-border"
          />
        </div>
        <div className="flex items-center gap-2 pt-2">
          <Switch
            checked={config.FTPPassiveMode === "1"}
            onCheckedChange={(v) => update("FTPPassiveMode", v ? "1" : "0")}
          />
          <Label className="text-sm">Passive Mode</Label>
        </div>
      </div>

      {/* Image Upload Schedule */}
      <div className="space-y-4 rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-mono uppercase text-muted-foreground">Image Upload</Label>
          <Switch
            checked={config.FTPScheduleEnable === "1"}
            onCheckedChange={(v) => update("FTPScheduleEnable", v ? "1" : "0")}
          />
        </div>

        {config.FTPScheduleEnable === "1" && (
          <div className="space-y-3">
            <ScheduleControls
              scheduled={imgScheduled}
              onScheduledChange={setImgScheduled}
              motionTriggered={imgMotion}
              onMotionTriggeredChange={setImgMotion}
              days={parseInt(config.FTPScheduleDay) || 0}
              onDaysChange={(v) => update("FTPScheduleDay", String(v))}
              timeStart={config.FTPScheduleTimeStart}
              onTimeStartChange={(v) => update("FTPScheduleTimeStart", v)}
              timeStop={config.FTPScheduleTimeStop}
              onTimeStopChange={(v) => update("FTPScheduleTimeStop", v)}
              radioName="imgSchedule"
            />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-mono uppercase text-muted-foreground">Base Filename</Label>
                <Input value={config.FTPScheduleBaseFileName} onChange={(e) => update("FTPScheduleBaseFileName", e.target.value)} className="font-mono text-sm bg-secondary border-border" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-mono uppercase text-muted-foreground">File Mode</Label>
                <select
                  value={config.FTPScheduleFileMode}
                  onChange={(e) => update("FTPScheduleFileMode", e.target.value)}
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

      {/* Video Upload Schedule */}
      <div className="space-y-4 rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-mono uppercase text-muted-foreground">Video Upload</Label>
          <Switch
            checked={config.FTPScheduleEnableVideo === "1"}
            onCheckedChange={(v) => update("FTPScheduleEnableVideo", v ? "1" : "0")}
          />
        </div>

        {config.FTPScheduleEnableVideo === "1" && (
          <div className="space-y-3">
            <ScheduleControls
              scheduled={vidScheduled}
              onScheduledChange={setVidScheduled}
              motionTriggered={vidMotion}
              onMotionTriggeredChange={setVidMotion}
              days={parseInt(config.FTPScheduleDayVideo) || 0}
              onDaysChange={(v) => update("FTPScheduleDayVideo", String(v))}
              timeStart={config.FTPScheduleTimeStartVideo}
              onTimeStartChange={(v) => update("FTPScheduleTimeStartVideo", v)}
              timeStop={config.FTPScheduleTimeStopVideo}
              onTimeStopChange={(v) => update("FTPScheduleTimeStopVideo", v)}
              radioName="vidSchedule"
            />

            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase text-muted-foreground">Base Filename</Label>
              <Input value={config.FTPScheduleBaseFileNameVideo} onChange={(e) => update("FTPScheduleBaseFileNameVideo", e.target.value)} className="font-mono text-sm bg-secondary border-border" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-mono uppercase text-muted-foreground">Max Size (KB)</Label>
                <Input value={config.FTPScheduleVideoLimitSize} onChange={(e) => update("FTPScheduleVideoLimitSize", e.target.value)} className="font-mono text-sm bg-secondary border-border" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-mono uppercase text-muted-foreground">Max Time (sec)</Label>
                <Input value={config.FTPScheduleVideoLimitTime} onChange={(e) => update("FTPScheduleVideoLimitTime", e.target.value)} className="font-mono text-sm bg-secondary border-border" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </button>
        <button
          onClick={handleTest}
          disabled={testing}
          className="flex items-center gap-2 rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
        >
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
          Test Connection
        </button>
        <button
          onClick={handleWriteTest}
          disabled={writeTesting}
          className="flex items-center gap-2 rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
        >
          {writeTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Write Test
        </button>
      </div>

      {status && (
        <p className="text-sm font-mono text-muted-foreground">{status}</p>
      )}
    </div>
  );
}
