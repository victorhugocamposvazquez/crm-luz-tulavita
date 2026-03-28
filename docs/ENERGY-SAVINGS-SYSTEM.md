# Sistema de cálculo de ahorro energético

Sistema completo de extracción de facturas (PDF/imagen), cálculo de ahorro estimado y presentación en landing/CRM.

---

## 1. Flujo

1. **Subida**: El cliente sube PDF o foto de factura en el formulario (bucket `lead-attachments`).
2. **Procesamiento**: Tras enviar el formulario, si hay factura se llama a `POST /api/process-invoice` con `lead_id` y `attachment_path`.
3. **Extracción**: Backend descarga el archivo y lo envía a **GPT-4o via OpenAI Responses API**. Para PDFs, la API extrae texto y renderiza cada página internamente. Para imágenes, se envían directamente como base64.
4. **Campos**: Se extraen `company_name`, `consumption_kwh`, `total_factura`, periodo, potencia contratada (P1/P2/P3), precios por tramo, tipo de tarifa, CUPS y titular.
5. **Cálculo**: Se comparan ofertas activas en `energy_offers` (excluyendo la misma comercializadora), se elige la de mayor ahorro usando la potencia real extraída, y se guarda en `energy_comparisons`.
6. **Frontend**: Loader con mensajes rotativos → pantalla de resultado con ahorro estimado, texto legal y reglas de presentación.

---

## 2. Base de datos

- **energy_offers**: `company_name`, `price_per_kwh`, `p1`, `p2`, `monthly_fixed_cost`, `active`.
- **energy_comparisons**: `lead_id`, `current_company`, `current_monthly_cost`, `best_offer_company`, `estimated_savings_amount`, `estimated_savings_percentage`, `status` (processing | completed | failed), `prudent_mode`, `ocr_confidence`, `raw_extraction` (JSON con todos los campos extendidos), etc.
- **process_invoice_rate_log**: `ip`, `created_at` — para rate limit por IP.

---

## 3. Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/process-invoice` | Body: `{ lead_id, attachment_path }`. Procesa factura, calcula ahorro, guarda en `energy_comparisons`. Timeout 55s. |
| GET | `/api/energy-comparison/:leadId` | Devuelve la última comparación del lead. |

---

## 4. Extracción con GPT-4o Vision

La extracción usa la **Responses API de OpenAI** (`/v1/responses`) con modelo `gpt-4o`.

- **PDFs**: se envían como `input_file` con base64. La API extrae texto y renderiza cada página internamente.
- **Imágenes**: se envían como `input_image` con base64 en detalle `high`.
- **Prompt estructurado**: el modelo devuelve un JSON con todos los campos necesarios para la oferta energética.
- **Sin dependencias externas**: no requiere Google Cloud, Document AI, ni conversión previa de PDF a imágenes.

### Campos extraídos

| Campo | Descripción |
|-------|-------------|
| `company_name` | Comercializadora (normalizada) |
| `consumption_kwh` | Consumo total del periodo (kWh) |
| `total_factura` | Importe total IVA incluido (€) |
| `period_start` / `period_end` | Fechas del periodo facturado |
| `period_months` | Duración del periodo (1-12) |
| `potencia_contratada_kw` | Potencia contratada (kW) |
| `potencia_p1_kw` / `p2_kw` / `p3_kw` | Potencias por tramo |
| `precio_energia_kwh` | Precio medio del kWh |
| `precio_p1_kwh` / `p2_kwh` / `p3_kwh` | Precios por tramo horario |
| `tipo_tarifa` | Tipo de tarifa (2.0TD, 3.0TD, etc.) |
| `cups` | Código CUPS del punto de suministro |
| `titular` | Nombre del titular del contrato |

### Variable de entorno requerida

```
OPENAI_API_KEY=sk-...
```

### Coste estimado

- ~$0.008 por factura (1-3 páginas, con `detail: high`)
- ~$80 por 10.000 facturas

---

## 5. Reglas de presentación (frontend)

- Porcentaje redondeado **hacia abajo** (ej. 17,38% → 17%).
- Mostrar **€ antes que %** cuando se muestra cifra exacta.
- Ahorro **< 8–10%**: mensaje neutro: "Hemos detectado una oportunidad de optimización en tu tarifa".
- **Modo prudente** (ahorro > 45%, consumo fuera de rango, o confianza OCR < 0,8): no mostrar cifra exacta, mismo mensaje neutro.
- Siempre texto legal: "Cálculo estimado basado en los datos de tu factura."

---

## 6. Seguridad y rate limit

- **Validación de `attachment_path`**: solo rutas relativas, sin `..` ni `/` inicial, extensión permitida (pdf, jpg, png, webp, gif), longitud máxima 500.
- **Rate limit por lead**: máximo **3** solicitudes por `lead_id` por hora.
- **Rate limit por IP**: máximo **20** solicitudes por IP por hora.
- **Límite de tamaño**: archivos hasta 20 MB; bucket `lead-attachments` limitado a 10 MB.

---

## 7. Actualizar ofertas (sin tocar código)

Actualizar filas en `energy_offers` (Supabase Dashboard o API con `service_role`):

- `price_per_kwh`, `monthly_fixed_cost`, `p1`, `p2`, `active`.
- Añadir nuevas comercializadoras insertando filas con `company_name` único.

---

## 8. Archivos del sistema

| Archivo | Función |
|---------|---------|
| `server-lib/invoice/types.ts` | Tipos: `InvoiceExtraction` con campos extendidos |
| `server-lib/invoice/llm-extract.ts` | Extracción via GPT-4o (Responses API + Chat Completions fallback) |
| `server-lib/invoice/pipeline.ts` | Orquestación: buffer → LLM → resultado |
| `server-lib/energy/calculation.ts` | Cálculo de ahorro con potencia real |
| `api/process-invoice.ts` | Endpoint Vercel: descarga, extrae, compara, guarda |
| `server-lib/invoice/validate-path.ts` | Validación de rutas de attachment |
