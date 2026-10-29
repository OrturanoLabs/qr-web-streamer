export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface WebRTCManagerOptions {
  onConnectionStateChange?: (state: ConnectionState) => void;
  onDataReceived?: (buffer: ArrayBuffer) => void;
  onError?: (message: string) => void;
  onSessionCreated?: (code: string) => void;
  onSessionJoined?: (code: string) => void;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary_string = atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

export class WebRTCManager {
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private options: WebRTCManagerOptions;
  private isTransmitter: boolean = false;
  private currentSessionCode: string | null = null;
  private hasConnectedP2P: boolean = false;

  constructor(options: WebRTCManagerOptions) {
    this.options = options;
  }

  public connectSignaling(): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        resolve();
      };

      this.ws.onerror = (err) => {
        console.error('WebSocket signaling error:', err);
        this.options.onError?.('Errore di connessione al server di segnalazione.');
        reject(err);
      };

      this.ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'qr-frame') {
            const buffer = base64ToArrayBuffer(msg.payload);
            this.options.onDataReceived?.(buffer);
            return;
          }
          await this.handleSignalingMessage(msg);
        } catch (e) {
          console.error('Error handling signaling message:', e);
        }
      };
    });
  }

  public async createSession(): Promise<void> {
    this.isTransmitter = true;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connectSignaling();
    }
    this.ws?.send(JSON.stringify({ type: 'create-session' }));
  }

  public async joinSession(code: string): Promise<void> {
    this.isTransmitter = false;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connectSignaling();
    }
    this.currentSessionCode = code.toUpperCase();
    this.ws?.send(JSON.stringify({ type: 'join-session', code: this.currentSessionCode }));
    
    // Consider signaling connection active as fallback connected state immediately
    this.options.onConnectionStateChange?.('connected');
  }

  private async handleSignalingMessage(msg: any) {
    switch (msg.type) {
      case 'session-created':
        this.currentSessionCode = msg.code;
        this.options.onSessionCreated?.(msg.code);
        break;

      case 'session-joined':
        this.options.onSessionJoined?.(msg.code);
        break;

      case 'receiver-connected':
        this.options.onConnectionStateChange?.('connected');
        // Try establishing P2P in background
        await this.initPeerConnection(true);
        break;

      case 'transmitter-disconnected':
      case 'receiver-disconnected':
        this.options.onConnectionStateChange?.('disconnected');
        this.options.onError?.('L\'altro utente si è disconnesso.');
        this.closePeerConnection();
        break;

      case 'error':
        this.options.onError?.(msg.message);
        this.options.onConnectionStateChange?.('error');
        break;

      case 'signal':
        await this.handleSignalData(msg.data);
        break;
    }
  }

  private async initPeerConnection(isInitiator: boolean) {
    if (this.pc) return;

    const rtcConfig: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    this.pc = new RTCPeerConnection(rtcConfig);

    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'signal',
          data: { candidate: event.candidate }
        }));
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (!this.pc) return;
      console.log('WebRTC connection state:', this.pc.connectionState);
      if (this.pc.connectionState === 'connected') {
        this.hasConnectedP2P = true;
        this.options.onConnectionStateChange?.('connected');
      } else if (this.pc.connectionState === 'failed') {
        console.warn('WebRTC P2P failed, falling back to WebSocket signaling relay.');
      }
    };

    if (isInitiator) {
      this.dataChannel = this.pc.createDataChannel('qr-stream', {
        ordered: false,
        maxRetransmits: 0
      });
      this.setupDataChannel();

      try {
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        this.ws?.send(JSON.stringify({ type: 'signal', data: { sdp: this.pc.localDescription } }));
      } catch (err) {
        console.error('Error creating offer:', err);
      }
    } else {
      this.pc.ondatachannel = (event) => {
        this.dataChannel = event.channel;
        this.setupDataChannel();
      };
    }
  }

  private setupDataChannel() {
    if (!this.dataChannel) return;

    this.dataChannel.binaryType = 'arraybuffer';

    this.dataChannel.onopen = () => {
      this.hasConnectedP2P = true;
      this.options.onConnectionStateChange?.('connected');
    };

    this.dataChannel.onclose = () => {
      // If we fallback to WS, don't necessarily treat as full disconnect if WS is open
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.options.onConnectionStateChange?.('disconnected');
      }
    };

    this.dataChannel.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        this.options.onDataReceived?.(event.data);
      }
    };
  }

  private async handleSignalData(data: any) {
    if (!this.pc) {
      await this.initPeerConnection(false);
    }

    try {
      if (data.sdp) {
        await this.pc!.setRemoteDescription(new RTCSessionDescription(data.sdp));
        if (data.sdp.type === 'offer') {
          const answer = await this.pc!.createAnswer();
          await this.pc!.setLocalDescription(answer);
          this.ws?.send(JSON.stringify({ type: 'signal', data: { sdp: this.pc!.localDescription } }));
        }
      } else if (data.candidate) {
        await this.pc!.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    } catch (err) {
      console.error('Error handling signal data:', err);
    }
  }

  public sendData(buffer: ArrayBuffer): boolean {
    let sent = false;

    // Try WebRTC DataChannel first
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      try {
        this.dataChannel.send(buffer);
        sent = true;
      } catch (e) {
        console.error('Error sending over DataChannel:', e);
      }
    }

    // Always fallback or dual-send via WebSocket signaling relay to guarantee 100% connectivity
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        const payload = arrayBufferToBase64(buffer);
        this.ws.send(JSON.stringify({ type: 'qr-frame', payload }));
        sent = true;
      } catch (e) {
        console.error('Error sending over WebSocket relay:', e);
      }
    }

    return sent;
  }

  public closePeerConnection() {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
  }

  public disconnect() {
    this.closePeerConnection();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
