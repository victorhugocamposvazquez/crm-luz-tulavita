/**
 * Ahorro Luz — flujo frontal en dos fases:
 * 1) Hero: subida principal + "Conozco mis datos" / "Que me llamen"
 * 2) Formulario por pasos según la opción elegida
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { useFormState } from '@/components/landing-form';
import { ContactPrivacyNote, QuestionStep, validateQuestion } from '@/components/landing-form';
import type { FormConfig, Question, LeadPayload } from '@/components/landing-form';
import { useMetaAttribution } from '@/hooks/useMetaAttribution';
import { useCollaboratorReferral } from '@/hooks/useCollaboratorReferral';
import { EnergySavingsFlow } from '@/components/energy-savings/EnergySavingsFlow';
import { AhorroLuzHero } from '@/components/energy-savings/AhorroLuzHero';
import { AhorroLuzBrandHeader } from '@/components/energy-savings/AhorroLuzBrandHeader';
import { AhorroLuzCookieConsent } from '@/components/energy-savings/AhorroLuzCookieConsent';
import { AhorroLuzPublicFooter } from '@/components/energy-savings/AhorroLuzPublicFooter';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { extractPdfTextFromFile } from '@/lib/pdf-text-client';
import {
  AHORRO_FORM_CONTROL_ACCENT,
  AHORRO_LUZ_CTA_GREEN,
} from '@/lib/ahorro-luz-public-ui';
const MAX_PDF_TEXT_CHARS = 350_000;
const LEAD_ATTACHMENTS_BUCKET = 'lead-attachments';
/** Sin espera artificial: el resultado aparece en cuanto responde la API. */
const LANDING_POST_SUBMIT_LOADER_MS = 0;

const IMAGE_COMPRESSION_OPTIONS = {
  maxSizeMB: 0.6,
  maxWidthOrHeight: 1200,
  useWebWorker: true,
};

const AHORRO_LUZ_DEFAULT_SOURCE: NonNullable<FormConfig['source']> = 'web_form';
const AHORRO_LUZ_DEFAULT_CAMPAIGN: NonNullable<FormConfig['campaign']> = 'ahorro_luz_gas';

const CONTACT_QUESTION_SHARED = {
  id: 'contact',
  type: 'contact' as const,
  label: '',
  required: true,
  privacyNote:
    'Trataremos tus datos para darte respuesta y enviarte ofertas e información promocional sobre nuestros servicios por diversos medios.',
  privacyNoteHighlight: 'darte respuesta',
  /** Texto bajo la fila Atrás / Enviar / Siguiente */
  privacyNoteBelowActions: true,
};

const CONTACT_AFTER_FILE: Question = {
  ...CONTACT_QUESTION_SHARED,
  header: 'Indícanos tus datos de contacto y revisaremos contigo:',
  reviewPoints: [
    'Sobrecostes actuales',
    'Precio €/kWh de tu tarifa actual',
    'Optimización de la potencia contratada*',
  ],
};

const CONTACT_MANUAL: Question = {
  ...CONTACT_QUESTION_SHARED,
  header: 'Indícanos tus datos de contacto y revisaremos contigo:',
  reviewPoints: [
    'Sobrecostes actuales',
    'Precio €/kWh de tu tarifa actual',
    'Optimización de la potencia contratada*',
  ],
};

const CONTACT_CALLBACK: Question = {
  ...CONTACT_QUESTION_SHARED,
  header: 'Déjanos tu teléfono o email y te llamamos lo antes posible.',
};

const FACTURA_MENSUAL: Question = {
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
};

const COMPANIA: Question = {
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
};

const POTENCIA: Question = {
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
};

const ADJUNTAR_FACTURA: Question = {
  id: 'adjuntar_factura',
  type: 'file_upload',
  label: 'Tu factura',
  required: true,
  maxSizeMb: 10,
  description: '',
};

const QUESTIONS_UPLOAD: Question[] = [ADJUNTAR_FACTURA, CONTACT_AFTER_FILE];
const QUESTIONS_MANUAL: Question[] = [FACTURA_MENSUAL, COMPANIA, POTENCIA, CONTACT_MANUAL];
const QUESTIONS_CALLBACK: Question[] = [CONTACT_CALLBACK];

export type LandingFormMode = 'upload' | 'manual' | 'callback';

function readForcedEntryModeFromUrl(): LandingFormMode | null {
  const params = new URLSearchParams(window.location.search);
  const entry = params.get('entry')?.trim().toLowerCase();
  if (entry === 'upload' || entry === 'manual' || entry === 'callback') return entry;
  return null;
}

