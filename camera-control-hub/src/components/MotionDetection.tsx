import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Activity, Save, Loader2 } from "lucide-react";
import { getMotionSettings, saveMotionSettings } from "@/lib/api";

export function MotionDetection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [sensitivity, setSensitivity] = useState([50]);
  const [blockSet, setBlockSet] = useState("1111111111111111111111111");

  // Preserve schedule fields so save doesn't clobber them
  const [scheduleMode, setScheduleMode] = useState("0");
  const [scheduleDays, setScheduleDays] = useState("127");
  const [timeStart, setTimeStart] = useState("00:00:00");
  const [timeStop, setTimeStop] = useState("00:00:00");

  useEffect(() => {
    getMotionSettings().then((s) => {
      setEnabled(s.MotionDetectionEnable === "1");
      setSensitivity([parseInt(s.MotionDetectionSensitivity) || 50]);
      setBlockSet(s.MotionDetectionBlockSet || "1111111111111111111111111");
      setScheduleMode(s.MotionDetectionScheduleMode);
      setScheduleDays(s.MotionDetectionScheduleDay);
      setTimeStart(s.MotionDetectionScheduleTimeStart);
      setTimeStop(s.MotionDetectionScheduleTimeStop);
      setLoading(false);
    });
  }, []);

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
      MotionDetectionBlockSet: blockSet,
      MotionDetectionScheduleMode: scheduleMode,
      MotionDetectionScheduleDay: scheduleDays,
      MotionDetectionScheduleTimeStart: timeStart,
      MotionDetectionScheduleTimeStop: timeStop,
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
          Configure motion detection sensitivity and zones.
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
