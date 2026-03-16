import WebSocket from "ws";

export type ElephantWsInbound =
  | {
      /** 兼容旧格式：type=message */
      type: "message";
      from: string;
      to?: string;
      text: string;
      conversationId?: string;
      messageId?: string;
      timestamp?: number;
    }
  | {
      /** 建连结果 type=1：token、sessionId，用于 MCP 与后续发信 */
      type: "connection_result";
      token?: string;
      sessionId: string;
      channel?: string;
      clientId?: string;
      content?: string;
    }
  | {
      /** 正常用户消息 type=2 */
      type: "user_message";
      channel?: string;
      clientId?: string;
      /** 服务端下发的对话 requestId（用于流式回传时复用） */
      requestId?: string;
      content: string;
    }
  | {
      type: "raw";
      text: string;
    };

/** 客户端消息格式 2.2.1：sessionId 建连后服务端返回，每次对话需带上 */
export type ElephantWsOutbound = {
  sessionId: string;
  channel: string;
  clientId: string;
  content: string;
  finished: boolean;
  id?: string;
  requestId?: string;
  /** bot 主动推送消息时需置 true（服务端据此走 push 链路） */
  botPush?: boolean;
  /** 按 bot 名称的启用开关，会传给服务端 */
  botEnabled?: Record<string, boolean>;
};

export type ElephantWsLogger = {
  debug?: (message: string) => void;
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
};

type ConnectionState = {
  ws: WebSocket;
  open: Promise<void>;
};

const RECONNECT_DELAY_MS = 2000;

export class ElephantWsManager {
  private readonly connections = new Map<string, ConnectionState>();

  constructor(private readonly logger: ElephantWsLogger) {}

  hasConnection(accountId: string): boolean {
    return this.connections.has(accountId);
  }

  private shouldLogSends(): boolean {
    // 默认不打印消息内容，避免污染日志/泄露敏感信息。
    // 需要时在启动 gateway 的终端里设置：ELEPHANT_DEBUG_SEND=1
    const raw = process.env.ELEPHANT_DEBUG_SEND?.trim();
    return raw === "1" || raw?.toLowerCase() === "true";
  }

  private shouldLogInbound(): boolean {
    // 需要时在启动 gateway 的终端里设置：ELEPHANT_DEBUG_INBOUND=1
    const raw = process.env.ELEPHANT_DEBUG_INBOUND?.trim();
    return raw === "1" || raw?.toLowerCase() === "true";
  }

  private formatSendPreview(text: string, max = 200): string {
    const compact = text.replace(/\s+/g, " ").trim();
    if (compact.length <= max) {
      return compact;
    }
    return `${compact.slice(0, max)}…(+${compact.length - max})`;
  }

  private formatInboundPreview(text: string, max = 350): string {
    // inbound 更适合保留换行信息，但日志里避免太长
    const trimmed = text.trim();
    if (trimmed.length <= max) {
      return trimmed;
    }
    return `${trimmed.slice(0, max)}…(+${trimmed.length - max})`;
  }

  private resolvePingConfig(): { intervalMs: number; pongTimeoutMs: number } {
    const intervalRaw = process.env.ELEPHANT_WS_PING_INTERVAL_MS?.trim();
    const timeoutRaw = process.env.ELEPHANT_WS_PONG_TIMEOUT_MS?.trim();
    const intervalMs = intervalRaw ? Number.parseInt(intervalRaw, 10) : 15_000;
    const pongTimeoutMs = timeoutRaw ? Number.parseInt(timeoutRaw, 10) : 30_000;
    return {
      intervalMs: Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : 15_000,
      pongTimeoutMs: Number.isFinite(pongTimeoutMs) && pongTimeoutMs > 0 ? pongTimeoutMs : 30_000,
    };
  }