function LandingFormSteps({
  mode,
  initialFile,
  onBackToHero,
  onLeadSuccess,
  attribution,
  clearAttribution,
  leadSource,
  leadCampaign,
  collaboratorMeta,
  collaboratorId,
}: {
  mode: LandingFormMode;
  initialFile: File | null;
  onBackToHero: () => void;
  onLeadSuccess: (lead: { id: string }, payload: LeadPayload) => void;
  attribution: ReturnType<typeof useMetaAttribution>['attribution'];
  clearAttribution: () => void;
  leadSource: string;
  leadCampaign?: string;
  collaboratorMeta?: Record<string, unknown>;
  collaboratorId?: string;
}) {
  const questions = useMemo(() => {
    if (mode === 'upload') return QUESTIONS_UPLOAD;
    if (mode === 'manual') return QUESTIONS_MANUAL;
    return QUESTIONS_CALLBACK;
  }, [mode]);

  const extraCustomFields = useMemo(() => {
    const o: Record<string, unknown> = { landing_entry_path: mode };
    if (mode === 'upload') o.tiene_factura = 'subir';
    if (mode === 'manual') o.tiene_factura = 'no';
    if (mode === 'callback') o.landing_callback_only = true;
    if (collaboratorMeta) Object.assign(o, collaboratorMeta);
    return o;
  }, [mode, collaboratorMeta]);

  const [validationError, setValidationError] = useState<string | null>(null);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  const autoAdvanceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contactValuesRef = useRef<Record<string, string>>({});
  const formContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const heroFileConsumedKey = useRef<string | null>(null);

  /** Factura ya elegida en el hero: se sube en segundo plano y se entra directo en contacto. */
  const skipHeroFileStep = mode === 'upload' && initialFile != null;

  const uploadLeadAttachment = useCallback(
    async (file: File): Promise<{ name: string; path: string; pdf_text?: string }> => {
      let fileToUpload = file;
      if (file.type.startsWith('image/')) {
        try {
          fileToUpload = await imageCompression(file, IMAGE_COMPRESSION_OPTIONS);
        } catch (e) {
          console.warn('Compresión de imagen fallida, se sube original:', e);
        }
      }

      const [rawPdfText, uploadPath] = await Promise.all([
        extractPdfTextFromFile(file),
        (async () => {
          const p = `${crypto.randomUUID()}/${fileToUpload.name}`;
          const { error } = await supabase.storage
            .from(LEAD_ATTACHMENTS_BUCKET)
            .upload(p, fileToUpload, { upsert: false });
          if (error) {
            toast({ title: 'Error al subir el archivo', description: error.message, variant: 'destructive' });
            throw error;
          }
          return p;
        })(),
      ]);

      const pdfText =
        rawPdfText && rawPdfText.length > 0
          ? rawPdfText.length > MAX_PDF_TEXT_CHARS
            ? rawPdfText.slice(0, MAX_PDF_TEXT_CHARS)
            : rawPdfText
          : undefined;

      return { name: file.name, path: uploadPath, ...(pdfText ? { pdf_text: pdfText } : {}) };
    },
    [],
  );

  const {
    currentQuestion,
    currentIndex,
    isFirst,
    isLast,
    answers,
    setAnswer,
    goNext,
    goPrev,
    submit,
    submitStatus,
    submitError,
  } = useFormState({
    questions,
    collaboratorId,
    source: leadSource,
    campaign: leadCampaign,
    attribution,
    clearAttribution,
    leadEntryApiUrl: import.meta.env.VITE_LEAD_ENTRIES_API_URL ?? '/api/lead-entries',
    onSuccess: onLeadSuccess,
    extraCustomFields,
    initialStepIndex: skipHeroFileStep ? 1 : 0,
  });

  const heroAttachmentReady = useMemo(() => {
    const adj = answers.adjuntar_factura;
    return (
      !!adj &&
      typeof adj === 'object' &&
      'path' in adj &&
      typeof (adj as { path: unknown }).path === 'string' &&
      (adj as { path: string }).path.length > 0
    );
  }, [answers.adjuntar_factura]);

  const heroUploadStillPending = skipHeroFileStep && !heroAttachmentReady;

  useEffect(() => {
    if (heroAttachmentReady) setValidationError((e) => (e?.includes('subirse la factura') ? null : e));
  }, [heroAttachmentReady]);

  const fileFingerprint = initialFile
    ? `${initialFile.name}-${initialFile.size}-${initialFile.lastModified}`
    : null;

  useEffect(() => {
    if (mode !== 'upload' || !initialFile || !fileFingerprint) return;
    if (heroFileConsumedKey.current === fileFingerprint) return;
    heroFileConsumedKey.current = fileFingerprint;
    let cancelled = false;
    (async () => {
      try {
        const result = await uploadLeadAttachment(initialFile);
        if (!cancelled) setAnswer('adjuntar_factura', result);
      } catch {
        heroFileConsumedKey.current = null;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, initialFile, fileFingerprint, uploadLeadAttachment, setAnswer]);

  const hasSelection = useMemo(() => {
    if (!currentQuestion) return false;
    const val = answers[currentQuestion.id];
    if (currentQuestion.type === 'contact') return true;
    if (currentQuestion.type === 'file_upload')
      return !!val && (typeof val === 'object' ? !!(val as { path?: string }).path || !!(val as { name?: string }).name : true);
    if (currentQuestion.type === 'checkbox') return Array.isArray(val) && val.length > 0;
    return val !== undefined && val !== null && val !== '';
  }, [currentQuestion, answers]);

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
      let value: string | number | string[] | Record<string, string> | undefined =
        valueOverride ??
        (currentQuestion.type === 'contact'
          ? (Object.keys(contactValuesRef.current).length ? contactValuesRef.current : answers[currentQuestion.id])
          : answers[currentQuestion.id]) as string | number | string[] | Record<string, string> | undefined;
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
      if (isLast && heroUploadStillPending) {
        setValidationError('Espera un momento a que termine de subirse la factura.');
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
      } else goNext();
      setTimeout(scrollToTop, 100);
    },
    [currentQuestion, answers, isLast, submit, goNext, scrollToTop, setAnswer, heroUploadStillPending],
  );

  const backToHeroFromSkippedUpload =
    skipHeroFileStep && currentIndex === 1 && questions[0]?.id === 'adjuntar_factura';

  const handlePrev = useCallback(() => {
    setValidationError(null);
    setDirection('prev');
    if (isFirst || backToHeroFromSkippedUpload) {
      onBackToHero();
      setTimeout(scrollToTop, 100);
      return;
    }
    goPrev();
    setTimeout(scrollToTop, 100);
  }, [isFirst, backToHeroFromSkippedUpload, goPrev, onBackToHero, scrollToTop]);

  const handleSelectAndAdvance = useCallback(
    (selectedValue: string) => {
      if (autoAdvanceTimeout.current) clearTimeout(autoAdvanceTimeout.current);
      autoAdvanceTimeout.current = setTimeout(() => {
        handleNext(selectedValue);
        autoAdvanceTimeout.current = null;
      }, 300);
    },
    [handleNext],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Enter' || e.shiftKey) return;
      // Tras elegir archivo, a veces el SO envía Enter al cerrar el diálogo: no avanzar de paso solo por eso.
      if (currentQuestion?.type === 'file_upload') {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      handleNext();
    },
    [handleNext, currentQuestion?.type],
  );

  const isRadioWithLetters =
    currentQuestion?.type === 'radio' && (currentQuestion as { optionLetters?: boolean }).optionLetters;

  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      });
    });
  }, [currentQuestion?.id, submitStatus]);

  if (!currentQuestion) {
    return null;
  }

  const centerIsElegirArchivo =
    currentQuestion.type === 'file_upload' && !answers[currentQuestion.id];
  const greenCenterCta =
    submitStatus !== 'loading' &&
    !(heroUploadStillPending && isLast) &&
    !centerIsElegirArchivo;
  const widerEnviar =
    isLast && submitStatus !== 'loading' && !heroUploadStillPending;

  return (
    <div className="flex min-h-screen flex-col bg-white antialiased">
      <AhorroLuzBrandHeader />

      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center px-4 pb-8 pt-2 sm:px-6">
          <div
            key={currentQuestion.id}
            onKeyDown={handleKeyDown}
            className={cn(
              'w-full max-w-xl mx-auto animate-in duration-300',
              direction === 'next' && 'fade-in slide-in-from-right-4',
              direction === 'prev' && 'fade-in slide-in-from-left-4'
            )}
          >
            <div className="mb-6 text-center">
              {currentQuestion.type === 'contact' && 'header' in currentQuestion && currentQuestion.header ? (
                <h1 className="mx-auto max-w-lg text-xl font-semibold leading-tight text-neutral-900 sm:text-2xl">
                  {currentQuestion.header}
                </h1>
              ) : currentQuestion.type !== 'contact' ? (
                <h1 className="mx-auto max-w-lg text-xl font-extrabold leading-tight tracking-tight text-neutral-950 sm:text-2xl">
                  {currentQuestion.label}
                  {currentQuestion.required !== false && <span className="ml-0.5 text-red-500">*</span>}
                </h1>
              ) : null}
            </div>

            <div
              className={cn(
                currentQuestion.type === 'contact' ? 'text-left' : 'text-center',
                currentQuestion.type !== 'contact' &&
                  '[&_input]:h-12 [&_input]:rounded-xl [&_input]:border [&_input]:border-neutral-300 [&_input]:text-lg'
              )}
            >
              <QuestionStep
                accentColor={AHORRO_FORM_CONTROL_ACCENT}
                question={currentQuestion}
                value={
                  answers[currentQuestion.id] as
                    | string
                    | number
                    | string[]
                    | Record<string, string>
                    | undefined
                }
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
                fileInputRef={currentQuestion.type === 'file_upload' ? fileInputRef : undefined}
                onUploadFile={currentQuestion.type === 'file_upload' ? uploadLeadAttachment : undefined}
              />
            </div>

            {validationError && <p className="mt-3 text-sm text-red-500 text-center">{validationError}</p>}
            {submitError && <p className="mt-3 text-sm text-red-500 text-center">{submitError}</p>}

            <div className="mt-10 grid grid-cols-3 items-center gap-2 w-full max-w-full">
              <div className="flex justify-start min-w-0">
                <button
                  type="button"
                  onClick={handlePrev}
                  disabled={submitStatus === 'loading'}
                  className={cn(
                    'flex items-center gap-1 sm:gap-2 p-2 rounded-lg transition-colors',
                    submitStatus === 'loading'
                      ? 'cursor-not-allowed text-neutral-300'
                      : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                  )}
                  title={isFirst || backToHeroFromSkippedUpload ? 'Volver al inicio' : 'Atrás'}
                >
                  <ChevronLeft className="h-6 w-6 shrink-0" />
                  <span className="text-sm font-medium hidden sm:inline">
                    {isFirst || backToHeroFromSkippedUpload ? 'Inicio' : 'Atrás'}
                  </span>
                </button>
              </div>

              <div className="flex justify-center min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    if (currentQuestion?.type === 'file_upload' && !answers[currentQuestion.id]) {
                      fileInputRef.current?.click();
                    } else {
                      handleNext();
                    }
                  }}
                  disabled={
                    submitStatus === 'loading' ||
                    heroUploadStillPending ||
                    (currentQuestion?.type !== 'file_upload' && !hasSelection)
                  }
                  className={cn(
                    'flex max-w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm transition-[filter] sm:text-base whitespace-nowrap',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    greenCenterCta
                      ? 'border border-neutral-900/15 font-semibold text-neutral-900 hover:brightness-[0.97]'
                      : 'border border-neutral-300 bg-white font-medium text-neutral-900 hover:bg-neutral-50',
                    widerEnviar && 'min-w-[13rem] max-w-[min(100%,18rem)] px-6 sm:min-w-[16rem] sm:px-10'
                  )}
                  style={greenCenterCta ? { backgroundColor: AHORRO_LUZ_CTA_GREEN } : undefined}
                >
                  {submitStatus === 'loading' ? (
                    <>
                      <Loader2 className="h-5 w-5 shrink-0 animate-spin text-neutral-900" />
                      Enviando...
                    </>
                  ) : heroUploadStillPending && isLast ? (
                    <>
                      <Loader2 className="h-5 w-5 shrink-0 animate-spin text-neutral-900" />
                      Subiendo factura…
                    </>
                  ) : isLast ? (
                    'Enviar'
                  ) : currentQuestion?.type === 'file_upload' && !answers[currentQuestion.id] ? (
                    'Elegir archivo'
                  ) : (
                    'Aceptar'
                  )}
                </button>
              </div>

              <div className="flex justify-end min-w-0">
                <button
                  type="button"
                  onClick={() => handleNext()}
                  disabled={
                    isLast ||
                    submitStatus === 'loading' ||
                    !hasSelection ||
                    currentQuestion?.type === 'file_upload'
                  }
                  className={cn(
                    'flex items-center gap-1 sm:gap-2 p-2 rounded-lg transition-colors',
                    isLast ||
                      submitStatus === 'loading' ||
                      !hasSelection ||
                      currentQuestion?.type === 'file_upload'
                      ? 'cursor-not-allowed text-neutral-300'
                      : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                  )}
                  title={
                    currentQuestion?.type === 'file_upload'
                      ? 'Usa Aceptar para continuar cuando hayas subido la factura'
                      : 'Siguiente'
                  }
                >
                  <span className="text-sm font-medium hidden sm:inline">Siguiente</span>
                  <ChevronRight className="h-6 w-6 shrink-0" />
                </button>
              </div>
            </div>

            {currentQuestion.type === 'contact' &&
              currentQuestion.privacyNoteBelowActions &&
              currentQuestion.privacyNote && (
                <div className="mx-auto mt-5 max-w-lg px-1 text-center">
                  <ContactPrivacyNote
                    note={currentQuestion.privacyNote}
                    highlight={currentQuestion.privacyNoteHighlight}
                    highlightHref={currentQuestion.privacyNoteHighlightHref}
                  />
                </div>
              )}
          </div>
        </div>
        <AhorroLuzPublicFooter />
      </div>
    </div>
  );
}

