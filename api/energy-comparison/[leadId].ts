/**
 * GET /api/energy-comparison/:leadId
 * Devuelve la última comparación de ahorro para el lead.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const cors = () => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  };

  if (req.method === 'OPTIONS') {
    cors();
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    cors();
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const leadId = req.query.leadId as string | undefined;
  if (!leadId) {
    cors();
    res.status(400).json({ error: 'leadId es obligatorio', code: 'VALIDATION_ERROR' });
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    cors();
    res.status(500).json({ error: 'Configuración Supabase incompleta', code: 'CONFIG_ERROR' });
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('energy_comparisons')
    .select('id, lead_id, current_company, current_monthly_cost, best_offer_company, estimated_savings_amount, estimated_savings_percentage, status, ocr_confidence, prudent_mode, error_message, created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    cors();
    res.status(500).json({ error: error.message, code: 'DB_ERROR' });
    return;
  }

  cors();
  res.status(200).json(data ?? null);
}
