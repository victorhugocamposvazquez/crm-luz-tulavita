/**
 * Formulario multi-step tipo Typeform
 * Una pregunta por pantalla, animaciones, progreso, integración con /api/leads
 */

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { QuestionStep, validateQuestion } from './QuestionStep';
import { useFormState } from './useFormState';
import { cn } from '@/lib/utils';
import type { FormConfig } from './types';
import { ChevronLeft, Loader2 } from 'lucide-react';

export interface MultiStepFormProps {
  config: FormConfig;
  apiUrl?: string;
  successMessage?: React.ReactNode;
  className?: string;
}

export function MultiStepForm({
  config,
  successMessage = (
    <p className="text-xl text-center text-muted-foreground">
      ¡Gracias! Te contactaremos pronto.
    </p>
  ),
  className,
}: MultiStepFormProps) {
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [direction, setDirection] = React.useState<'next' | 'prev'>('next');

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
    questions: config.questions,
    source: config.source,
    campaign: config.campaign,
    adset: config.adset,
  });

  const handleNext = () => {
    if (!currentQuestion) return;

    const value = answers[currentQuestion.id];
    const err = validateQuestion(currentQuestion, value);
    if (err) {
      setValidationError(err);
      return;
    }

    setValidationError(null);
    setDirection('next');

    if (isLast) {
      submit();
    } else {
      goNext();
    }
  };

  const handlePrev = () => {
    setValidationError(null);
    setDirection('prev');
    goPrev();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleNext();
    }
  };

  if (submitStatus === 'success') {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center min-h-[300px] p-6 animate-in fade-in duration-300',
          className
        )}
      >
        {successMessage}
        <Button variant="outline" onClick={reset} className="mt-6">
          Enviar otro formulario
        </Button>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className={cn('p-6 text-center text-muted-foreground', className)}>
        No hay preguntas configuradas.
      </div>
    );
  }

  return (
    <div className={cn('w-full max-w-xl mx-auto', className)}>
      {/* Indicador de progreso */}
      <div className="mb-8">
        <div className="flex justify-between text-sm text-muted-foreground mb-2">
          <span>
            Paso {currentStep} de {totalSteps}
          </span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Contenedor de pregunta con animación */}
      <div
        key={currentQuestion.id}
        className={cn(
          'min-h-[200px] animate-in duration-300',
          direction === 'next' && 'fade-in slide-in-from-right-4',
          direction === 'prev' && 'fade-in slide-in-from-left-4'
        )}
        onKeyDown={handleKeyDown}
      >
        <QuestionStep
          question={currentQuestion}
          value={answers[currentQuestion.id]}
          onChange={(v) => setAnswer(currentQuestion.id, v)}
          error={validationError ?? undefined}
          disabled={submitStatus === 'loading'}
        />
      </div>

      {/* Error de envío */}
      {submitError && (
        <p className="mt-4 text-sm text-destructive">{submitError}</p>
      )}

      {/* Navegación */}
      <div className="flex items-center justify-between mt-8 gap-4">
        <Button
          variant="ghost"
          onClick={handlePrev}
          disabled={isFirst || submitStatus === 'loading'}
          className="gap-2"
        >
          <ChevronLeft className="h-4 w-4" />
          Atrás
        </Button>

        <Button
          onClick={handleNext}
          disabled={submitStatus === 'loading'}
          className="min-w-[120px]"
        >
          {submitStatus === 'loading' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Enviando...
            </>
          ) : isLast ? (
            'Enviar'
          ) : (
            'Siguiente'
          )}
        </Button>
      </div>
    </div>
  );
}
