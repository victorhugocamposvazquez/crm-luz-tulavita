/**
 * Flujo completo: procesar factura, loader, resultado de ahorro estimado.
 * Si la extracción automática falla, se muestra un formulario para introducir consumo y total (plan B).
 */

import { useEffect, useState } from 'react';
import { useEnergyComparison } from '@/hooks/useEnergyComparison';
import { EnergySavingsLoader } from './EnergySavingsLoader';
import { EnergySavingsResult } from './EnergySavingsResult';
import { cn } from '@/lib/utils';
import { AHORRO_LUZ_CTA_GREEN } from '@/lib/ahorro-luz-public-ui';
/** GIF celebración bajo el resultado (coloca el archivo en public/animatios/final.gif). */
const RESULT_CELEBRATION_GIF = '/animations/final.gif';

export function EnergySavingsFlow({
  leadId,
  attachmentPath,
  onReset,
  compactLoader = false,
  fixedResultLoaderMs,
  attachmentPdfText,
}: {
  leadId: string;
  attachmentPath: string;
  onReset?: () => void;
  /** Loader más compacto y rápido (p. ej. debajo del paso de contacto en la landing). */
  compactLoader?: boolean;
  /** Tiempo mínimo mostrando el loader antes del resultado. */
  fixedResultLoaderMs?: number;
  /** Texto del PDF extraído en cliente al subir (acelera extracción en servidor). */
  attachmentPdfText?: string | null;
}) {
  const { status, comparison, error, run, runWithManual, reset } = useEnergyComparison();
  const [manualConsumption, setManualConsumption] = useState('');
  const [manualTotal, setManualTotal] = useState('');
  const [manualPeriod, setManualPeriod] = useState<number>(1);
  const [manualError, setManualError] = useState<string | null>(null);

  useEffect(() => {
    run(leadId, attachmentPath, {
      minLoaderMs: fixedResultLoaderMs ?? 0,
      attachmentPdfText: attachmentPdfText ?? null,
    });
    return () => reset();
  }, [leadId, attachmentPath, fixedResultLoaderMs, attachmentPdfText, run, reset]);

  if (status === 'processing') {
    return (
      <div className="w-full space-y-8">
        <h2 className="px-2 text-xl leading-snug text-neutral-900 sm:text-2xl">
          <span className="font-light">Estamos analizando tu factura; en un momento verás </span>
          <strong className="font-bold text-neutral-950">cuánto puedes ahorrar</strong>
          <span className="font-light"> en tu factura.</span>
        </h2>
        <EnergySavingsLoader compact={compactLoader} />
      </div>
    );
  }

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setManualError(null);
    const consumption = Number(manualConsumption.replace(',', '.'));
    const total = Number(manualTotal.replace(',', '.'));
    if (!Number.isFinite(consumption) || consumption <= 0) {
      setManualError('Introduce un consumo válido en kWh.');
      return;
    }
    if (!Number.isFinite(total) || total <= 0) {
      setManualError('Introduce un total válido en €.');
      return;
    }
    runWithManual(leadId, {
      consumption_kwh: consumption,
      total_factura: total,
      period_months: manualPeriod,
    });
  };

  if (status === 'failed' && error) {
    return (
      <div className="space-y-6">
        <p className="text-lg text-neutral-600">{error}</p>
        <div className="rounded-xl border border-neutral-200 bg-neutral-50/80 p-4 sm:p-5">
          <p className="mb-3 font-medium text-neutral-900">
            Introduce los datos de tu factura para ver tu ahorro estimado
          </p>
          <form onSubmit={handleManualSubmit} className="space-y-4">
            <div>
              <label htmlFor="manual-consumption" className="mb-1 block text-sm font-medium text-neutral-700">
                Consumo (kWh)
              </label>
              <input
                id="manual-consumption"
                type="text"
                inputMode="decimal"
                placeholder="Ej. 120"
                value={manualConsumption}
                onChange={(e) => setManualConsumption(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              />
            </div>
            <div>
              <label htmlFor="manual-total" className="mb-1 block text-sm font-medium text-neutral-700">
                Total de la factura (€)
              </label>
              <input
                id="manual-total"
                type="text"
                inputMode="decimal"
                placeholder="Ej. 45,50"
                value={manualTotal}
                onChange={(e) => setManualTotal(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              />
            </div>
            <div>
              <label htmlFor="manual-period" className="mb-1 block text-sm font-medium text-neutral-700">
                Periodo de facturación
              </label>
              <select
                id="manual-period"
                value={manualPeriod}
                onChange={(e) => setManualPeriod(Number(e.target.value))}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-base focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              >
                <option value={1}>Mensual (1 mes)</option>
                <option value={2}>Bimensual (2 meses)</option>
                <option value={3}>Trimestral (3 meses)</option>
              </select>
            </div>
            {manualError && (
              <p className="text-sm text-red-600">{manualError}</p>
            )}
            <button
              type="submit"
              className={cn(
                'w-full rounded-xl border border-neutral-900/15 py-3 text-base font-semibold text-neutral-900 transition-[filter]',
                'hover:brightness-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2'
              )}
              style={{ backgroundColor: AHORRO_LUZ_CTA_GREEN }}
            >
              Calcular ahorro
            </button>
          </form>
        </div>
        <p className="text-sm text-neutral-500">
          Un asesor te contactará en las próximas horas para ayudarte a ahorrar en tu factura.
        </p>
        {onReset && (
          <button type="button" onClick={onReset} className="text-sm font-medium text-neutral-900 underline-offset-4 hover:underline">
            Enviar otra solicitud
          </button>
        )}
      </div>
    );
  }

  if (comparison) {
    return (
      <div className="flex w-full flex-col items-center space-y-3 sm:space-y-6">
        <EnergySavingsResult
          data={{
            status: comparison.status,
            estimated_savings_amount: comparison.estimated_savings_amount,
            estimated_savings_percentage: comparison.estimated_savings_percentage,
            current_monthly_cost: comparison.current_monthly_cost,
            prudent_mode: comparison.prudent_mode ?? false,
          }}
        />
        <img
          src={RESULT_CELEBRATION_GIF}
          alt=""
          className="mx-auto h-auto max-h-36 w-auto max-w-[11.5rem] shrink-0 object-contain sm:max-h-none sm:max-w-sm"
          width={400}
          height={300}
          loading="lazy"
          decoding="async"
        />
        <p className="text-lg text-neutral-600">
          Un asesor te contactará en las próximas horas para ayudarte a ahorrar en tu factura.
        </p>
        {onReset && (
          <button type="button" onClick={onReset} className="text-lg font-medium text-neutral-900 underline-offset-4 hover:underline">
            Enviar otra solicitud
          </button>
        )}
      </div>
    );
  }

  return <p className="text-lg text-neutral-600">Un asesor te contactará en las próximas horas para ayudarte a ahorrar en tu factura.</p>;
}
