const WebSocket = require('ws');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

/**
 * OpenClawClient — connects to OpenClaw Gateway via WebSocket with full device auth.
 *
 * Implements the v2 signature protocol:
 * 1. Generate ed25519 keypair (persisted to disk)
 * 2. Wait for connect.challenge from gateway
 * 3. Sign payload: "v2|deviceId|clientId|clientMode|role|scopes|signedAtMs|token|nonce"
 * 4. Send connect request with device identity
 * 5. Subscribe to chat events for real-time agent activity
 */
class OpenClawClient extends EventEmitter {
  constructor(workspaceRoot) {
    super();
    this.workspaceRoot = workspaceRoot;
    this.configPath = path.join(process.env.HOME, '.openclaw', 'openclaw.json');
    this.keyPath = path.join(__dirname, '..', '.device-identity.json');
    this.ws = null;
    this.status = 'offline';
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.gatewayHost = '127.0.0.1';
    this.gatewayPort = 18789;
    this.gatewayUrl = 'ws://127.0.0.1:18789/';
    this.token = null;
    this.identity = null; // { deviceId, publicKey, privateKey }
    this.connectNonce = null;
    this.connected = false;

    // Activity tracking
    this.activity = {
      currentState: 'idle',     // idle | thinking | tool_call
      currentTool: null,        // current tool being called
      currentMessage: null,     // latest chat message summary
      turnStartedAt: null,      // when current turn started
      recentEvents: [],         // last 50 events for timeline
      lastMessages: [],         // recent chat history (from polling)
    };
    this.MAX_EVENTS = 50;
    this._historyPollTimer = null;
    this._lastMessageTs = 0;

    // Terminal-style log buffer (ring buffer, newest at end)
    this._logBuffer = [];
    this.MAX_LOG_LINES = 200;
    this._lastAssistantText = '';  // accumulate streaming text for final output
    this._lastUserMessage = '';    // last user message for lifecycle log context
  }

  async init() {
    await this.loadConfig();
    await this.loadOrCreateIdentity();
    await this.connect();
  }

