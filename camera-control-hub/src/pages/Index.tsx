import { useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { LiveView } from "@/components/LiveView";
import { FTPConnection } from "@/components/FTPConnection";
import { FTPBrowser } from "@/components/FTPBrowser";
import { MotionDetection } from "@/components/MotionDetection";
import { UploadAutomation } from "@/components/UploadAutomation";

type Page = "live" | "ftp-connection" | "ftp-browser" | "motion" | "upload-automation";

const Index = () => {
  const [page, setPage] = useState<Page>("live");

  const content: Record<Page, React.ReactNode> = {
    live: <LiveView />,
    "ftp-connection": <FTPConnection />,
    "ftp-browser": <FTPBrowser />,
    motion: <MotionDetection />,
    "upload-automation": <UploadAutomation />,
  };

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <AppSidebar activePage={page} onNavigate={setPage} />
      <main className="flex-1 overflow-y-auto p-6">{content[page]}</main>
    </div>
  );
};

export default Index;
