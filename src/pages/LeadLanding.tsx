/**
 * Página de ejemplo: Landing tipo Typeform con 4 preguntas
 * Ruta: /lead
 *
 * Ejemplo de URL con parámetros:
 * /lead?source=meta_ads&campaign=verano2024&adset=audiencia_interes
 */

import { MultiStepForm } from '@/components/landing-form';
import type { FormConfig } from '@/components/landing-form';

const LEAD_FORM_CONFIG: FormConfig = {
  source: 'web_form',
  campaign: undefined, // Se toma de URL si existe
  adset: undefined,
  questions: [
    {
      id: 'nombre',
      type: 'text',
      label: '¿Cómo te llamas?',
      placeholder: 'Tu nombre',
      required: true,
      mapTo: 'name',
    },
    {
      id: 'email',
      type: 'email',
      label: '¿Cuál es tu email?',
      placeholder: 'tu@email.com',
      required: true,
      mapTo: 'email',
    },
    {
      id: 'telefono',
      type: 'phone',
      label: '¿Y tu teléfono?',
      placeholder: '612 345 678',
      required: false,
      mapTo: 'phone',
    },
    {
      id: 'interes',
      type: 'select',
      label: '¿Qué te interesa más?',
      required: true,
      options: [
        { value: 'producto_a', label: 'Producto A' },
        { value: 'producto_b', label: 'Producto B' },
        { value: 'informacion', label: 'Solo información' },
      ],
    },
    // Ejemplo de pregunta condicional: solo si eligió producto
    {
      id: 'contacto_preferido',
      type: 'radio',
      label: '¿Cómo prefieres que te contactemos?',
      required: true,
      options: [
        { value: 'email', label: 'Por email' },
        { value: 'telefono', label: 'Por teléfono' },
        { value: 'whatsapp', label: 'Por WhatsApp' },
      ],
      showWhen: {
        questionId: 'interes',
        value: ['producto_a', 'producto_b'],
      },
    },
  ],
};

export default function LeadLanding() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-2xl">
        <h1 className="text-2xl sm:text-3xl font-bold text-center mb-2">
          Cuéntanos sobre ti
        </h1>
        <p className="text-muted-foreground text-center mb-8">
          Solo te llevará un minuto
        </p>

        <MultiStepForm
          config={LEAD_FORM_CONFIG}
          successMessage={
            <div className="text-center space-y-4">
              <p className="text-2xl font-semibold text-primary">
                ¡Gracias por tu interés!
              </p>
              <p className="text-muted-foreground">
                Hemos recibido tu información. Te contactaremos en las próximas
                24 horas.
              </p>
            </div>
          }
        />
      </div>
    </div>
  );
}
