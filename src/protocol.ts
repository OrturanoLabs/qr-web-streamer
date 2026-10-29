import { BitMatrix } from '@zxing/library';

export interface QRMessage {
  version: number;
  dimension: number;
  sequenceNumber: number;
  timestamp: number;
  matrix: BitMatrix;
}

/**
 * Serializes a ZXing BitMatrix into a compact binary ArrayBuffer.
 */
export function serializeBitMatrix(matrix: BitMatrix, sequenceNumber: number, timestamp: number = Date.now()): ArrayBuffer {
  const width = matrix.getWidth();
  const height = matrix.getHeight();
  const dimension = width; // QR codes are square

  const totalBits = width * height;
  const payloadBytes = Math.ceil(totalBits / 8);
  const headerSize = 14; // 1 (ver) + 1 (dim) + 4 (seq) + 8 (timestamp)
  
  const buffer = new ArrayBuffer(headerSize + payloadBytes);
  const view = new DataView(buffer);

  // Header
  view.setUint8(0, 1); // Protocol version 1
  view.setUint8(1, dimension);
  view.setUint32(2, sequenceNumber, false); // Big endian
  view.setFloat64(6, timestamp, false);

  // Payload bits packing
  const bytes = new Uint8Array(buffer, headerSize);
  let byteIndex = 0;
  let bitMask = 128; // 10000000
  let currentByte = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (matrix.get(x, y)) {
        currentByte |= bitMask;
      }
      bitMask >>= 1;
      if (bitMask === 0) {
        bytes[byteIndex++] = currentByte;
        currentByte = 0;
        bitMask = 128;
      }
    }
  }

  // Flush remaining bits if any
  if (bitMask !== 128) {
    bytes[byteIndex++] = currentByte;
  }

  return buffer;
}

/**
 * Deserializes a binary ArrayBuffer back into a QRMessage object containing a BitMatrix.
 */
export function deserializeBitMatrix(buffer: ArrayBuffer): QRMessage {
  const view = new DataView(buffer);
  
  const version = view.getUint8(0);
  if (version !== 1) {
    throw new Error(`Unsupported protocol version: ${version}`);
  }

  const dimension = view.getUint8(1);
  const sequenceNumber = view.getUint32(2, false);
  const timestamp = view.getFloat64(6, false);

  const headerSize = 14;
  const bytes = new Uint8Array(buffer, headerSize);

  const grid: boolean[][] = Array.from({ length: dimension }, () => Array(dimension).fill(false));
  
  let byteIndex = 0;
  let bitMask = 128;
  let currentByte = bytes[byteIndex];

  for (let y = 0; y < dimension; y++) {
    for (let x = 0; x < dimension; x++) {
      grid[y][x] = (currentByte & bitMask) !== 0;
      bitMask >>= 1;
      if (bitMask === 0) {
        byteIndex++;
        if (byteIndex < bytes.length) {
          currentByte = bytes[byteIndex];
        }
        bitMask = 128;
      }
    }
  }

  const matrix = BitMatrix.parseFromBooleanArray(grid);

  return {
    version,
    dimension,
    sequenceNumber,
    timestamp,
    matrix
  };
}
