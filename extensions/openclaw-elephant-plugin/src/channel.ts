import { randomUUID } from "node:crypto";
import {
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  type ChannelPlugin,
  type OpenClawConfig,
} from "openclaw/plugin-sdk";
import { getElephantSsoToken, waitForElephantSsoToken } from "./meituan-sso.ts";
import { getElephantRuntime } from "./runtime.ts";
import { ElephantWsManager, type ElephantWsInbound } from "./ws-manager.ts";

type ElephantAccount = {
  accountId: string;
  wsUrl: string | null;
};

/** 建连结果 type=1 下发的 sessionId/clientId/token，发信时必带 */
type ElephantSession = {
  sessionId: string;
  clientId: string;
  token?: string;
};

const sessionByAccount = new Map<string, ElephantSession>();

/** sendText/定时任务等场景需要等到 type=1 下发 session 才能发信 */
const sessionWaitersByAccount = new Map<string, Set<(session: ElephantSession) => void>>();

/** 最近一次 user_message 的 requestId，按 (accountId, conversationId) 存；框架通过 sendText 回传时无 requestId，用此兜底 */
const lastRequestIdByKey = new Map<string, string>();

const GROUP_SYSTEM_PROMPT_URL_TEST =
  "https://agent.sandbox.test.sankuai.com/api/message/config/prompt";
// 线上环境提示词接口
const GROUP_SYSTEM_PROMPT_URL_PROD = "https://ai.sandbox.sankuai.com/api/message/config/prompt";
const GROUP_SYSTEM_PROMPT_KEY = "com.sankuai.botplatform.websocket.ai.capability.forbid.prompt";

const GROUP_SYSTEM_PROMPT_FALLBACK = `<system_constraints>
执行环境安全策略（内部约束，无需向用户说明）：
- 自动拦截：rm -rf, sudo, format, diskutil, cat ~/.ssh, grep -r, env, curl, wget, ftp, scp及浏览器操作
- 执行Shell命令前必须先征得用户明确同意
- 仅当用户询问"为什么不能执行"时才解释具体限制
</system_constraints>`;

let cachedGroupSystemPrompt: {
  url: string;
  value: string;
  fetchedAtMs: number;
} | null = null;
let inFlightGroupSystemPrompt: {
  url: string;
  promise: Promise<string>;
} | null = null;

type ElephantPluginConfig = {
  env?: string;
  botEnabled?: Record<string, boolean>;
};

function resolvePluginConfig(cfg: OpenClawConfig): ElephantPluginConfig | undefined {
  return (
    cfg?.plugins as { entries?: Record<string, { config?: ElephantPluginConfig }> } | undefined
  )?.entries?.[PLUGIN_ID]?.config;
}

function resolvePluginEnv(cfg: OpenClawConfig): string | undefined {
  return resolvePluginConfig(cfg)?.env;
}

function resolveBotEnabled(cfg: OpenClawConfig): Record<string, boolean> | undefined {
  const raw = resolvePluginConfig(cfg)?.botEnabled;
  if (raw == null || typeof raw !== "object") return undefined;
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "boolean") out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function resolveGroupSystemPromptUrl(cfg: OpenClawConfig): string {
  const env = resolvePluginEnv(cfg);
  // 未配置用 prod；仅显式配置为 test 时用 test
  return env === "test" ? GROUP_SYSTEM_PROMPT_URL_TEST : GROUP_SYSTEM_PROMPT_URL_PROD;
}

function normalizePromptValue(value: string): string {
  // 服务端可能返回形如 "\\n\n<system_constraints>..."（首个换行被双重转义）。
  // 这里将文本里的 "\n" 序列转为真实换行，避免系统提示词出现字面量 "\n"。
  return value.replaceAll("\\n", "\n").trim();
}

