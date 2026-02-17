/**
 * Convierte la primera página de un PDF a imagen (JPEG) en el navegador.
 * Así el servidor recibe una imagen y Document AI tarda menos (<10s en Vercel Hobby).
 */

const JPEG_QUALITY = 0.82;
const MAX_DIMENSION = 1200;
const SCALE = 2;

export async function pdfFirstPageToImageBlob(file: File): Promise<Blob> {
  const pdfjsLib = await import('pdfjs-dist');
  if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions?.workerSrc) {
    try {
      const workerUrl = await import('pdfjs-dist/build/pdf.worker.mjs?url').then((m) => m.default);
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
    } catch {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${(pdfjsLib as { version?: string }).version ?? '4.0.379'}/pdf.worker.min.mjs`;
    }
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(SCALE, MAX_DIMENSION / Math.max(baseViewport.width, baseViewport.height));
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2d not available');

  await page.render({
    canvasContext: ctx,
    viewport,
  }).promise;

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      'image/jpeg',
      JPEG_QUALITY
    );
  });
}
