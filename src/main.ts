import { BrowserQRCodeReader, QRCodeReader, BinaryBitmap, DecodeHintType, Result, BarcodeFormat } from '@zxing/library';
import Detector from '@zxing/library/esm/core/qrcode/detector/Detector';
import QRCodeDecoderMetaData from '@zxing/library/esm/core/qrcode/decoder/QRCodeDecoderMetaData';
import { serializeBitMatrix, deserializeBitMatrix } from './protocol';
import { WebSocketStreamer, ConnectionState } from './streamer';

/**
 * QR Reader for Transmitter mode
 */
class MatrixCapturingQRCodeReader extends QRCodeReader {
  public rawStandardBitMatrix: any = null;

  public decode(image: BinaryBitmap, hints?: Map<DecodeHintType, any>): Result {
    const blackMatrix = image.getBlackMatrix();
    const detector = new Detector(blackMatrix);
    const detectorResult = detector.detect(hints);
    const rawBits = detectorResult.getBits();
    
    this.rawStandardBitMatrix = rawBits.clone();

    const decoder = (this as any).getDecoder();
    const decoderResult = decoder.decodeBitMatrix(rawBits, hints);
    const points = detectorResult.getPoints();

    const other = decoderResult.getOther();
    const isMirrored = other instanceof QRCodeDecoderMetaData && other.isMirrored();
    if (isMirrored) {
      other.applyMirroredCorrection(points);
    }

    const result = new Result(
      decoderResult.getText(),
      decoderResult.getRawBytes(),
      undefined,
      points,
      BarcodeFormat.QR_CODE,
      undefined
    );

    (result as any).isMirrored = isMirrored;
    return result;
  }
}

// UI Mode Switcher
const btnModeSender = document.getElementById('btn-mode-sender') as HTMLButtonElement;
const btnModeReceiver = document.getElementById('btn-mode-receiver') as HTMLButtonElement;
const viewSender = document.getElementById('view-sender') as HTMLDivElement;
const viewReceiver = document.getElementById('view-receiver') as HTMLDivElement;

btnModeSender.addEventListener('click', () => {
  btnModeSender.classList.add('active');
  btnModeReceiver.classList.remove('active');
  viewSender.classList.add('active');
  viewReceiver.classList.remove('active');
});

btnModeReceiver.addEventListener('click', () => {
  btnModeReceiver.classList.add('active');
  btnModeSender.classList.remove('active');
  viewReceiver.classList.add('active');
  viewSender.classList.remove('active');
});

// --- TRANSMITTER LOGIC ---
const videoElement = document.getElementById('video') as HTMLVideoElement;
const btnCreateSession = document.getElementById('btn-create-session') as HTMLButtonElement;
const txSessionCode = document.getElementById('tx-session-code') as HTMLDivElement;
const txTxtStatus = document.getElementById('tx-txt-status') as HTMLSpanElement;
const txTxtPeer = document.getElementById('tx-txt-peer') as HTMLSpanElement;
const txTxtSent = document.getElementById('tx-txt-sent') as HTMLSpanElement;
const txStatusBadge = document.getElementById('tx-status-badge') as HTMLDivElement;
const btnStart = document.getElementById('btn-start') as HTMLButtonElement;
const btnStop = document.getElementById('btn-stop') as HTMLButtonElement;
const txTxtContent = document.getElementById('tx-txt-content') as HTMLSpanElement;
const txTxtDims = document.getElementById('tx-txt-dims') as HTMLSpanElement;

const customReader = new MatrixCapturingQRCodeReader();
const codeReader = new BrowserQRCodeReader();
(codeReader as any).reader = customReader;

let scanningActive = false;
let sentCount = 0;
let lastSerializedSignature = '';
let lastSentTime = 0;
let streamerTx: WebSocketStreamer | null = null;

btnCreateSession.addEventListener('click', async () => {
  try {
    txTxtStatus.textContent = 'Connessione al server...';
    txTxtStatus.style.color = 'var(--warning)';
    txStatusBadge.className = 'status-badge connecting';

    streamerTx = new WebSocketStreamer({
      onSessionCreated: (code) => {
        txSessionCode.textContent = code;
        txTxtStatus.textContent = 'Sessione attiva (Pronto)';
        txTxtStatus.style.color = 'var(--success)';
        txStatusBadge.className = 'status-badge active';
        txTxtPeer.textContent = 'Sempre operativo (Server Relay)';
        btnStart.disabled = false;
        btnCreateSession.disabled = true;
      },
      onConnectionStateChange: (state: ConnectionState) => {
        if (state === 'connected') {
          // Connected to server
        } else if (state === 'disconnected') {
          txTxtStatus.textContent = 'Disconnesso dal server';
          txTxtStatus.style.color = 'var(--danger)';
          txStatusBadge.className = 'status-badge';
        }
      },
      onError: (msg) => {
        alert(msg);
        txTxtStatus.textContent = 'Errore';
        txTxtStatus.style.color = 'var(--danger)';
      }
    });

    await streamerTx.createSession();
  } catch (err) {
    console.error('Failed to create session:', err);
    txTxtStatus.textContent = 'Errore server';
    txTxtStatus.style.color = 'var(--danger)';
  }
});

function renderBitMatrix(matrix: any, canvas: HTMLCanvasElement) {
  const width = matrix.getWidth();
  const height = matrix.getHeight();
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const scale = 10;
  const quietZone = 2;
  const totalWidth = (width + quietZone * 2) * scale;
  const totalHeight = (height + quietZone * 2) * scale;

  canvas.width = totalWidth;
  canvas.height = totalHeight;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  ctx.fillStyle = '#000000';
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (matrix.get(x, y)) {
        ctx.fillRect(
          (x + quietZone) * scale,
          (y + quietZone) * scale,
          scale,
          scale
        );
      }
    }
  }
}

