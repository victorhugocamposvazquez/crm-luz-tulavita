/**
 * Valores de `clients.comercializadora` alineados con el censo CNMC / selector del CRM.
 * (Archivo estable: no lo sobrescribe `scripts/build-comercializadoras.mjs`.)
 */
export const COMERCIALIZADORA_IBERDROLA_CLIENTES_SA_U = 'IBERDROLA CLIENTES, S.A.U.' as const;

/** Legado: primeras importaciones CSV «tipo operaciones». Se conserva por datos y filtros históricos. */
export const IMPORT_SOURCE_IBERDROLA_OPERACIONES_CSV = 'iberdrola_operaciones_csv' as const;

/** CSV tipo operaciones (Fecha, ID, Cliente, Suministro…), cualquier comercializadora — valor actual de `clients.import_source`. */
export const IMPORT_SOURCE_OPERACIONES_COMERCIALIZADORA_CSV =
  'operaciones_comercializadora_csv' as const;
