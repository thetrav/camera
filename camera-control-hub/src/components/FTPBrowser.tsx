import { useEffect, useState } from "react";
import {
  FileImage,
  FileVideo,
  RefreshCw,
  ChevronRight,
  FolderOpen,
  Download,
  Loader2,
  File,
} from "lucide-react";
import { listFtpFiles, getFtpDownloadUrl, type FtpFile } from "@/lib/api";

function formatSize(bytes: number): string {
  if (bytes === 0) return "--";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: string | null): string {
  if (!date) return "--";
  return new Date(date).toLocaleString();
}

function isImage(name: string): boolean {
  return /\.(jpg|jpeg|png|gif|bmp)$/i.test(name);
}

function FileIcon({ file }: { file: FtpFile }) {
  if (file.type === "dir") return <FolderOpen className="h-4 w-4 text-warning" />;
  if (isImage(file.name)) return <FileImage className="h-4 w-4 text-success" />;
  if (/\.(avi|mp4|mkv)$/i.test(file.name)) return <FileVideo className="h-4 w-4 text-primary" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

export function FTPBrowser() {
  const [files, setFiles] = useState<FtpFile[]>([]);
  const [path, setPath] = useState("/");
  const [loading, setLoading] = useState(true);

  const load = async (p: string) => {
    setLoading(true);
    const data = await listFtpFiles(p);
    setFiles(data);
    setPath(p);
    setLoading(false);
  };

  useEffect(() => {
    load("/");
  }, []);

  const navigateTo = (name: string) => {
    const next = path === "/" ? `/${name}` : `${path}/${name}`;
    load(next);
  };

  const navigateUp = () => {
    const parts = path.split("/").filter(Boolean);
    parts.pop();
    load("/" + parts.join("/"));
  };

  const navigateBreadcrumb = (idx: number) => {
    const parts = path.split("/").filter(Boolean);
    load("/" + parts.slice(0, idx + 1).join("/"));
  };

  const pathSegments = path.split("/").filter(Boolean);

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">FTP Browser</h1>
          <div className="flex items-center gap-1 mt-1 text-xs font-mono text-muted-foreground">
            <button onClick={() => load("/")} className="hover:text-foreground transition-colors">
              ftp://server
            </button>
            {pathSegments.map((seg, i) => (
              <span key={i} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3" />
                <button
                  onClick={() => navigateBreadcrumb(i)}
                  className="text-foreground hover:text-primary transition-colors"
                >
                  {seg}
                </button>
              </span>
            ))}
          </div>
        </div>
        <button
          onClick={() => load(path)}
          className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* File list */}
      <div className="flex-1 rounded-lg border border-border bg-card overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1fr_80px_140px_40px] gap-3 px-4 py-2 border-b border-border text-xs font-mono uppercase text-muted-foreground bg-secondary/50">
          <span>Name</span>
          <span>Size</span>
          <span>Date</span>
          <span />
        </div>

        {/* Rows */}
        <div className="divide-y divide-border overflow-y-auto max-h-[calc(100vh-280px)]">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : (
            <>
              {path !== "/" && (
                <div
                  className="grid grid-cols-[1fr_80px_140px_40px] gap-3 px-4 py-2.5 items-center text-sm hover:bg-secondary/30 transition-colors cursor-pointer"
                  onClick={navigateUp}
                >
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 text-warning" />
                    <span className="font-mono text-xs">..</span>
                  </div>
                  <span />
                  <span />
                  <span />
                </div>
              )}
              {files.map((file) => (
                <div
                  key={file.name}
                  className="grid grid-cols-[1fr_80px_140px_40px] gap-3 px-4 py-2.5 items-center text-sm hover:bg-secondary/30 transition-colors cursor-pointer"
                  onClick={() => file.type === "dir" && navigateTo(file.name)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileIcon file={file} />
                    <span className="font-mono text-xs truncate">{file.name}</span>
                    {file.type === "file" && isImage(file.name) && (
                      <img
                        src={getFtpDownloadUrl(path === "/" ? `/${file.name}` : `${path}/${file.name}`)}
                        alt={file.name}
                        className="h-8 w-8 object-cover rounded ml-auto shrink-0"
                      />
                    )}
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{formatSize(file.size)}</span>
                  <span className="font-mono text-xs text-muted-foreground">{formatDate(file.date)}</span>
                  {file.type === "file" && (
                    <a
                      href={getFtpDownloadUrl(path === "/" ? `/${file.name}` : `${path}/${file.name}`)}
                      download
                      className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              ))}
              {files.length === 0 && !loading && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No files found
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="text-xs font-mono text-muted-foreground">
        {files.length} items
      </div>
    </div>
  );
}
