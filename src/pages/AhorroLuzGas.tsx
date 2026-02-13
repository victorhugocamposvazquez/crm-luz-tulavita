/**
 * Clon del formulario Selectra "Estudio de energía"
 * Estructura según API Typeform: https://api.typeform.com/forms/XpzfGYPD
 * Referencia: https://selectra.typeform.com/ahorro-luz-gas
 */

import { useState, useCallback } from 'react';
import { useFormState } from '@/components/landing-form';
import { QuestionStep, validateQuestion } from '@/components/landing-form';
import type { FormConfig } from '@/components/landing-form';
import { cn } from '@/lib/utils';
import { ChevronLeft, Loader2 } from 'lucide-react';

const BUTTON_BLUE = '#2563eb';

const AHORRO_LUZ_GAS_CONFIG: FormConfig = {
  source: 'web_form',
  campaign: 'ahorro_luz_gas',
  questions: [
    {
      id: 'factura_mensual',
      type: 'radio',
      label: '💰 Para poder ayudarte, ¿sabes cuánto pagas al mes en tu factura?',
      required: true,
      optionLetters: true,
      options: [
        { value: 'menos_100', label: 'Menos de 100€' },
        { value: '100_200', label: 'Entre 100 y 200€' },
        { value: 'mas_200', label: 'Más de 200€' },
        { value: 'no_se', label: 'No lo sé' },
      ],
    },
    {
      id: 'tipo_tarifa',
      type: 'radio',
      label: '¿Qué tipo de tarifa deseas comparar en este estudio?',
      required: true,
      optionLetters: true,
      options: [
        { value: 'luz_gas', label: 'Tarifas de luz y gas' },
        { value: 'luz', label: 'Tarifas de luz' },
        { value: 'gas', label: 'Tarifas de gas' },
      ],
    },
    {
      id: 'tipo_servicio',
      type: 'radio',
      label: '¿Este servicio lo necesitas para…?',
      required: true,
      optionLetters: true,
      options: [
        { value: 'hogar', label: '🏠 Un hogar' },
        { value: 'empresa', label: '🏢 Un negocio o empresa' },
      ],
    },
    {
      id: 'codigo_postal',
      type: 'text',
      label: 'Indica el código postal del suministro',
      placeholder: 'Ej: 28001',
      required: true,
    },
    {
      id: 'tiene_factura',
      type: 'radio',
      label: 'Para ajustar la tarifa al consumo de tu vivienda, ¿tienes una factura a mano?',
      required: true,
      optionLetters: true,
      options: [
        { value: 'subir', label: 'Sí. Quiero subir mi factura' },
        { value: 'manual', label: 'Sí. Introducir datos manualmente' },
        { value: 'calcular', label: 'No. Ayúdame a calcularlo' },
      ],
    },
    {
      id: 'superficie',
      type: 'number',
      label: 'Indica la superficie de la vivienda en m²',
      placeholder: 'Ej: 85',
      required: false,
      min: 20,
      max: 500,
      showWhen: { questionId: 'tiene_factura', value: 'calcular' },
    },
    {
      id: 'personas',
      type: 'radio',
      label: '¿Cuántas personas viven en la casa?',
      required: false,
      optionLetters: true,
      options: [
        { value: '1', label: '1' },
        { value: '2', label: '2' },
        { value: '3', label: '3' },
        { value: '4', label: '4' },
        { value: '5', label: '5' },
        { value: '6_mas', label: '6 o más' },
      ],
      showWhen: { questionId: 'tiene_factura', value: 'calcular' },
    },
    {
      id: 'calefaccion',
      type: 'radio',
      label: '¿Qué energía utilizas para la calefacción?',
      required: false,
      optionLetters: true,
      options: [
        { value: 'electricidad', label: 'Electricidad' },
        { value: 'gas', label: 'Gas' },
      ],
      showWhen: { questionId: 'tiene_factura', value: 'calcular' },
    },
    {
      id: 'agua_caliente',
      type: 'radio',
      label: '¿Y para el agua caliente?',
      required: false,
      optionLetters: true,
      options: [
        { value: 'electricidad', label: 'Electricidad' },
        { value: 'gas', label: 'Gas' },
      ],
      showWhen: { questionId: 'tiene_factura', value: 'calcular' },
    },
    {
      id: 'cocina',
      type: 'radio',
      label: '¿Y para la cocina?',
      required: false,
      optionLetters: true,
      options: [
        { value: 'electricidad', label: 'Electricidad' },
        { value: 'gas', label: 'Gas' },
      ],
      showWhen: { questionId: 'tiene_factura', value: 'calcular' },
    },
    {
      id: 'kwh_luz',
      type: 'number',
      label: '¿Cuántos kWh consumes al mes en luz?',
      placeholder: 'Ej: 150',
      required: true,
      min: 1,
      max: 2000,
      showWhen: { questionId: 'tiene_factura', value: 'manual' },
    },
    {
      id: 'potencia_p1',
      type: 'number',
      label: '¿Cuánta potencia tienes contratada en P1 (punta)? (kW)',
      placeholder: 'Ej: 2.3',
      required: false,
      min: 1,
      max: 15,
      showWhen: { questionId: 'tiene_factura', value: 'manual' },
    },
    {
      id: 'potencia_p2',
      type: 'number',
      label: '¿Cuánta potencia tienes contratada en P2 (valle)? (kW)',
      placeholder: 'Ej: 2.3',
      required: false,
      min: 1,
      max: 15,
      showWhen: { questionId: 'tiene_factura', value: 'manual' },
    },
    {
      id: 'frecuencia_factura',
      type: 'text',
      label: '¿Con qué frecuencia de días te facturan la luz?',
      placeholder: 'Ej: 30 o 60',
      required: false,
      showWhen: { questionId: 'tiene_factura', value: 'manual' },
    },
    {
      id: 'placas_solares',
      type: 'radio',
      label: 'Para reducir aún más tu consumo, ¿te interesa un estudio sobre placas solares?',
      required: false,
      optionLetters: true,
      options: [
        { value: 'si', label: 'Sí, quiero información sobre placas solares' },
        { value: 'no', label: 'No, solo quiero un estudio de tarifas estándar' },
      ],
    },
    {
      id: 'nombre',
      type: 'text',
      label: '¿Cómo te llamas?',
      placeholder: 'Nombre y apellidos',
      required: true,
      mapTo: 'name',
    },
    {
      id: 'telefono',
      type: 'phone',
      label: '¿Cuál es tu teléfono?',
      placeholder: '612 345 678',
      required: true,
      mapTo: 'phone',
    },
    {
      id: 'email',
      type: 'email',
      label: '¿Cuál es tu email?',
      placeholder: 'tu@email.com',
      required: true,
      mapTo: 'email',
    },
  ],
};

