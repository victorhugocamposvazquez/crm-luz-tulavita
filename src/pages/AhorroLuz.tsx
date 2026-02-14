/**
 * Formulario Ahorro Luz - Pasos según capturas del usuario
 * - Auto-avance al seleccionar opción (radio)
 * - Flechas para navegar atrás/adelante
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { useFormState } from '@/components/landing-form';
import { QuestionStep, validateQuestion } from '@/components/landing-form';
import type { FormConfig } from '@/components/landing-form';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

const BRAND_COLOR = '#26606b';

const AHORRO_LUZ_CONFIG: FormConfig = {
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
      otherOption: { value: 'otra', placeholder: 'Escribe cual' },
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
      privacyNoteHighlight: 'darte respuesta',
    },
  ],
};

export default function AhorroLuz() {
  const [validationError, setValidationError] = useState<string | null>(null);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  const autoAdvanceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contactValuesRef = useRef<Record<string, string>>({});
  const formContainerRef = useRef<HTMLDivElement | null>(null);

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
    questions: AHORRO_LUZ_CONFIG.questions,
    source: AHORRO_LUZ_CONFIG.source,
    campaign: AHORRO_LUZ_CONFIG.campaign,
  });

  const scrollToTop = useCallback(() => {
    const doScroll = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    requestAnimationFrame(() => requestAnimationFrame(doScroll));
  }, []);

  const handleNext = useCallback(
    (valueOverride?: string) => {
      if (!currentQuestion) return;
      let value: unknown =
        valueOverride ??
        (currentQuestion.type === 'contact'
          ? (Object.keys(contactValuesRef.current).length ? contactValuesRef.current : answers[currentQuestion.id])
          : answers[currentQuestion.id]);
      // Fallback: leer del DOM para contacto (evita desincronización estado/DOM)
      if (currentQuestion.type === 'contact' && formContainerRef.current) {
        const base = (value as Record<string, string>) ?? {};
        const phoneEl = formContainerRef.current.querySelector<HTMLInputElement>('[data-contact-field="phone"]');
        const emailEl = formContainerRef.current.querySelector<HTMLInputElement>('[data-contact-field="email"]');
        const nameEl = formContainerRef.current.querySelector<HTMLInputElement>('[data-contact-field="name"]');
        const merged: Record<string, string> = { ...base };
        if (phoneEl?.value?.trim()) merged.phone = phoneEl.value.trim();
        if (emailEl?.value?.trim()) merged.email = emailEl.value.trim();
        if (nameEl?.value?.trim()) merged.name = nameEl.value.trim();
        if (Object.keys(merged).length > 0) value = merged;
      }
      const err = validateQuestion(currentQuestion, value);
      if (err) {
        setValidationError(err);
        return;
      }
      setValidationError(null);
      setDirection('next');
      if (isLast) {
        if (currentQuestion.type === 'contact') {
          const toSave = (value as Record<string, string>) ?? contactValuesRef.current;
          if (toSave && Object.keys(toSave).length > 0) {
            flushSync(() => setAnswer(currentQuestion.id, toSave));
          }
        }
        submit();
      }
      else goNext();
      // Scroll explícito al hacer clic en botón (necesario en iOS mobile)
      setTimeout(scrollToTop, 100);
    },
    [currentQuestion, answers, isLast, submit, goNext, scrollToTop]
  );

  const handlePrev = useCallback(() => {
    setValidationError(null);
    setDirection('prev');
    goPrev();
    // Scroll explícito al hacer clic en botón (necesario en iOS mobile)
    setTimeout(scrollToTop, 100);
  }, [goPrev, scrollToTop]);

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

  // Scroll al tope al cambiar de pantalla o al mostrar éxito (robusto en mobile)
  useEffect(() => {
    const scrollToTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    // requestAnimationFrame x2: espera al paint del nuevo contenido (crítico en mobile)
    requestAnimationFrame(() => {
      requestAnimationFrame(scrollToTop);
    });
  }, [currentQuestion?.id, submitStatus]);

  if (submitStatus === 'success') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-white">
        <header className="fixed top-0 left-0 right-0 z-40 h-14 sm:h-16 flex items-center justify-between px-4 py-3 bg-white/80 backdrop-blur-sm border-b border-gray-200/50">
          <div className="flex items-center justify-center min-w-[3rem] sm:min-w-[3.5rem]">
            <img src="/logo-tulavita.png" alt="Tulavita" className="h-12 w-12 sm:h-14 sm:w-14 object-contain" />
          </div>
          <h1 className="absolute left-1/2 -translate-x-1/2 text-sm sm:text-base font-semibold" style={{ color: BRAND_COLOR }}>
            Ahorra en tu factura
          </h1>
          <div className="min-w-[3rem] sm:min-w-[3.5rem]" aria-hidden />
        </header>
        <div className="max-w-lg w-full text-center animate-in fade-in duration-500">
          <h2 className="text-2xl sm:text-3xl font-semibold mb-4" style={{ color: BRAND_COLOR }}>
            ¡Gracias!
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            Hemos recibido tu información. Un asesor te contactará en las
            próximas horas para ayudarte a ahorrar en tu factura.
          </p>
          <button
            onClick={reset}
            className="text-lg font-medium hover:underline"
            style={{ color: BRAND_COLOR }}
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
      <header className="fixed top-0 left-0 right-0 z-40 h-14 sm:h-16 flex items-center justify-between px-4 py-3 bg-white/80 backdrop-blur-sm border-b border-gray-200/50">
        <div className="flex items-center justify-center min-w-[3rem] sm:min-w-[3.5rem]">
          <img src="/logo-tulavita.png" alt="Tulavita" className="h-12 w-12 sm:h-14 sm:w-14 object-contain" />
        </div>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-sm sm:text-base font-semibold" style={{ color: BRAND_COLOR }}>
          Ahorra en tu factura
        </h1>
        <div className="min-w-[3rem] sm:min-w-[3.5rem]" aria-hidden />
      </header>

      {/* Barra de progreso */}
      <div className="fixed top-14 sm:top-16 left-0 right-0 z-50 h-1 w-full bg-gray-200">
          <div
            className="h-full transition-all duration-300 ease-out"
            style={{ backgroundColor: BRAND_COLOR, width: `${progress}%` }}
          />
      </div>

      {/* Contenido */}
      <div className="flex-1 flex flex-col items-center px-4 sm:px-6 py-16 pt-28">
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
          <div className="flex items-start gap-2 mb-6">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-white text-sm font-medium" style={{ backgroundColor: BRAND_COLOR }}>
              {currentStep}
            </span>
            {currentQuestion.type === 'contact' && 'header' in currentQuestion && currentQuestion.header ? (
              <h1 className="text-xl sm:text-2xl font-semibold leading-tight pt-0.5" style={{ color: BRAND_COLOR }}>
                {currentQuestion.header}
              </h1>
            ) : currentQuestion.type !== 'contact' ? (
              <h1 className="text-xl sm:text-2xl font-medium leading-tight" style={{ color: BRAND_COLOR }}>
                {currentQuestion.label}
                {currentQuestion.required !== false && (
                  <span className="text-red-500 ml-0.5">*</span>
                )}
              </h1>
            ) : null}
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
          <div className={cn(
            currentQuestion.type !== 'contact' && '[&_input]:text-lg [&_input]:h-12 [&_input]:rounded-xl [&_input]:border-2'
          )}>
            <QuestionStep
              question={currentQuestion}
              value={answers[currentQuestion.id]}
              onChange={(v) => {
                if (currentQuestion.type === 'contact' && typeof v === 'object' && v !== null) {
                  contactValuesRef.current = v as Record<string, string>;
                }
                setAnswer(currentQuestion.id, v);
              }}
              error={validationError ?? undefined}
              disabled={submitStatus === 'loading'}
              hideLabel
              onSelect={isRadioWithLetters ? handleSelectAndAdvance : undefined}
              formContainerRef={currentQuestion.type === 'contact' ? formContainerRef : undefined}
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
                  : 'text-gray-600 hover:bg-gray-100 hover:text-[#26606b]'
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
              style={{ backgroundColor: BRAND_COLOR }}
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
                  : 'text-gray-600 hover:bg-gray-100 hover:text-[#26606b]'
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
