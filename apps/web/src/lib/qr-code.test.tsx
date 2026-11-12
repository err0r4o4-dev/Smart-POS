import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { generateQRMatrix, QrCode, QRCodeSVG } from './qr-code';

describe('QRCode Generator', () => {
  it('generates a valid square matrix with finder patterns', () => {
    const matrix = generateQRMatrix('https://smartpos.local');
    expect(matrix.length).toBeGreaterThan(20);
    expect(matrix[0].length).toBe(matrix.length);

    // Top-left finder pattern corner
    expect(matrix[0][0]).toBe(true);
    expect(matrix[0][1]).toBe(true);
    expect(matrix[0][2]).toBe(true);
    expect(matrix[0][6]).toBe(true);
  });

  it('correctly handles long table URLs and sets the dark module', () => {
    const longUrl =
      'http://192.168.200.31:8088/shop/velo-cafe?table=86d486caf821f567ca0c079123a8e9500c3f86eec949400af8b6d59c2c37ccc7';
    const qr = QrCode.encodeText(longUrl);
    expect(qr.version).toBeGreaterThanOrEqual(6);
    expect(qr.size).toBe(qr.version * 4 + 17);

    // Standard ISO/IEC 18004 Dark Module must be at (size - 8, 8)
    expect(qr.modules[qr.size - 8][8]).toBe(true);

    // Top-right finder pattern
    expect(qr.modules[0][qr.size - 7]).toBe(true);
    expect(qr.modules[0][qr.size - 1]).toBe(true);

    // Bottom-left finder pattern
    expect(qr.modules[qr.size - 7][0]).toBe(true);
    expect(qr.modules[qr.size - 1][0]).toBe(true);
  });

  it('renders SVG element with correct viewbox and dimensions', () => {
    const { container } = render(
      <QRCodeSVG value="Hello QR" size={150} title="Test QR" />,
    );
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg?.getAttribute('width')).toBe('150');
    expect(svg?.getAttribute('height')).toBe('150');
    expect(svg?.getAttribute('aria-label')).toBe('Test QR');
  });
});
