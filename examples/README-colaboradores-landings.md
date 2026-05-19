# Landings de colaboradores

Fuentes:

- `tulavita-landing-compacta.html` → `/colaboradores/`
- `tulavita-landing-hibrida.html` → `/colaboradores/hibrida/`

## Generación

```bash
npm run build:landings
```

El script `scripts/build-colaboradores-landings.mjs` copia los HTML a `public/colaboradores/`, conecta el formulario a `POST /api/leads` (campañas `colaboradores_compacta` y `colaboradores_hibrida`), crea entrada en CRM vía `POST /api/lead-entries`, y aplica el mismo estilo de CTAs que `/ahorra-factura-luz` (verde `#88f082`, texto oscuro, bordes redondeados 12px).

Se ejecuta automáticamente en `npm run dev` (predev) y `npm run build`.

## Variables opcionales

- `VITE_COLABORADORES_WA_NUMBER` o `COLABORADORES_WA_NUMBER` — WhatsApp (solo dígitos, ej. `34612345678`)
- `VITE_COLABORADORES_TEL` o `COLABORADORES_TEL` — teléfono visible en la landing

## CRM

En **Dashboard → Colaboradores** hay enlaces para copiar y abrir ambas landings.
