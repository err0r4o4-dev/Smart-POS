import type { CSSProperties } from 'react';

/**
 * QR Code generator conforming to ISO/IEC 18004:2015.
 * Pure TypeScript implementation (byte mode UTF-8, ECC Low/Medium, versions 1-40,
 * standard Reed-Solomon generator polynomials, full mask evaluation N1-N4).
 */
export class QrCode {
  readonly size: number;
  readonly modules: boolean[][];

  constructor(
    readonly version: number,
    readonly errorCorrectionLevel: number, // 0 = L, 1 = M, 2 = Q, 3 = H
    dataCodewords: Uint8Array,
    mask: number = -1,
  ) {
    if (version < 1 || version > 40)
      throw new RangeError('Version out of range');
    this.size = version * 4 + 17;

    const row: boolean[] = new Array(this.size).fill(false);
    this.modules = Array.from({ length: this.size }, () => row.slice());
    const isFunction: boolean[][] = Array.from({ length: this.size }, () =>
      row.slice(),
    );

    // 1. Draw all function modules (finder, timing, alignment, version info, dark module)
    this.drawFunctionPatterns(isFunction);

    // 2. Add ECC and interleave data codewords
    const allCodewords = this.addEccAndInterleave(dataCodewords);

    // 3. Draw data codewords into matrix
    this.drawCodewords(allCodewords, isFunction);

    // 4. Select mask with lowest penalty score if not specified
    if (mask === -1) {
      let minPenalty = 1e9;
      for (let i = 0; i < 8; i++) {
        this.applyMask(i, isFunction);
        this.drawFormatBits(i);
        const penalty = this.getPenaltyScore();
        if (penalty < minPenalty) {
          minPenalty = penalty;
          mask = i;
        }
        this.applyMask(i, isFunction); // Undoes mask
      }
    }
    this.applyMask(mask, isFunction);
    this.drawFormatBits(mask);
  }

  static encodeText(text: string, ecl: number = 0): QrCode {
    const data = new TextEncoder().encode(text);
    return QrCode.encodeBinary(data, ecl);
  }

