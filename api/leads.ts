/**
 * POST /api/leads - Endpoint único para creación de leads
 * Todas las fuentes (web, Meta, CSV, manual) pasan por aquí
 * Deploy: Vercel Serverless
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createLead } from '../src/lib/leads/createLead';
import type { LeadInput } from '../src/lib/leads/types';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.status(200).setHeader('Access-Control-Allow-Origin', '*').end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    res.status(500).json({ error: 'Configuración de Supabase incompleta' });
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const input: LeadInput = {
      name: body.name,
      phone: body.phone,
      email: body.email,
      source: body.source ?? 'web_form',
      campaign: body.campaign,
      adset: body.adset,
      ad: body.ad,
      status: body.status,
      owner_id: body.owner_id,
      tags: body.tags,
      custom_fields: body.custom_fields,
    };

    const result = await createLead(supabase, input, {
      defaultOwnerId: body.default_owner_id,
      createInitialTask: body.create_initial_task ?? false,
    });

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(200).setHeader('Access-Control-Allow-Origin', '*').json(result);
  } catch (e) {
    console.error('[api/leads]', e);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      code: 'INTERNAL_ERROR',
    });
  }
}
