import { promises as fs } from "fs";
import { FileSystem, FtpConnection } from "ftp-srv";

export class FtpFileSystem extends FileSystem {
  constructor(connection: FtpConnection, params?: { root: any; cwd: any }) {
    super(connection, params);
  }

  write(fileName: string, props?: { append?: boolean; start?: any }): any {
    const result = super.write(fileName, props);
    const { fsPath } = (this as any)._resolvePath(fileName);
    result.stream.on("close", async () => {
      await fs.chmod(fsPath, 0o777);
    });
    return result;
  }

  async mkdir(fileName: string, props?: { append?: boolean }): Promise<any> {
    const fsPath = await super.mkdir(fileName);
    await fs.chmod(fsPath, 0o777);
    return fsPath;
  }

  chmod(path: string, mode: string): Promise<any> {
    console.log(
      `[FtpFileSystem] chmod called: path=${path}, mode=${mode}, caller=${new Error().stack}`,
    );
    return super.chmod(path, mode);
  }
}
