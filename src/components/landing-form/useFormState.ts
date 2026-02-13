/**
 * Hook para manejar el estado del formulario multi-step
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import type { FormAnswers, Question, LeadPayload } from './types';
import { getUrlParams } from './utils';

export interface UseFormStateOptions {
  questions: Question[];
  source?: string;
  campaign?: string;
  adset?: string;
}

export function useFormState({
  questions,
  source: defaultSource,
  campaign: defaultCampaign,
  adset: defaultAdset,
}: UseFormStateOptions) {
  const [answers, setAnswers] = useState<FormAnswers>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const urlParams = useMemo(getUrlParams, []);

  const source = defaultSource ?? urlParams.source ?? 'web_form';
  const campaign = defaultCampaign ?? urlParams.campaign;
  const adset = defaultAdset ?? urlParams.adset;

  const visibleQuestions = useMemo(() => {
    return questions.filter((q) => {
      if (!q.showWhen) return true;
      const { questionId, value } = q.showWhen;
      const answer = answers[questionId];
      if (Array.isArray(value)) {
        return Array.isArray(answer)
          ? value.some((v) => answer.includes(v))
          : answer != null && value.includes(String(answer));
      }
      return answer === value || (Array.isArray(answer) && answer.includes(value));
    });
  }, [questions, answers]);

  useEffect(() => {
    if (currentIndex >= visibleQuestions.length && visibleQuestions.length > 0) {
      setCurrentIndex(visibleQuestions.length - 1);
    }
  }, [visibleQuestions.length, currentIndex]);

  const currentQuestion = visibleQuestions[currentIndex];
  const totalSteps = visibleQuestions.length;
  const progress = totalSteps > 0 ? ((currentIndex + 1) / totalSteps) * 100 : 0;
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === visibleQuestions.length - 1;

  const setAnswer = useCallback((questionId: string, value: string | number | string[]) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, visibleQuestions.length - 1));
  }, [visibleQuestions.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }, []);

  const buildPayload = useCallback((): LeadPayload => {
    const custom_fields: Record<string, unknown> = {};
    let name: string | undefined;
    let email: string | undefined;
    let phone: string | undefined;

    for (const q of questions) {
      const val = answers[q.id];
      if (val === undefined || val === '') continue;

      if (q.mapTo === 'name') name = String(val);
      else if (q.mapTo === 'email') email = String(val);
      else if (q.mapTo === 'phone') phone = String(val);
      else custom_fields[q.id] = val;
    }

    return {
      name,
      email,
      phone,
      source,
      campaign: campaign ?? undefined,
      adset: adset ?? undefined,
      custom_fields,
    };
  }, [answers, questions, source, campaign, adset]);

  const submit = useCallback(async () => {
    const payload = buildPayload();
    if (!payload.email && !payload.phone) {
      setSubmitError('Se requiere al menos email o teléfono');
      setSubmitStatus('error');
      return;
    }

    setSubmitStatus('loading');
    setSubmitError(null);

    try {
      const apiUrl = import.meta.env.VITE_LEADS_API_URL ?? '/api/leads';
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error ?? `Error ${res.status}`);
      }

      if (data.success === false) {
        throw new Error(data.error ?? 'Error al enviar');
      }

      setSubmitStatus('success');
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Error de conexión');
      setSubmitStatus('error');
    }
  }, [buildPayload]);

  const reset = useCallback(() => {
    setAnswers({});
    setCurrentIndex(0);
    setSubmitStatus('idle');
    setSubmitError(null);
  }, []);

  const currentStep = currentIndex + 1;

  return {
    answers,
    setAnswer,
    currentQuestion,
    currentIndex,
    currentStep,
    visibleQuestions,
    totalSteps,
    progress,
    isFirst,
    isLast,
    goNext,
    goPrev,
    submit,
    reset,
    submitStatus,
    submitError,
    buildPayload,
  };
}
