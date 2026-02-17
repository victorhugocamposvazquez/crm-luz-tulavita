/**
 * Convierte la primera página de un PDF a imagen (JPEG) en el navegador.
 * Así el servidor recibe una imagen y Document AI tarda menos (<10s en Vercel Hobby).
 */
const JPEG_QUALITY = 0.82;
const MAX_DIMENSION = 1200;
const SCALE = 2;

async function ensureWorker(pdfjsLib: typeof import('pdfjs-dist')) {
  if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions?.workerSrc) {
    try {
      const workerUrl = await import('pdfjs-dist/build/pdf.worker.mjs?url').then((m) => m.default);
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
    } catch {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${(pdfjsLib as { version?: string }).version ?? '4.0.379'}/pdf.worker.min.mjs`;
    }
  }
}

export async function pdfFirstPageToImageBlob(file: File): Promise<Blob> {
  const pdfjsLib = await import('pdfjs-dist');
  await ensureWorker(pdfjsLib);
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(SCALE, MAX_DIMENSION / Math.max(baseViewport.width, baseViewport.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2d not available');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/jpeg', JPEG_QUALITY);
  });
}

/**
 * Convierte las dos primeras páginas del PDF en una sola imagen (apiladas).
 * En muchas facturas (ej. Iberdrola) el total está en pág. 1 y el consumo (kWh) en pág. 2.
 */
export async function pdfFirstTwoPagesToImageBlob(file: File): Promise<Blob> {
  const pdfjsLib = await import('pdfjs-dist');
  await ensureWorker(pdfjsLib);
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  const pagesToRender = Math.min(2, numPages);

  let totalHeight = 0;
  let maxWidth = 0;
  const pageCanvases: HTMLCanvasElement[] = [];

  for (let i = 1; i <= pagesToRender; i++) {
    const page = await pdf.getPage(i);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(SCALE, MAX_DIMENSION / Math.max(baseViewport.width, baseViewport.height));
    const viewport = page.getViewport({ scale });
    const w = Math.round(viewport.width);
    const h = Math.round(viewport.height);
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = w;
    pageCanvas.height = h;
    const pageCtx = pageCanvas.getContext('2d');
    if (!pageCtx) throw new Error('Canvas 2d not available');
    await page.render({ canvasContext: pageCtx, viewport }).promise;
    pageCanvases.push(pageCanvas);
    totalHeight += h;
    maxWidth = Math.max(maxWidth, w);
  }

  const canvas = document.createElement('canvas');
  canvas.width = maxWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2d not available');

  let y = 0;
  for (const pageCanvas of pageCanvases) {
    ctx.drawImage(pageCanvas, 0, y);
    y += pageCanvas.height;
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/jpeg', JPEG_QUALITY);
  });
}
