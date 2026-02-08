import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save, TestTube, FileText, Loader2 } from "lucide-react";
import { getFtpSettings, saveFtpSettings, testFtp, writeTestFtp, type FtpSettings } from "@/lib/api";

export function FTPConnection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [writeTesting, setWriteTesting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const [config, setConfig] = useState({
    FTPHostAddress: "",
    FTPPortNumber: "21",
    FTPUserName: "",
    FTPPassword: "",
    FTPDirectoryPath: "/",
    FTPPassiveMode: "1",
  });

  useEffect(() => {
    getFtpSettings().then((s) => {
      setConfig({
        FTPHostAddress: s.FTPHostAddress,
        FTPPortNumber: s.FTPPortNumber,
        FTPUserName: s.FTPUserName,
        FTPPassword: s.FTPPassword,
        FTPDirectoryPath: s.FTPDirectoryPath,
        FTPPassiveMode: s.FTPPassiveMode,
      });
      setLoading(false);
    });
  }, []);

  const update = (key: keyof typeof config, value: string) =>
    setConfig((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    const res = await saveFtpSettings(config);
    setStatus(res.saved ? "Saved successfully" : `Save failed (status ${res.status})`);
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setStatus(null);
    const res = await testFtp();
    setStatus(res.tested ? "Test image sent to FTP" : `Test failed (status ${res.status})`);
    setTesting(false);
  };

  const handleWriteTest = async () => {
    setWriteTesting(true);
    setStatus(null);
    const res = await writeTestFtp();
    setStatus(res.ok ? "Write test succeeded" : `Write test failed: ${res.error}`);
    setWriteTesting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading FTP settings...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold">FTP Connection</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure where camera snapshots and recordings are uploaded.
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-card p-5">
        <Label className="text-xs font-mono uppercase text-muted-foreground">Connection</Label>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs font-mono uppercase text-muted-foreground">Host</Label>
            <Input
              value={config.FTPHostAddress}
              onChange={(e) => update("FTPHostAddress", e.target.value)}
              placeholder="192.168.1.100"
              className="font-mono text-sm bg-secondary border-border"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-mono uppercase text-muted-foreground">Port</Label>
            <Input
              value={config.FTPPortNumber}
              onChange={(e) => update("FTPPortNumber", e.target.value)}
              className="font-mono text-sm bg-secondary border-border"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-mono uppercase text-muted-foreground">Username</Label>
            <Input
              value={config.FTPUserName}
              onChange={(e) => update("FTPUserName", e.target.value)}
              className="font-mono text-sm bg-secondary border-border"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-mono uppercase text-muted-foreground">Password</Label>
            <Input
              type="password"
              value={config.FTPPassword}
              onChange={(e) => update("FTPPassword", e.target.value)}
              className="font-mono text-sm bg-secondary border-border"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-mono uppercase text-muted-foreground">Remote Path</Label>
          <Input
            value={config.FTPDirectoryPath}
            onChange={(e) => update("FTPDirectoryPath", e.target.value)}
            className="font-mono text-sm bg-secondary border-border"
          />
        </div>
        <div className="flex items-center gap-2 pt-2">
          <Switch
            checked={config.FTPPassiveMode === "1"}
            onCheckedChange={(v) => update("FTPPassiveMode", v ? "1" : "0")}
          />
          <Label className="text-sm">Passive Mode</Label>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </button>
        <button
          onClick={handleTest}
          disabled={testing}
          className="flex items-center gap-2 rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
        >
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
          Test Connection
        </button>
        <button
          onClick={handleWriteTest}
          disabled={writeTesting}
          className="flex items-center gap-2 rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
        >
          {writeTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Write Test
        </button>
      </div>

      {status && (
        <p className="text-sm font-mono text-muted-foreground">{status}</p>
      )}
    </div>
  );
}