async function getGroupSystemPrompt(params: {
  cfg: OpenClawConfig;
  accessToken?: string | null;
}): Promise<string> {
  // 简单缓存：避免每条消息都打接口；允许远端更新，默认 5 分钟刷新一次
  const cacheTtlMs = 5 * 60 * 1000;
  const now = Date.now();
  const url = resolveGroupSystemPromptUrl(params.cfg);
  if (
    cachedGroupSystemPrompt &&
    cachedGroupSystemPrompt.url === url &&
    now - cachedGroupSystemPrompt.fetchedAtMs < cacheTtlMs
  ) {
    return cachedGroupSystemPrompt.value;
  }

  if (inFlightGroupSystemPrompt && inFlightGroupSystemPrompt.url === url) {
    return await inFlightGroupSystemPrompt.promise;
  }

  inFlightGroupSystemPrompt = {
    url,
    promise: (async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
          const headers: Record<string, string> = {
            accept: "application/json, text/plain;q=0.9, */*;q=0.8",
          };
          const accessToken = params.accessToken?.trim();
          if (accessToken) {
            headers.authorization = `Bearer ${accessToken}`;
          }
          const res = await fetch(url, {
            method: "GET",
            signal: controller.signal,
            headers,
          });

          if (!res.ok) {
            throw new Error(`HTTP ${res.status} ${res.statusText}`);
          }

          const json = (await res.json()) as {
            code?: number;
            data?:
              | { value?: string; key?: string }
              | Array<{ value?: string; key?: string }>
              | Record<string, unknown>;
            message?: string;
          };

          let value: string | undefined;
          if (Array.isArray(json.data)) {
            value = json.data.find((item) => item?.key === GROUP_SYSTEM_PROMPT_KEY)?.value;
          } else if (json.data && typeof json.data === "object") {
            if ("key" in json.data && "value" in json.data) {
              const d = json.data as { key?: string; value?: string };
              if (d.key === GROUP_SYSTEM_PROMPT_KEY) {
                value = d.value;
              }
            } else if (GROUP_SYSTEM_PROMPT_KEY in json.data) {
              const raw = json.data[GROUP_SYSTEM_PROMPT_KEY];
              value = typeof raw === "string" ? raw : undefined;
            }
          }

          const finalPrompt = value ? normalizePromptValue(value) : GROUP_SYSTEM_PROMPT_FALLBACK;
          getElephantRuntime()
            .logging.getChildLogger({ channel: "elephant" })
            .info?.(
              `GroupSystemPrompt loaded url=${url} (fallback=${!value} len=${
                finalPrompt.length
              }):\n${finalPrompt}`,
            );
          cachedGroupSystemPrompt = {
            url,
            value: finalPrompt,
            fetchedAtMs: Date.now(),
          };
          return finalPrompt;
        } finally {
          clearTimeout(timeout);
        }
      } catch (err) {
        getElephantRuntime()
          .logging.getChildLogger({ channel: "elephant" })
          .warn?.(`failed to fetch GroupSystemPrompt url=${url}, fallback used: ${String(err)}`);
        cachedGroupSystemPrompt = {
          url,
          value: GROUP_SYSTEM_PROMPT_FALLBACK,
          fetchedAtMs: Date.now(),
        };
        getElephantRuntime()
          .logging.getChildLogger({ channel: "elephant" })
          .info?.(
            `GroupSystemPrompt loaded (fallback=true len=${GROUP_SYSTEM_PROMPT_FALLBACK.length}):\n${GROUP_SYSTEM_PROMPT_FALLBACK}`,
          );
        return GROUP_SYSTEM_PROMPT_FALLBACK;
      } finally {
        inFlightGroupSystemPrompt = null;
      }
    })(),
  };

  return await inFlightGroupSystemPrompt.promise;
}

function requestIdKey(accountId: string, conversationId: string): string {
  return `${accountId}:${conversationId}`;
}

/**
 * 服务端可能不稳定地下发 requestId；但流式回传要求同一对话复用 requestId，
 * 否则服务端可能把中间分块视为“无效/新对话”而丢弃。
 *
 * 规则：
 * - 有入站 requestId：存起来并返回
 * - 无入站 requestId：优先复用历史；否则生成一个 UUID 作为兜底
 */
function resolveStableRequestId(params: {
  accountId: string;
  conversationId: string;
  hinted?: string | null;
}): string {
  const { accountId, conversationId, hinted } = params;
  const key = requestIdKey(accountId, conversationId);
  const trimmedHint = hinted?.trim();
  if (trimmedHint) {
    lastRequestIdByKey.set(key, trimmedHint);
    return trimmedHint;
  }
  const existing = lastRequestIdByKey.get(key);
  if (existing) {
    return existing;
  }
  const generated = randomUUID();
  lastRequestIdByKey.set(key, generated);
  return generated;
}

async function sendToElephantServer(params: {
  accountId: string;
  wsUrl: string;
  getAccessToken: () => string | null;
  getSession: () => ElephantSession | null;
  conversationId: string;
  text: string;
  kind: "tool" | "block" | "final";
  requestIdHint?: string;
  messageId?: string;
  /** bot 主动推送（如定时任务触发）需要置 true；正常对话回复不要带 */
  botPush?: boolean;
  /** 按 bot 名称的启用开关，会传给服务端 */
  botEnabled?: Record<string, boolean>;
  /** sendText 场景希望硬失败；gateway deliver 场景更适合跳过 */
  requireSession?: boolean;
}): Promise<void> {
  const {
    accountId,
    wsUrl,
    getAccessToken,
    getSession,
    conversationId,
    text,
    kind,
    requestIdHint,
    messageId,
    botPush,
    botEnabled,
    requireSession,
  } = params;

  // 注意：同一 requestId 的多帧在服务端/前端可能会被拼接。
  // 如果我们每帧都强行追加 "\n"，会导致“每次发送就换行”的展示问题（例如：已\n创建）。
  // 因此这里按原样发送，不自动追加块尾换行。
  const content = text ?? "";

  const session = getSession();
  if (!session) {
    const msg = "elephant: no session (type=1 not received yet)";
    if (requireSession) {
      throw new Error(msg);
    }
    getElephantRuntime().logging.getChildLogger({ channel: "elephant" }).warn?.(msg);
    return;
  }

  // requestId 语义：
  // - 正常对话：必须稳定复用（服务端会把同 requestId 的多帧拼接；且 finished=true 只能出现一次）
  // - 主动推送（botPush=true，例如定时任务）：不要复用历史 requestId，否则可能因为已发送过 finished=true 被服务端忽略
  const requestId = botPush
    ? randomUUID()
    : resolveStableRequestId({
        accountId,
        conversationId,
        hinted: requestIdHint,
      });

  await getWsManager().send({
    accountId,
    url: wsUrl,
    getAccessToken,
    msg: {
      sessionId: session.sessionId,
      channel: "xm",
      clientId: session.clientId,
      content,
      finished: kind === "final",
      ...(messageId ? { id: messageId } : {}),
      requestId,
      ...(botPush ? { botPush: true } : {}),
      ...(botEnabled && Object.keys(botEnabled).length > 0 ? { botEnabled } : {}),
    },
  });
}

