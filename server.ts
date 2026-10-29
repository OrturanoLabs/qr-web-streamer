import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

interface Session {
  code: string;
  transmitter?: WebSocket;
  receivers: Set<WebSocket>;
  lastMatrix?: ArrayBuffer;
  createdAt: number;
}

const server = createServer();
const wss = new WebSocketServer({ server });

const sessions = new Map<string, Session>();

function generateSessionCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return sessions.has(code) ? generateSessionCode() : code;
}

wss.on('connection', (ws: WebSocket) => {
  console.log('[Server] New WebSocket client connected');
  let currentCode: string | null = null;
  let role: 'transmitter' | 'receiver' | null = null;

  ws.on('error', (err) => {
    console.error('[Server] WebSocket client error:', err);
  });

  ws.on('message', (message: WebSocket.RawData, isBinary: boolean) => {
    try {
      console.log(`[Server] Received message | isBinary: ${isBinary} | size: ${message.length} bytes`);
      if (isBinary) {
        if (role === 'transmitter' && currentCode) {
          const session = sessions.get(currentCode);
          if (session) {
            const buf = Buffer.isBuffer(message) 
              ? message.buffer.slice(message.byteOffset, message.byteOffset + message.byteLength)
              : message as ArrayBuffer;
            
            session.lastMatrix = buf;
            console.log(`[Server] Broadcasting binary matrix (${buf.byteLength} bytes) to ${session.receivers.size} receivers in session ${currentCode}`);
            for (const receiver of session.receivers) {
              if (receiver.readyState === WebSocket.OPEN) {
                receiver.send(buf);
              }
            }
          }
        } else {
          console.log(`[Server] Ignored binary message from role: ${role}, code: ${currentCode}`);
        }
        return;
      }

      const rawStr = message.toString();
      console.log(`[Server] Received text message: ${rawStr}`);
      const data = JSON.parse(rawStr);

      switch (data.type) {
        case 'create-session': {
          currentCode = generateSessionCode();
          role = 'transmitter';
          sessions.set(currentCode, {
            code: currentCode,
            receivers: new Set(),
            createdAt: Date.now()
          });
          ws.send(JSON.stringify({ type: 'session-created', code: currentCode }));
          console.log(`[Server] ✅ Session created and assigned: ${currentCode} for TRANSMITTER`);
          break;
        }

        case 'join-session': {
          currentCode = data.code.toUpperCase();
          role = 'receiver';
          const session = sessions.get(currentCode);

          if (!session) {
            console.log(`[Server] ❌ Session not found: ${currentCode}`);
            ws.send(JSON.stringify({ type: 'error', message: 'Sessione non trovata o scaduta.' }));
            return;
          }

          session.receivers.add(ws);
          ws.send(JSON.stringify({ type: 'session-joined', code: currentCode }));
          console.log(`[Server] ✅ Receiver joined session: ${currentCode} (Total receivers: ${session.receivers.size})`);

          if (session.lastMatrix) {
            console.log(`[Server] Sending cached lastMatrix to new receiver in session ${currentCode}`);
            ws.send(session.lastMatrix);
          }
          break;
        }
      }
    } catch (err) {
      console.error('[Server] Message handling error:', err);
    }
  });

  ws.on('close', () => {
    console.log('[Server] WebSocket client disconnected');
    if (currentCode) {
      const session = sessions.get(currentCode);
      if (session) {
        if (role === 'transmitter') {
          console.log(`[Server] Transmitter left session: ${currentCode}`);
          for (const receiver of session.receivers) {
            if (receiver.readyState === WebSocket.OPEN) {
              receiver.send(JSON.stringify({ type: 'transmitter-disconnected' }));
            }
          }
          sessions.delete(currentCode);
        } else if (role === 'receiver') {
          console.log(`[Server] Receiver left session: ${currentCode}`);
          session.receivers.delete(ws);
        }
      }
    }
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, session] of sessions.entries()) {
    if (now - session.createdAt > 3600000) {
      sessions.delete(code);
      console.log(`[Server] Expired session cleaned up: ${code}`);
    }
  }
}, 60000);

const PORT = Number(process.env.PORT) || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[WebSocket Server-Relay] Running on port ${PORT}`);
});