export default function AhorroLuz() {
  const forcedEntryMode = useMemo(readForcedEntryModeFromUrl, []);
  const [phase, setPhase] = useState<'hero' | 'form' | 'success'>(() => (forcedEntryMode ? 'form' : 'hero'));
  const [formMode, setFormMode] = useState<LandingFormMode | null>(() => forcedEntryMode);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const [lastLeadId, setLastLeadId] = useState<string | null>(null);
  const [lastFacturaPath, setLastFacturaPath] = useState<string | null>(null);
  const [invoicePdfTextForFlow, setInvoicePdfTextForFlow] = useState<string | null>(null);
  const [successEntryPath, setSuccessEntryPath] = useState<string | null>(null);

  const { attribution, clearAttribution } = useMetaAttribution();
  const {
    collaborator,
    requestedCode,
    hasCollaboratorInUrl,
    loading: collaboratorLoading,
    entryMode: collaboratorEntryMode,
  } = useCollaboratorReferral();

  const collaboratorMeta = useMemo(() => {
    if (!collaborator) return undefined;
    return {
      collaborator_id: collaborator.id,
      collaborator_code: collaborator.code,
      collaborator_name: collaborator.name,
    };
  }, [collaborator]);

  const leadSource = collaborator ? 'collaborator_referral' : AHORRO_LUZ_DEFAULT_SOURCE;
  const leadCampaign = collaborator ? `collaborator:${collaborator.code}` : AHORRO_LUZ_DEFAULT_CAMPAIGN;
  const collaboratorEntryModeResolved = collaboratorEntryMode !== 'auto' ? collaboratorEntryMode : null;

  useEffect(() => {
    if (forcedEntryMode || !collaboratorEntryModeResolved || phase === 'success') return;
    setFormMode(collaboratorEntryModeResolved);
    setPhase('form');
  }, [forcedEntryMode, collaboratorEntryModeResolved, phase]);

  const handleLeadSuccess = useCallback((lead: { id: string }, payload: LeadPayload) => {
    setLastLeadId(lead.id);
    const adj = payload.custom_fields?.adjuntar_factura;
    const path =
      adj && typeof adj === 'object' && adj !== null && 'path' in adj && typeof (adj as { path: unknown }).path === 'string'
        ? (adj as { path: string }).path
        : null;
    setLastFacturaPath(path);
    const pdfAdj = adj && typeof adj === 'object' && adj !== null && 'pdf_text' in adj ? (adj as { pdf_text?: string }).pdf_text : undefined;
    setInvoicePdfTextForFlow(typeof pdfAdj === 'string' && pdfAdj.trim() ? pdfAdj.trim() : null);
    const ep = payload.custom_fields?.landing_entry_path;
    setSuccessEntryPath(typeof ep === 'string' ? ep : null);
  }, []);

  const handleReset = useCallback(() => {
    setLastLeadId(null);
    setLastFacturaPath(null);
    setInvoicePdfTextForFlow(null);
    setSuccessEntryPath(null);
    setPhase(forcedEntryMode ? 'form' : 'hero');
    setFormMode(forcedEntryMode);
    setPendingFile(null);
  }, [forcedEntryMode]);

  const onFormSuccessWrapper = useCallback(
    (lead: { id: string }, payload: LeadPayload) => {
      handleLeadSuccess(lead, payload);
      setFormMode(null);
      setPendingFile(null);
      setPhase('success');
    },
    [handleLeadSuccess],
  );

  const goToForm = useCallback((mode: LandingFormMode, file: File | null = null) => {
    setFormMode(mode);
    setPendingFile(file);
    setPhase('form');
  }, []);

  const backToHero = useCallback(() => {
    setPhase('hero');
    setFormMode(null);
    setPendingFile(null);
  }, []);

  const formKey = formMode ? `${formMode}-${pendingFile?.name ?? ''}-${pendingFile?.lastModified ?? 0}` : 'none';

  if (phase === 'success' && lastLeadId) {
    const showEnergyFlow = !!lastFacturaPath;
    const isManualThanks = successEntryPath === 'manual';
    const isCallbackThanks = successEntryPath === 'callback';

    return (
      <>
        <div className="flex min-h-screen flex-col bg-white antialiased">
          <AhorroLuzBrandHeader />
          <div className="flex flex-1 flex-col">
            {showEnergyFlow ? (
              <div className="flex flex-1 flex-col items-center justify-center px-4 pb-8 pt-2 sm:px-6">
                <div className="w-full max-w-xl mx-auto text-center animate-in fade-in duration-300 space-y-6">
                  <EnergySavingsFlow
                    leadId={lastLeadId}
                    attachmentPath={lastFacturaPath!}
                    onReset={handleReset}
                    compactLoader
                    fixedResultLoaderMs={LANDING_POST_SUBMIT_LOADER_MS}
                    attachmentPdfText={invoicePdfTextForFlow}
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center px-4 pb-8 pt-2 sm:px-6">
                <div className="mx-auto w-full max-w-lg space-y-6 text-center animate-in fade-in duration-500">
                  <h2 className="text-2xl font-semibold text-neutral-950 sm:text-3xl">¡Gracias!</h2>
                  {isManualThanks ? (
                    <>
                      <p className="text-xl font-bold text-neutral-950 sm:text-2xl">
                        ¿Sabías que cerca del 99% de las facturas que recibimos les mejoramos el precio? Seguro que la tuya
                        también! 💪
                      </p>
                      <p className="text-lg text-neutral-600">Un asesor te contactará pronto para ponernos manos a la obra</p>
                      <button type="button" onClick={handleReset} className="text-lg font-medium text-neutral-900 underline-offset-4 hover:underline">
                        Enviar otra solicitud
                      </button>
                    </>
                  ) : isCallbackThanks ? (
                    <>
                      <p className="text-lg text-neutral-700">
                        Te llamaremos lo antes posible con el número o email que nos has dejado.
                      </p>
                      <button type="button" onClick={handleReset} className="text-lg font-medium text-neutral-900 underline-offset-4 hover:underline">
                        Enviar otra solicitud
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-lg text-neutral-600">
                        Un asesor te contactará en las próximas horas para ayudarte a ahorrar en tu factura.
                      </p>
                      <button type="button" onClick={handleReset} className="text-lg font-medium text-neutral-900 underline-offset-4 hover:underline">
                        Enviar otra solicitud
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
            <AhorroLuzPublicFooter />
          </div>
        </div>
        <AhorroLuzCookieConsent />
      </>
    );
  }

  if (phase === 'form' && formMode) {
    return (
      <>
        <LandingFormSteps
          key={formKey}
          mode={formMode}
          initialFile={pendingFile}
          onBackToHero={backToHero}
          onLeadSuccess={onFormSuccessWrapper}
          attribution={collaborator ? null : attribution}
          clearAttribution={clearAttribution}
          leadSource={leadSource}
          leadCampaign={leadCampaign}
          collaboratorMeta={collaboratorMeta}
          collaboratorId={collaborator?.id}
        />
        {collaborator && (
          <p className="px-4 pb-2 text-center text-sm text-muted-foreground">
            Solicitud vinculada al colaborador <span className="font-medium">{collaborator.name}</span>.
          </p>
        )}
        {!collaboratorLoading && !collaborator && hasCollaboratorInUrl && requestedCode && (
          <p className="px-4 pb-2 text-center text-sm text-amber-700">
            El colaborador <span className="font-medium">{requestedCode}</span> no esta activo.
          </p>
        )}
        <AhorroLuzCookieConsent />
      </>
    );
  }

  return (
    <>
      <AhorroLuzHero
        onFileSelected={(file) => goToForm('upload', file)}
        onManualData={() => goToForm('manual', null)}
        onRequestCall={() => goToForm('callback', null)}
      />
      <AhorroLuzCookieConsent />
    </>
  );
}
