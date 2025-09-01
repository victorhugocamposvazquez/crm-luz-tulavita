/**
 * Utility functions for client data normalization
 */

/**
 * Normalizes a DNI by trimming whitespace and converting letter to uppercase
 * @param dni - The DNI string to normalize
 * @returns The normalized DNI or null if empty
 */
export function normalizeDNI(dni: string | null | undefined): string | null {
  if (!dni) return null;
  
  const trimmed = dni.trim();
  if (!trimmed) return null;
  
  return trimmed.toUpperCase();
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