function handleTransmitterScan(result: Result) {
  const text = result.getText();
  txTxtContent.textContent = text;

  const bitMatrix = customReader.rawStandardBitMatrix;
  if (bitMatrix) {
    const w = bitMatrix.getWidth();
    const h = bitMatrix.getHeight();
    txTxtDims.textContent = `${w} × ${h} moduli`;

    const now = Date.now();
    const buffer = serializeBitMatrix(bitMatrix, sentCount + 1, now);
    
    const signature = `${w}x${h}-${Array.from(new Uint8Array(buffer, 14, Math.min(20, buffer.byteLength - 14))).join(',')}`;
    
    if (signature !== lastSerializedSignature || now - lastSentTime > 150) {
      if (signature !== lastSerializedSignature) {
        lastSerializedSignature = signature;
      }
      lastSentTime = now;
      sentCount++;
      txTxtSent.textContent = sentCount.toString();

      if (streamerTx) {
        streamerTx.sendData(buffer);
      }
    }
  }
}

btnStart.addEventListener('click', async () => {
  try {
    btnStart.disabled = true;
    btnStop.disabled = false;
    scanningActive = true;

    await codeReader.decodeFromConstraints(
      { video: { facingMode: 'environment' } },
      videoElement,
      (result, err) => {
        if (result && scanningActive) {
          handleTransmitterScan(result);
        }
      }
    );
  } catch (error) {
    console.error('Camera error:', error);
    btnStart.disabled = false;
    btnStop.disabled = true;
    scanningActive = false;
  }
});

btnStop.addEventListener('click', () => {
  codeReader.reset();
  scanningActive = false;
  btnStart.disabled = false;
  btnStop.disabled = true;
});


// --- RECEIVER LOGIC ---
const inputSessionCode = document.getElementById('input-session-code') as HTMLInputElement;
const btnJoinSession = document.getElementById('btn-join-session') as HTMLButtonElement;
const rxTxtStatus = document.getElementById('rx-txt-status') as HTMLSpanElement;
const rxTxtLatency = document.getElementById('rx-txt-latency') as HTMLSpanElement;
const rxTxtReceived = document.getElementById('rx-txt-received') as HTMLSpanElement;
const rxTxtDims = document.getElementById('rx-txt-dims') as HTMLSpanElement;
const rxTxtTime = document.getElementById('rx-txt-time') as HTMLSpanElement;
const rxCanvas = document.getElementById('qr-canvas') as HTMLCanvasElement;

let receivedCount = 0;
let streamerRx: WebSocketStreamer | null = null;
let lastReceivedTime: number | null = null;

// Continuously update time display with tenths of a second precision
setInterval(() => {
  if (lastReceivedTime !== null) {
    const d = new Date(lastReceivedTime);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    const tenths = Math.floor(d.getMilliseconds() / 100);
    rxTxtTime.textContent = `${hours}:${minutes}:${seconds}.${tenths}`;
  }
}, 100);

btnJoinSession.addEventListener('click', async () => {
  const code = inputSessionCode.value.trim();
  if (code.length !== 6) {
    alert('Inserisci un codice di sessione valido a 6 caratteri.');
    return;
  }

  try {
    rxTxtStatus.textContent = 'Connessione in corso...';
    rxTxtStatus.style.color = 'var(--warning)';

    streamerRx = new WebSocketStreamer({
      onSessionJoined: (joinedCode) => {
        rxTxtStatus.textContent = 'Connesso (In ascolto)';
        rxTxtStatus.style.color = 'var(--success)';
      },
      onConnectionStateChange: (state: ConnectionState) => {
        if (state === 'connected') {
          // Connected to server
        } else if (state === 'disconnected') {
          rxTxtStatus.textContent = 'Disconnesso';
          rxTxtStatus.style.color = 'var(--danger)';
        }
      },
      onTransmitterDisconnected: () => {
        rxTxtStatus.textContent = 'Trasmettitore disconnesso';
        rxTxtStatus.style.color = 'var(--danger)';
      },
      onDataReceived: (buffer: ArrayBuffer) => {
        const now = Date.now();
        const msg = deserializeBitMatrix(buffer);
        
        receivedCount++;
        rxTxtReceived.textContent = receivedCount.toString();

        const w = msg.matrix.getWidth();
        const h = msg.matrix.getHeight();
        rxTxtDims.textContent = `${w} × ${h} moduli`;

        lastReceivedTime = msg.timestamp; // Sender's capture timestamp
        const d = new Date(lastReceivedTime);
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const seconds = String(d.getSeconds()).padStart(2, '0');
        const tenths = Math.floor(d.getMilliseconds() / 100);
        rxTxtTime.textContent = `${hours}:${minutes}:${seconds}.${tenths}`;

        const e2eLatency = Math.max(0, now - msg.timestamp);
        rxTxtLatency.textContent = `${e2eLatency} ms`;

        renderBitMatrix(msg.matrix, rxCanvas);
      },
      onError: (msg) => {
        alert(msg);
        rxTxtStatus.textContent = 'Errore';
        rxTxtStatus.style.color = 'var(--danger)';
      }
    });

    await streamerRx.joinSession(code);
    btnJoinSession.disabled = true;
    inputSessionCode.disabled = true;
  } catch (err) {
    console.error('Failed to join session:', err);
    rxTxtStatus.textContent = 'Errore di connessione';
    rxTxtStatus.style.color = 'var(--danger)';
  }
});
