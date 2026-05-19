# Landings de colaboradores (React)

Las landings públicas viven en el CRM como páginas React (Vite + React Router), no como HTML estático.

## Rutas

| Variante | URL | Componente |
|----------|-----|------------|
| Compacta | `/colaboradores` | `src/pages/ColaboradoresCompacta.tsx` |
| Híbrida | `/colaboradores/hibrida` | `src/pages/ColaboradoresHibrida.tsx` |

## Código

- Estilos: `src/components/colaboradores/colaboradores-landing.css`
- Componentes compartidos: `src/components/colaboradores/colaboradores-shared.tsx`
- Bot Lara (solo híbrida): `src/components/colaboradores/TvBot.tsx`
- Envío de leads: `src/hooks/useColaboradoresLeadSubmit.ts`

Los archivos `examples/tulavita-landing-*.html` son la referencia de diseño original (export bundler); el código activo está en `src/components/colaboradores/`.

## Variables opcionales

- `VITE_COLABORADORES_WA_NUMBER` — WhatsApp (solo dígitos)
- `VITE_COLABORADORES_TEL` — teléfono visible

## CRM

En **Dashboard → Colaboradores** hay enlaces para copiar y abrir ambas rutas.
