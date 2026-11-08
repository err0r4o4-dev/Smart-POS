import type { CSSProperties } from 'react';

// Galois Field tables
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
let val = 1;
for (let i = 0; i < 255; i++) {
  EXP[i] = val;
  EXP[i + 255] = val;
  LOG[val] = i;
  val = (val << 1) ^ (val >= 128 ? 0x11d : 0);
}

function mul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

function rsPoly(n: number): number[] {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= mul(poly[j], EXP[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

function rsCalc(data: Uint8Array, count: number): Uint8Array {
  const gen = rsPoly(count);
  const out = new Uint8Array(count);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ out[0];
    for (let j = 0; j < count - 1; j++) {
      out[j] = out[j + 1] ^ mul(gen[count - 1 - j], factor);
    }
    out[count - 1] = mul(gen[0], factor);
  }
  return out;
}

interface VersionInfo {
  size: number;
  dataBytes: number;
  ecBytes: number;
  blocks: [number, number][];
}

const V_INFO: (VersionInfo | null)[] = [
  null,
  { size: 21, dataBytes: 19, ecBytes: 7, blocks: [[19, 7]] },
  { size: 25, dataBytes: 34, ecBytes: 10, blocks: [[34, 10]] },
  { size: 29, dataBytes: 55, ecBytes: 15, blocks: [[55, 15]] },
  { size: 33, dataBytes: 80, ecBytes: 20, blocks: [[80, 20]] },
  { size: 37, dataBytes: 108, ecBytes: 26, blocks: [[108, 26]] },
  { size: 41, dataBytes: 136, ecBytes: 36, blocks: [[68, 18], [68, 18]] },
  { size: 45, dataBytes: 156, ecBytes: 40, blocks: [[78, 20], [78, 20]] },
  { size: 49, dataBytes: 194, ecBytes: 48, blocks: [[97, 24], [97, 24]] },
  { size: 53, dataBytes: 232, ecBytes: 60, blocks: [[116, 30], [116, 30]] },
  { size: 57, dataBytes: 274, ecBytes: 72, blocks: [[68, 18], [68, 18], [69, 18], [69, 18]] },
];

const ALIGNMENT = [
  [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
  [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]
];

const FORMAT_L = [
  0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976
];

export function generateQRMatrix(text: string): boolean[][] {
  const encoder = new TextEncoder();
  const utf8 = encoder.encode(text);
  let ver = 1;
  while (ver <= 10 && (V_INFO[ver]?.dataBytes ?? 0) < utf8.length + 3) {
    ver++;
  }
  if (ver > 10) {
    ver = 10;
  }
  const info = V_INFO[ver]!;

  const bits: number[] = [];
  function addBits(v: number, len: number) {
    for (let i = len - 1; i >= 0; i--) bits.push((v >> i) & 1);
  }

  // 8-bit byte mode (0100)
  addBits(4, 4);
  addBits(utf8.length, ver < 10 ? 8 : 16);
  for (const b of utf8) addBits(b, 8);

  const totalBits = info.dataBytes * 8;
  const termLen = Math.min(4, Math.max(0, totalBits - bits.length));
  addBits(0, termLen);
  while (bits.length % 8 !== 0) bits.push(0);

  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < totalBits) {
    addBits(padBytes[padIdx % 2], 8);
    padIdx++;
  }

  const dataBytes = new Uint8Array(info.dataBytes);
  for (let i = 0; i < info.dataBytes; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j];
    dataBytes[i] = b;
  }

  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;
  for (const [dLen, ecLen] of info.blocks) {
    const dBlock = dataBytes.slice(offset, offset + dLen);
    dataBlocks.push(dBlock);
    ecBlocks.push(rsCalc(dBlock, ecLen));
    offset += dLen;
  }

  const finalStream: number[] = [];
  const maxD = Math.max(...info.blocks.map((b) => b[0]));
  for (let i = 0; i < maxD; i++) {
    for (const dBlock of dataBlocks) {
      if (i < dBlock.length) finalStream.push(dBlock[i]);
    }
  }
  const maxEC = Math.max(...info.blocks.map((b) => b[1]));
  for (let i = 0; i < maxEC; i++) {
    for (const ecBlock of ecBlocks) {
      if (i < ecBlock.length) finalStream.push(ecBlock[i]);
    }
  }

  const size = info.size;
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () =>
    Array(size).fill(null),
  );

  function setFinder(r: number, c: number) {
    for (let i = -1; i <= 7; i++) {
      for (let j = -1; j <= 7; j++) {
        const row = r + i;
        const col = c + j;
        if (row < 0 || row >= size || col < 0 || col >= size) continue;
        if (i >= 0 && i <= 6 && j >= 0 && j <= 6) {
          matrix[row][col] =
            i === 0 ||
            i === 6 ||
            j === 0 ||
            j === 6 ||
            (i >= 2 && i <= 4 && j >= 2 && j <= 4);
        } else {
          matrix[row][col] = false;
        }
      }
    }
  }
  setFinder(0, 0);
  setFinder(0, size - 7);
  setFinder(size - 7, 0);

  for (let i = 8; i < size - 8; i++) {
    if (matrix[6][i] === null) matrix[6][i] = i % 2 === 0;
    if (matrix[i][6] === null) matrix[i][6] = i % 2 === 0;
  }

  const align = ALIGNMENT[ver] ?? [];
  for (const r of align) {
    for (const c of align) {
      if (matrix[r][c] !== null) continue;
      for (let i = -2; i <= 2; i++) {
        for (let j = -2; j <= 2; j++) {
          matrix[r + i][c + j] =
            Math.abs(i) === 2 || Math.abs(j) === 2 || (i === 0 && j === 0);
        }
      }
    }
  }

  for (let i = 0; i < 9; i++) {
    if (matrix[8][i] === null) matrix[8][i] = false;
    if (matrix[i][8] === null) matrix[i][8] = false;
    if (size - 1 - i >= 0) {
      if (matrix[8][size - 1 - i] === null) matrix[8][size - 1 - i] = false;
      if (matrix[size - 1 - i][8] === null) matrix[size - 1 - i][8] = false;
    }
  }
  matrix[size - 8][8] = true;

  const finalBits: number[] = [];
  for (const byte of finalStream) {
    for (let i = 7; i >= 0; i--) finalBits.push((byte >> i) & 1);
  }

  let bitIdx = 0;
  let dir = -1;
  let c = size - 1;
  while (c > 0) {
    if (c === 6) c--;
    const rStart = dir === -1 ? size - 1 : 0;
    const rEnd = dir === -1 ? -1 : size;
    for (let r = rStart; r !== rEnd; r += dir === -1 ? -1 : 1) {
      for (const col of [c, c - 1]) {
        if (matrix[r][col] === null) {
          const bit = bitIdx < finalBits.length ? finalBits[bitIdx++] : 0;
          const mask = (r + col) % 2 === 0;
          matrix[r][col] = (bit ^ (mask ? 1 : 0)) === 1;
        }
      }
    }
    dir = -dir;
    c -= 2;
  }

  const format = FORMAT_L[0];
  for (let i = 0; i < 15; i++) {
    const bit = ((format >> (14 - i)) & 1) === 1;
    if (i < 6) matrix[8][i] = bit;
    else if (i === 6) matrix[8][7] = bit;
    else if (i === 7) matrix[8][8] = bit;
    else if (i === 8) matrix[7][8] = bit;
    else matrix[14 - i][8] = bit;

    if (i < 8) matrix[size - 1 - i][8] = bit;
    else matrix[8][size - 15 + i] = bit;
  }

  return matrix.map((row) => row.map((cell) => cell === true));
}

export function QRCodeSVG({
  value,
  size = 200,
  margin = 4,
  fgColor = '#000000',
  bgColor = '#FFFFFF',
  className,
  style,
  title,
}: {
  value: string;
  size?: number | string;
  margin?: number;
  fgColor?: string;
  bgColor?: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
}) {
  const matrix = generateQRMatrix(value);
  const n = matrix.length;
  const viewBoxSize = n + margin * 2;

  let pathD = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) {
        const x = c + margin;
        const y = r + margin;
        pathD += `M${x},${y}h1v1h-1z `;
      }
    }
  }

  return (
    <svg
      role="img"
      aria-label={title || 'QR Code'}
      viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
      width={size}
      height={size}
      className={className}
      style={{
        display: 'block',
        background: bgColor,
        borderRadius: 8,
        ...style,
      }}
    >
      {title && <title>{title}</title>}
      <rect width="100%" height="100%" fill={bgColor} />
      <path d={pathD} fill={fgColor} />
    </svg>
  );
}
