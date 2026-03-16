import crypto from "node:crypto";
import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import {
  SSOAccessEnvType,
  SSOCliClient,
  SSOTokenInfoType,
  SSOTokenStorageInterface,
} from "@mtfe/sso-web-oidc-cli";
import { getElephantSsoClientConfig, type ElephantSsoProfile } from "./meituan-kms.ts";

const fsPromise = fs.promises;

/** 本地 Token 存储目录（与 sso-web-oidc-cli 约定一致） */
export const DEFAULT_TOKEN_DIR = path.resolve(homedir(), ".openclaw_elephant_sso_config");

type Logger = {
  info?: (msg: string) => void;
  warn?: (msg: string) => void;
  error?: (msg: string) => void;
  debug?: (msg: string) => void;
};

/** 对外暴露的 token 形状（与 SSOTokenInfoType 兼容） */
export type SsoToken = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  [key: string]: unknown;
};

/** 本地 Token 存储器 */
class AdvancedFileTokenStorage implements SSOTokenStorageInterface {
  private clientId: string;
  private accessEnv: string;
  private configDirAbsolutePath: string;

  constructor(clientId: string, accessEnv: string, configDirAbsolutePath: string) {
    this.clientId = clientId;
    this.accessEnv = accessEnv;
    this.configDirAbsolutePath = configDirAbsolutePath;
  }

  async get(): Promise<SSOTokenInfoType> {
    try {
      if (!this.clientId) {
        return {} as SSOTokenInfoType;
      }
      const filePath = await this.getClientRelatedFilePath();
      const rawData = await fsPromise.readFile(filePath, "utf-8");
      const content = JSON.parse(rawData) as SSOTokenInfoType;
      const result: SSOTokenInfoType = {
        ...content,
        access_token: this.decodeText(this.clientId, content.access_token),
        refresh_token: this.decodeText(this.clientId, content.refresh_token),
      };
      return result;
    } catch {
      return {} as SSOTokenInfoType;
    }
  }

  async set(tokens: SSOTokenInfoType): Promise<void> {
    const rawData = {
      ...tokens,
      access_token: this.encodeText(this.clientId, tokens.access_token),
      refresh_token: this.encodeText(this.clientId, tokens.refresh_token),
    };
    const filePath = await this.getClientRelatedFilePath();
    await fsPromise.writeFile(filePath, JSON.stringify(rawData, null, 2), "utf-8");
  }

  private async getClientRelatedFilePath(): Promise<string> {
    const filePath = getTokenFilePath({
      clientId: this.clientId,
      accessEnv: this.accessEnv as "test" | "product",
      tokenDir: this.configDirAbsolutePath,
    });
    await fsPromise.mkdir(path.dirname(filePath), { recursive: true });
    return filePath;
  }

  private encodeText(_key: string, text?: string): string | undefined {
    return text;
  }

  private decodeText(_key: string, text?: string): string | undefined {
    return text;
  }
}

export function getTokenFilePath(params: {
  clientId: string;
  accessEnv: "test" | "product";
  tokenDir: string;
}): string {
  const { clientId, accessEnv, tokenDir } = params;
  const MAGIC_WORLD = "cli";
  const clientIdHash = crypto
    .createHash("sha1")
    .update(`${clientId}_@_${MAGIC_WORLD}`)
    .digest("hex");
  const envDir = accessEnv ? path.join(tokenDir, accessEnv) : tokenDir;
  return path.join(envDir, `${String(clientIdHash)}_tokens.json`);
}

function mapAccessEnv(
  env: "test" | "product",
): (typeof SSOAccessEnvType)[keyof typeof SSOAccessEnvType] {
  return env === "product" ? SSOAccessEnvType.product : SSOAccessEnvType.test;
}

export function createSSOClient(params: {
  clientId: string;
  accessEnv: "test" | "product";
  tokenDir?: string;
  localPortList?: number[];
  isDebug?: boolean;
}): SSOCliClient {
  const tokenDir = params.tokenDir ?? DEFAULT_TOKEN_DIR;
  const accessEnv = mapAccessEnv(params.accessEnv);
  return new SSOCliClient({
    clientId: params.clientId,
    accessEnv,
    localPortList: params.localPortList ?? [11088, 11089],
    tokenStorage: new AdvancedFileTokenStorage(params.clientId, params.accessEnv, tokenDir),
    isDebug: params.isDebug ?? false,
  });
}

let cached: {
  token: SsoToken;
  user?: unknown;
  receivedAt: number;
} | null = null;
let inflight: Promise<void> | null = null;

export function getElephantSsoToken(): {
  token: SsoToken;
  user?: unknown;
  receivedAt: number;
} | null {
  return cached;
}

/** 轮询直到 SSO 登录成功拿到 token，或超时。用于在建立 WS 前确保已认证。 */
export function waitForElephantSsoToken(params?: {
  timeoutMs?: number;
  pollIntervalMs?: number;
}): Promise<{
  token: SsoToken;
  user?: unknown;
  receivedAt: number;
} | null> {
  const timeoutMs = params?.timeoutMs ?? 60_000;
  const pollIntervalMs = params?.pollIntervalMs ?? 500;
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const tick = () => {
      const cur = getElephantSsoToken();
      if (cur != null) {
        resolve(cur);
        return;
      }
      if (Date.now() >= deadline) {
        resolve(null);
        return;
      }
      setTimeout(tick, pollIntervalMs);
    };
    tick();
  });
}

/** 使用 sso-web-oidc-cli 发起登录（浏览器/CLI 流程），clientId 从 KMS 拉取，无需 secret。 */
export function startElephantSsoLogin(params: { profile: ElephantSsoProfile; logger?: Logger }) {
  const logger = params.logger ?? console;
  if (inflight) {
    return;
  }

  inflight = (async () => {
    logger?.info?.("elephant sso: fetching clientId from KMS and starting CLI login");
    const cfg = await getElephantSsoClientConfig({
      logger,
      profile: params.profile,
    });
    const sso = createSSOClient({
      clientId: cfg.clientId,
      accessEnv: cfg.accessEnv,
      tokenDir: DEFAULT_TOKEN_DIR,
      isDebug: Boolean(process.env.ELEPHANT_SSO_DEBUG),
    });
    const token = await sso.login();
    const user = await sso.whoami();
    cached = {
      token: token as SsoToken,
      user,
      receivedAt: Date.now(),
    };
    logger?.info?.("elephant sso: CLI login success");
  })()
    .catch((err) => {
      logger?.error?.(`elephant sso: CLI login failed: ${String(err)}`);
    })
    .finally(() => {
      inflight = null;
    });
}
