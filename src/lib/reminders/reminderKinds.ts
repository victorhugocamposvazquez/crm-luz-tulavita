export const REMINDER_KIND_VALUES = ['renewal', 'contract_end', 'recontact', 'custom'] as const;
export type ReminderKind = (typeof REMINDER_KIND_VALUES)[number];

const LABELS: Record<Exclude<ReminderKind, 'custom'>, string> = {
  renewal: 'Renovación',
  contract_end: 'Fin de contrato',
  recontact: 'Recontactar',
};

export function reminderKindLabel(kind: string | null | undefined): string {
  const k = kind ?? 'renewal';
  if (k === 'custom') return 'Otro';
  return LABELS[k as keyof typeof LABELS] ?? k;
}

/** Texto visible: etiqueta fija o el texto personalizado. */
export function reminderKindDisplay(kind: string | null | undefined, customLabel: string | null | undefined): string {
  const k = kind ?? 'renewal';
  if (k === 'custom') {
    const t = customLabel?.trim();
    return t || 'Otro';
  }
  return reminderKindLabel(k);
}
