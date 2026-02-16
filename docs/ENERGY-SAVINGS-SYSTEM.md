# Sistema de cálculo de ahorro energético

Sistema completo de extracción de facturas (PDF/imagen), cálculo de ahorro estimado y presentación en landing/CRM.

---

## 1. Flujo

1. **Subida**: El cliente sube PDF o foto de factura en el formulario (bucket `lead-attachments`).
2. **Procesamiento**: Tras enviar el formulario, si hay factura se llama a `POST /api/process-invoice` con `lead_id` y `attachment_path`.
3. **Extracción**: Backend descarga el archivo, extrae texto (PDF con texto → `pdf-parse`; PDF sin texto o imagen → **Google Document AI OCR**).
4. **Campos**: Se extraen `company_name`, `consumo_kwh`, `total_factura`, periodo (normalizado a mensual si es bimensual).
5. **Cálculo**: Se comparan ofertas activas en `energy_offers` (excluyendo la misma comercializadora), se elige la de mayor ahorro y se guarda en `energy_comparisons`.
6. **Frontend**: Loader con mensajes rotativos → pantalla de resultado con ahorro estimado, texto legal y reglas de presentación.

---

## 2. Base de datos

- **energy_offers**: `company_name`, `price_per_kwh`, `monthly_fixed_cost`, `active`. Seed: Iberdrola, Endesa, Naturgy, Repsol.
- **energy_comparisons**: `lead_id`, `current_company`, `current_monthly_cost`, `best_offer_company`, `estimated_savings_amount`, `estimated_savings_percentage`, `status` (processing | completed | failed), `prudent_mode`, `ocr_confidence`, `raw_extraction`, etc.
- **process_invoice_rate_log**: `ip`, `created_at` — para rate limit por IP (se purgan filas antiguas en cada request).

Migraciones: `20260216000001_energy_offers_and_comparisons.sql`, `20260217000001_process_invoice_rate_limit.sql`.

---

## 3. Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/process-invoice` | Body: `{ lead_id, attachment_path }`. Procesa factura, calcula ahorro, guarda en `energy_comparisons`. Timeout 10s. |
| GET | `/api/energy-comparison/:leadId` | Devuelve la última comparación del lead. |

---

## 4. Google Document AI (opcional)

Si no se configura, solo se usa extracción de texto de PDF con `pdf-parse` (PDFs con texto embebido). Para **imágenes** o **PDFs escaneados** hace falta OCR.

Variables de entorno:

- `GOOGLE_CLOUD_PROJECT` o `DOCUMENT_AI_PROJECT_ID`
- `DOCUMENT_AI_LOCATION` (ej. `eu`)
- `DOCUMENT_AI_PROCESSOR_ID`
- `GOOGLE_APPLICATION_CREDENTIALS_JSON`: contenido del JSON de la cuenta de servicio (o base64).

---

## 5. Reglas de presentación (frontend)

- Porcentaje redondeado **hacia abajo** (ej. 17,38% → 17%).
- Mostrar **€ antes que %** cuando se muestra cifra exacta.
- Ahorro **< 8–10%**: mensaje neutro: "Hemos detectado una oportunidad de optimización en tu tarifa".
- **Modo prudente** (ahorro > 45%, consumo fuera de rango, o confianza OCR < 0,8): no mostrar cifra exacta, mismo mensaje neutro.
- Siempre texto legal: "Cálculo estimado basado en los datos de tu factura."

---

## 6. Seguridad y rate limit (aplicado)

- **Validación de `attachment_path`**: solo rutas relativas, sin `..` ni `/` inicial, extensión permitida (pdf, jpg, png, webp, gif), longitud máxima 500. Ver `api/lib/invoice/validate-path.ts`.
- **Rate limit por lead**: máximo **3** solicitudes por `lead_id` por hora (contando filas en `energy_comparisons`).
- **Rate limit por IP**: máximo **20** solicitudes por IP por hora. Se usa la tabla `process_invoice_rate_log` (se purgan filas de más de 2 horas en cada request).
- Respuesta **429** con `code: RATE_LIMIT_LEAD` o `RATE_LIMIT_IP`; el frontend muestra mensaje amigable.
- **Límite de tamaño** en storage: bucket `lead-attachments` ya limitado a 10MB.
- **Cola asíncrona** (opcional): para timeouts largos, se puede crear la fila en `processing` y procesar con un job o Edge Function; el frontend ya hace polling.

---

## 7. Actualizar ofertas (sin tocar código)

Actualizar filas en `energy_offers` (Supabase Dashboard o API con `service_role`):

- `price_per_kwh`, `monthly_fixed_cost`, `active`.
- Añadir nuevas comercializadoras insertando filas con `company_name` único.
