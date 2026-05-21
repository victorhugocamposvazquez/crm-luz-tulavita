# Flujos de colaboradores — referencia interna

Documentación de los dos funnels principales y las APIs involucradas.

## Funnel 1 — Reclutamiento de colaboradores

**Rutas:** `/colaboradores`, `/hazte-colaborador` (antes `/colaboradores/hibrida`, redirige)

**Objetivo:** Captar prospectos que quieren unirse al programa de colaboradores.

| Campo lead | Valor |
|------------|-------|
| `source` | `web_form` |
| `campaign` | `colaboradores_compacta` o `hazte_colaborador` |
| `status` | `contacted` (por defecto en API) |
| `custom_fields.landing_type` | `colaboradores` |
| `custom_fields.landing_variant` | `compacta` \| `hibrida` |

**Flujo:**

1. Prospecto rellena `TvForm` en la landing.
2. `POST /api/leads` crea el lead.
3. `POST /api/lead-entries` registra la entrada con UTMs y metadatos de campaña.
4. Admin contacta en CRM → **Convertir a colaborador** → genera kit (enlaces + QR + portal).

**URL opcional (F4):** `?ref={token_reclutador}` atribuye al colaborador referidor (`referred_by_collaborator_id`).

---

## Funnel 2 — Captación de clientes vía colaborador

**Ruta:** `/ahorra-factura-luz`

**Objetivo:** Cliente final ahorra en luz; el lead se atribuye al colaborador.

| Param URL | Uso |
|-----------|-----|
| `?ref={token}` | Enlace firmado (revocable, recomendado) |
| `?collaborator={code}` | Enlace directo por código |
| `?entry=upload\|manual\|callback` | Override de modo de entrada |

| Campo lead | Valor |
|------------|-------|
| `source` | `collaborator_referral` |
| `campaign` | `collaborator:{code}` |
| `collaborator_id` | UUID del colaborador activo |

**Modos (`entry_mode`):**

| Modo | UX |
|------|-----|
| `auto` | Hero completo → opción subir factura |
| `upload` | Salta a subida de factura |
| `manual` | kWh + importe sin PDF |
| `callback` | Solo contacto |

**APIs:**

- `POST /api/resolve-collaborator-ref` — resuelve token o código.
- `POST /api/leads` — crea lead con `collaborator_id`.
- `POST /api/lead-entries` — entrada CRM.
- `POST /api/process-invoice` — procesa factura adjunta.

---

## Funnel 3 — Portal colaborador (autoservicio)

**Ruta:** `/colaborador/acceso?token={access_token}`

**Objetivo:** Colaborador activo copia enlaces/QR, registra clientes off-landing y sube facturas de comisión.

**APIs:**

- `POST /api/resolve-collaborator-portal` — valida token y devuelve datos del colaborador.
- `POST /api/collaborator-submit-lead` — nuevo cliente atribuido (contacto + factura opcional).
- `POST /api/collaborator-invoice` — factura de comisión vinculada a liquidación.

---

## Payloads API

### POST /api/leads

```json
{
  "name": "María García",
  "phone": "612345678",
  "email": "maria@example.com",
  "source": "web_form",
  "campaign": "colaboradores_compacta",
  "collaborator_id": "uuid-opcional",
  "custom_fields": {
    "landing_type": "colaboradores",
    "landing_variant": "compacta"
  }
}
```

Respuesta: `{ "success": true, "lead": { "id": "..." }, "isNew": true }`

### POST /api/lead-entries

```json
{
  "lead_id": "uuid",
  "source": "web_form",
  "campaign": "colaboradores_compacta",
  "adset": "utm_term",
  "ad": "utm_content",
  "collaborator_id": null,
  "custom_fields": {
    "landing_variant": "compacta",
    "utm_source": "facebook",
    "fbclid": "..."
  }
}
```

### POST /api/resolve-collaborator-ref

```json
{ "ref": "token-firmado", "code": "marta-zona-sur" }
```

Respuesta: `{ "success": true, "collaborator": { "id", "code", "name" }, "entry_mode": "auto" }`

### POST /api/collaborator-submit-lead

```json
{
  "access_token": "...",
  "name": "Cliente",
  "phone": "612345678",
  "email": "cliente@example.com",
  "entry_mode": "upload",
  "attachment_base64": "data:application/pdf;base64,...",
  "attachment_name": "factura.pdf",
  "manual_extraction": { "consumption_kwh": 350, "total_factura": 89.5 }
}
```

---

## Tablas Supabase relevantes

| Tabla | Uso |
|-------|-----|
| `collaborators` | Colaboradores activos |
| `collaborator_referral_links` | Tokens de captación cliente |
| `collaborator_access_tokens` | Tokens de portal autoservicio |
| `collaborator_payouts` | Liquidaciones |
| `collaborator_invoices` | Facturas de comisión del colaborador |
| `leads.referred_by_collaborator_id` | Referidor en reclutamiento |

---

## Archivos clave

| Área | Archivos |
|------|----------|
| Admin | `src/components/dashboard/CollaboratorsManagement.tsx` |
| Kit / QR | `src/lib/collaborators/*`, `src/components/dashboard/CollaboratorKitMenu.tsx` |
| Portal | `src/pages/ColaboradorPortal.tsx` |
| Landings reclutamiento | `src/hooks/useColaboradoresLeadSubmit.ts` |
| Captación cliente | `src/hooks/useCollaboratorReferral.ts`, `src/pages/AhorroLuz.tsx` |
| CRM leads | `src/components/dashboard/LeadsManagement.tsx`, `LeadDetailSheet.tsx` |
