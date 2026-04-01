/**
 * Extracción de texto PDF en el navegador (misma idea que InvoiceSimulator → simulate-invoice).
 * Evita que el servidor reparse el PDF desde cero y acelera el pipeline frente a solo buffer.
 */

let pdfjsWorkerReady = false;

export async function ensurePdfWorker(): Promise<void> {
  if (pdfjsWorkerReady) return;
  const pdfjsLib = await import('pdfjs-dist');
  const workerModule = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
  pdfjsWorkerReady = true;
}

/** null si no es PDF o falla la lectura. */
export async function extractPdfTextFromFile(file: File): Promise<string | null> {
  if (file.type !== 'application/pdf') return null;

  try {
    await ensurePdfWorker();
    const pdfjsLib = await import('pdfjs-dist');
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .trim();
      if (pageText) pages.push(pageText);
    }

    return pages.join('\n').trim() || null;
  } catch (err) {
    console.warn('Client PDF text extraction failed:', err);
    return null;
  }
}
