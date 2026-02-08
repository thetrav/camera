import { useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { LiveView } from "@/components/LiveView";
import { FTPConfig } from "@/components/FTPConfig";
import { FTPBrowser } from "@/components/FTPBrowser";
import { MotionDetection } from "@/components/MotionDetection";

type Page = "live" | "ftp-config" | "ftp-browser" | "motion";

const Index = () => {
  const [page, setPage] = useState<Page>("live");

  const content: Record<Page, React.ReactNode> = {
    live: <LiveView />,
    "ftp-config": <FTPConfig />,
    "ftp-browser": <FTPBrowser />,
    motion: <MotionDetection />,
  };

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <AppSidebar activePage={page} onNavigate={setPage} />
      <main className="flex-1 overflow-y-auto p-6">{content[page]}</main>
    </div>
  );
};

export default Index;
