# Landings de colaboradores (React)

Landing pública única de reclutamiento de colaboradores.

## Ruta

| Landing | URL | Componente |
|---------|-----|------------|
| Hazte colaborador | `/hazte-colaborador` | `src/pages/HazteColaborador.tsx` |

Redirecciones legacy: `/colaboradores` y `/colaboradores/hibrida` → `/hazte-colaborador`.

## Código

- Estilos: `src/components/colaboradores/colaboradores-landing.css`
- Componentes compartidos: `src/components/colaboradores/colaboradores-shared.tsx`
- Bot Lara: `src/components/colaboradores/TvBot.tsx`
- Envío de leads: `src/hooks/useColaboradoresLeadSubmit.ts`

## Variables opcionales

- `VITE_COLABORADORES_WA_NUMBER` — WhatsApp (solo dígitos)
- `VITE_COLABORADORES_TEL` — teléfono visible

## CRM

En **Dashboard → Colaboradores** hay enlace para copiar y abrir la landing.

## Flujos y payloads API

Ver [`docs/COLABORADORES-FLOWS.md`](../docs/COLABORADORES-FLOWS.md).

### POST /api/leads (reclutamiento)

```json
{
  "name": "Ana López",
  "phone": "612345678",
  "email": "ana@example.com",
  "source": "web_form",
  "campaign": "hazte_colaborador",
  "custom_fields": {
    "landing_type": "colaboradores"
  }
}
```
