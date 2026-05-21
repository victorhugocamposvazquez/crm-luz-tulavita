import QRCode from 'qrcode';

export async function generateQrDataUrl(url: string, size = 320): Promise<string> {
  return QRCode.toDataURL(url, {
    width: size,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
}

export function downloadQrPng(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  link.click();
}