  async run(params: {
    accountId: string;
    url: string;
    getAccessToken: () => string | null;
    abortSignal: AbortSignal;
    onMessage: (msg: ElephantWsInbound) => Promise<void> | void;
    onConnected?: () => void;
    onDisconnected?: (info: { code: number; reason: string }) => void;
  }): Promise<void> {
    const { accountId, url, getAccessToken, abortSignal, onMessage, onConnected, onDisconnected } =
      params;

    const onAbort = (): void => {
      const conn = this.connections.get(accountId);
      if (conn) {
        try {
          conn.ws.close(1000, "abort");
        } catch {
          // ignore
        }
      }
    };
    abortSignal.addEventListener("abort", onAbort, { once: true });

    while (!abortSignal.aborted) {
      const token = getAccessToken();
      if (!token?.trim()) {
        this.logger.warn?.(`[${accountId}] no access token, stopping run loop`);
        break;
      }

      this.logger.info?.(`[${accountId}] connecting ${url}`);
      const ws = new WebSocket(url, {
        headers: { Authorization: `Bearer ${token.trim()}`, version: "v2" },
      });
      const open = new Promise<void>((resolve, reject) => {
        ws.once("open", () => resolve());
        ws.once("error", (err) => reject(err));
      });

      this.connections.set(accountId, { ws, open });

      // Keepalive via WebSocket ping/pong to avoid idle timeouts (common cause of 1006).
      const { intervalMs: pingIntervalMs, pongTimeoutMs } = this.resolvePingConfig();
      let pingTimer: ReturnType<typeof setInterval> | null = null;
      let lastPongAt = Date.now();
      ws.on("pong", () => {
        lastPongAt = Date.now();
      });

      ws.on("message", (data) => {
        const raw =
          typeof data === "string"
            ? data
            : Buffer.isBuffer(data)
              ? data.toString("utf8")
              : Array.isArray(data)
                ? Buffer.concat(data).toString("utf8")
                : data instanceof ArrayBuffer
                  ? Buffer.from(data).toString("utf8")
                  : Buffer.from(data as Uint8Array).toString("utf8");
        if (this.shouldLogInbound()) {
          this.logger.info?.(
            `[${accountId}] inbound frame len=${
              raw.length
            } preview="${this.formatInboundPreview(raw)}"`,
          );
        }
        void this.handleRawInbound(raw, onMessage, accountId).catch((err) => {
          this.logger.error?.(`[${accountId}] inbound handler failed: ${String(err)}`);
        });
      });

      ws.on("error", (err) => {
        this.logger.warn?.(`[${accountId}] ws error: ${String(err)}`);
      });

      const closed = new Promise<void>((resolve) => {
        ws.once("close", (code, reason) => {
          this.connections.delete(accountId);
          if (pingTimer) {
            clearInterval(pingTimer);
          }
          pingTimer = null;
          onDisconnected?.({
            code,
            reason: reason?.toString() ?? "",
          });
          this.logger.info?.(
            `[${accountId}] disconnected code=${code} reason=${reason?.toString() ?? ""}`,
          );
          resolve();
        });
      });

      await open
        .then(() => {
          this.logger.info?.(`[${accountId}] connected ${url}`);
          lastPongAt = Date.now();
          if (pingTimer) {
            clearInterval(pingTimer);
          }
          pingTimer = setInterval(() => {
            try {
              // If server/proxy drops pongs, forcibly reconnect.
              if (Date.now() - lastPongAt > pongTimeoutMs) {
                this.logger.warn?.(
                  `[${accountId}] pong timeout (> ${pongTimeoutMs}ms), terminating socket`,
                );
                ws.terminate();
                return;
              }
              ws.ping();
            } catch (err) {
              this.logger.warn?.(`[${accountId}] ping failed: ${String(err)}`);
            }
          }, pingIntervalMs);
          onConnected?.();
        })
        .catch((err) => {
          this.connections.delete(accountId);
          if (pingTimer) {
            clearInterval(pingTimer);
          }
          pingTimer = null;
          this.logger.warn?.(
            `[${accountId}] connect failed (check X-WebSocket-Reject-* if server returned): ${String(
              err,
            )}`,
          );
        });

      await closed;
      if (abortSignal.aborted) {
        break;
      }
      this.logger.info?.(`[${accountId}] reconnecting in ${RECONNECT_DELAY_MS}ms`);
      await new Promise<void>((r) => setTimeout(r, RECONNECT_DELAY_MS));
    }

    abortSignal.removeEventListener("abort", onAbort);
    this.connections.delete(accountId);
  }

  async send(params: {
    accountId: string;
    url: string;
    getAccessToken: () => string | null;
    msg: ElephantWsOutbound;
  }): Promise<void> {
    const { accountId, url, getAccessToken, msg } = params;
    const conn = await this.ensureConnected({ accountId, url, getAccessToken });
    const payload = JSON.stringify(msg);
    if (this.shouldLogSends()) {
      this.logger.info?.(
        `[${accountId}] send -> ${url} sessionId=${msg.sessionId} channel=${
          msg.channel
        } clientId=${msg.clientId} requestid=${msg.requestId ?? ""} finished=${
          msg.finished
        } len=${msg.content.length} preview="${this.formatSendPreview(msg.content)}"`,
      );
    }
    await new Promise<void>((resolve, reject) => {
      conn.ws.send(payload, (err) => {
        if (err) {
          this.logger.warn?.(`[${accountId}] send failed: ${String(err)}`);
          reject(err);
          return;
        }
        if (this.shouldLogSends()) {
          this.logger.info?.(`[${accountId}] send ok requestid=${msg.requestId ?? ""}`);
        }
        resolve();
      });
    });
  }