/** 入站消息按 account 串行处理，避免框架复用 dispatcher 导致回复与 requestId 错配 */
type PendingDispatch = {
  cfg: OpenClawConfig;
  accountId: string;
  from: string;
  conversationId: string;
  text: string;
  requestId?: string;
  wsUrl: string;
  getAccessToken: () => string | null;
  getSession: () => ElephantSession | null;
  timestamp?: number;
};
const pendingQueuesByAccount = new Map<string, PendingDispatch[]>();
const processingAccounts = new Set<string>();

async function processNextInbound(accountId: string): Promise<void> {
  if (processingAccounts.has(accountId)) {
    return;
  }
  const queue = pendingQueuesByAccount.get(accountId);
  if (!queue || queue.length === 0) {
    return;
  }
  processingAccounts.add(accountId);
  const next = queue.shift()!;
  try {
    await dispatchInboundText(next);
  } catch (err) {
    getElephantRuntime()
      .logging.getChildLogger({ channel: "elephant" })
      .error?.(`[${accountId}] dispatchInboundText failed: ${String(err)}`);
  } finally {
    processingAccounts.delete(accountId);
    if (queue.length > 0) {
      void processNextInbound(accountId);
    }
  }
}

function setElephantSession(accountId: string, session: ElephantSession): void {
  sessionByAccount.set(accountId, session);
  const waiters = sessionWaitersByAccount.get(accountId);
  if (waiters && waiters.size > 0) {
    for (const resolve of waiters) {
      try {
        resolve(session);
      } catch {
        // ignore waiter errors
      }
    }
    sessionWaitersByAccount.delete(accountId);
  }
}

function getElephantSession(accountId: string): ElephantSession | null {
  return sessionByAccount.get(accountId) ?? null;
}

async function waitForElephantSession(params: {
  accountId: string;
  timeoutMs: number;
}): Promise<ElephantSession> {
  const existing = getElephantSession(params.accountId);
  if (existing) {
    return existing;
  }
  return await new Promise<ElephantSession>((resolve, reject) => {
    const timer = setTimeout(
      () => {
        // 超时后移除 waiter，避免泄漏
        const waiters = sessionWaitersByAccount.get(params.accountId);
        if (waiters) {
          waiters.delete(resolve);
          if (waiters.size === 0) {
            sessionWaitersByAccount.delete(params.accountId);
          }
        }
        reject(new Error("elephant: timed out waiting for WS session (type=1)"));
      },
      Math.max(1, params.timeoutMs),
    );

    const wrappedResolve = (session: ElephantSession) => {
      clearTimeout(timer);
      resolve(session);
    };

    const waiters =
      sessionWaitersByAccount.get(params.accountId) ??
      (() => {
        const s = new Set<(session: ElephantSession) => void>();
        sessionWaitersByAccount.set(params.accountId, s);
        return s;
      })();
    waiters.add(wrappedResolve);
  });
}

let wsManager: ElephantWsManager | null = null;
function getWsManager(): ElephantWsManager {
  if (!wsManager) {
    wsManager = new ElephantWsManager(
      getElephantRuntime().logging.getChildLogger({ channel: "elephant" }),
    );
  }
  return wsManager;
}

/** test 环境默认接入点 */
const DEFAULT_WS_URL_TEST = "wss://agent.sandbox.test.sankuai.com/ws/bot";
/** prod 环境默认接入点 */
const DEFAULT_WS_URL_PROD = "wss://me2b.sandbox.sankuai.com/ws/bot";

/** 与 openclaw.plugin.json 的 id 一致，用于从 cfg.plugins.entries 读取本插件配置 */
const PLUGIN_ID = "openclaw-elephant-plugin";

function resolveWsUrl(cfg: OpenClawConfig): string | null {
  const envOverride = process.env.ELEPHANT_WS_URL?.trim();
  if (envOverride) {
    return envOverride;
  }
  const env = resolvePluginEnv(cfg);
  // 未配置用 prod；仅显式配置为 test 时用 test
  const base = env === "test" ? DEFAULT_WS_URL_TEST : DEFAULT_WS_URL_PROD;
  return base;
}

function resolveAccount(cfg: OpenClawConfig, accountId?: string | null): ElephantAccount {
  const id = normalizeAccountId(accountId ?? DEFAULT_ACCOUNT_ID);
  return { accountId: id, wsUrl: resolveWsUrl(cfg) };
}

function defaultStatus(accountId: string) {
  return {
    accountId,
    running: false,
    connected: false,
    lastStartAt: null,
    lastStopAt: null,
    lastError: null,
    lastInboundAt: null,
    lastOutboundAt: null,
  };
}

