/**
 * Flujo completo: procesar factura, loader, resultado de ahorro estimado.
 * Si la extracción automática falla, se muestra un formulario para introducir consumo y total (plan B).
 */

import { useEffect, useState } from 'react';
import { useEnergyComparison } from '@/hooks/useEnergyComparison';
import { EnergySavingsLoader } from './EnergySavingsLoader';
import { EnergySavingsResult } from './EnergySavingsResult';
import { cn } from '@/lib/utils';

const BRAND = '#26606b';

export function EnergySavingsFlow({
  leadId,
  attachmentPath,
  onReset,
}: {
  leadId: string;
  attachmentPath: string;
  onReset?: () => void;
}) {
  const { status, comparison, error, run, runWithManual, reset } = useEnergyComparison();
  const [manualConsumption, setManualConsumption] = useState('');
  const [manualTotal, setManualTotal] = useState('');
  const [manualPeriod, setManualPeriod] = useState<number>(1);
  const [manualError, setManualError] = useState<string | null>(null);

  useEffect(() => {
    run(leadId, attachmentPath);
    return () => reset();
  }, [leadId, attachmentPath, run, reset]);

  if (status === 'processing') {
    return <EnergySavingsLoader />;
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
        <p className="text-lg text-gray-600">
          {error}
        </p>
        <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 sm:p-5">
          <p className="mb-3 font-medium text-gray-800">
            Introduce los datos de tu factura para ver tu ahorro estimado
          </p>
          <form onSubmit={handleManualSubmit} className="space-y-4">
            <div>
              <label htmlFor="manual-consumption" className="mb-1 block text-sm font-medium text-gray-700">
                Consumo (kWh)
              </label>
              <input
                id="manual-consumption"
                type="text"
                inputMode="decimal"
                placeholder="Ej. 120"
                value={manualConsumption}
                onChange={(e) => setManualConsumption(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-[#26606b] focus:outline-none focus:ring-1 focus:ring-[#26606b]"
              />
            </div>
            <div>
              <label htmlFor="manual-total" className="mb-1 block text-sm font-medium text-gray-700">
                Total de la factura (€)
              </label>
              <input
                id="manual-total"
                type="text"
                inputMode="decimal"
                placeholder="Ej. 45,50"
                value={manualTotal}
                onChange={(e) => setManualTotal(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-[#26606b] focus:outline-none focus:ring-1 focus:ring-[#26606b]"
              />
            </div>
            <div>
              <label htmlFor="manual-period" className="mb-1 block text-sm font-medium text-gray-700">
                Periodo de facturación
              </label>
              <select
                id="manual-period"
                value={manualPeriod}
                onChange={(e) => setManualPeriod(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-[#26606b] focus:outline-none focus:ring-1 focus:ring-[#26606b]"
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
                'w-full rounded-xl py-3 text-base font-medium text-white transition-opacity',
                'hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-offset-2'
              )}
              style={{ backgroundColor: BRAND }}
            >
              Calcular ahorro
            </button>
          </form>
        </div>
        <p className="text-sm text-gray-500">
          Un asesor te contactará en las próximas horas para ayudarte a ahorrar en tu factura.
        </p>
        {onReset && (
          <button type="button" onClick={onReset} className="text-sm font-medium hover:underline" style={{ color: BRAND }}>
            Enviar otra solicitud
          </button>
        )}
      </div>
    );
  }

  if (comparison) {
    return (
      <div className="space-y-6">
        <EnergySavingsResult
          data={{
            status: comparison.status,
            estimated_savings_amount: comparison.estimated_savings_amount,
            estimated_savings_percentage: comparison.estimated_savings_percentage,
            prudent_mode: comparison.prudent_mode ?? false,
          }}
        />
        <p className="text-lg text-gray-600">
          Un asesor te contactará en las próximas horas para ayudarte a ahorrar en tu factura.
        </p>
        {onReset && (
          <button type="button" onClick={onReset} className="text-lg font-medium hover:underline" style={{ color: '#26606b' }}>
            Enviar otra solicitud
          </button>
        )}
      </div>
    );
  }

  return (
    <p className="text-lg text-gray-600">
      Un asesor te contactará en las próximas horas para ayudarte a ahorrar en tu factura.
    </p>
  );
}