export default function AhorroLuzGas() {
  const [validationError, setValidationError] = useState<string | null>(null);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');

  const {
    currentQuestion,
    visibleQuestions,
    totalSteps,
    currentStep,
    progress,
    isFirst,
    isLast,
    answers,
    setAnswer,
    goNext,
    goPrev,
    submit,
    reset,
    submitStatus,
    submitError,
  } = useFormState({
    questions: AHORRO_LUZ_GAS_CONFIG.questions,
    source: AHORRO_LUZ_GAS_CONFIG.source,
    campaign: AHORRO_LUZ_GAS_CONFIG.campaign,
  });

  const handleNext = useCallback(() => {
    if (!currentQuestion) return;
    const value = answers[currentQuestion.id];
    const err = validateQuestion(currentQuestion, value);
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError(null);
    setDirection('next');
    if (isLast) submit();
    else goNext();
  }, [currentQuestion, answers, isLast, submit, goNext]);

  const handlePrev = useCallback(() => {
    setValidationError(null);
    setDirection('prev');
    goPrev();
  }, [goPrev]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleNext();
      }
    },
    [handleNext]
  );

  if (submitStatus === 'success') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-white">
        <div className="max-w-lg w-full text-center animate-in fade-in duration-500">
          <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900 mb-4">
            ¡Gracias!
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            Hemos recibido tu información. Un asesor te contactará en las
            próximas horas para ayudarte a ahorrar en tu factura.
          </p>
          <button
            onClick={reset}
            className="text-lg font-medium text-blue-600 hover:underline"
          >
            Enviar otra solicitud
          </button>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return null;
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Barra de progreso */}
      <div
        className="h-1 w-full bg-gray-200"
        style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50 }}
      >
        <div
          className="h-full transition-all duration-300 ease-out bg-blue-600"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Contenido */}
      <div className="flex-1 flex flex-col items-center px-4 sm:px-6 py-16 pt-20">
        <div
          className="w-full max-w-xl"
          key={currentQuestion.id}
          onKeyDown={handleKeyDown}
          className={cn(
            'animate-in duration-300',
            direction === 'next' && 'fade-in slide-in-from-right-4',
            direction === 'prev' && 'fade-in slide-in-from-left-4'
          )}
        >
          {/* Instrucción numerada - estilo Selectra */}
          <p className="text-base text-gray-700 mb-6">
            <span className="font-semibold">{currentStep}</span>{' '}
            Completa el formulario para recibir un{' '}
            <span className="font-semibold">estudio de ahorro gratuito</span> y
            conseguir un mejor precio.
          </p>

          {/* Pregunta */}
          <h1 className="text-xl sm:text-2xl font-medium text-gray-900 mb-6 leading-tight">
            {currentQuestion.label}
            {currentQuestion.required !== false && (
              <span className="text-red-500 ml-0.5">*</span>
            )}
          </h1>

          {/* Respuesta */}
          <div className="[&_input]:text-lg [&_input]:h-12 [&_input]:rounded-xl [&_input]:border-2">
            <QuestionStep
              question={currentQuestion}
              value={answers[currentQuestion.id]}
              onChange={(v) => setAnswer(currentQuestion.id, v)}
              error={validationError ?? undefined}
              disabled={submitStatus === 'loading'}
              hideLabel
            />
          </div>

          {validationError && (
            <p className="mt-3 text-sm text-red-500">{validationError}</p>
          )}
          {submitError && (
            <p className="mt-3 text-sm text-red-500">{submitError}</p>
          )}

          {/* Botón Aceptar - azul, estilo Selectra */}
          <div className="mt-10 flex items-center justify-between gap-4">
            {!isFirst ? (
              <button
                onClick={handlePrev}
                disabled={submitStatus === 'loading'}
                className="flex items-center gap-1 text-gray-500 hover:text-gray-700 text-sm"
              >
                <ChevronLeft className="h-4 w-4" />
                Atrás
              </button>
            ) : (
              <div />
            )}
            <button
              onClick={handleNext}
              disabled={submitStatus === 'loading'}
              className={cn(
                'flex items-center justify-center gap-2 px-8 py-3 rounded-xl font-medium text-white transition-all',
                'hover:opacity-90 disabled:opacity-70 disabled:cursor-not-allowed'
              )}
              style={{ backgroundColor: BUTTON_BLUE }}
            >
              {submitStatus === 'loading' ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Enviando...
                </>
              ) : isLast ? (
                'Enviar'
              ) : (
                'Aceptar'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
