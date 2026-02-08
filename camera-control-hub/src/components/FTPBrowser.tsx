import { useEffect, useState, useCallback } from "react";
import {
  FileImage,
  FileVideo,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Folder,
  Download,
  Loader2,
  File,
  Trash2,
  Play,
  X,
  Film,
} from "lucide-react";
import { listFtpFiles, getFtpDownloadUrl, getFtpBasePath, deleteFtpItem, transcodeVideo, transcodeDir, type FtpFile } from "@/lib/api";

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  date: string | null;
  children?: TreeNode[];
  loading?: boolean;
  expanded?: boolean;
  transcoding?: boolean;
}

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

function isVideo(name: string): boolean {
  return /\.(avi|mp4|mkv)$/i.test(name);
}

function NodeIcon({ node }: { node: TreeNode }) {
  if (node.type === "dir") {
    return node.expanded ? (
      <FolderOpen className="h-4 w-4 text-warning shrink-0" />
    ) : (
      <Folder className="h-4 w-4 text-warning shrink-0" />
    );
  }
  if (isImage(node.name)) return <FileImage className="h-4 w-4 text-success shrink-0" />;
  if (isVideo(node.name)) return <FileVideo className="h-4 w-4 text-primary shrink-0" />;
  return <File className="h-4 w-4 text-muted-foreground shrink-0" />;
}

function buildPath(parent: string, name: string): string {
  return parent === "/" ? `/${name}` : `${parent}/${name}`;
}

