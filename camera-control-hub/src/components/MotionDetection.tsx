import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Activity, Save, Loader2 } from "lucide-react";
import { getMotionSettings, saveMotionSettings, type MotionSettings } from "@/lib/api";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function MotionDetection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [sensitivity, setSensitivity] = useState([50]);
  const [scheduleMode, setScheduleMode] = useState("0");
  const [scheduleDays, setScheduleDays] = useState(127);
  const [timeStart, setTimeStart] = useState("00:00:00");
  const [timeStop, setTimeStop] = useState("00:00:00");
  const [blockSet, setBlockSet] = useState("1111111111111111111111111");

  useEffect(() => {
    getMotionSettings().then((s) => {
      setEnabled(s.MotionDetectionEnable === "1");
      setSensitivity([parseInt(s.MotionDetectionSensitivity) || 50]);
      setScheduleMode(s.MotionDetectionScheduleMode);
      setScheduleDays(parseInt(s.MotionDetectionScheduleDay) || 127);
      setTimeStart(s.MotionDetectionScheduleTimeStart);
      setTimeStop(s.MotionDetectionScheduleTimeStop);
      setBlockSet(s.MotionDetectionBlockSet || "1111111111111111111111111");
      setLoading(false);
    });
  }, []);

  const toggleDay = (bit: number) => {
    setScheduleDays((prev) => prev ^ (1 << bit));
  };

  const toggleBlock = (idx: number) => {
    setBlockSet((prev) => {
      const chars = prev.split("");
      chars[idx] = chars[idx] === "1" ? "0" : "1";
      return chars.join("");
    });
  };

  const handleSave = async () => {
    setSaving(true);
    await saveMotionSettings({
      MotionDetectionEnable: enabled ? "1" : "0",
      MotionDetectionSensitivity: String(sensitivity[0]),
      MotionDetectionScheduleMode: scheduleMode,
      MotionDetectionScheduleDay: String(scheduleDays),
      MotionDetectionScheduleTimeStart: timeStart,
      MotionDetectionScheduleTimeStop: timeStop,
      MotionDetectionBlockSet: blockSet,
    });
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading motion settings...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold">Motion Detection</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure motion detection triggers and zones.
        </p>
      </div>

      {/* Main toggle */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${enabled ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"} transition-colors`}>
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium text-sm">Motion Detection</p>
            <p className="text-xs text-muted-foreground">
              {enabled ? "Active - monitoring for motion" : "Disabled"}
            </p>
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {enabled && (
        <>
          {/* Sensitivity */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-mono uppercase text-muted-foreground">
                Sensitivity
              </Label>
              <span className="font-mono text-sm text-primary">{sensitivity[0]}%</span>
            </div>
            <Slider
              value={sensitivity}
              onValueChange={setSensitivity}
              max={100}
              step={5}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
              <span>Low</span>
              <span>Medium</span>
              <span>High</span>
            </div>
          </div>

          {/* Detection Grid */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <Label className="text-xs font-mono uppercase text-muted-foreground">
              Detection Zones (5x5 Grid)
            </Label>
            <div className="relative w-fit">
              <img
                src="/cam/image/jpeg.cgi"
                alt="Snapshot"
                className="w-80 h-60 object-cover rounded"
              />
              <div className="absolute inset-0 grid grid-cols-5 grid-rows-5">
                {blockSet.split("").map((ch, i) => (
                  <button
                    key={i}
                    onClick={() => toggleBlock(i)}
                    className={`border border-white/30 transition-colors ${
                      ch === "1"
                        ? "bg-primary/30 hover:bg-primary/50"
                        : "bg-transparent hover:bg-red-500/20"
                    }`}
                  />
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Click cells to toggle detection zones. Highlighted = active.
            </p>
          </div>

          {/* Schedule */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <Label className="text-xs font-mono uppercase text-muted-foreground">
              Schedule
            </Label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="scheduleMode"
                  checked={scheduleMode === "0"}
                  onChange={() => setScheduleMode("0")}
                  className="accent-primary"
                />
                Always
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="scheduleMode"
                  checked={scheduleMode === "1"}
                  onChange={() => setScheduleMode("1")}
                  className="accent-primary"
                />
                Scheduled
              </label>
            </div>

            {scheduleMode === "1" && (
              <div className="space-y-3">
                <div className="flex gap-2 flex-wrap">
                  {DAYS.map((day, i) => (
                    <button
                      key={day}
                      onClick={() => toggleDay(i)}
                      className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                        scheduleDays & (1 << i)
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-mono uppercase text-muted-foreground">Start</Label>
                    <Input
                      value={timeStart}
                      onChange={(e) => setTimeStart(e.target.value)}
                      placeholder="00:00:00"
                      className="font-mono text-sm bg-secondary border-border"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-mono uppercase text-muted-foreground">Stop</Label>
                    <Input
                      value={timeStop}
                      onChange={(e) => setTimeStop(e.target.value)}
                      placeholder="00:00:00"
                      className="font-mono text-sm bg-secondary border-border"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save
      </button>
    </div>
  );
}
