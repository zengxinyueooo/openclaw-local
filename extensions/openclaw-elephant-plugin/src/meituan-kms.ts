type Logger = {
  info?: (msg: string) => void;
  warn?: (msg: string) => void;
  error?: (msg: string) => void;
  debug?: (msg: string) => void;
};

export type ElephantSsoProfile = "test" | "prod";

export type ElephantSsoClientConfig = {
  profile: ElephantSsoProfile;
  clientId: string;
  /** sso-web-oidc-cli 的 accessEnv 取值 */
  accessEnv: "test" | "product";
  /** 用于排查（固定 clientId 时仅作标识） */
  kmsKeys: { clientIdKey: string; appkey: string };
};

/** 固定 clientId：线下 test / 线上 prod */
const FIXED_CLIENT_IDS: Record<ElephantSsoProfile, string> = {
  test: "5K14002I94118207",
  prod: "dc91160a8b",
};

const cache = new Map<string, ElephantSsoClientConfig>();

export async function getElephantSsoClientConfig(params?: {
  logger?: Logger;
  env?: NodeJS.ProcessEnv;
  profile?: ElephantSsoProfile;
}): Promise<ElephantSsoClientConfig> {
  const logger = params?.logger;
  const env = params?.env ?? process.env;
  const profile: ElephantSsoProfile =
    params?.profile ??
    (() => {
      const raw = env.ELEPHANT_ENV?.trim() ?? "";
      const normalized = raw.toLowerCase();
      if (normalized === "test") {
        return "test";
      }
      return "prod";
    })();

  const cacheKey = profile;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const clientId = FIXED_CLIENT_IDS[profile];
  const suffix = profile.toUpperCase();
  const clientIdKey = `OPENCLAW_CLIENT_ID_${suffix}`;

  logger?.info?.(`elephant sso: using fixed clientId profile=${profile} clientId=${clientId}`);

  const result: ElephantSsoClientConfig = {
    profile,
    clientId,
    accessEnv: profile === "prod" ? "product" : "test",
    kmsKeys: { clientIdKey, appkey: "" },
  };
  cache.set(cacheKey, result);
  return result;
}

export function resolveElephantSsoProfile(
  env: NodeJS.ProcessEnv = process.env,
): ElephantSsoProfile {
  const raw = env.ELEPHANT_ENV?.trim() ?? "";
  const normalized = raw.toLowerCase();
  if (normalized === "test") {
    return "test";
  }
  return "prod";
}
