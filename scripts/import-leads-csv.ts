#!/usr/bin/env npx ts-node
/**
 * Script de importación de leads desde CSV/Excel (exportado a CSV)
 * Uso: npx ts-node scripts/import-leads-csv.ts archivo.csv
 * Variables: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';
import { createLead } from '../src/lib/leads/createLead';
import type { LeadInput } from '../src/lib/leads/types';

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Falta VITE_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);

const csvPath = process.argv[2];
if (!csvPath || !fs.existsSync(csvPath)) {
  console.error('Uso: npx ts-node scripts/import-leads-csv.ts archivo.csv');
  process.exit(1);
}

// Mapeo flexible de columnas (nombre, email, phone, etc.)
const COLUMN_ALIASES: Record<string, string[]> = {
  name: ['nombre', 'name', 'nombre_apellidos', 'full_name'],
  email: ['email', 'correo', 'e-mail'],
  phone: ['phone', 'telefono', 'tel', 'movil', 'movil'],
  source: ['source', 'origen', 'fuente'],
  campaign: ['campaign', 'campaña', 'campania'],
};

function findColumn(row: Record<string, string>, aliases: string[]): string | null {
  for (const a of aliases) {
    const key = Object.keys(row).find(
      (k) => k.toLowerCase().trim() === a || k.toLowerCase().includes(a)
    );
    if (key && row[key]?.trim()) return row[key].trim();
  }
  return null;
}

function mapRowToLead(row: Record<string, string>): LeadInput | null {
  const name = findColumn(row, COLUMN_ALIASES.name) ?? undefined;
  const email = findColumn(row, COLUMN_ALIASES.email) ?? undefined;
  const phone = findColumn(row, COLUMN_ALIASES.phone) ?? undefined;

  if (!email && !phone) return null;

  return {
    name,
    email: email || undefined,
    phone: phone || undefined,
    source: (findColumn(row, COLUMN_ALIASES.source) as LeadInput['source']) ?? 'csv_import',
    campaign: findColumn(row, COLUMN_ALIASES.campaign) ?? undefined,
  };
}

async function main() {
  const content = fs.readFileSync(path.resolve(csvPath), 'utf-8');
  const { data: rows, errors } = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
  });

  if (errors.length > 0) {
    console.warn('Errores de parseo:', errors);
  }

  const leads = rows.map(mapRowToLead).filter((l): l is LeadInput => l != null);
  console.log(`Procesando ${leads.length} leads...`);

  const { data: importRow } = await supabase
    .from('lead_imports')
    .insert({
      source: 'csv_import',
      raw_payload: { file: csvPath, rowCount: leads.length },
      status: 'pending',
    })
    .select('id')
    .single();
  const importId = importRow?.id;

  let ok = 0;
  let fail = 0;

  for (const input of leads) {
    const result = await createLead(supabase, input, {
      createInitialTask: false,
    });
    if (result.success) {
      ok++;
      process.stdout.write(result.isNew ? '.' : 'u');
    } else {
      fail++;
      console.error(`\nError: ${input.email ?? input.phone} - ${result.error}`);
    }
  }

  if (importId) {
    await supabase
      .from('lead_imports')
      .update({
        status: fail === 0 ? 'success' : 'partial',
        error: fail > 0 ? `${fail} fallos` : null,
      })
      .eq('id', importId);
  }

  console.log(`\nListo: ${ok} OK, ${fail} fallos`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
