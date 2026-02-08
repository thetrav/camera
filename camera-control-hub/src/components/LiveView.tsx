import { useRef, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { PTZControls } from "@/components/PTZControls";
import { Maximize2, Volume2, VolumeX, Moon, Sun, Camera } from "lucide-react";
import { ptz, setAudioMute, setNightMode } from "@/lib/api";

export function LiveView() {
  const imgRef = useRef<HTMLImageElement>(null);
  const [muted, setMuted] = useState(false);
  const [nightMode, setNightModeState] = useState(false);

  const handlePtz = async (direction: number) => {
    await ptz(direction);
  };

  const handleMuteToggle = async () => {
    const next = !muted;
    setMuted(next);
    await setAudioMute(next);
  };

  const handleNightToggle = async () => {
    const next = !nightMode;
    setNightModeState(next);
    await setNightMode(next);
  };

  const handleSnapshot = () => {
    const img = imgRef.current;
    if (!img) return;
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const link = document.createElement("a");
    link.download = `snapshot-${Date.now()}.jpg`;
    link.href = canvas.toDataURL("image/jpeg");
    link.click();
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Live View</h1>
          <StatusBadge status="online" />
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {new Date().toLocaleString()}
        </span>
      </div>

      <div className="flex flex-1 gap-4 min-h-0">
        {/* Video feed */}
        <div className="flex-1 relative rounded-lg overflow-hidden border border-border bg-card">
          <img
            ref={imgRef}
            src="/cam/video.cgi"
            alt="Camera feed"
            className="absolute inset-0 w-full h-full object-contain bg-black"
            crossOrigin="anonymous"
          />

          {/* Overlay controls */}
          <div className="absolute top-3 left-3">
            <StatusBadge status="recording">LIVE</StatusBadge>
          </div>
          <button
            className="absolute top-3 right-3 h-8 w-8 rounded-md bg-card/80 backdrop-blur flex items-center justify-center text-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
            onClick={handleSnapshot}
            title="Snapshot"
          >
            <Camera className="h-4 w-4" />
          </button>
          <div className="absolute bottom-3 left-3 font-mono text-[10px] text-muted-foreground/60">
            DCS-5020L &bull; 640&times;480
          </div>
        </div>

        {/* Side panel */}
        <div className="w-48 shrink-0 rounded-lg border border-border bg-card p-4 space-y-4">
          <PTZControls onMove={handlePtz} />

          <div className="space-y-2">
            <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
              Controls
            </h3>
            <button
              onClick={handleMuteToggle}
              className={`flex items-center gap-2 w-full rounded-md px-3 py-2 text-sm transition-colors ${
                muted
                  ? "bg-destructive/10 text-destructive"
                  : "bg-secondary text-foreground hover:bg-primary hover:text-primary-foreground"
              }`}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              {muted ? "Unmute" : "Mute"}
            </button>
            <button
              onClick={handleNightToggle}
              className={`flex items-center gap-2 w-full rounded-md px-3 py-2 text-sm transition-colors ${
                nightMode
                  ? "bg-primary/20 text-primary"
                  : "bg-secondary text-foreground hover:bg-primary hover:text-primary-foreground"
              }`}
            >
              {nightMode ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              {nightMode ? "Night On" : "Night Off"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