  static encodeBinary(data: Uint8Array, ecl: number = 0): QrCode {
    for (let version = 1; version <= 40; version++) {
      const dataCapacity = QrCode.getNumDataCodewords(version, ecl);
      const headerBits = 4 + (version < 10 ? 8 : 16);
      const totalDataBits = headerBits + data.length * 8;
      if (totalDataBits <= dataCapacity * 8) {
        const bb: number[] = [];
        const addBits = (val: number, len: number) => {
          for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1);
        };
        // Mode 4 = Byte mode (0100)
        addBits(0x4, 4);
        addBits(data.length, version < 10 ? 8 : 16);
        for (const b of data) addBits(b, 8);

        // Terminator (up to 4 zeroes)
        const termLen = Math.min(4, dataCapacity * 8 - bb.length);
        addBits(0, termLen);
        while (bb.length % 8 !== 0) bb.push(0);

        // Pad bytes
        const padBytes = [0xec, 0x11];
        let padIdx = 0;
        while (bb.length < dataCapacity * 8) {
          addBits(padBytes[padIdx % 2], 8);
          padIdx++;
        }

        const dataCodewords = new Uint8Array(dataCapacity);
        for (let i = 0; i < dataCapacity; i++) {
          let b = 0;
          for (let j = 0; j < 8; j++) b = (b << 1) | bb[i * 8 + j];
          dataCodewords[i] = b;
        }
        return new QrCode(version, ecl, dataCodewords);
      }
    }
    throw new Error('Data too long for QR Code');
  }

  private drawFunctionPatterns(isFunction: boolean[][]) {
    // Timing patterns
    for (let i = 0; i < this.size; i++) {
      this.setFunctionModule(6, i, i % 2 === 0, isFunction);
      this.setFunctionModule(i, 6, i % 2 === 0, isFunction);
    }

    // 3 Finder patterns
    this.drawFinderPattern(3, 3, isFunction);
    this.drawFinderPattern(this.size - 4, 3, isFunction);
    this.drawFinderPattern(3, this.size - 4, isFunction);

    // Alignment patterns
    const alignPos = QrCode.getAlignmentPatternPositions(this.version);
    const numAlign = alignPos.length;
    for (let i = 0; i < numAlign; i++) {
      for (let j = 0; j < numAlign; j++) {
        if (
          (i === 0 && j === 0) ||
          (i === 0 && j === numAlign - 1) ||
          (i === numAlign - 1 && j === 0)
        )
          continue;
        this.drawAlignmentPattern(alignPos[i], alignPos[j], isFunction);
      }
    }

    // Version info for V >= 7
    if (this.version >= 7) {
      let rem = this.version;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const bits = (this.version << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const bit = ((bits >>> i) & 1) !== 0;
        const a = this.size - 11 + (i % 3);
        const b = Math.floor(i / 3);
        this.setFunctionModule(a, b, bit, isFunction);
        this.setFunctionModule(b, a, bit, isFunction);
      }
    }

    // Dummy format bits (reserve functional area)
    this.drawFormatBits(0, isFunction);
    // Dark module at (size - 8, 8)
    this.setFunctionModule(this.size - 8, 8, true, isFunction);
  }

  private drawFinderPattern(x: number, y: number, isFunction: boolean[][]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const px = x + dx;
        const py = y + dy;
        if (px >= 0 && px < this.size && py >= 0 && py < this.size) {
          this.setFunctionModule(px, py, dist !== 2 && dist !== 4, isFunction);
        }
      }
    }
  }

  private drawAlignmentPattern(x: number, y: number, isFunction: boolean[][]) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.setFunctionModule(
          x + dx,
          y + dy,
          Math.max(Math.abs(dx), Math.abs(dy)) !== 1,
          isFunction,
        );
      }
    }
  }

  private setFunctionModule(
    x: number,
    y: number,
    isDark: boolean,
    isFunction: boolean[][],
  ) {
    this.modules[y][x] = isDark;
    isFunction[y][x] = true;
  }

  private drawFormatBits(mask: number, isFunction?: boolean[][]) {
    const eclBits = [1, 0, 3, 2][this.errorCorrectionLevel];
    const data = (eclBits << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;

    const set = (x: number, y: number, bit: boolean) => {
      this.modules[y][x] = bit;
      if (isFunction) isFunction[y][x] = true;
    };

    // Copy 1 (around top-left)
    for (let i = 0; i <= 5; i++) set(8, i, ((bits >>> i) & 1) !== 0);
    set(8, 7, ((bits >>> 6) & 1) !== 0);
    set(8, 8, ((bits >>> 7) & 1) !== 0);
    set(7, 8, ((bits >>> 8) & 1) !== 0);
    for (let i = 9; i < 15; i++) set(14 - i, 8, ((bits >>> i) & 1) !== 0);

    // Copy 2 (bottom-left and top-right)
    for (let i = 0; i < 7; i++)
      set(this.size - 1 - i, 8, ((bits >>> i) & 1) !== 0);
    for (let i = 7; i < 15; i++)
      set(8, this.size - 15 + i, ((bits >>> i) & 1) !== 0);
  }

  private addEccAndInterleave(data: Uint8Array): Uint8Array {
    const ver = this.version;
    const ecl = this.errorCorrectionLevel;
    const numBlocks = QrCode.NUM_ERROR_CORRECTION_BLOCKS[ecl][ver];
    const blockEccLen = QrCode.ECC_CODEWORDS_PER_BLOCK[ecl][ver];
    const rawCodewords = Math.floor(QrCode.getNumRawDataModules(ver) / 8);
    const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
    const shortBlockLen = Math.floor(rawCodewords / numBlocks);

    const blocks: Uint8Array[] = [];
    const rsDiv = QrCode.reedSolomonComputeDivisor(blockEccLen);
    let k = 0;
    for (let i = 0; i < numBlocks; i++) {
      const dataLen =
        shortBlockLen - blockEccLen + (i >= numShortBlocks ? 1 : 0);
      const dat = data.slice(k, k + dataLen);
      k += dataLen;
      const ecc = QrCode.reedSolomonComputeRemainder(dat, rsDiv);
      const full = new Uint8Array(dat.length + ecc.length);
      full.set(dat);
      full.set(ecc, dat.length);
      blocks.push(full);
    }

    const result = new Uint8Array(rawCodewords);
    let idx = 0;
    // Interleave data
    for (let i = 0; i < shortBlockLen - blockEccLen; i++) {
      for (let j = 0; j < numBlocks; j++) result[idx++] = blocks[j][i];
    }
    for (let j = numShortBlocks; j < numBlocks; j++) {
      result[idx++] = blocks[j][shortBlockLen - blockEccLen];
    }
    // Interleave ECC
    for (let i = 0; i < blockEccLen; i++) {
      for (let j = 0; j < numBlocks; j++) {
        const offset = blocks[j].length - blockEccLen + i;
        result[idx++] = blocks[j][offset];
      }
    }
    return result;
  }

  private drawCodewords(data: Uint8Array, isFunction: boolean[][]) {
    let bitIdx = 0;
    const totalBits = data.length * 8;
    let right = this.size - 1;
    let upwards = true;

    while (right > 0) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < this.size; vert++) {
        const y = upwards ? this.size - 1 - vert : vert;
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          if (!isFunction[y][x]) {
            let dark = false;
            if (bitIdx < totalBits) {
              dark = ((data[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) !== 0;
              bitIdx++;
            }
            this.modules[y][x] = dark;
          }
        }
      }
      upwards = !upwards;
      right -= 2;
    }
  }

  private applyMask(mask: number, isFunction: boolean[][]) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (!isFunction[y][x]) {
          let invert = false;
          switch (mask) {
            case 0:
              invert = (x + y) % 2 === 0;
              break;
            case 1:
              invert = y % 2 === 0;
              break;
            case 2:
              invert = x % 3 === 0;
              break;
            case 3:
              invert = (x + y) % 3 === 0;
              break;
            case 4:
              invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
              break;
            case 5:
              invert = ((x * y) % 2) + ((x * y) % 3) === 0;
              break;
            case 6:
              invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
              break;
            case 7:
              invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
              break;
          }
          if (invert) this.modules[y][x] = !this.modules[y][x];
        }
      }
    }
  }

  private getPenaltyScore(): number {
    let result = 0;
    const size = this.size;
    const mods = this.modules;

    // Adjacent modules in row
    for (let y = 0; y < size; y++) {
      let runColor = false;
      let runVal = 0;
      const runHistory = [0, 0, 0, 0, 0, 0, 0];
      for (let x = 0; x < size; x++) {
        if (mods[y][x] === runColor) {
          runVal++;
          if (runVal === 5) result += 3;
          else if (runVal > 5) result += 1;
        } else {
          QrCode.addHistory(runHistory, runVal);
          if (!runColor && QrCode.hasFinderLikePattern(runHistory))
            result += 40;
          runColor = mods[y][x];
          runVal = 1;
        }
      }
      QrCode.addHistory(runHistory, runVal);
      if (!runColor && QrCode.hasFinderLikePattern(runHistory)) result += 40;
    }

    // Adjacent modules in column
    for (let x = 0; x < size; x++) {
      let runColor = false;
      let runVal = 0;
      const runHistory = [0, 0, 0, 0, 0, 0, 0];
      for (let y = 0; y < size; y++) {
        if (mods[y][x] === runColor) {
          runVal++;
          if (runVal === 5) result += 3;
          else if (runVal > 5) result += 1;
        } else {
          QrCode.addHistory(runHistory, runVal);
          if (!runColor && QrCode.hasFinderLikePattern(runHistory))
            result += 40;
          runColor = mods[y][x];
          runVal = 1;
        }
      }
      QrCode.addHistory(runHistory, runVal);
      if (!runColor && QrCode.hasFinderLikePattern(runHistory)) result += 40;
    }

    // 2x2 blocks of same color
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const color = mods[y][x];
        if (
          color === mods[y][x + 1] &&
          color === mods[y + 1][x] &&
          color === mods[y + 1][x + 1]
        ) {
          result += 3;
        }
      }
    }

    // Balance of dark and light modules
    let dark = 0;
    for (const row of mods) {
      for (const color of row) if (color) dark++;
    }
    const total = size * size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * 10;
    return result;
  }

  private static addHistory(history: number[], runVal: number) {
    history.shift();
    history.push(runVal);
  }

  private static hasFinderLikePattern(history: number[]): boolean {
    const n = history[1];
    return (
      n > 0 &&
      history[2] === n &&
      history[3] === n * 3 &&
      history[4] === n &&
      history[5] === n &&
      (history[0] >= n * 4 || history[6] >= n * 4)
    );
  }

  static getNumDataCodewords(ver: number, ecl: number): number {
    return (
      Math.floor(QrCode.getNumRawDataModules(ver) / 8) -
      QrCode.ECC_CODEWORDS_PER_BLOCK[ecl][ver] *
        QrCode.NUM_ERROR_CORRECTION_BLOCKS[ecl][ver]
    );
  }

  static getNumRawDataModules(ver: number): number {
    let result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }

  static getAlignmentPatternPositions(ver: number): number[] {
    if (ver === 1) return [];
    const numAlign = Math.floor(ver / 7) + 2;
    const step =
      ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
    const result = [6];
    for (let pos = ver * 4 + 10; result.length < numAlign; pos -= step) {
      result.splice(1, 0, pos);
    }
    return result;
  }

  static reedSolomonComputeDivisor(degree: number): Uint8Array {
    const result = new Uint8Array(degree);
    result[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < degree; j++) {
        result[j] = QrCode.reedSolomonMultiply(result[j], root);
        if (j + 1 < degree) result[j] ^= result[j + 1];
      }
      root = QrCode.reedSolomonMultiply(root, 0x02);
    }
    return result;
  }

  static reedSolomonComputeRemainder(
    data: Uint8Array,
    divisor: Uint8Array,
  ): Uint8Array {
    const result = new Uint8Array(divisor.length);
    for (const b of data) {
      const factor = b ^ result[0];
      result.copyWithin(0, 1);
      result[divisor.length - 1] = 0;
      for (let i = 0; i < divisor.length; i++) {
        result[i] ^= QrCode.reedSolomonMultiply(divisor[i], factor);
      }
    }
    return result;
  }

  static reedSolomonMultiply(x: number, y: number): number {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }

  static readonly ECC_CODEWORDS_PER_BLOCK: number[][] = [
    [
      -1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30,
      28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
      30, 30, 30, 30,
    ], // L
    [
      -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28,
      26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
      28, 28, 28, 28, 28,
    ], // M
    [
      -1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28,
      28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30,
      30, 30, 30, 30, 30,
    ], // Q
    [
      -1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28,
      28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
      30, 30, 30, 30, 30,
    ], // H
  ];

  static readonly NUM_ERROR_CORRECTION_BLOCKS: number[][] = [
    [
      -1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9,
      10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25,
    ], // L
    [
      -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17,
      17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47,
      49,
    ], // M
    [
      -1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20,
      23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62,
      65, 68,
    ], // Q
    [
      -1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25,
      25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 72,
      74, 77,
    ], // H
  ];
}

/**
 * Generates a boolean 2D matrix representing dark modules in a valid QR code.
 */
export function generateQRMatrix(text: string, ecl: number = 0): boolean[][] {
  const qr = QrCode.encodeText(text, ecl);
  return qr.modules;
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
