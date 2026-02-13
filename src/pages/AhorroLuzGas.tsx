/**
 * Formulario Ahorro Luz/Gas - Pasos según capturas del usuario
 * - Auto-avance al seleccionar opción (radio)
 * - Flechas para navegar atrás/adelante
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useFormState } from '@/components/landing-form';
import { QuestionStep, validateQuestion } from '@/components/landing-form';
import type { FormConfig } from '@/components/landing-form';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Loader2, Zap } from 'lucide-react';

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
      id: 'compania',
      type: 'radio',
      label: '¿Cuál es tu compañía actual?',
      required: true,
      optionLetters: true,
      options: [
        { value: 'endesa', label: 'Endesa' },
        { value: 'naturgy', label: 'Naturgy' },
        { value: 'repsol', label: 'Repsol' },
        { value: 'iberdrola', label: 'Iberdrola' },
        { value: 'octopus', label: 'Octopus' },
        { value: 'plenitude', label: 'Plenitude' },
        { value: 'otra', label: 'Otra' },
      ],
    },
    {
      id: 'potencia',
      type: 'radio',
      label: '¿Podrías decirnos qué potencia tienes contratada?',
      required: true,
      optionLetters: true,
      options: [
        { value: 'menos_3', label: 'Menos de 3kW' },
        { value: '3_5', label: 'Entre 3 y 5kW' },
        { value: 'mas_5', label: 'Más de 5kW' },
        { value: 'no_se', label: 'No lo sé' },
      ],
    },
    {
      id: 'tiene_factura',
      type: 'radio',
      label: '¿Tendrías una factura reciente a mano que puedas subir?',
      required: true,
      optionLetters: true,
      options: [
        { value: 'subir', label: 'Sí, ¡la subo ahora!' },
        { value: 'no', label: 'No la tengo, mejor en otro momento' },
      ],
    },
    {
      id: 'adjuntar_factura',
      type: 'file_upload',
      label: '¡Adjunta tu factura aquí! Puede ser una foto, captura, PDF...',
      required: false,
      maxSizeMb: 10,
      description: 'Si al final no puedes subirla ahora, continúa y te enviaremos un mail para que puedas hacerlo más tarde.',
      showWhen: { questionId: 'tiene_factura', value: 'subir' },
    },
    {
      id: 'contacto',
      type: 'contact',
      label: '',
      required: true,
      header: 'Indícanos tus datos de contacto y revisaremos contigo:',
      reviewPoints: [
        'Sobrecostes actuales',
        'Precio €/kWh de tu tarifa actual',
        'Optimización de la potencia contratada*',
      ],
      privacyNote:
        'Trataremos tus datos para darte respuesta y enviarte ofertas e información promocional sobre nuestros servicios por diversos medios.',
    },
  ],
};

export default function AhorroLuzGas() {
  const [validationError, setValidationError] = useState<string | null>(null);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  const autoAdvanceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const handleNext = useCallback(
    (valueOverride?: string) => {
      if (!currentQuestion) return;
      const value = valueOverride ?? answers[currentQuestion.id];
      const err = validateQuestion(currentQuestion, value);
      if (err) {
        setValidationError(err);
        return;
      }
      setValidationError(null);
      setDirection('next');
      if (isLast) submit();
      else goNext();
    },
    [currentQuestion, answers, isLast, submit, goNext]
  );

  const handlePrev = useCallback(() => {
    setValidationError(null);
    setDirection('prev');
    goPrev();
  }, [goPrev]);

  const handleSelectAndAdvance = useCallback(
    (selectedValue: string) => {
      if (autoAdvanceTimeout.current) clearTimeout(autoAdvanceTimeout.current);
      autoAdvanceTimeout.current = setTimeout(() => {
        handleNext(selectedValue);
        autoAdvanceTimeout.current = null;
      }, 300);
    },
    [handleNext]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleNext();
      }
    },
    [handleNext]
  );

  const isRadioWithLetters =
    currentQuestion?.type === 'radio' && (currentQuestion as { optionLetters?: boolean }).optionLetters;

  // Scroll al tope al cambiar de pantalla o al mostrar éxito
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentQuestion?.id, submitStatus]);

  if (submitStatus === 'success') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-white">
        <header className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 bg-white/80 backdrop-blur-sm border-b border-gray-200/50"
          style={{ height: 48 }}
        >
          <div className="flex items-center gap-2 min-w-[80px]">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400/90 text-amber-900">
              <Zap className="h-4 w-4" strokeWidth={2.5} />
            </div>
          </div>
          <h1 className="absolute left-1/2 -translate-x-1/2 text-sm font-semibold text-gray-800">
            Ahorra en tu factura
          </h1>
          <div className="min-w-[80px]" aria-hidden />
        </header>
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
      {/* Cabecera con opacidad */}
      <header
        className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 bg-white/80 backdrop-blur-sm border-b border-gray-200/50"
        style={{ height: 48 }}
      >
        <div className="flex items-center gap-2 min-w-[80px]">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400/90 text-amber-900">
            <Zap className="h-4 w-4" strokeWidth={2.5} />
          </div>
        </div>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-sm font-semibold text-gray-800">
          Ahorra en tu factura
        </h1>
        <div className="min-w-[80px]" aria-hidden />
      </header>

      {/* Barra de progreso */}
      <div
        className="h-1 w-full bg-gray-200"
        style={{ position: 'fixed', top: 48, left: 0, right: 0, zIndex: 50 }}
      >
        <div
          className="h-full transition-all duration-300 ease-out bg-blue-600"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Contenido */}
      <div className="flex-1 flex flex-col items-center px-4 sm:px-6 py-16 pt-24">
        <div
          key={currentQuestion.id}
          onKeyDown={handleKeyDown}
          className={cn(
            'w-full max-w-xl animate-in duration-300',
            direction === 'next' && 'fade-in slide-in-from-right-4',
            direction === 'prev' && 'fade-in slide-in-from-left-4'
          )}
        >
          {/* Indicador de paso - cuadrado negro con número */}
          <div className="flex items-center gap-2 mb-6">
            <span className="flex h-8 w-8 items-center justify-center rounded bg-gray-800 text-white text-sm font-medium">
              {currentStep}
            </span>
            {currentQuestion.type !== 'contact' && (
              <h1 className="text-xl sm:text-2xl font-medium text-gray-900 leading-tight">
                {currentQuestion.label}
                {currentQuestion.required !== false && currentQuestion.type !== 'contact' && (
                  <span className="text-red-500 ml-0.5">*</span>
                )}
              </h1>
            )}
          </div>

          {/* Descripción extra para paso 5 (tiene_factura) */}
          {currentQuestion.id === 'tiene_factura' && (
            <div className="mb-6 space-y-2">
              <p className="text-base text-gray-700">
                Es la forma más <strong>rápida</strong> y <strong>exacta</strong> de calcular tu ahorro.*
              </p>
              <p className="text-sm text-gray-600">
                Si no puedes subirla ahora, no pasa nada. Te enviaremos un email para que puedas hacerlo cuando te venga mejor.
              </p>
            </div>
          )}

          {/* Respuesta */}
          <div className="[&_input]:text-lg [&_input]:h-12 [&_input]:rounded-xl [&_input]:border-2">
            <QuestionStep
              question={currentQuestion}
              value={answers[currentQuestion.id]}
              onChange={(v) => setAnswer(currentQuestion.id, v)}
              error={validationError ?? undefined}
              disabled={submitStatus === 'loading'}
              hideLabel
              onSelect={isRadioWithLetters ? handleSelectAndAdvance : undefined}
            />
          </div>

          {validationError && (
            <p className="mt-3 text-sm text-red-500">{validationError}</p>
          )}
          {submitError && (
            <p className="mt-3 text-sm text-red-500">{submitError}</p>
          )}

          {/* Navegación: flechas + botón Aceptar */}
          <div className="mt-10 flex items-center justify-between gap-4">
            <button
              onClick={handlePrev}
              disabled={isFirst || submitStatus === 'loading'}
              className={cn(
                'flex items-center gap-2 p-2 rounded-lg transition-colors',
                isFirst || submitStatus === 'loading'
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
              title="Atrás"
            >
              <ChevronLeft className="h-6 w-6" />
              <span className="text-sm font-medium">Atrás</span>
            </button>

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

            <button
              onClick={handleNext}
              disabled={isLast || submitStatus === 'loading'}
              className={cn(
                'flex items-center gap-2 p-2 rounded-lg transition-colors',
                isLast || submitStatus === 'loading'
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
              title="Siguiente"
            >
              <span className="text-sm font-medium">Siguiente</span>
              <ChevronRight className="h-6 w-6" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
