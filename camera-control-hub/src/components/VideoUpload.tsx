import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save, Upload } from "lucide-react";

export function VideoUpload() {
  const [config, setConfig] = useState({
    enabled: true,
    format: "avi",
    duration: "10",
    quality: "medium",
    prefix: "clip_",
  });

  const update = (key: string, value: string | boolean) =>
    setConfig((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-xl font-semibold">Video Upload</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure automatic video recording and upload settings.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${config.enabled ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"} transition-colors`}>
            <Upload className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium text-sm">Auto Upload</p>
            <p className="text-xs text-muted-foreground">
              {config.enabled ? "Clips upload automatically after recording" : "Disabled"}
            </p>
          </div>
        </div>
        <Switch checked={config.enabled} onCheckedChange={(v) => update("enabled", v)} />
      </div>

      {config.enabled && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase text-muted-foreground">Format</Label>
              <select
                value={config.format}
                onChange={(e) => update("format", e.target.value)}
                className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm font-mono"
              >
                <option value="avi">AVI</option>
                <option value="mp4">MP4</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase text-muted-foreground">
                Clip Duration (s)
              </Label>
              <Input
                value={config.duration}
                onChange={(e) => update("duration", e.target.value)}
                className="font-mono text-sm bg-secondary border-border"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase text-muted-foreground">Quality</Label>
              <select
                value={config.quality}
                onChange={(e) => update("quality", e.target.value)}
                className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm font-mono"
              >
                <option value="low">Low (320×240)</option>
                <option value="medium">Medium (640×480)</option>
                <option value="high">High (1280×960)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-mono uppercase text-muted-foreground">
                File Prefix
              </Label>
              <Input
                value={config.prefix}
                onChange={(e) => update("prefix", e.target.value)}
                className="font-mono text-sm bg-secondary border-border"
              />
            </div>
          </div>
        </div>
      )}

      <button className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
        <Save className="h-4 w-4" />
        Save Settings
      </button>
    </div>
  );
}
