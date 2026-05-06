/**
 * Utility functions for client data normalization
 */

/** Texto antiguo del import CSV; en UI se sustituye por guion. */
export const LEGACY_IMPORT_DIRECCION_PLACEHOLDER = 'Pendiente — importación CSV';

/**
 * Línea de dirección fiscal para ensamblar “dirección, localidad, CP”.
 * Devuelve null si está vacío, es el marcador legacy de importación o solo “-”.
 */
export function fiscalStreetLineOrNull(direccion: string | null | undefined): string | null {
  const t = (direccion ?? '').trim();
  if (!t || t === LEGACY_IMPORT_DIRECCION_PLACEHOLDER || t === '-') return null;
  return t;
}

/** Texto único para la celda de dirección (lista / enlace); mínimo “-” si no hay datos. */
export function clientFiscalAddressLine(
  direccion: string | null | undefined,
  localidad?: string | null,
  codigo_postal?: string | null,
): string {
  const street = fiscalStreetLineOrNull(direccion);
  const parts = [street, localidad?.trim() || '', codigo_postal?.trim() || ''].filter(Boolean);
  return parts.length ? parts.join(', ') : '-';
}

/** Valor inicial del input de dirección al editar (marcador legacy / vacío → guion). */
export function direccionForFormInput(raw: string | null | undefined): string {
  const street = fiscalStreetLineOrNull(raw);
  return street !== null ? street : '-';
}

/** Query para Maps cuando no hay calle útil pero sí localidad o CP. */
export function clientFiscalAddressMapQuery(
  direccion: string | null | undefined,
  localidad?: string | null,
  codigo_postal?: string | null,
): string {
  const line = clientFiscalAddressLine(direccion, localidad, codigo_postal);
  return line === '-' ? 'España' : line;
}

/**
 * Validates DNI format (minimum 8 characters with at least 1 letter)
 * @param dni - The DNI string to validate
 * @returns True if valid, false otherwise
 */
export function validateDNI(dni: string | null | undefined): boolean {
  if (!dni) return false;
  
  const trimmed = dni.trim();
  if (trimmed.length < 8) return false;
  
  // Must contain at least one letter
  return /[a-zA-Z]/.test(trimmed);
}

/**
 * Normalizes a DNI by trimming whitespace and converting letter to uppercase
 * @param dni - The DNI string to normalize
 * @returns The normalized DNI or null if empty
 */
export function normalizeDNI(dni: string | null | undefined): string | null {
  console.log('normalizeDNI called with:', dni, typeof dni);
  if (!dni) {
    console.log('DNI is null/undefined, returning null');
    return null;
  }
  
  const trimmed = dni.trim();
  console.log('DNI after trim:', `"${trimmed}"`);
  if (!trimmed) {
    console.log('DNI is empty after trim, returning null');
    return null;
  }
  
  // ELIMINAR TODOS LOS ESPACIOS, no solo trim
  const withoutSpaces = trimmed.replace(/\s+/g, '');
  console.log('DNI after removing all spaces:', `"${withoutSpaces}"`);
  
  const result = withoutSpaces.toUpperCase();
  console.log('DNI final result:', `"${result}"`);
  return result;
}

/**
 * Normalizes a name by trimming whitespace and converting to uppercase
 * @param name - The name string to normalize
 * @returns The normalized name
 */
export function normalizeName(name: string): string {
  return name.trim().toUpperCase();
}

/**
 * Normalizes client data for creation or update
 * @param clientData - The client data object
 * @returns The normalized client data
 */
export function normalizeClientData<T extends { nombre_apellidos: string; dni?: string | null }>(
  clientData: T
): T {
  return {
    ...clientData,
    nombre_apellidos: normalizeName(clientData.nombre_apellidos),
    dni: normalizeDNI(clientData.dni),
  };
}