  close(accountId: string) {
    const conn = this.connections.get(accountId);
    if (!conn) {
      return;
    }
    try {
      conn.ws.close(1000, "close");
    } catch {
      // ignore
    }
    this.connections.delete(accountId);
  }

  private async ensureConnected(params: {
    accountId: string;
    url: string;
    getAccessToken: () => string | null;
  }): Promise<ConnectionState> {
    const { accountId, url, getAccessToken } = params;
    const existing = this.connections.get(accountId);
    if (existing) {
      await existing.open;
      return existing;
    }

    const token = getAccessToken();
    if (!token?.trim()) {
      throw new Error("elephant: no access token for WS send (complete SSO first)");
    }

    this.logger.info?.(`[${accountId}] connecting (lazy) ${url}`);
    const ws = new WebSocket(url, {
      headers: { Authorization: `Bearer ${token.trim()}`, version: "v2" },
    });
    const open = new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", (err) => reject(err));
    });
    this.connections.set(accountId, { ws, open });
    ws.on("error", (err) => {
      this.logger.warn?.(`[${accountId}] ws error (lazy): ${String(err)}`);
    });
    await open.then(() => {
      this.logger.info?.(`[${accountId}] connected (lazy) ${url}`);
    });
    ws.once("close", () => {
      this.connections.delete(accountId);
      this.logger.info?.(`[${accountId}] disconnected (lazy)`);
    });
    return { ws, open };
  }

  private async handleRawInbound(
    raw: string,
    onMessage: (msg: ElephantWsInbound) => Promise<void> | void,
    accountId?: string,
  ) {
    const trimmed = raw.trim();
    if (!trimmed) {
      return;
    }

    const extractTextLike = (v: unknown): string | undefined => {
      if (typeof v === "string") {
        const s = v.trimEnd();
        return s ? s : undefined;
      }
      if (Array.isArray(v)) {
        // 支持 ["a","b"] 或 [{text:"a"},{content:"b"}]
        const parts: string[] = [];
        for (const item of v) {
          if (typeof item === "string") {
            const s = item.trimEnd();
            if (s) {
              parts.push(s);
            }
            continue;
          }
          if (item && typeof item === "object" && !Array.isArray(item)) {
            const obj = item as Record<string, unknown>;
            const t =
              extractTextLike(obj.text) ??
              extractTextLike(obj.content) ??
              extractTextLike(obj.message);
            if (t) {
              parts.push(t);
            }
          }
        }
        const joined = parts.join("\n").trimEnd();
        return joined ? joined : undefined;
      }
      if (v && typeof v === "object") {
        const obj = v as Record<string, unknown>;
        return (
          extractTextLike(obj.text) ?? extractTextLike(obj.content) ?? extractTextLike(obj.message)
        );
      }
      return undefined;
    };

    // JSON message: { type: "message", ... } or type=1 MCP token
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        const typeValue = parsed.type;
        const typeStr = typeof typeValue === "string" ? typeValue : null;
        const typeNum = typeof typeValue === "number" ? typeValue : null;
        const normalizedType =
          typeNum != null ? String(typeNum) : typeStr != null ? typeStr.trim().toLowerCase() : "";

        if (
          parsed.type === "message" &&
          typeof parsed.text === "string" &&
          typeof parsed.from === "string"
        ) {
          await onMessage({
            type: "message",
            from: parsed.from,
            to: typeof parsed.to === "string" ? parsed.to : undefined,
            text: parsed.text,
            conversationId:
              typeof parsed.conversationId === "string" ? parsed.conversationId : undefined,
            messageId: typeof parsed.messageId === "string" ? parsed.messageId : undefined,
            timestamp: typeof parsed.timestamp === "number" ? parsed.timestamp : undefined,
          });
          return;
        }

        const extractString = (v: unknown): string | undefined => {
          if (typeof v !== "string") {
            return undefined;
          }
          const s = v.trim();
          return s ? s : undefined;
        };
        const extractStringFrom = (obj: Record<string, unknown>, key: string) =>
          extractString(obj[key]);

        // 建连结果：type=1 或 "1" 或 "connection_result"
        if (
          normalizedType === "1" ||
          normalizedType === "connection_result" ||
          normalizedType === "connectionresult"
        ) {
          const data =
            parsed.data && typeof parsed.data === "object" && !Array.isArray(parsed.data)
              ? (parsed.data as Record<string, unknown>)
              : null;
          const sessionId =
            extractStringFrom(parsed, "sessionId") ??
            extractStringFrom(parsed, "session_id") ??
            (data
              ? (extractStringFrom(data, "sessionId") ?? extractStringFrom(data, "session_id"))
              : undefined);
          if (!sessionId) {
            this.logger.warn?.(
              `ws inbound: connection_result missing sessionId (keys=${Object.keys(parsed).join(
                ",",
              )})`,
            );
            return;
          }

          const token =
            extractStringFrom(parsed, "token") ??
            (data ? extractStringFrom(data, "token") : undefined);

          if (!token) {
            // sandbox 环境可能不下发 token；sessionId/clientId 足以用于后续发信。
            this.logger.info?.(
              `ws inbound: connection_result received without token (sessionId=${sessionId})`,
            );
          }
          await onMessage({
            type: "connection_result",
            sessionId,
            ...(token ? { token } : {}),
            channel:
              extractStringFrom(parsed, "channel") ??
              (data ? extractStringFrom(data, "channel") : undefined),
            clientId:
              extractStringFrom(parsed, "clientId") ??
              extractStringFrom(parsed, "client_id") ??
              (data
                ? (extractStringFrom(data, "clientId") ?? extractStringFrom(data, "client_id"))
                : undefined),
            content:
              extractStringFrom(parsed, "content") ??
              (data ? extractStringFrom(data, "content") : undefined),
          });
          return;
        }

        // 正常用户消息：type=2 或 "2" 或 "user_message"
        if (
          normalizedType === "2" ||
          normalizedType === "user_message" ||
          normalizedType === "usermessage"
        ) {
          const data =
            parsed.data && typeof parsed.data === "object" && !Array.isArray(parsed.data)
              ? (parsed.data as Record<string, unknown>)
              : null;
          const content =
            extractTextLike(parsed.content) ??
            (data ? extractTextLike(data.content) : undefined) ??
            extractTextLike(parsed.text) ??
            (data ? extractTextLike(data.text) : undefined) ??
            (data ? extractTextLike(data.messages) : undefined);
          if (!content) {
            if (this.shouldLogInbound()) {
              const logPrefix = accountId ? `[${accountId}]` : "[ws]";
              this.logger.warn?.(
                `${logPrefix} inbound user_message dropped: missing content (keys=${Object.keys(
                  parsed,
                ).join(",")})`,
              );
            }
            return;
          }
          // 链路日志：看服务端是否下发了 requestId（及从哪个字段解析到）
          const reqIdTop =
            extractStringFrom(parsed, "requestId") ??
            extractStringFrom(parsed, "request_id") ??
            extractStringFrom(parsed, "reqId") ??
            extractStringFrom(parsed, "id");
          const reqIdData = data
            ? (extractStringFrom(data, "requestId") ??
              extractStringFrom(data, "request_id") ??
              extractStringFrom(data, "reqId") ??
              extractStringFrom(data, "id"))
            : undefined;
          const requestId = reqIdTop ?? reqIdData;
          const logPrefix = accountId ? `[${accountId}]` : "[ws]";
          this.logger.info?.(
            `${logPrefix} inbound user_message requestId=${requestId ?? "MISSING"} contentLen=${
              content.length
            } (parsed.requestId/request_id/reqId/id=${
              reqIdTop ?? "—"
            } data.requestId/...=${reqIdData ?? "—"})`,
          );
          if (this.shouldLogInbound()) {
            this.logger.info?.(
              `${logPrefix} inbound user_message contentPreview="${this.formatInboundPreview(
                content,
              )}"`,
            );
          }
          await onMessage({
            type: "user_message",
            channel:
              extractStringFrom(parsed, "channel") ??
              (data ? extractStringFrom(data, "channel") : undefined),
            clientId:
              extractStringFrom(parsed, "clientId") ??
              extractStringFrom(parsed, "client_id") ??
              (data
                ? (extractStringFrom(data, "clientId") ?? extractStringFrom(data, "client_id"))
                : undefined),
            ...(requestId ? { requestId } : {}),
            content,
          });
          return;
        }
      } catch {
        if (this.shouldLogInbound()) {
          const logPrefix = accountId ? `[${accountId}]` : "[ws]";
          this.logger.warn?.(
            `${logPrefix} inbound json parse failed, treating as raw len=${trimmed.length}`,
          );
        }
        // fallthrough to raw
      }
    }

    // Raw string frame => treat as inbound message.
    if (this.shouldLogInbound()) {
      const logPrefix = accountId ? `[${accountId}]` : "[ws]";
      this.logger.info?.(
        `${logPrefix} inbound raw frame len=${
          raw.length
        } preview="${this.formatInboundPreview(raw)}"`,
      );
    }
    await onMessage({ type: "raw", text: raw });
  }
}
