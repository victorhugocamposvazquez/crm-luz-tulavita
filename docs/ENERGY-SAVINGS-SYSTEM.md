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

Migración: `supabase/migrations/20260216000001_energy_offers_and_comparisons.sql`.

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

## 6. Mejoras recomendadas (seguridad y coste)

- **Límite de tamaño** en storage (ya 10MB en bucket).
- **Rate limit** por lead o IP en `POST /api/process-invoice` para evitar abuso y coste de Document AI.
- **Validar** en backend que `attachment_path` pertenezca al lead o al bucket permitido.
- **Cache** por hash del archivo para no re-procesar el mismo fichero (opcional).
- **Cola asíncrona**: para timeouts largos, crear la fila en `processing` y procesar en job/Edge Function, y que el frontend solo haga polling.

---

## 7. Actualizar ofertas (sin tocar código)

Actualizar filas en `energy_offers` (Supabase Dashboard o API con `service_role`):

- `price_per_kwh`, `monthly_fixed_cost`, `active`.
- Añadir nuevas comercializadoras insertando filas con `company_name` único.
