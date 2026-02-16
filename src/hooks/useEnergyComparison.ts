/**
 * Procesa factura y obtiene comparación de ahorro (polling hasta completed/failed)
 */

import { useState, useCallback, useRef } from 'react';

const PROCESS_API = import.meta.env.VITE_PROCESS_INVOICE_API_URL ?? '/api/process-invoice';
const COMPARISON_API = import.meta.env.VITE_ENERGY_COMPARISON_API_URL ?? '/api/energy-comparison';
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 30;

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

export function useEnergyComparison() {
  const [status, setStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');
  const [comparison, setComparison] = useState<EnergyComparisonResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const run = useCallback(async (leadId: string, attachmentPath: string) => {
    setStatus('processing');
    setComparison(null);
    setError(null);
    abortRef.current = false;

    try {
      const processRes = await fetch(PROCESS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId, attachment_path: attachmentPath }),
      });
      const processData = await processRes.json().catch(() => ({}));

      if (!processRes.ok) {
        setError(processData.error || 'Error al procesar la factura');
        setStatus('failed');
        return;
      }

      if (processData.comparison?.status === 'completed') {
        setComparison(processData.comparison as EnergyComparisonResult);
        setStatus('completed');
        return;
      }
      if (processData.comparison?.status === 'failed') {
        setStatus('failed');
        setError(processData.comparison?.error_message || 'No se pudo calcular el ahorro');
        return;
      }

      let attempts = 0;
      while (!abortRef.current && attempts < POLL_MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (abortRef.current) break;
        const getRes = await fetch(`${COMPARISON_API}/${leadId}`);
        const getData = await getRes.json().catch(() => null);
        if (getData?.status === 'completed') {
          setComparison(getData as EnergyComparisonResult);
          setStatus('completed');
          return;
        }
        if (getData?.status === 'failed') {
          setStatus('failed');
          setError(getData?.error_message || 'No se pudo calcular el ahorro');
          return;
        }
        attempts++;
      }

      if (abortRef.current) return;
      setStatus('failed');
      setError('Tiempo de espera agotado. Un asesor te contactará.');
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

  return { status, comparison, error, run, reset };
}
