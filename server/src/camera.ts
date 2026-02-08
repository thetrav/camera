import http from "node:http";
import crypto from "node:crypto";

export interface CameraConfig {
  ip: string;
  user: string;
  pass: string;
  basicAuth: string;
  sshHost?: string;
  sshUser?: string;
  sshKeyPath?: string;
  sshFtpRoot?: string;
}

function md5(s: string): string {
  return crypto.createHash("md5").update(s).digest("hex");
}

function parseDigestChallenge(header: string): Record<string, string> {
  const params: Record<string, string> = {};
  const regex = /(\w+)=(?:"([^"]+)"|([^\s,]+))/g;
  let match;
  while ((match = regex.exec(header)) !== null) {
    params[match[1]] = match[2] ?? match[3];
  }
  return params;
}

let nonceCount = 0;

function buildDigestAuth(
  config: CameraConfig,
  method: string,
  uri: string,
  challenge: Record<string, string>,
): string {
  const realm = challenge.realm;
  const nonce = challenge.nonce;
  const qop = challenge.qop;
  nonceCount++;
  const nc = nonceCount.toString(16).padStart(8, "0");
  const cnonce = crypto.randomBytes(16).toString("hex");

  const ha1 = md5(`${config.user}:${realm}:${config.pass}`);
  const ha2 = md5(`${method}:${uri}`);
  const response = qop
    ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${nonce}:${ha2}`);

  let header = `Digest username="${config.user}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
  if (qop) {
    header += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
  }
  return header;
}

export function camRequest(
  config: CameraConfig,
  method: string,
  camPath: string,
  headers: Record<string, string>,
  body?: Buffer,
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: config.ip, port: 80, path: camPath, method, headers },
      resolve,
    );
    req.on("error", reject);
    if (body) req.end(body);
    else req.end();
  });
}

export function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export function readResponse(res: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    res.on("data", (chunk: Buffer) => chunks.push(chunk));
    res.on("end", () => resolve(Buffer.concat(chunks)));
    res.on("error", reject);
  });
}

export async function digestRequest(
  config: CameraConfig,
  method: string,
  camPath: string,
  referer: string,
  body?: string,
  contentType?: string,
): Promise<{ status: number; body: string }> {
  const headers: Record<string, string> = {
    Referer: `http://${config.ip}/${referer}`,
  };
  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  const buf = body ? Buffer.from(body) : undefined;
  const res1 = await camRequest(config, method, camPath, headers, buf);
  const body1 = (await readResponse(res1)).toString();

  if (res1.statusCode !== 401) {
    return { status: res1.statusCode ?? 0, body: body1 };
  }

  const wwwAuth = res1.headers["www-authenticate"] ?? "";
  if (!wwwAuth.startsWith("Digest")) {
    return { status: res1.statusCode ?? 0, body: body1 };
  }

  const challenge = parseDigestChallenge(wwwAuth);
  headers.Authorization = buildDigestAuth(config, method, camPath, challenge);

  const res2 = await camRequest(config, method, camPath, headers, buf);
  const body2 = (await readResponse(res2)).toString();
  return { status: res2.statusCode ?? 0, body: body2 };
}

export async function getSessionKey(
  config: CameraConfig,
  htmPage: string,
): Promise<string> {
  const res = await digestRequest(config, "GET", `/${htmPage}`, htmPage);
  const match = res.body.match(/SessionKey"\s*value="([^"]+)"/);
  if (!match) throw new Error(`Could not find SessionKey in ${htmPage}`);
  return match[1];
}

export async function proxyToCamera(
  config: CameraConfig,
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  const camPath = req.url!.slice(4); // strip /cam
  const method = req.method ?? "GET";
  const body = method === "POST" ? await readBody(req) : undefined;

  const headers: Record<string, string> = {
    Authorization: config.basicAuth,
    Referer: `http://${config.ip}/home.htm`,
  };
  if (req.headers["content-type"]) {
    headers["Content-Type"] = req.headers["content-type"];
  }

  const camRes = await camRequest(config, method, camPath, headers, body);

  if (camRes.statusCode === 401) {
    await readResponse(camRes); // drain
    const wwwAuth = camRes.headers["www-authenticate"] ?? "";
    if (wwwAuth.startsWith("Digest")) {
      const challenge = parseDigestChallenge(wwwAuth);
      headers.Authorization = buildDigestAuth(config, method, camPath, challenge);
      const camRes2 = await camRequest(config, method, camPath, headers, body);
      res.writeHead(camRes2.statusCode ?? 200, {
        "Content-Type":
          camRes2.headers["content-type"] || "application/octet-stream",
      });
      camRes2.pipe(res);
      res.on("close", () => camRes2.destroy());
      return;
    }
  }

  res.writeHead(camRes.statusCode ?? 200, {
    "Content-Type":
      camRes.headers["content-type"] || "application/octet-stream",
  });
  camRes.pipe(res);
  res.on("close", () => camRes.destroy());
}
