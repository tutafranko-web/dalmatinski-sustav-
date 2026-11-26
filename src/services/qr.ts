import QRCode from 'qrcode';

/** QR kod kao SVG (za ispis na stol, jelovnik ili letak). Razina M podnosi malo ogrebotina i mrlja. */
export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, color: { dark: '#17221f', light: '#ffffff' } });
}
