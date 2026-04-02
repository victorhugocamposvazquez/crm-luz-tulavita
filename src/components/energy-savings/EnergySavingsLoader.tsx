import { FileSearch, Scale, Sparkles } from 'lucide-react';
import {
  InvoiceProcessingLoader,
  type InvoiceProcessingLoaderStep,
} from '@/components/invoice/InvoiceProcessingLoader';

const STEPS: InvoiceProcessingLoaderStep[] = [
  { label: 'Analizando tu factura…', icon: FileSearch },
  { label: 'Comparando tarifas…', icon: Scale },
  { label: 'Buscando tu mejor oferta…', icon: Sparkles },
];

/** Landing compacta: intervalo largo entre pasos (antes 400 ms) para sensación más calmada. */
const COMPACT_STEP_INTERVAL_MS = 1600;

export function EnergySavingsLoader({
  compact = false,
  stepIntervalMs,
}: {
  compact?: boolean;
  /** Por defecto, intervalo más largo en compacto para no “saltar” pasos en poco tiempo. */
  stepIntervalMs?: number;
} = {}) {
  return (
    <InvoiceProcessingLoader
      compact={compact}
      stepIntervalMs={stepIntervalMs ?? (compact ? COMPACT_STEP_INTERVAL_MS : undefined)}
      title="Estamos revisando tu factura"
      subtitle="Esto suele tardar unos segundos"
      note="Mientras analizamos tu factura, también estamos comparando las mejores tarifas disponibles."
      steps={STEPS}
    />
  );
}
