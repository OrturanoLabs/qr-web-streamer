export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface StreamerOptions {
  onConnectionStateChange?: (state: ConnectionState) => void;
  onDataReceived?: (buffer: ArrayBuffer) => void;
  onError?: (message: string) => void;
  onSessionCreated?: (code: string) => void;
  onSessionJoined?: (code: string) => void;
  onTransmitterDisconnected?: () => void;
}

export class WebSocketStreamer {
  private ws: WebSocket | null = null;
  private options: StreamerOptions;
  private currentSessionCode: string | null = null;

  constructor(options: StreamerOptions) {
    this.options = options;
  }

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // Connect through Vite's proxy (/ws) to support WSS over HTTPS secure context
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      this.ws = new WebSocket(wsUrl);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        console.log('[Streamer] WebSocket connected successfully');
        this.options.onConnectionStateChange?.('connected');
        resolve();
      };

      this.ws.onerror = (err) => {
        console.error('[Streamer] WebSocket error:', err);
        const errorMsg = 'Errore WSS: Impossibile connettersi. Ricorda di accettare il certificato SSL auto-firmato visitando prima https://<IP_PC>:5173 nel browser.';
        this.options.onError?.(errorMsg);
        this.options.onConnectionStateChange?.('error');
        reject(new Error(errorMsg));
      };

      this.ws.onclose = (event) => {
        console.log('[Streamer] WebSocket closed:', event);
        this.options.onConnectionStateChange?.('disconnected');
      };

      this.ws.onmessage = (event) => {
        console.log('[Streamer] Received message data:', event.data);
        if (event.data instanceof ArrayBuffer) {
          this.options.onDataReceived?.(event.data);
          return;
        }

        try {
          const msg = JSON.parse(event.data);
          console.log('[Streamer] Parsed JSON message:', msg);
          this.handleMessage(msg);
        } catch (e) {
          console.error('[Streamer] Error parsing message:', e);
        }
      };
    });
  }

  public async createSession(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log('[Streamer] Not connected, connecting now...');
      await this.connect();
    }
    console.log('[Streamer] Sending create-session command...');
    this.ws?.send(JSON.stringify({ type: 'create-session' }));
  }

  public async joinSession(code: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }
    this.currentSessionCode = code.toUpperCase();
    this.ws?.send(JSON.stringify({ type: 'join-session', code: this.currentSessionCode }));
  }

  private handleMessage(msg: any) {
    switch (msg.type) {
      case 'session-created':
        this.currentSessionCode = msg.code;
        this.options.onSessionCreated?.(msg.code);
        break;

      case 'session-joined':
        this.options.onSessionJoined?.(msg.code);
        break;

      case 'transmitter-disconnected':
        this.options.onTransmitterDisconnected?.();
        this.options.onError?.('Il trasmettitore ha chiuso la sessione.');
        break;

      case 'error':
        this.options.onError?.(msg.message);
        break;
    }
  }

  public sendData(buffer: ArrayBuffer): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(buffer);
        return true;
      } catch (e) {
        console.error('Error sending binary data over WS:', e);
        return false;
      }
    }
    return false;
  }

  public disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
