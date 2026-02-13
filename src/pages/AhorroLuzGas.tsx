/**
 * Clon del formulario Selectra "Ahorra en tu próxima factura"
 * Inspirado en: https://selectra.typeform.com/ahorro-luz-gas
 *
 * Diseño Typeform: fondo claro, pregunta centrada, opciones grandes
 */

import { useState, useCallback } from 'react';
import { useFormState } from '@/components/landing-form';
import { QuestionStep, validateQuestion } from '@/components/landing-form';
import type { FormConfig } from '@/components/landing-form';
import { cn } from '@/lib/utils';
import { ChevronLeft, Loader2 } from 'lucide-react';

const SELECTRA_GREEN = '#00a86b';

const AHORRO_LUZ_GAS_CONFIG: FormConfig = {
  source: 'web_form',
  campaign: 'ahorro_luz_gas',
  questions: [
    {
      id: 'suministro',
      type: 'radio',
      label: '¿Qué necesitas comparar?',
      required: true,
      options: [
        { value: 'luz', label: 'Solo luz' },
        { value: 'gas', label: 'Solo gas' },
        { value: 'luz_gas', label: 'Luz y gas' },
      ],
    },
    {
      id: 'potencia',
      type: 'number',
      label: '¿Cuál es tu potencia contratada? (kW)',
      placeholder: 'Ej: 4.6',
      required: true,
      min: 1,
      max: 15,
      showWhen: { questionId: 'suministro', value: ['luz', 'luz_gas'] },
    },
    {
      id: 'consumo',
      type: 'number',
      label: '¿Cuál es tu consumo medio mensual? (kWh)',
      placeholder: 'Ej: 150',
      required: true,
      min: 1,
      max: 2000,
    },
    {
      id: 'patron',
      type: 'radio',
      label: '¿Cuál es tu patrón de consumo?',
      required: true,
      options: [
        { value: 'todo_dia', label: 'Todo el día' },
        { value: 'noches_fines', label: 'Noches y fines de semana' },
        { value: 'segunda_verano', label: 'Segunda residencia (verano)' },
        { value: 'segunda_fin', label: 'Segunda residencia (fin de semana)' },
      ],
    },
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
      required: true,
      mapTo: 'phone',
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
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#f7f7f7]">
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
            className="text-lg font-medium hover:underline"
            style={{ color: SELECTRA_GREEN }}
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
    <div className="min-h-screen bg-[#f7f7f7] flex flex-col">
      {/* Barra de progreso - estilo Typeform/Selectra */}
      <div
        className="h-1 w-full bg-gray-200"
        style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50 }}
      >
        <div
          className="h-full transition-all duration-300 ease-out"
          style={{
            width: `${progress}%`,
            backgroundColor: SELECTRA_GREEN,
          }}
        />
      </div>

      {/* Contenido centrado */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-16 pt-20">
        <div
          key={currentQuestion.id}
          onKeyDown={handleKeyDown}
          className={cn(
            'w-full max-w-2xl animate-in duration-300',
            direction === 'next' && 'fade-in slide-in-from-right-4',
            direction === 'prev' && 'fade-in slide-in-from-left-4'
          )}
        >
          {/* Pregunta - tipografía grande estilo Typeform */}
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-gray-900 mb-8 leading-tight">
            {currentQuestion.label}
            {currentQuestion.required !== false && (
              <span className="text-red-500 ml-1">*</span>
            )}
          </h1>

          {/* Componente de respuesta con estilo Selectra/Typeform */}
          <div className="selectra-form [&_input]:text-lg [&_input]:h-14 [&_input]:rounded-xl [&_.border]:border-2 [&_label]:rounded-xl [&_label]:p-5 [&_label]:text-base">
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

          {/* Navegación - minimalista tipo Typeform */}
          <div className="flex items-center justify-between mt-10 gap-4">
            <button
              onClick={handlePrev}
              disabled={isFirst || submitStatus === 'loading'}
              className={cn(
                'flex items-center gap-1 text-gray-500 hover:text-gray-700 transition-colors',
                (isFirst || submitStatus === 'loading') && 'opacity-50 cursor-not-allowed'
              )}
            >
              <ChevronLeft className="h-5 w-5" />
              <span className="text-base">Atrás</span>
            </button>

            <button
              onClick={handleNext}
              disabled={submitStatus === 'loading'}
              className={cn(
                'flex items-center gap-2 px-6 py-3 rounded-full font-medium text-white transition-all',
                'hover:opacity-90 disabled:opacity-70 disabled:cursor-not-allowed'
              )}
              style={{ backgroundColor: SELECTRA_GREEN }}
            >
              {submitStatus === 'loading' ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Enviando...
                </>
              ) : isLast ? (
                'Enviar'
              ) : (
                'Siguiente'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Footer sutil - paso X de Y */}
      <div className="py-4 text-center text-sm text-gray-400">
        Paso {currentStep} de {totalSteps}
      </div>
    </div>
  );
}
