/**
 * Etiquetas para mostrar custom_fields de leads por formulario/fuente.
 * Claves = id de pregunta en el formulario.
 */
export const WEB_FORM_AHORRO_LUZ_LABELS: Record<string, string> = {
  factura_mensual: '¿Cuánto pagas al mes en tu factura?',
  compania: 'Compañía actual',
  potencia: 'Potencia contratada',
  tiene_factura: '¿Tienes factura reciente a mano?',
  adjuntar_factura: 'Factura adjunta',
  contacto: 'Datos de contacto',
};

/** Obtener etiqueta para un custom_field key según la fuente del lead */
export function getLeadFieldLabel(source: string, fieldKey: string): string {
  if (source === 'web_form') {
    return WEB_FORM_AHORRO_LUZ_LABELS[fieldKey] ?? fieldKey;
  }
  return fieldKey;
}
