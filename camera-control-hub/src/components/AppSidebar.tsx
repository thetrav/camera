import { useState } from "react";
import {
  Video,
  FolderOpen,
  Server,
  Activity,
  Camera,
  ChevronLeft,
  ChevronRight,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Page = "live" | "ftp-connection" | "ftp-browser" | "motion" | "upload-automation";

interface AppSidebarProps {
  activePage: Page;
  onNavigate: (page: Page) => void;
}

const navItems: { id: Page; label: string; icon: React.ElementType }[] = [
  { id: "live", label: "Live View", icon: Video },
  { id: "ftp-connection", label: "FTP Connection", icon: Server },
  { id: "ftp-browser", label: "FTP Browser", icon: FolderOpen },
  { id: "motion", label: "Motion Detection", icon: Activity },
  { id: "upload-automation", label: "Upload Automation", icon: Clock },
];

export function AppSidebar({ activePage, onNavigate }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-border bg-card transition-all duration-300",
        collapsed ? "w-16" : "w-56"
      )}
    >
      {/* Brand */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-4">
        <Camera className="h-6 w-6 shrink-0 text-primary" />
        {!collapsed && (
          <span className="font-mono text-sm font-bold tracking-wide text-primary">
            DCS-5020L
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
              activePage === item.id
                ? "bg-primary/10 text-primary glow-sm"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center border-t border-border py-3 text-muted-foreground hover:text-foreground transition-colors"
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
    </aside>
  );
}
