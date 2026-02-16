/**
 * Extracción de texto desde PDF (sin OCR).
 * Usar cuando el PDF tiene texto embebido para ahorrar coste Document AI.
 */

export async function extractTextFromPdf(buffer: Buffer): Promise<{ text: string; pages: number } | null> {
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer);
    const text = (data?.text || '').trim();
    if (text.length < 50) return null;
    return { text, pages: data?.numpages || 1 };
  } catch {
    return null;
  }
}
