# Sistema de Gestión de Leads

## Estructura de carpetas

```
crm-luz-tulavita/
├── api/
│   └── leads.ts                 # POST /api/leads (Vercel Serverless)
├── src/lib/leads/
│   ├── index.ts                 # Exports públicos
│   ├── types.ts                 # Tipos TypeScript
│   ├── normalizer.ts             # Normalización de datos
│   ├── deduplicator.ts          # Lógica de deduplicación
│   └── createLead.ts            # Función principal createLead()
├── supabase/
│   ├── migrations/
│   │   └── 20260213000001_create_leads_tables.sql
│   └── functions/
│       ├── create-lead/         # Edge Function (alternativa a api/leads)
│       └── meta-lead-webhook/   # Webhook Meta Lead Ads
├── scripts/
│   └── import-leads-csv.ts      # Importación CSV
├── examples/
│   └── landing-form.html        # Ejemplo formulario web
└── docs/
    └── LEADS_SYSTEM.md          # Esta documentación
```

## Endpoint único: POST /api/leads

Todas las fuentes deben enviar datos a este endpoint:

```json
{
  "name": "Juan Pérez",
  "phone": "612345678",
  "email": "juan@ejemplo.com",
  "source": "web_form",
  "campaign": "landing-verano",
  "adset": "opcional",
  "ad": "opcional",
  "owner_id": "uuid-opcional",
  "tags": ["tag1"],
  "custom_fields": {},
  "create_initial_task": false
}
```

**Mínimo requerido:** `phone` O `email`

## Fuentes soportadas

| Fuente           | source value     | Cómo integrar                          |
|------------------|------------------|----------------------------------------|
| Formulario web   | `web_form`       | fetch() a /api/leads desde tu landing   |
| Meta Lead Ads    | `meta_lead_ads`  | Webhook → supabase/functions/meta-lead-webhook |
| Meta Ads + web   | `meta_ads_web`   | Formulario web con utm_campaign, etc.   |
| CSV/Excel        | `csv_import`     | `npx tsx scripts/import-leads-csv.ts archivo.csv` |
| Manual (CRM)     | `manual`         | UI del CRM → createLead()              |

## Flujo createLead()

1. **Validar** – Al menos phone o email
2. **Normalizar** – Teléfono E.164, email lowercase, source estandarizado
3. **Deduplicar** – Buscar por phone primero, luego por email
4. **Si existe** – Actualizar datos + evento `lead_updated`
5. **Si no existe** – Insertar + evento `lead_created`
6. **Automatizaciones** – Tarea inicial opcional (admin_tasks)

## RLS (Row Level Security)

- **Admins:** acceso total a leads, lead_events, lead_imports
- **Comerciales:** solo sus leads (owner_id = auth.uid())
- **service_role:** acceso completo (Edge Functions, api/leads)

## Despliegue

### Vercel (api/leads)

1. Variables de entorno: `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
2. El rewrite en vercel.json excluye /api/* del SPA

### Supabase Edge Functions

```bash
supabase functions deploy create-lead
supabase functions deploy meta-lead-webhook
```

URL: `https://[PROJECT_REF].supabase.co/functions/v1/create-lead`

### Meta Lead Ads – Configuración webhook

1. Meta Business Suite → Configuración → Webhooks
2. Suscribirse a "Leads"
3. URL: `https://[PROJECT_REF].supabase.co/functions/v1/meta-lead-webhook`
4. Token de verificación: definir `META_LEAD_VERIFY_TOKEN` en Supabase

## Script CSV

```bash
VITE_SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=xxx npx tsx scripts/import-leads-csv.ts leads.csv
```

Columnas reconocidas (flexible): nombre/name, email/correo, phone/telefono/tel, source, campaign.

## Decisiones técnicas

- **Un solo endpoint:** Facilita auditoría, rate limiting y lógica centralizada
- **Deduplicación phone > email:** Evita duplicados y mantiene historial
- **lead_events:** Auditoría y base para futuras automatizaciones
- **lead_imports:** Trazabilidad de fuentes externas (Meta, CSV)
- **RLS por owner:** Comerciales solo ven sus leads; admins todo