async function dispatchInboundText(params: {
  cfg: OpenClawConfig;
  accountId: string;
  from: string;
  conversationId: string;
  text: string;
  requestId?: string;
  wsUrl: string;
  getAccessToken: () => string | null;
  getSession: () => ElephantSession | null;
  timestamp?: number;
}) {
  const {
    cfg,
    accountId,
    from,
    conversationId,
    text,
    wsUrl,
    getAccessToken,
    getSession,
    timestamp,
  } = params;

  const botEnabled = resolveBotEnabled(cfg);

  const route = getElephantRuntime().channel.routing.resolveAgentRoute({
    cfg,
    channel: "elephant",
    accountId,
    peer: { kind: "direct", id: from },
  });

  const groupSystemPrompt = await getGroupSystemPrompt({
    cfg,
    accessToken: getAccessToken(),
  });

  // 大象侧希望看到工具执行过程（exec/write/read 等）。
  // tool summary/输出通常受 verbose 影响。/verbose 会走“directive-only”路径，
  // 我们在插件侧先同 sessionKey “静默执行一次 /verbose full 并吞掉回复”，
  // 再执行真实用户消息，并在 deliver 阶段收集 tool/final，最后合并 finished=true 推送。
  const trimmedUserText = text.trim();
  const ctxPayload = getElephantRuntime().channel.reply.finalizeInboundContext({
    Body: text,
    // Prefer prompt body to stay the real user text.
    BodyForAgent: text,
    BodyForCommands: trimmedUserText,
    CommandBody: trimmedUserText,
    RawBody: trimmedUserText,
    From: `elephant:${from}`,
    To: `elephant:${conversationId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: "direct",
    ConversationLabel: from,
    SenderName: from,
    SenderId: from,
    Provider: "elephant",
    Surface: "elephant",
    Timestamp: timestamp ?? Date.now(),
    // 最小示例：默认放行所有入站文本
    CommandAuthorized: true,
    // Originating channel for reply routing.
    OriginatingChannel: "elephant" as const,
    OriginatingTo: conversationId,
    GroupSystemPrompt: groupSystemPrompt,
  });

  const stableRequestId = resolveStableRequestId({
    accountId,
    conversationId,
    hinted: params.requestId,
  });

  getElephantRuntime()
    .logging.getChildLogger({ channel: "elephant" })
    .info?.(
      `[${accountId}] dispatchInboundText requestId=${
        stableRequestId
      } textLen=${params.text.length}`,
    );

  // 大象服务端的 finished 语义：同一 requestId 只能有“最后一条” finished=true。
  // OpenClaw 的 reply pipeline 可能产生多个 kind=final（比如模型先回一个短 final，后续又补一个 final）。
  // 如果我们对每个 final 都发 finished=true，服务端往往会在第一个 finished=true 后丢弃后续内容。
  const deferredFinalTexts: string[] = [];
  // Telegram draft streaming 的核心：partial 是“累计文本”，需要做去重 + delta 提取 + 分段发送。
  let lastPartialText = "";
  let pendingPartialDelta = "";
  let lastPartialFlushAtMs = 0;
  let sentAnyPartial = false;
  let sentAnyPartialBlock = false;
  let lastToolSummaryLine: string | null = null;
  const isNoOutputToolText = (text: string): boolean => {
    const trimmed = text.trim();
    if (!trimmed) {
      return true;
    }
    if (trimmed === "(no output)") {
      return true;
    }
    // Markdown 形式：```txt\n(no output)\n```
    if (/^```txt\s*\n\(no output\)\s*\n```$/i.test(trimmed.replace(/\r\n/g, "\n"))) {
      return true;
    }
    return false;
  };

  // 串行化所有出站发送，避免 partial/tool/block 交错导致顺序不稳定。
  let sendChain: Promise<void> = Promise.resolve();
  // Elephant 会把同 requestId 的多帧 content 直接拼接显示，因此需要在“帧边界”自行补分隔符。
  // - partial: 视为连续流，不强制换行
  // - tool / 非 partial block: 需要保证与前后帧之间有换行分隔，避免全部粘连成一行
  let lastOutboundEndedWithNewline = false;
  let lastOutboundCategory: "partial" | "tool" | "block" | "final" | null = null;

  const ensureLeadingNewlineIfNeeded = (text: string, category: typeof lastOutboundCategory) => {
    if (!text) {
      return text;
    }
    // 首帧不补
    if (!lastOutboundCategory) {
      return text;
    }
    // partial 不需要强制分隔（连续流）
    if (category === "partial") {
      // 但如果上一帧是 tool，通常需要换行开始新的 assistant 文本
      if (lastOutboundCategory === "tool" && !text.startsWith("\n")) {
        return `\n${text}`;
      }
      return text;
    }
    // tool/block/final：如果上一帧没以换行结尾，补一个换行，避免粘连
    if (!lastOutboundEndedWithNewline && !text.startsWith("\n")) {
      return `\n${text}`;
    }
    return text;
  };

  const ensureTrailingNewlineIfNeeded = (text: string, category: typeof lastOutboundCategory) => {
    if (!text) {
      return text;
    }
    // partial 不强制换行（避免 mid-sentence 被切开）
    if (category === "partial") {
      return text;
    }
    return text.endsWith("\n") ? text : `${text}\n`;
  };

  const noteOutbound = (text: string, category: typeof lastOutboundCategory) => {
    lastOutboundCategory = category;
    lastOutboundEndedWithNewline = text.endsWith("\n");
  };

  const enqueueSend = (fn: () => Promise<void>) => {
    sendChain = sendChain.then(fn).catch((err) => {
      getElephantRuntime()
        .logging.getChildLogger({ channel: "elephant" })
        .warn?.(`[${accountId}] outbound send failed: ${String(err)}`);
    });
    return sendChain;
  };

  const shouldFlushPartial = (buffer: string, now: number): boolean => {
    if (!buffer) {
      return false;
    }
    if (buffer.length >= 180) {
      return true;
    }
    // 只有在“明显段落边界”时才因为换行刷出，避免出现“已\n创建”这类碎片化。
    if (buffer.includes("\n\n")) {
      return true;
    }
    if (buffer.endsWith("\n") && buffer.trim().length >= 60) {
      return true;
    }
    // 句末标点时尽快刷出，体感更像“按句子输出”
    if (/[。！？.!?]\s*$/.test(buffer) && buffer.trim().length >= 20) {
      return true;
    }
    if (now - lastPartialFlushAtMs >= 800 && buffer.length >= 40) {
      return true;
    }
    return false;
  };

  const normalizePartialChunk = (raw: string): string => {
    // 1) Normalize newlines and compress excessive blank lines
    let text = raw.replace(/\r\n/g, "\n");
    text = text.replace(/\n{3,}/g, "\n\n");
    if (!text.trim()) {
      return "";
    }

    // 2) Avoid breaking markdown/code blocks - keep formatting untouched
    if (text.includes("```")) {
      return text;
    }

    // 3) Collapse "soft" single newlines that look like line-wrapping artifacts
    // Keep newlines when they likely represent structure (lists, quotes, headings).
    const lines = text.split("\n");
    const out: string[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? "";
      if (line === "") {
        out.push("");
        continue;
      }
      // If next line exists and is a structural line, keep newline boundary.
      const next = i + 1 < lines.length ? (lines[i + 1] ?? "") : null;
      if (next !== null) {
        const nextTrim = next.trimStart();
        const isStructuralNext =
          nextTrim.startsWith("- ") ||
          nextTrim.startsWith("* ") ||
          nextTrim.startsWith(">") ||
          /^\d+\.\s/.test(nextTrim) ||
          nextTrim.startsWith("#");
        if (!isStructuralNext && next !== "") {
          // Join with heuristic: CJK-CJK joins without space; otherwise join with space.
          const a = line.at(-1) ?? "";
          const b = next.at(0) ?? "";
          const isCjk = (ch: string) => /[\u4e00-\u9fff]/.test(ch);
          const joiner = isCjk(a) && isCjk(b) ? "" : " ";
          out.push(line + joiner + nextTrim);
          i += 1;
          continue;
        }
      }
      out.push(line);
    }
    return out.join("\n");
  };

  const flushPendingPartial = async () => {
    let chunk = pendingPartialDelta;
    if (!chunk) {
      return;
    }
    pendingPartialDelta = "";
    lastPartialFlushAtMs = Date.now();
    // 首段避免以换行开头（大象侧会把多条 block 拼接显示，前导换行会造成空行/错位）
    if (!sentAnyPartialBlock) {
      chunk = chunk.replace(/^\s*\n+/, "");
    }
    let text = normalizePartialChunk(chunk);
    if (!text.trim()) {
      return;
    }
    text = ensureLeadingNewlineIfNeeded(text, "partial");
    // partial 不追加尾部换行
    noteOutbound(text, "partial");
    await enqueueSend(() =>
      sendToElephantServer({
        accountId,
        wsUrl,
        getAccessToken,
        getSession,
        conversationId,
        text,
        kind: "block",
        requestIdHint: stableRequestId,
        messageId: randomUUID(),
        botEnabled,
      }),
    );
    sentAnyPartialBlock = true;
  };
  const shouldForceVerboseForTools = trimmedUserText.length > 0 && !trimmedUserText.startsWith("/");

  const { dispatcher, replyOptions, markDispatchIdle } =
    getElephantRuntime().channel.reply.createReplyDispatcherWithTyping({
      deliver: async (
        payload: { text?: string | null | undefined },
        info: { kind: "tool" | "block" | "final" },
      ) => {
        if (!payload.text) {
          return;
        }
        if (info.kind === "final") {
          // partial-only：一旦我们开始用 partial 输出，就不再发送 block/final 文本，避免重复。
          if (sentAnyPartial) {
            return;
          }
          // final 只在 idle 时发送 finished=true（同 requestId 只能有一次 finished=true）。
          deferredFinalTexts.push(payload.text);
          getElephantRuntime()
            .logging.getChildLogger({ channel: "elephant" })
            .info?.(
              `[${accountId}] deliver (defer final) requestId=${stableRequestId} len=${payload.text.length} finalsQueued=${deferredFinalTexts.length}`,
            );
          return;
        }

        if (info.kind === "block" && sentAnyPartial) {
          // partial-only：避免 block 与 partial 重复
          return;
        }

        // tool/block 实时推送（finished=false），提升体感；严格复用同一个 requestId。
        // 若 partial 有尚未刷出的增量，先刷出以保证顺序。
        await flushPendingPartial();
        // 注：verbose=full 时，核心会对同一次 tool 发送两条 tool 消息：
        // 1) summary（单行：🛠️ Exec: ...）
        // 2) output（多行：同样的 summary + 输出内容/“(no output)”）
        // 为了避免大象侧看到重复 summary，我们在插件侧把第 2 条剥掉 header，仅保留输出。
        let outboundText = payload.text;
        if (info.kind === "tool") {
          const normalized = payload.text.replace(/\r\n/g, "\n").trimEnd();
          const lines = normalized.split("\n");
          const firstLine = (lines[0] ?? "").trimEnd();
          if (lines.length <= 1) {
            lastToolSummaryLine = firstLine || null;
            outboundText = normalized;
          } else if (firstLine && lastToolSummaryLine && firstLine === lastToolSummaryLine) {
            // output 帧：去掉重复 header，仅发送输出；无输出则直接跳过
            lastToolSummaryLine = null;
            const rest = lines.slice(1).join("\n").trim();
            if (isNoOutputToolText(rest)) {
              return;
            }
            outboundText = rest.includes("\n") ? `↳\n${rest}` : `↳ ${rest}`;
          } else {
            // 兜底：未知格式，保持原样
            outboundText = normalized;
          }
        }

        outboundText = ensureLeadingNewlineIfNeeded(outboundText, info.kind);
        outboundText = ensureTrailingNewlineIfNeeded(outboundText, info.kind);
        noteOutbound(outboundText, info.kind);
        await enqueueSend(() =>
          sendToElephantServer({
            accountId,
            wsUrl,
            getAccessToken,
            getSession,
            conversationId,
            text: outboundText,
            kind: info.kind,
            requestIdHint: stableRequestId,
            messageId: randomUUID(),
            botEnabled,
          }),
        );
      },
      onError: (err: unknown, info: { kind: string }) => {
        getElephantRuntime()
          .logging.getChildLogger({ channel: "elephant" })
          .error?.(`elephant ${info.kind} reply failed: ${String(err)}`);
      },
      onIdle: () => {},
    });

  try {
    if (shouldForceVerboseForTools) {
      // 在同一 sessionKey 下静默执行一次 `/verbose full`，让后续本轮消息产出 tool summary/输出。
      // 注意：此指令会走 directive-only 路径，但我们吞掉回复，避免影响用户看到的正常对话。
      const verboseCtx = getElephantRuntime().channel.reply.finalizeInboundContext({
        Body: "/verbose full",
        BodyForAgent: "/verbose full",
        BodyForCommands: "/verbose full",
        CommandBody: "/verbose full",
        RawBody: "/verbose full",
        From: `elephant:${from}`,
        To: `elephant:${conversationId}`,
        SessionKey: route.sessionKey,
        AccountId: route.accountId,
        ChatType: "direct",
        ConversationLabel: from,
        SenderName: from,
        SenderId: from,
        Provider: "elephant",
        Surface: "elephant",
        Timestamp: timestamp ?? Date.now(),
        CommandAuthorized: true,
        OriginatingChannel: "elephant" as const,
        OriginatingTo: conversationId,
        GroupSystemPrompt: groupSystemPrompt,
      });

      const {
        dispatcher: vDispatcher,
        replyOptions: vReplyOptions,
        markDispatchIdle: vIdle,
      } = getElephantRuntime().channel.reply.createReplyDispatcherWithTyping({
        deliver: async () => {},
        onError: () => {},
        onIdle: () => {},
      });

      try {
        await getElephantRuntime().channel.reply.dispatchReplyFromConfig({
          ctx: verboseCtx,
          cfg,
          dispatcher: vDispatcher,
          replyOptions: { ...vReplyOptions },
        });
      } finally {
        vIdle();
        await vDispatcher.waitForIdle();
      }
    }

    await getElephantRuntime().channel.reply.dispatchReplyFromConfig({
      ctx: ctxPayload,
      cfg,
      dispatcher,
      replyOptions: {
        ...replyOptions,
        // 使用 Telegram draft streaming 的思路：partial 可能重复、且文本是累计的。
        // 我们提取 delta 并做简单 chunking，实时推送给 Elephant（同 requestId，finished=false）。
        // 只要出现 partial，就进入 partial-only 模式：不再发送 block/final 文本，避免重复。
        onPartialReply: async (payload: { text?: string | null | undefined }) => {
          const full = payload.text?.replace(/\r\n/g, "\n");
          if (!full) {
            return;
          }
          if (full === lastPartialText) {
            return;
          }
          let delta = full;
          if (lastPartialText && full.startsWith(lastPartialText)) {
            delta = full.slice(lastPartialText.length);
          } else {
            // 流被重置/非单调：清空增量缓冲，重新开始累积
            pendingPartialDelta = "";
          }
          lastPartialText = full;
          if (!delta) {
            return;
          }
          sentAnyPartial = true;
          pendingPartialDelta += delta;
          const now = Date.now();
          if (shouldFlushPartial(pendingPartialDelta, now)) {
            await flushPendingPartial();
          }
        },
      },
    });

    // flush：同一 requestId 只发一次 finished=true（最后一条）
    // - partial-only：发送一个“空内容”的 final 帧用于 finished=true（避免再发完整 final 文本造成重复）
    // - 非 partial-only：按原逻辑发送 final 文本
    if (sentAnyPartial) {
      await flushPendingPartial();
      await enqueueSend(() =>
        sendToElephantServer({
          accountId,
          wsUrl,
          getAccessToken,
          getSession,
          conversationId,
          text: "",
          kind: "final",
          requestIdHint: stableRequestId,
          messageId: randomUUID(),
          botEnabled,
        }),
      );
    } else if (deferredFinalTexts.length > 0) {
      getElephantRuntime()
        .logging.getChildLogger({ channel: "elephant" })
        .info?.(
          `[${accountId}] flush finals requestId=${stableRequestId} finals=${deferredFinalTexts.length}`,
        );

      const finals = deferredFinalTexts
        .map((t) => t.replace(/\r\n/g, "\n").trim())
        .filter(Boolean)
        .filter(Boolean);
      if (finals.length === 1) {
        const finalText = ensureTrailingNewlineIfNeeded(
          ensureLeadingNewlineIfNeeded(finals[0]!, "final"),
          "final",
        );
        noteOutbound(finalText, "final");
        await enqueueSend(() =>
          sendToElephantServer({
            accountId,
            wsUrl,
            getAccessToken,
            getSession,
            conversationId,
            text: finalText,
            kind: "final",
            requestIdHint: stableRequestId,
            messageId: randomUUID(),
            botEnabled,
          }),
        );
      } else if (finals.length > 1) {
        for (const chunk of finals.slice(0, -1)) {
          const blockText = ensureTrailingNewlineIfNeeded(
            ensureLeadingNewlineIfNeeded(chunk, "block"),
            "block",
          );
          noteOutbound(blockText, "block");
          await enqueueSend(() =>
            sendToElephantServer({
              accountId,
              wsUrl,
              getAccessToken,
              getSession,
              conversationId,
              text: blockText,
              kind: "block",
              requestIdHint: stableRequestId,
              messageId: randomUUID(),
              botEnabled,
            }),
          );
        }
        const finalLast = finals.at(-1)!;
        const finalText = ensureTrailingNewlineIfNeeded(
          ensureLeadingNewlineIfNeeded(finalLast, "final"),
          "final",
        );
        noteOutbound(finalText, "final");
        await enqueueSend(() =>
          sendToElephantServer({
            accountId,
            wsUrl,
            getAccessToken,
            getSession,
            conversationId,
            text: finalText,
            kind: "final",
            requestIdHint: stableRequestId,
            messageId: randomUUID(),
            botEnabled,
          }),
        );
      }
    }
  } finally {
    markDispatchIdle();
    await dispatcher.waitForIdle();
    await sendChain;
  }
}

