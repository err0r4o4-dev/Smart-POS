import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { generateQRMatrix, QRCodeSVG } from './qr-code';

describe('QRCode Generator', () => {
  it('generates a valid square matrix with finder patterns', () => {
    const matrix = generateQRMatrix('https://smartpos.local');
    expect(matrix.length).toBeGreaterThan(20);
    expect(matrix[0].length).toBe(matrix.length);

    // Top-left finder pattern corner
    expect(matrix[0][0]).toBe(true);
    expect(matrix[0][1]).toBe(true);
    expect(matrix[0][2]).toBe(true);
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
