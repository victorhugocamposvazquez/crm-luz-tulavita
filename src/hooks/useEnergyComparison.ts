/**
 * Procesa factura y obtiene comparación de ahorro (polling hasta completed/failed).
 * El loader se muestra al menos MIN_LOADER_MS para que el usuario vea el progreso.
 */

import { useState, useCallback, useRef } from 'react';

const PROCESS_API = import.meta.env.VITE_PROCESS_INVOICE_API_URL ?? '/api/process-invoice';
const COMPARISON_API = import.meta.env.VITE_ENERGY_COMPARISON_API_URL ?? '/api/energy-comparison';
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 30;
/** Tiempo mínimo mostrando el loader para que se vea la secuencia (no parpadeo). */
const MIN_LOADER_MS = 2500;

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
}

export interface ManualExtractionInput {
  consumption_kwh: number;
  total_factura: number;
  period_months?: number;
}

export function useEnergyComparison() {
  const [status, setStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');
  const [comparison, setComparison] = useState<EnergyComparisonResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const run = useCallback(async (leadId: string, attachmentPath: string) => {
    const startedAt = Date.now();
    setStatus('processing');
    setComparison(null);
    setError(null);
    abortRef.current = false;

    const applyResult = (
      nextStatus: 'completed' | 'failed',
      nextComparison: EnergyComparisonResult | null,
      nextError: string | null
    ) => {
      const elapsed = Date.now() - startedAt;
      const delay = Math.max(0, MIN_LOADER_MS - elapsed);
      const apply = () => {
        if (abortRef.current) return;
        setComparison(nextComparison);
        setError(nextError);
        setStatus(nextStatus);
      };
      if (delay > 0) setTimeout(apply, delay);
      else apply();
    };

    try {
      const processRes = await fetch(PROCESS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId, attachment_path: attachmentPath }),
      });
      const processData = await processRes.json().catch(() => ({}));

      if (!processRes.ok) {
        const msg =
          processRes.status === 429
            ? 'Demasiadas solicitudes. Por favor, espera un poco e inténtalo de nuevo.'
            : processData.error || 'Error al procesar la factura';
        applyResult('failed', null, msg);
        return;
      }

      if (processData.comparison?.status === 'completed') {
        applyResult('completed', processData.comparison as EnergyComparisonResult, null);
        return;
      }
      if (processData.comparison?.status === 'failed') {
        applyResult(
          'failed',
          null,
          processData.comparison?.error_message || 'No se pudo calcular el ahorro'
        );
        return;
      }

      let attempts = 0;
      while (!abortRef.current && attempts < POLL_MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (abortRef.current) break;
        const getRes = await fetch(`${COMPARISON_API}/${leadId}`);
        const getData = await getRes.json().catch(() => null);
        if (getData?.status === 'completed') {
          applyResult('completed', getData as EnergyComparisonResult, null);
          return;
        }
        if (getData?.status === 'failed') {
          applyResult('failed', null, getData?.error_message || 'No se pudo calcular el ahorro');
          return;
        }
        attempts++;
      }

      if (abortRef.current) return;
      applyResult('failed', null, 'Tiempo de espera agotado. Un asesor te contactará.');
    } catch (e) {
      applyResult('failed', null, e instanceof Error ? e.message : 'Error de conexión');
    }
  }, []);

  /** Plan B: calcular ahorro con datos introducidos por el usuario (sin procesar archivo). */
  const runWithManual = useCallback(async (leadId: string, data: ManualExtractionInput) => {
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
    setStatus('idle');
    setComparison(null);
    setError(null);
  }, []);

  return { status, comparison, error, run, runWithManual, reset };
}
