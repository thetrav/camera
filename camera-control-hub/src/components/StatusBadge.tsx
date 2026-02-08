import { ReactNode } from "react";

interface StatusBadgeProps {
  status: "online" | "offline" | "recording";
  children?: ReactNode;
}

export function StatusBadge({ status, children }: StatusBadgeProps) {
  const colors = {
    online: "bg-success/20 text-success border-success/30",
    offline: "bg-destructive/20 text-destructive border-destructive/30",
    recording: "bg-destructive/20 text-destructive border-destructive/30",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-mono font-medium ${colors[status]}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status === "recording" ? "animate-pulse bg-destructive" : status === "online" ? "bg-success" : "bg-destructive"
        }`}
      />
      {children ?? status.toUpperCase()}
    </span>
  );
}
