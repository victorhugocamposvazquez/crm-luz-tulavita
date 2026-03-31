import { FileSearch, Scale, Sparkles } from 'lucide-react';
import { InvoiceProcessingLoader } from '@/components/invoice/InvoiceProcessingLoader';

const STEPS = [
  { label: 'Analizando tu factura…', icon: FileSearch },
  { label: 'Comparando tarifas…', icon: Scale },
  { label: 'Buscando tu mejor oferta…', icon: Sparkles },
] as const;

const DEFAULT_STEP_INTERVAL_MS = 1000;

export function EnergySavingsLoader({
  compact = false,
  stepIntervalMs,
}: {
  compact?: boolean;
  /** Pasos más rápidos en flujo embebido (landing). */
  stepIntervalMs?: number;
} = {}) {
  return (
    <InvoiceProcessingLoader
      compact={compact}
      stepIntervalMs={stepIntervalMs ?? (compact ? 400 : DEFAULT_STEP_INTERVAL_MS)}
      title="Estamos revisando tu factura"
      subtitle="Esto suele tardar unos segundos"
      note="Mientras analizamos tu factura, también estamos comparando las mejores tarifas disponibles."
      steps={STEPS}
    />
  );
}
