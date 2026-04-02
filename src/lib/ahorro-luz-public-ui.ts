/** Verde solo para detalles del hero (puntos, subrayado, stats); no en botones rellenos. */
export const AHORRO_PUBLIC_ACCENT = '#22c55e';

/** Acento de controles del formulario (radios, focos, subida): alto contraste sin verde. */
export const AHORRO_FORM_CONTROL_ACCENT = '#171717';

/**
 * Reserva vertical igual a la cabecera fija (`AhorroLuzBrandHeader` con `fixed`).
 * Mantener sincronizado si cambian paddings, pastilla o tamaños del logo.
 */
export const AHORRO_LUZ_HEADER_SPACER_CLASS =
  'h-[calc(max(0.875rem,env(safe-area-inset-top,0px))+7.875rem)] sm:h-[calc(max(1.125rem,env(safe-area-inset-top,0px))+8.375rem)]';

/** Padding superior del área scrollable bajo la misma cabecera fija. */
export const AHORRO_LUZ_SCROLL_TOP_PAD_CLASS =
  'pt-[calc(max(0.875rem,env(safe-area-inset-top,0px))+7.875rem)] sm:pt-[calc(max(1.125rem,env(safe-area-inset-top,0px))+8.375rem)]';

/** `min-height` del panel principal restando la cabecera (evita solapes con viewport). */
export const AHORRO_LUZ_MAIN_MIN_H_CLASS =
  'min-h-[calc(100dvh-max(0.875rem,env(safe-area-inset-top,0px))-8.125rem)] sm:min-h-[calc(100dvh-max(1.125rem,env(safe-area-inset-top,0px))-8.75rem)]';