  async loadConfig() {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      const config = JSON.parse(content);
      this.token = config.gateway?.auth?.token || null;

      const bind = config.gateway?.bind || 'loopback';
      this.gatewayPort = config.gateway?.port || 18789;
      this.gatewayHost = (bind === 'loopback' || bind === 'localhost') ? '127.0.0.1' : '0.0.0.0';
      this.gatewayUrl = `ws://${this.gatewayHost}:${this.gatewayPort}/`;

      console.log('[OpenClawClient] Config loaded, token:', this.token ? 'yes' : 'no', 'url:', this.gatewayUrl);
    } catch (err) {
      console.warn('[OpenClawClient] Failed to load config:', err.message);
    }
  }

  async loadOrCreateIdentity() {
    try {
      const content = await fs.readFile(this.keyPath, 'utf-8');
      this.identity = JSON.parse(content);
      console.log('[OpenClawClient] Loaded existing device identity:', this.identity.deviceId);
      return;
    } catch {
      // Generate new identity
    }

    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

    // Export raw 32-byte keys
    const pubDer = publicKey.export({ type: 'spki', format: 'der' });
    const privDer = privateKey.export({ type: 'pkcs8', format: 'der' });

    // Raw 32-byte public key is last 32 bytes of SPKI DER
    const pubRaw = pubDer.slice(-32);
    // Raw 32-byte private key is last 32 bytes of PKCS8 DER
    const privRaw = privDer.slice(-32);

    // Base64url encode
    const pubB64 = this._toBase64Url(pubRaw);
    const privB64 = this._toBase64Url(privRaw);

    // Device ID = SHA-256 hex digest of raw public key (matches Gateway's fingerprintPublicKey)
    const deviceId = crypto.createHash('sha256').update(pubRaw).digest('hex');

    this.identity = {
      deviceId,
      publicKey: pubB64,
      privateKey: privB64,
      createdAtMs: Date.now()
    };

    // Persist
    try {
      await fs.writeFile(this.keyPath, JSON.stringify(this.identity, null, 2));
      console.log('[OpenClawClient] Created new device identity:', deviceId);
    } catch (err) {
      console.warn('[OpenClawClient] Failed to persist identity:', err.message);
    }
  }

  _toBase64Url(buf) {
    return Buffer.from(buf).toString('base64')
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/g, '');
  }

  _fromBase64Url(str) {
    const padded = str.replaceAll('-', '+').replaceAll('_', '/');
    const pad = (4 - padded.length % 4) % 4;
    return Buffer.from(padded + '='.repeat(pad), 'base64');
  }

  _sign(message) {
    const privRaw = this._fromBase64Url(this.identity.privateKey);
    // Create private key object from raw 32 bytes
    const privKey = crypto.createPrivateKey({
      key: Buffer.concat([
        // PKCS8 DER header for ed25519
        Buffer.from('302e020100300506032b657004220420', 'hex'),
        privRaw
      ]),
      format: 'der',
      type: 'pkcs8'
    });
    const sig = crypto.sign(null, Buffer.from(message), privKey);
    return this._toBase64Url(sig);
  }

  async connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.connected = false;

    try {
      console.log('[OpenClawClient] Connecting to', this.gatewayUrl);
      this.ws = new WebSocket(this.gatewayUrl, {
        origin: `http://${this.gatewayHost}:${this.gatewayPort}`,
        headers: {
          'Host': `${this.gatewayHost}:${this.gatewayPort}`
        }
      });

      this.ws.on('open', () => {
        console.log('[OpenClawClient] WebSocket open, waiting for challenge...');
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this._handleMessage(msg);
        } catch (err) {
          console.warn('[OpenClawClient] Parse error:', err.message);
        }
      });

      this.ws.on('error', (err) => {
        console.error('[OpenClawClient] WS error:', err.message);
      });

      this.ws.on('close', (code, reason) => {
        console.log('[OpenClawClient] Disconnected, code:', code, 'reason:', reason?.toString() || 'n/a');
        this.connected = false;
        const newStatus = 'offline';
        if (this.status !== newStatus) {
          this.status = newStatus;
          this.emit('status', this.status);
        }
        this.stopPing();
        this.scheduleReconnect();
      });

    } catch (err) {
      console.error('[OpenClawClient] Connect failed:', err.message);
      this.scheduleReconnect();
    }
  }

  _handleMessage(msg) {
    // Step 1: Receive challenge
    if (msg.type === 'event' && msg.event === 'connect.challenge') {
      this.connectNonce = msg.payload?.nonce || '';
      console.log('[OpenClawClient] Got challenge, nonce:', this.connectNonce.slice(0, 8) + '...');
      this._sendConnect();
      return;
    }

    // Step 2: Handle responses (connect + requests)
    if (msg.type === 'res') {
      // Check if this is a response to a pending request (chat.history, etc.)
      if (this._handleResponse(msg)) return;

      if (msg.payload?.type === 'hello-ok') {
        console.log('[OpenClawClient] Connected successfully!');
        this.connected = true;
        this._connectedAt = Date.now();
        this.status = 'running';
        this.emit('status', this.status);
        this.startPing();
        this._startHistoryPoll();
        return;
      }

      if (msg.ok === false) {
        console.error('[OpenClawClient] Connect rejected:', JSON.stringify(msg.error));
        this.status = 'error';
        this.emit('status', this.status);
        return;
      }
    }

    // Step 3: Handle events (chat, agent activity, etc.)
    if (msg.type === 'event') {
      // Log non-health/presence events for debugging
      if (msg.event !== 'health' && msg.event !== 'presence') {
        console.log(`[OpenClawClient] Event: ${msg.event}`, JSON.stringify(msg.payload || {}).slice(0, 200));
      }
      this.emit('event', msg);
      this._trackActivity(msg);
    }
  }

  _sendConnect() {
    const signedAt = Date.now();
    const role = 'operator';
    const scopes = ['operator.admin', 'operator.approvals', 'operator.pairing'];
    const clientId = 'openclaw-control-ui';
    const clientMode = 'webchat';

    // Build v2 signature payload
    const payload = [
      'v2',
      this.identity.deviceId,
      clientId,
      clientMode,
      role,
      scopes.join(','),
      String(signedAt),
      this.token || '',
      this.connectNonce
    ].join('|');

    const signature = this._sign(payload);

    const connectParams = {
      type: 'req',
      id: `connect-${Date.now()}`,
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: clientId,
          version: '1.0.0',
          platform: 'web',
          mode: clientMode
        },
        role,
        scopes,
        caps: ['tool-events'],
        commands: [],
        permissions: {},
        auth: { token: this.token || '' },
        locale: 'zh-CN',
        userAgent: 'agent-dashboard/1.0.0',
        device: {
          id: this.identity.deviceId,
          publicKey: this.identity.publicKey,
          signature,
          signedAt,
          nonce: this.connectNonce
        }
      }
    };

    this._send(connectParams);
    console.log('[OpenClawClient] Sent connect request');
  }

  _send(data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 30000);
  }

  stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    console.log('[OpenClawClient] Reconnecting in 5s...');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }

  _trackActivity(msg) {
    const ts = Date.now();
    const event = msg.event;
    const payload = msg.payload;

    // "agent" event — real-time stream of agent work
    if (event === 'agent') {
      const stream = payload?.stream;
      const data = payload?.data;

      if (stream === 'assistant') {
        if (this.activity.currentState === 'idle') {
          this.activity.currentState = 'thinking';
          this.activity.turnStartedAt = ts;
          this._pushEvent(ts, 'turn_start', { state: 'thinking' });
        }
        if (data?.text) {
          this.activity.currentMessage = data.text.slice(-200);
        }
        this.emit('activity-change', this.activity);
      }
      else if (stream === 'lifecycle') {
        const phase = data?.phase;
        if (phase === 'start') {
          this.activity.currentState = 'thinking';
          this.activity.turnStartedAt = ts;
          this._pushEvent(ts, 'turn_start', { state: 'thinking' });
          // Show what triggered this turn (last user message if available)
          const trigger = this._lastUserMessage || '(用户输入)';
          this._appendLog(ts, `── 收到: ${trigger} ──`);
          this.emit('activity-change', this.activity);
        }
        else if (phase === 'end') {
          const duration = this.activity.turnStartedAt
            ? Math.round((ts - this.activity.turnStartedAt) / 1000)
            : 0;
          this.activity.currentState = 'idle';
          this.activity.currentTool = null;
          this.activity.turnStartedAt = null;
          this._pushEvent(ts, 'turn_end', { durationSeconds: duration });
          // Show reply summary
          const reply = this._lastAssistantText ? this._lastAssistantText.slice(0, 100) : '';
          this._appendLog(ts, reply ? `── 回复 (${duration}s): ${reply} ──` : `── 处理完成 (${duration}s) ──`);
          this._appendLog(ts, '');
          this._lastAssistantText = '';
          this.emit('activity-change', this.activity);
        }
      }
    }

    // "chat" event — message lifecycle
    else if (event === 'chat') {
      const state = payload?.state;
      const message = payload?.message;

      if (state === 'delta') {
        if (this.activity.currentState === 'idle') {
          this.activity.currentState = 'thinking';
          this.activity.turnStartedAt = ts;
          this._pushEvent(ts, 'turn_start', { state: 'thinking' });
        }
        const text = this._extractMessageText(message);
        if (text) {
          this.activity.currentMessage = text.slice(-200);
        }
      }
      else if (state === 'final' || state === 'aborted' || state === 'error') {
        const text = this._extractMessageText(message);
        if (text) {
          this.activity.currentMessage = text.slice(-200);
        }
        const duration = this.activity.turnStartedAt
          ? Math.round((ts - this.activity.turnStartedAt) / 1000)
          : 0;
        this._pushEvent(ts, state === 'final' ? 'turn_end' : state, {
          durationSeconds: duration,
          text: (text || '').slice(0, 100)
        });
        this.activity.currentState = 'idle';
        this.activity.currentTool = null;
        this.activity.turnStartedAt = null;
        this.emit('activity-change', this.activity);
      }
    }
  }

  // --- History polling (since Gateway doesn't push chat/agent to observer connections) ---

  _startHistoryPoll() {
    // Poll chat.history every 3s to capture tool calls (not available via WS stream)
    this._pollHistory();
    this._historyPollTimer = setInterval(() => this._pollHistory(), 3000);
  }

  _stopHistoryPoll() {
    if (this._historyPollTimer) {
      clearInterval(this._historyPollTimer);
      this._historyPollTimer = null;
    }
  }

  _gatewayRequest(method, params) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('not connected'));
      }
      const id = `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const timeout = setTimeout(() => {
        delete this._pendingRequests[id];
        reject(new Error('request timeout'));
      }, 10000);
      
      if (!this._pendingRequests) this._pendingRequests = {};
      this._pendingRequests[id] = { resolve, reject, timeout };
      
      this.ws.send(JSON.stringify({ type: 'req', id, method, params }));
    });
  }

  _handleResponse(msg) {
    if (!this._pendingRequests) return false;
    const pending = this._pendingRequests[msg.id];
    if (!pending) return false;
    
    clearTimeout(pending.timeout);
    delete this._pendingRequests[msg.id];
    
    if (msg.ok !== false && msg.error == null) {
      pending.resolve(msg.payload);
    } else {
      pending.reject(new Error(msg.error?.message || 'request failed'));
    }
    return true;
  }

  async _pollHistory() {
    try {
      const result = await this._gatewayRequest('chat.history', {
        sessionKey: 'agent:main:main',
        limit: 30
      });
      const messages = result?.messages;
      if (!Array.isArray(messages)) return;

      // Compare with last known message count to only process new messages
      const newCount = messages.length;
      const lastCount = this._lastHistoryCount || 0;
      this._lastHistoryCount = newCount;

      // Only process new messages (appended at end)
      const newMessages = lastCount === 0
        ? messages.slice(-5)  // On first load, show last 5
        : messages.slice(lastCount);  // After that, only new ones

      if (newMessages.length === 0) return;

      const ts = Date.now();
      for (const msg of newMessages) {
        const role = msg.role || '';
        const content = msg.content;

        // User message → track for lifecycle log
        if (role === 'user') {
          const text = this._extractMessageText(msg);
          if (text) {
            this._lastUserMessage = text.slice(0, 80).replace(/\n/g, ' ');
          }
          continue;
        }

        // Assistant message → extract text + tool calls
        if (role === 'assistant' && Array.isArray(content)) {
          for (const part of content) {
            if (part.type === 'text' && part.text) {
              const preview = part.text.slice(0, 150).replace(/\n/g, ' ');
              this._lastAssistantText = preview;
              this._appendLog(ts, `💬 ${preview}`);
            }
            // toolCall → tool invocation with name + arguments
            if (part.type === 'toolCall' && part.name) {
              const args = part.arguments || part.input || {};
              const argsStr = typeof args === 'string' ? args : JSON.stringify(args);
              const preview = argsStr.slice(0, 150).replace(/\n/g, '↵');
              this._appendLog(ts, `🔧 [${part.name}] ${preview}`);
              this.activity.currentTool = part.name;
              this.activity.currentState = 'tool_call';
              this._pushEvent(ts, 'tool_call', { tool: part.name });
              this.emit('activity-change', this.activity);
            }
          }
          continue;
        }

        // toolResult → result output
        if (role === 'toolResult' && Array.isArray(content)) {
          for (const part of content) {
            if (part.type === 'text' && part.text) {
              const preview = part.text.slice(0, 120).replace(/\n/g, '↵');
              this._appendLog(ts, `   → ${preview}`);
            }
          }
          this.activity.currentTool = null;
          this._pushEvent(ts, 'tool_done', { tool: 'done' });
          this.emit('activity-change', this.activity);
          continue;
        }
      }
    } catch (err) {
      console.warn('[OpenClawClient] History poll error:', err.message);
    }
  }

  // --- Terminal log buffer ---

  _appendLog(ts, text) {
    const time = new Date(ts).toLocaleTimeString('zh-CN', { hour12: false });
    this._logBuffer.push(`[${time}] ${text}`);
    if (this._logBuffer.length > this.MAX_LOG_LINES) {
      this._logBuffer = this._logBuffer.slice(-this.MAX_LOG_LINES);
    }
    // Emit for real-time push to frontend
    this.emit('log', this._logBuffer.slice(-50).join('\n'));
  }

  getLogOutput(lines = 50) {
    return this._logBuffer.slice(-lines).join('\n');
  }

  _extractMessageText(message) {
    if (!message) return null;
    // message.text or message.content
    if (typeof message.text === 'string') return message.text;
    if (typeof message.content === 'string') return message.content;
    if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part?.type === 'text' && typeof part.text === 'string') {
          return part.text;
        }
      }
    }
    return null;
  }

  _pushEvent(ts, type, data) {
    // 生成人类可读的消息
    const message = this._formatEventMessage(type, data);
    this.activity.recentEvents.unshift({ timestamp: ts, type, message, ...data });
    if (this.activity.recentEvents.length > this.MAX_EVENTS) {
      this.activity.recentEvents = this.activity.recentEvents.slice(0, this.MAX_EVENTS);
    }
  }

  _formatEventMessage(type, data) {
    switch (type) {
      case 'turn_start': return '开始思考';
      case 'tool_call': return `调用工具: ${data.tool || 'unknown'}`;
      case 'tool_done': return `工具完成: ${data.tool || 'unknown'}`;
      case 'turn_end': return `思考结束 (${data.durationSeconds || 0}s)`;
      case 'chat_response': return '回复消息';
      default: return type;
    }
  }

  getActivity() {
    return {
      ...this.activity,
      uptimeSeconds: this.connected
        ? Math.round((Date.now() - (this._connectedAt || Date.now())) / 1000)
        : 0
    };
  }

  getStatus() {
    return this.status;
  }

  isConnected() {
    return this.connected;
  }

  async close() {
    this.stopPing();
    this._stopHistoryPoll();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

module.exports = OpenClawClient;
