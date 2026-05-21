# Landings de colaboradores (React)

Las landings públicas viven en el CRM como páginas React (Vite + React Router), no como HTML estático.

## Rutas

| Variante | URL | Componente |
|----------|-----|------------|
| Compacta | `/colaboradores` | `src/pages/ColaboradoresCompacta.tsx` |
| Hazte colaborador | `/hazte-colaborador` | `src/pages/ColaboradoresHibrida.tsx` |
| Portal colaborador | `/colaborador/acceso?token=...` | `src/pages/ColaboradorPortal.tsx` |

## Código

- Estilos: `src/components/colaboradores/colaboradores-landing.css`
- Componentes compartidos: `src/components/colaboradores/colaboradores-shared.tsx`
- Bot Lara (solo híbrida): `src/components/colaboradores/TvBot.tsx`
- Envío de leads: `src/hooks/useColaboradoresLeadSubmit.ts`
- Kit admin (enlaces/QR): `src/lib/collaborators/*`, `CollaboratorKitMenu.tsx`

Los archivos `examples/tulavita-landing-*.html` son la referencia de diseño original (export bundler); el código activo está en `src/components/colaboradores/`.

## Variables opcionales

- `VITE_COLABORADORES_WA_NUMBER` — WhatsApp (solo dígitos)
- `VITE_COLABORADORES_TEL` — teléfono visible

## CRM

En **Dashboard → Colaboradores** hay enlaces para copiar y abrir ambas rutas, kit de captación (4 modos + QR + portal) y leads de reclutamiento.

## Flujos y payloads API

Ver documentación completa en [`docs/COLABORADORES-FLOWS.md`](../docs/COLABORADORES-FLOWS.md).

### Funnel reclutamiento → POST /api/leads

```json
{
  "name": "Ana López",
  "phone": "612345678",
  "email": "ana@example.com",
  "source": "web_form",
  "campaign": "colaboradores_compacta",
  "custom_fields": {
    "landing_type": "colaboradores",
    "landing_variant": "compacta"
  }
}
```

Seguido de `POST /api/lead-entries` con UTMs y metadatos de campaña.

### Funnel captación cliente → /ahorra-factura-luz

Enlace firmado: `/ahorra-factura-luz?ref={token}`  
Enlace directo: `/ahorra-factura-luz?collaborator={code}`

Lead con `source: collaborator_referral`, `campaign: collaborator:{code}`, `collaborator_id`.
