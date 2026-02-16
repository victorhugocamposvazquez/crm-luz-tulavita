/**
 * Extracción de texto desde PDF (sin OCR).
 * Usar cuando el PDF tiene texto embebido para ahorrar coste Document AI.
 * API: pdf-parse 2.x exporta clase PDFParse con getText().
 */

export async function extractTextFromPdf(buffer: Buffer): Promise<{ text: string; pages: number } | null> {
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const textResult = await parser.getText();
    await parser.destroy();
    const text = (textResult?.text ?? '').trim();
    if (text.length < 50) return null;
    const pages = textResult?.pages?.length ?? 1;
    return { text, pages };
  } catch {
    return null;
  }
}
