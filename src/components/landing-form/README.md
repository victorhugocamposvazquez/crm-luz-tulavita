# Formulario Multi-Step Tipo Typeform

Componente React para landings con formulario de una pregunta por pantalla, integrado con `/api/leads`.

## Uso

```tsx
import { MultiStepForm } from '@/components/landing-form';

<MultiStepForm
  config={{
    source: 'web_form',
    questions: [
      { id: 'nombre', type: 'text', label: '¿Nombre?', mapTo: 'name', required: true },
      { id: 'email', type: 'email', label: '¿Email?', mapTo: 'email', required: true },
      { id: 'telefono', type: 'phone', label: '¿Teléfono?', mapTo: 'phone' },
      { id: 'interes', type: 'select', label: '¿Interés?', options: [...], required: true },
    ],
  }}
/>
```

## Tipos de pregunta

- `text` - Campo de texto
- `number` - Número (opcional: min, max)
- `email` - Email con validación
- `phone` - Teléfono
- `select` - Desplegable
- `radio` - Opción única
- `checkbox` - Opciones múltiples (valor: string[])

## Preguntas condicionales

```tsx
{
  id: 'contacto',
  type: 'radio',
  label: '¿Cómo contactar?',
  options: [...],
  showWhen: { questionId: 'interes', value: ['opcion_a', 'opcion_b'] },
}
```

## Parámetros URL

Se mapean automáticamente: `?source=meta_ads&campaign=verano&adset=audiencia`

## API

Por defecto envía a `/api/leads`. En desarrollo local, define `VITE_LEADS_API_URL` si el API está en otra URL (ej. producción).

## Ruta de ejemplo

`/lead` - Ver `src/pages/LeadLanding.tsx`