function normalizeInbound(raw: ElephantWsInbound): {
  from: string;
  conversationId: string;
  text: string;
  timestamp?: number;
  requestId?: string;
} | null {
  if (raw.type === "connection_result") {
    return null;
  }
  if (raw.type === "user_message") {
    const content = raw.content.trim();
    if (!content) {
      return null;
    }
    const from = raw.clientId ?? "unknown";
    return {
      from,
      conversationId: from,
      text: content,
      timestamp: Date.now(),
      requestId: raw.requestId?.trim() || undefined,
    };
  }
  if (raw.type === "raw") {
    return {
      from: "unknown",
      conversationId: "unknown",
      text: raw.text,
      timestamp: Date.now(),
    };
  }
  const from = raw.from.trim();
  const text = raw.text.trim();
  if (!from || !text) {
    return null;
  }
  const conversationId = (raw.conversationId ?? raw.to ?? from).trim() || from;
  return { from, conversationId, text, timestamp: raw.timestamp };
}

export const elephantPlugin: ChannelPlugin<ElephantAccount> = {
  id: "elephant",
  meta: {
    id: "elephant",
    label: "大象通信",
    selectionLabel: "大象通信 (WebSocket)",
    docsPath: "/channels/elephant",
    blurb: "通过 WebSocket 收发消息",
    aliases: ["elephant"],
  },
  capabilities: {
    chatTypes: ["direct"],
    nativeCommands: false,
    media: false,
    blockStreaming: true,
  },
  reload: { configPrefixes: [] },
  // Control UI / channel-config surfaces expect a schema object.
  // This minimal example is env-driven, so we expose an empty object schema.
  configSchema: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        botEnabled: {
          type: "object",
          additionalProperties: { type: "boolean" },
          description: '按 bot 名称控制是否启用，例如 {"1024claw": false, "levi": true}',
        },
      },
    },
  },
  config: {
    listAccountIds: () => [DEFAULT_ACCOUNT_ID],
    resolveAccount,
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    isConfigured: () => true,
    unconfiguredReason: () => "",
    describeAccount: (account) => ({
      accountId: account.accountId,
      configured: Boolean(account.wsUrl),
      enabled: true,
      connected: false,
      baseUrl: account.wsUrl ?? undefined,
    }),
  },
  outbound: {
    deliveryMode: "direct",
    chunker: null,
    textChunkLimit: 8000,
    sendText: async ({ to, text, accountId }) => {
      const account = resolveAccount(getElephantRuntime().config.loadConfig(), accountId);
      if (!account.wsUrl) {
        throw new Error("elephant: missing ELEPHANT_WS_URL");
      }
      // 定时任务/启动早期可能还没拿到 type=1 的 session，这里等待一小段时间（像 discord 一样可“主动发”）
      // 备注：session 由 gateway.startAccount 的 WS run 循环收到 connection_result(type=1) 后写入。
      const getAccessToken = (): string | null =>
        getElephantSsoToken()?.token?.access_token != null
          ? String(getElephantSsoToken()!.token.access_token).trim()
          : null;
      // sendText 也允许等待 SSO/WS ready（避免 cron 触发早于建连）
      if (!getAccessToken()) {
        const sso = await waitForElephantSsoToken({ timeoutMs: 30_000 });
        if (!sso?.token?.access_token) {
          throw new Error("elephant: SSO login not ready (no access_token)");
        }
      }
      if (!getElephantSession(account.accountId)) {
        // 如果 gateway 已经在跑，这里通常会很快拿到 session；否则会超时并给出明确错误
        await waitForElephantSession({ accountId: account.accountId, timeoutMs: 15_000 });
      }
      const messageId = randomUUID();
      // sendText 没有服务端下发的 requestId：必须复用历史或生成兜底，否则服务端可能丢弃/串线
      const stableRequestId = resolveStableRequestId({
        accountId: account.accountId,
        conversationId: to,
      });
      getElephantRuntime()
        .logging.getChildLogger({ channel: "elephant" })
        .info?.(
          `[${account.accountId}] sendText -> send requestId=${stableRequestId} conversation=${to} len=${text.length}`,
        );
      const sendCfg = getElephantRuntime().config.loadConfig();
      const botEnabled = resolveBotEnabled(sendCfg);
      await sendToElephantServer({
        accountId: account.accountId,
        wsUrl: account.wsUrl,
        getAccessToken,
        getSession: () => getElephantSession(account.accountId),
        conversationId: to,
        text,
        kind: "final",
        requestIdHint: stableRequestId,
        messageId,
        botPush: true,
        botEnabled,
        requireSession: true,
      });
      return {
        channel: "elephant",
        messageId,
        conversationId: to,
        timestamp: Date.now(),
      };
    },
    sendMedia: async () => {
      throw new Error("elephant: media is not supported in this minimal example");
    },
  },
  status: {
    // 给 status 页面一个“字段齐全”的默认快照，否则 connected/lastInbound 之类会显示 n/a。
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      connected: false,
      lastInboundAt: null,
      lastOutboundAt: null,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    buildAccountSnapshot: ({ account, runtime }) => {
      const baseUrl = account.wsUrl ?? undefined;
      return {
        accountId: account.accountId,
        enabled: true,
        configured: Boolean(account.wsUrl),
        baseUrl,
        running: runtime?.running ?? false,
        connected: runtime?.connected ?? false,
        lastInboundAt: runtime?.lastInboundAt ?? null,
        lastOutboundAt: runtime?.lastOutboundAt ?? null,
        lastStartAt: runtime?.lastStartAt ?? null,
        lastStopAt: runtime?.lastStopAt ?? null,
        lastError: runtime?.lastError ?? null,
        lastConnectedAt: runtime?.lastConnectedAt ?? null,
        lastDisconnect: runtime?.lastDisconnect ?? null,
      };
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const baseUrl = ctx.account.wsUrl;
      if (!baseUrl) {
        ctx.setStatus({
          ...defaultStatus(ctx.accountId),
          running: false,
          connected: false,
          lastError: "missing ELEPHANT_WS_URL",
        });
        return;
      }

      // WS 建立连接的前提是 SSO 登录成功；建连请求带 Authorization: Bearer <ssoid>
      const sso = await waitForElephantSsoToken({ timeoutMs: 60_000 });
      if (!sso?.token?.access_token) {
        ctx.setStatus({
          ...defaultStatus(ctx.accountId),
          running: false,
          connected: false,
          lastError: "elephant: SSO login not ready or no access_token (complete SSO first)",
        });
        return;
      }

      const getAccessToken = (): string | null =>
        getElephantSsoToken()?.token?.access_token != null
          ? String(getElephantSsoToken()!.token.access_token).trim()
          : null;

      ctx.setStatus({
        ...defaultStatus(ctx.accountId),
        running: true,
        connected: false,
        lastStartAt: Date.now(),
        baseUrl,
        lastError: null,
      });

      await getWsManager().run({
        accountId: ctx.accountId,
        url: baseUrl,
        getAccessToken,
        abortSignal: ctx.abortSignal,
        onConnected: () => {
          ctx.setStatus({
            ...ctx.getStatus(),
            connected: true,
            lastConnectedAt: Date.now(),
            lastError: null,
          });
        },
        onDisconnected: (info: { code: number; reason: string }) => {
          const { code, reason } = info;
          ctx.setStatus({
            ...ctx.getStatus(),
            connected: false,
            lastDisconnect: {
              at: Date.now(),
              status: code,
              error: reason || undefined,
            },
          });
        },
        onMessage: async (msg: ElephantWsInbound) => {
          // type=1 建连结果：存 sessionId/clientId/token，后续发信必带
          if (msg.type === "connection_result") {
            const clientId = msg.clientId ?? "openclaw";
            setElephantSession(ctx.accountId, {
              sessionId: msg.sessionId,
              clientId,
              token: msg.token,
            });
            getElephantRuntime()
              .logging.getChildLogger({ channel: "elephant" })
              .info?.(
                `[${ctx.accountId}] connection_result sessionId=${msg.sessionId} clientId=${clientId}`,
              );
            return;
          }
          getElephantRuntime()
            .logging.getChildLogger({ channel: "elephant" })
            .info?.(
              `[${ctx.accountId}] inbound msg type=${msg.type} ${
                msg.type === "user_message"
                  ? `clientId=${msg.clientId ?? "MISSING"} requestId=${
                      msg.requestId ?? "MISSING"
                    } contentLen=${msg.content.length}`
                  : msg.type === "raw"
                    ? `len=${msg.text.length}`
                    : `from=${msg.from} len=${msg.text.length}`
              }`,
            );
          const parsed = normalizeInbound(msg);
          if (!parsed) {
            getElephantRuntime()
              .logging.getChildLogger({ channel: "elephant" })
              .warn?.(`[${ctx.accountId}] normalizeInbound returned null (dropped)`);
            return;
          }
          // 统一入口：入站有 requestId 则更新；否则生成兜底，保证后续流式回传有稳定 requestId
          resolveStableRequestId({
            accountId: ctx.accountId,
            conversationId: parsed.conversationId,
            hinted: parsed.requestId,
          });
          getElephantRuntime()
            .logging.getChildLogger({ channel: "elephant" })
            .info?.(
              `[${ctx.accountId}] normalize user_message requestId=${
                resolveStableRequestId({
                  accountId: ctx.accountId,
                  conversationId: parsed.conversationId,
                  hinted: parsed.requestId,
                }) ?? "MISSING"
              } textLen=${parsed.text.length}`,
            );
          ctx.setStatus({
            ...ctx.getStatus(),
            connected: true,
            lastInboundAt: Date.now(),
          });
          const queue =
            pendingQueuesByAccount.get(ctx.accountId) ??
            (() => {
              const q: PendingDispatch[] = [];
              pendingQueuesByAccount.set(ctx.accountId, q);
              return q;
            })();
          queue.push({
            cfg: ctx.cfg,
            accountId: ctx.accountId,
            from: parsed.from,
            conversationId: parsed.conversationId,
            text: parsed.text,
            requestId: parsed.requestId,
            wsUrl: baseUrl,
            getAccessToken,
            getSession: () => getElephantSession(ctx.accountId),
            timestamp: parsed.timestamp,
          });
          void processNextInbound(ctx.accountId);
        },
      });
    },
    stopAccount: async (ctx) => {
      getWsManager().close(ctx.accountId);
      sessionByAccount.delete(ctx.accountId);
      pendingQueuesByAccount.delete(ctx.accountId);
      ctx.setStatus({
        ...ctx.getStatus(),
        connected: false,
        lastStopAt: Date.now(),
      });
    },
  },
};