export function FTPBrowser() {
  const [roots, setRoots] = useState<TreeNode[]>([]);
  const [basePath, setBasePath] = useState<string>("/");
  const [initialLoading, setInitialLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<TreeNode | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [batchStatus, setBatchStatus] = useState<{ path: string; message: string } | null>(null);

  // Update a node in the tree by path
  const updateNode = useCallback(
    (nodes: TreeNode[], targetPath: string, updater: (node: TreeNode) => TreeNode): TreeNode[] => {
      return nodes.map((node) => {
        if (node.path === targetPath) {
          return updater(node);
        }
        if (node.children) {
          return { ...node, children: updateNode(node.children, targetPath, updater) };
        }
        return node;
      });
    },
    [],
  );

  // Remove a node from the tree by path
  const removeNode = useCallback(
    (nodes: TreeNode[], targetPath: string): TreeNode[] => {
      return nodes
        .filter((node) => node.path !== targetPath)
        .map((node) => {
          if (node.children) {
            return { ...node, children: removeNode(node.children, targetPath) };
          }
          return node;
        });
    },
    [],
  );

  // Load children for a directory node
  const loadChildren = useCallback(
    async (dirPath: string, setTree: React.Dispatch<React.SetStateAction<TreeNode[]>>) => {
      setTree((prev) =>
        updateNode(prev, dirPath, (n) => ({ ...n, loading: true, expanded: true })),
      );
      try {
        const entries = await listFtpFiles(dirPath);
        const children: TreeNode[] = entries.map((e: FtpFile) => ({
          name: e.name,
          path: buildPath(dirPath, e.name),
          type: e.type,
          size: e.size,
          date: e.date,
          expanded: false,
        }));
        setTree((prev) =>
          updateNode(prev, dirPath, (n) => ({ ...n, children, loading: false })),
        );
        // Auto-expand subdirectories
        for (const child of children) {
          if (child.type === "dir") {
            loadChildren(child.path, setTree);
          }
        }
      } catch (err) {
        console.error("Failed to load", dirPath, err);
        setTree((prev) =>
          updateNode(prev, dirPath, (n) => ({ ...n, loading: false, children: [] })),
        );
      }
    },
    [updateNode],
  );

  // Initial load
  useEffect(() => {
    (async () => {
      try {
        const { basePath: bp } = await getFtpBasePath();
        setBasePath(bp);
        const entries = await listFtpFiles(bp);
        const nodes: TreeNode[] = entries.map((e: FtpFile) => ({
          name: e.name,
          path: buildPath(bp, e.name),
          type: e.type,
          size: e.size,
          date: e.date,
          expanded: false,
        }));
        setRoots(nodes);
        setInitialLoading(false);
        // Auto-expand all directories
        for (const node of nodes) {
          if (node.type === "dir") {
            loadChildren(node.path, setRoots);
          }
        }
      } catch (err) {
        console.error("Failed initial load", err);
        setInitialLoading(false);
      }
    })();
  }, [loadChildren]);

  const toggleExpand = (node: TreeNode) => {
    if (node.type !== "dir") return;
    if (!node.children) {
      // Not loaded yet, load
      loadChildren(node.path, setRoots);
    } else {
      setRoots((prev) =>
        updateNode(prev, node.path, (n) => ({ ...n, expanded: !n.expanded })),
      );
    }
  };

  const handleFileClick = async (node: TreeNode) => {
    if (node.type === "dir") {
      toggleExpand(node);
      return;
    }

    if (/\.mp4$/i.test(node.name)) {
      setVideoUrl(getFtpDownloadUrl(node.path));
      return;
    }

    if (/\.avi$/i.test(node.name)) {
      // Transcode AVI to MP4 then play
      setRoots((prev) =>
        updateNode(prev, node.path, (n) => ({ ...n, transcoding: true })),
      );
      try {
        const result = await transcodeVideo(node.path);
        if (result.ok && result.mp4Path) {
          setVideoUrl(getFtpDownloadUrl(result.mp4Path));
          // Replace AVI node with MP4 node in the tree
          const mp4Name = node.name.replace(/\.avi$/i, ".mp4");
          setRoots((prev) =>
            updateNode(prev, node.path, (n) => ({
              ...n,
              name: mp4Name,
              path: result.mp4Path!,
              transcoding: false,
            })),
          );
          return;
        } else {
          console.error("Transcode failed:", result.error);
        }
      } catch (err) {
        console.error("Transcode error:", err);
      }
      setRoots((prev) =>
        updateNode(prev, node.path, (n) => ({ ...n, transcoding: false })),
      );
    }
  };

  const handleBatchConvert = async (node: TreeNode) => {
    setBatchStatus({ path: node.path, message: "Converting..." });
    try {
      const result = await transcodeDir(node.path);
      if (result.ok) {
        setBatchStatus({
          path: node.path,
          message: `Done: ${result.converted} converted, ${result.skipped} skipped${result.errors.length ? `, ${result.errors.length} errors` : ""}`,
        });
        // Refresh the directory to show new mp4 files
        loadChildren(node.path, setRoots);
      } else {
        setBatchStatus({ path: node.path, message: "Batch convert failed" });
      }
    } catch (err) {
      console.error("Batch convert error:", err);
      setBatchStatus({ path: node.path, message: "Batch convert error" });
    }
    setTimeout(() => setBatchStatus(null), 5000);
  };

  const handleDelete = async (node: TreeNode) => {
    try {
      await deleteFtpItem(node.path, node.type);
      setRoots((prev) => removeNode(prev, node.path));
    } catch (err) {
      console.error("Delete failed", err);
    }
    setConfirmDelete(null);
  };

  const refreshAll = async () => {
    setInitialLoading(true);
    try {
      const entries = await listFtpFiles(basePath);
      const nodes: TreeNode[] = entries.map((e: FtpFile) => ({
        name: e.name,
        path: buildPath(basePath, e.name),
        type: e.type,
        size: e.size,
        date: e.date,
        expanded: false,
      }));
      setRoots(nodes);
      setInitialLoading(false);
      for (const node of nodes) {
        if (node.type === "dir") {
          loadChildren(node.path, setRoots);
        }
      }
    } catch (err) {
      console.error("Refresh failed", err);
      setInitialLoading(false);
    }
  };

  const countNodes = (nodes: TreeNode[]): number => {
    let count = nodes.length;
    for (const n of nodes) {
      if (n.children) count += countNodes(n.children);
    }
    return count;
  };

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">FTP Browser</h1>
          <div className="text-xs font-mono text-muted-foreground mt-1">{basePath}</div>
        </div>
        <button
          onClick={refreshAll}
          className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      <div className="flex-1 rounded-lg border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-[1fr_80px_140px_70px] gap-3 px-4 py-2 border-b border-border text-xs font-mono uppercase text-muted-foreground bg-secondary/50">
          <span>Name</span>
          <span>Size</span>
          <span>Date</span>
          <span />
        </div>

        <div className="overflow-y-auto max-h-[calc(100vh-280px)]">
          {initialLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : roots.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No files found</div>
          ) : (
            <TreeRows
              nodes={roots}
              depth={0}
              onToggle={toggleExpand}
              onClick={handleFileClick}
              onDelete={(node) => setConfirmDelete(node)}
              onBatchConvert={handleBatchConvert}
              batchStatus={batchStatus}
            />
          )}
        </div>
      </div>

      <div className="text-xs font-mono text-muted-foreground">{countNodes(roots)} items</div>

      {/* Video player modal */}
      {videoUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setVideoUrl(null)}
        >
          <div
            className="relative max-w-4xl w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute -top-10 right-0 text-white hover:text-white/80"
              onClick={() => setVideoUrl(null)}
            >
              <X className="h-6 w-6" />
            </button>
            <video
              src={videoUrl}
              controls
              autoPlay
              className="w-full rounded-lg"
            />
          </div>
        </div>
      )}

      {/* Delete confirm dialog */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="bg-card rounded-lg p-6 max-w-sm w-full mx-4 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm">
              {confirmDelete.type === "dir"
                ? `Delete folder "${confirmDelete.name}" and all contents?`
                : `Delete "${confirmDelete.name}"?`}
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="rounded-md px-3 py-1.5 text-xs font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button
                className="rounded-md px-3 py-1.5 text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/80"
                onClick={() => handleDelete(confirmDelete)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TreeRows({
  nodes,
  depth,
  onToggle,
  onClick,
  onDelete,
  onBatchConvert,
  batchStatus,
}: {
  nodes: TreeNode[];
  depth: number;
  onToggle: (node: TreeNode) => void;
  onClick: (node: TreeNode) => void;
  onDelete: (node: TreeNode) => void;
  onBatchConvert: (node: TreeNode) => void;
  batchStatus: { path: string; message: string } | null;
}) {
  // Sort: dirs first, then files, alphabetically within each group
  const sorted = [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <>
      {sorted.map((node) => (
        <TreeRow
          key={node.path}
          node={node}
          depth={depth}
          onToggle={onToggle}
          onClick={onClick}
          onDelete={onDelete}
          onBatchConvert={onBatchConvert}
          batchStatus={batchStatus}
        />
      ))}
    </>
  );
}

function TreeRow({
  node,
  depth,
  onToggle,
  onClick,
  onDelete,
  onBatchConvert,
  batchStatus,
}: {
  node: TreeNode;
  depth: number;
  onToggle: (node: TreeNode) => void;
  onClick: (node: TreeNode) => void;
  onDelete: (node: TreeNode) => void;
  onBatchConvert: (node: TreeNode) => void;
  batchStatus: { path: string; message: string } | null;
}) {
  const indent = depth * 20;

  return (
    <>
      <div
        className="grid grid-cols-[1fr_80px_140px_70px] gap-3 px-4 py-1.5 items-center text-sm hover:bg-secondary/30 transition-colors cursor-pointer border-b border-border/50"
        onClick={() => onClick(node)}
      >
        <div className="flex items-center gap-1.5 min-w-0" style={{ paddingLeft: indent }}>
          {node.type === "dir" ? (
            <button
              className="p-0.5 rounded hover:bg-secondary shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onToggle(node);
              }}
            >
              {node.loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : node.expanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
          ) : (
            <span className="w-5" />
          )}
          <NodeIcon node={node} />
          <span className="font-mono text-xs truncate">{node.name}</span>
          {node.type === "file" && isImage(node.name) && (
            <img
              src={getFtpDownloadUrl(node.path)}
              alt={node.name}
              className="h-8 w-8 object-cover rounded ml-auto shrink-0"
            />
          )}
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {node.type === "file" ? formatSize(node.size) : ""}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {node.type === "file" ? formatDate(node.date) : ""}
        </span>
        <div className="flex items-center gap-1">
          {node.type === "file" && node.transcoding && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          )}
          {node.type === "file" && isVideo(node.name) && !node.transcoding && (
            <button
              className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onClick(node);
              }}
              title="Play video"
            >
              <Play className="h-3.5 w-3.5" />
            </button>
          )}
          {node.type === "dir" && (
            <button
              className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onBatchConvert(node);
              }}
              title="Convert videos in folder"
            >
              {batchStatus?.path === node.path ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Film className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          {node.type === "file" && (
            <a
              href={getFtpDownloadUrl(node.path)}
              download
              className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <Download className="h-3.5 w-3.5" />
            </a>
          )}
          <button
            className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {node.type === "dir" && node.expanded && node.children && (
        <TreeRows
          nodes={node.children}
          depth={depth + 1}
          onToggle={onToggle}
          onClick={onClick}
          onDelete={onDelete}
          onBatchConvert={onBatchConvert}
          batchStatus={batchStatus}
        />
      )}
    </>
  );
}
