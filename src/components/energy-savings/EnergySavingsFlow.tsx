/**
 * Flujo completo: procesar factura, loader, resultado de ahorro estimado
 */

import { useEffect } from 'react';
import { useEnergyComparison } from '@/hooks/useEnergyComparison';
import { EnergySavingsLoader } from './EnergySavingsLoader';
import { EnergySavingsResult } from './EnergySavingsResult';

export function EnergySavingsFlow({
  leadId,
  attachmentPath,
  onReset,
}: {
  leadId: string;
  attachmentPath: string;
  onReset?: () => void;
}) {
  const { status, comparison, error, run, reset } = useEnergyComparison();

  useEffect(() => {
    run(leadId, attachmentPath);
    return () => reset();
  }, [leadId, attachmentPath, run, reset]);

  if (status === 'processing') {
    return <EnergySavingsLoader />;
  }

  if (status === 'failed' && error) {
    return (
      <div className="space-y-4">
        <p className="text-lg text-gray-600">
          {error}
        </p>
        <p className="text-sm text-gray-500">
          Un asesor te contactará en las próximas horas para ayudarte a ahorrar en tu factura.
        </p>
        {onReset && (
          <button type="button" onClick={onReset} className="text-sm font-medium text-[#26606b] hover:underline">
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
