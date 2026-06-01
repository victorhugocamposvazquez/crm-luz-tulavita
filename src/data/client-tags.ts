/**
 * Catálogo de etiquetas de clientes (estados comerciales).
 *
 * Los valores se guardan tal cual en clients.tags (text[]). Deben coincidir
 * EXACTAMENTE (mayúsculas/acentos) con los estados generados por el import
 * (carpetas Agrupados/<ESTADO>) para no duplicar variantes.
 */

export interface ClientTagDef {
  value: string;
  color: string;
}

export const CLIENT_TAGS: ClientTagDef[] = [
  { value: 'en trámite', color: '#f59e0b' },
  { value: 'Liquidado', color: '#22c55e' },
  { value: 'KO', color: '#ef4444' },
  { value: 'Baja Decomisionable', color: '#0ea5e9' },
  { value: 'Baja Decomisionada', color: '#6b7280' },
  { value: 'Baja No Decomisionable', color: '#8b5cf6' },
];

const DEFAULT_TAG_COLOR = '#64748b';

const colorByValue = new Map(CLIENT_TAGS.map((t) => [t.value, t.color]));

/** Color asociado a una etiqueta de cliente; gris por defecto si es personalizada. */
export function getClientTagColor(value: string): string {
  return colorByValue.get(value) ?? DEFAULT_TAG_COLOR;
}
