# CRM operativo y atribución Meta

Resumen de cambios y funcionalidad actual del sistema de leads (atribución en landing y CRM con entradas, conversaciones y mensajes).

---

## 1. Atribución Meta (landing AhorroLuz)

**Objetivo:** Registrar correctamente `source`, `campaign`, `adset` y `ad` cuando el tráfico viene de Meta (utm_* / fbclid).

- **`src/hooks/useMetaAttribution.ts`**
  - Lee de la URL: `utm_source`, `utm_campaign`, `utm_content`, `utm_term`, `fbclid`.
  - **Mapeo:**
    - `source`: si `utm_source` incluye `'facebook'` o existe `fbclid` → `'meta_ads_web'`, si no → `'web_form'`.
    - `campaign` ← `utm_campaign`, `adset` ← `utm_term`, `ad` ← `utm_content`.
  - Persistencia en **localStorage**; se limpia tras envío correcto del formulario.

- **Prioridad en el formulario:** primero valores de la URL (atribución), luego defaults del config; nunca al revés.

- **Landing:** AhorroLuz usa el hook y pasa `attribution` y `clearAttribution` a `useFormState`. No se modifican preguntas ni comportamiento visible.

---

## 2. CRM operativo (entradas, conversaciones, mensajes)

**Objetivo:** Múltiples entradas por lead, conversaciones por canal y timeline unificado.

### Base de datos (nuevas tablas; no se modifica `leads` ni `/api/leads`)

| Tabla | Uso |
|-------|-----|
| **lead_entries** | Cada envío (formulario, Lead Ad, etc.): `lead_id`, `source`, `campaign`, `adset`, `ad`, `custom_fields`, `created_at`. |
| **lead_conversations** | Una conversación por lead/canal: `lead_id`, `channel` (whatsapp \| call \| email), `status` (open \| closed). |
| **lead_messages** | Mensajes de cada conversación: `conversation_id`, `direction` (inbound \| outbound), `content`, `status`, `user_id`, `created_at`. |

RLS: admins ven todo; comerciales solo leads con `owner_id = auth.uid()`.

### API

- **POST /api/leads** — Sin cambios: crea/actualiza lead (dedup por teléfono/email).
- **POST /api/lead-entries** (nuevo): recibe `lead_id`, `source`, `campaign`, `adset`, `ad`, `custom_fields`; crea una fila en `lead_entries` y una en `lead_conversations` (canal `whatsapp`, `open`).

### Flujo landing → CRM

- Tras un envío correcto a `/api/leads`, si la respuesta trae `lead.id`, el front hace **POST /api/lead-entries** con ese `lead_id` y la atribución (source, campaign, adset, ad, custom_fields).
- Configurado en AhorroLuz con `leadEntryApiUrl` (por defecto `/api/lead-entries`). Así cada envío genera una entrada en `lead_entries` y una conversación inicial, sin modificar preguntas ni comportamiento visible.

### Tipos y hooks

- **`src/types/crm.ts`:** `LeadEntry`, `LeadConversation`, `LeadMessage`, canales, estados, inputs de creación.
- **`src/hooks/useConversation.ts`:** dado un `leadId`, carga eventos, conversaciones y mensajes; devuelve **timeline** (eventos + mensajes ordenados por fecha), `getOrCreateConversation(channel)`, `sendOutboundMessage(conversationId, content)` y `refetch`.

---

## 3. Detalle de lead en el CRM (LeadDetailSheet)

- **Botones de contacto:** WhatsApp, Llamar, Email.
  - Abren `wa.me`, `tel:` o `mailto:` y registran un mensaje **outbound** en la conversación del canal (creando la conversación si no existe).
  - Si el lead está en estado **new**, se pasa a **contacted** al usar cualquiera de estas acciones.

- **Timeline:** una sola lista por lead con:
  - **Eventos:** lead_created, lead_updated, nota (desde `lead_events`).
  - **Mensajes:** enviados/recibidos por canal (WhatsApp, llamada, email) desde `lead_messages`.
  - Ordenados por fecha (más recientes primero).

- Notas: se siguen guardando en `lead_events` (tipo `note`) y se refresca el timeline con `refetch`.

---

## 4. Pipeline y fuentes

- **Estados del lead (existentes):** new, contacted, qualified, converted, lost.
- **Fuentes soportadas:** meta_lead_ads, meta_ads_web, web_form, manual, csv_import.
- **Automatización actual:** primer contacto desde el CRM (WhatsApp, Llamar o Email) → lead pasa de **new** a **contacted**.

---

## 5. Archivos tocados / añadidos

| Ámbito | Archivos |
|--------|----------|
| Atribución | `src/hooks/useMetaAttribution.ts` (nuevo), `useFormState.ts`, `types.ts` (FormConfig, LeadPayload), `AhorroLuz.tsx`, `MultiStepForm.tsx` |
| CRM DB | `supabase/migrations/20260215000001_crm_lead_entries_conversations_messages.sql` (nuevo) |
| Tipos / API | `src/types/crm.ts` (nuevo), `api/lead-entries.ts` (nuevo), `src/integrations/supabase/types.ts` (tablas nuevas) |
| Formulario → CRM | `useFormState.ts` (`leadEntryApiUrl`), `types.ts` y `MultiStepForm.tsx` (config), `AhorroLuz.tsx` (`leadEntryApiUrl`) |
| CRM UI | `src/hooks/useConversation.ts` (nuevo), `LeadDetailSheet.tsx` (botones WhatsApp/Llamar/Email, timeline unificado) |

---

## 6. Funcionalidad actual en una frase

- **Landing:** Atribución Meta por URL (utm_* / fbclid) con prioridad sobre el config, persistida hasta el envío; cada envío crea/actualiza el lead y, si está configurado, crea `lead_entry` y conversación inicial.
- **CRM:** Por lead se ven sus entradas (origen/campaña), conversaciones por canal (WhatsApp, llamada, email), mensajes y eventos en un único timeline; acciones “WhatsApp / Llamar / Email” abren el canal y registran el contacto, y el estado puede pasar de new a contacted.

---

## Aplicar cambios

1. **Migración** (Supabase):
   ```bash
   supabase db push
   ```
   o ejecutar manualmente el SQL de `supabase/migrations/20260215000001_crm_lead_entries_conversations_messages.sql`.

2. **Despliegue:** incluir `api/lead-entries.ts` (Vercel sirve `/api/lead-entries` desde ese archivo).

3. **Landing:** AhorroLuz ya usa `leadEntryApiUrl`. En producción, opcional: `VITE_LEAD_ENTRIES_API_URL` si la URL del API es distinta.
