/**
 * Procesa factura y obtiene comparación de ahorro (polling hasta completed/failed).
 * Opcional: minLoaderMs, pdf_text del cliente para acelerar extracción en servidor.
 */

import { useState, useCallback, useRef } from 'react';

const PROCESS_API = import.meta.env.VITE_PROCESS_INVOICE_API_URL ?? '/api/process-invoice';
const COMPARISON_API = import.meta.env.VITE_ENERGY_COMPARISON_API_URL ?? '/api/energy-comparison';
const POLL_INTERVAL_MS = 1000;
const POLL_MAX_ATTEMPTS = 30;
const DEFAULT_MIN_LOADER_MS = 0;

export interface EnergyComparisonResult {
  id: string;
  lead_id: string;
  status: string;
  current_company: string | null;
  current_monthly_cost: number | null;
  best_offer_company: string | null;
  estimated_savings_amount: number | null;
  estimated_savings_percentage: number | null;
  prudent_mode: boolean | null;
  ocr_confidence: number | null;
  created_at: string;
  error_message?: string | null;
}

export interface ManualExtractionInput {
  consumption_kwh: number;
  total_factura: number;
  period_months?: number;
}

export interface RunEnergyComparisonOptions {
  /** Tiempo mínimo en pantalla de “procesando” antes de mostrar resultado. */
  minLoaderMs?: number;
  /** Texto PDF extraído en cliente (misma vía que el simulador del backoffice). */
  attachmentPdfText?: string | null;
}

export function useEnergyComparison() {
  const [status, setStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');
  const [comparison, setComparison] = useState<EnergyComparisonResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPendingTimer = () => {
    if (pendingTimerRef.current != null) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
  };

  const run = useCallback(async (
    leadId: string,
    attachmentPath: string,
    options?: RunEnergyComparisonOptions,
  ) => {
    const minLoaderMs = options?.minLoaderMs ?? DEFAULT_MIN_LOADER_MS;
    const pdfText =
      typeof options?.attachmentPdfText === 'string' && options.attachmentPdfText.trim() !== ''
        ? options.attachmentPdfText.trim()
        : undefined;

    const startedAt = Date.now();
    clearPendingTimer();
    setStatus('processing');
    setComparison(null);
    setError(null);
    abortRef.current = false;

    const scheduleFinish = (
      nextStatus: 'completed' | 'failed',
      nextComparison: EnergyComparisonResult | null,
      nextError: string | null,
    ) => {
      const elapsed = Date.now() - startedAt;
      const delay = Math.max(0, minLoaderMs - elapsed);
      clearPendingTimer();
      pendingTimerRef.current = setTimeout(() => {
        pendingTimerRef.current = null;
        if (abortRef.current) return;
        setComparison(nextComparison);
        setError(nextError);
        setStatus(nextStatus);
      }, delay);
    };

    try {
      const processRes = await fetch(PROCESS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: leadId,
          attachment_path: attachmentPath,
          ...(pdfText ? { pdf_text: pdfText } : {}),
        }),
      });
      const processData = await processRes.json().catch(() => ({}));

      if (!processRes.ok) {
        const msg =
          processRes.status === 429
            ? 'Demasiadas solicitudes. Por favor, espera un poco e inténtalo de nuevo.'
            : processData.error || 'Error al procesar la factura';
        scheduleFinish('failed', null, msg);
        return;
      }

      if (processData.comparison?.status === 'completed') {
        scheduleFinish('completed', processData.comparison as EnergyComparisonResult, null);
        return;
      }
      if (processData.comparison?.status === 'failed') {
        const failMsg =
          processData.comparison?.error_message || 'No se pudo calcular el ahorro';
        scheduleFinish('failed', null, failMsg);
        return;
      }

      let attempts = 0;
      while (!abortRef.current && attempts < POLL_MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (abortRef.current) break;
        const getRes = await fetch(`${COMPARISON_API}/${leadId}`);
        const getData = await getRes.json().catch(() => null);
        if (getData?.status === 'completed') {
          scheduleFinish('completed', getData as EnergyComparisonResult, null);
          return;
        }
        if (getData?.status === 'failed') {
          const failMsg = getData?.error_message || 'No se pudo calcular el ahorro';
          scheduleFinish('failed', null, failMsg);
          return;
        }
        attempts++;
      }

      if (abortRef.current) return;
      scheduleFinish('failed', null, 'Tiempo de espera agotado. Un asesor te contactará.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error de conexión';
      scheduleFinish('failed', null, msg);
    }
  }, []);

  const runWithManual = useCallback(async (leadId: string, data: ManualExtractionInput) => {
    clearPendingTimer();
    setStatus('processing');
    setComparison(null);
    setError(null);
    try {
      const res = await fetch(PROCESS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: leadId,
          manual_extraction: {
            consumption_kwh: data.consumption_kwh,
            total_factura: data.total_factura,
            period_months: data.period_months ?? 1,
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Error al calcular el ahorro');
        setStatus('failed');
        return;
      }
      const comp = json.comparison;
      if (comp?.status === 'completed') {
        setComparison(comp as EnergyComparisonResult);
        setError(null);
        setStatus('completed');
        return;
      }
      setError(comp?.error_message || 'No se pudo calcular el ahorro');
      setStatus('failed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de conexión');
      setStatus('failed');
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current = true;
    clearPendingTimer();
    setStatus('idle');
    setComparison(null);
    setError(null);
  }, []);

  return { status, comparison, error, run, runWithManual, reset };
}
