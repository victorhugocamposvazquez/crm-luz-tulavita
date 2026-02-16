/**
 * Validación de attachment_path para evitar path traversal y rutas no permitidas.
 * Solo permite rutas relativas dentro del bucket: UUID/nombre.ext
 */

const MAX_PATH_LENGTH = 500;
const ALLOWED_EXT = /\.(pdf|jpe?g|png|webp|gif)$/i;
const SAFE_PATH = /^[a-zA-Z0-9_\-\/. ]+$/;

export function validateAttachmentPath(path: string): { valid: boolean; error?: string } {
  if (typeof path !== 'string') {
    return { valid: false, error: 'attachment_path debe ser una cadena' };
  }
  const trimmed = path.trim();
  if (!trimmed) {
    return { valid: false, error: 'attachment_path no puede estar vacío' };
  }
  if (trimmed.length > MAX_PATH_LENGTH) {
    return { valid: false, error: 'attachment_path demasiado largo' };
  }
  if (trimmed.includes('..') || trimmed.startsWith('/')) {
    return { valid: false, error: 'Ruta no permitida' };
  }
  if (!ALLOWED_EXT.test(trimmed)) {
    return { valid: false, error: 'Extensión no permitida (use pdf, jpg, png, webp o gif)' };
  }
  if (!SAFE_PATH.test(trimmed)) {
    return { valid: false, error: 'Ruta contiene caracteres no permitidos' };
  }
  return { valid: true };
}
