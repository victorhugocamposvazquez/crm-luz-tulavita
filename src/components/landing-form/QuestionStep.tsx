/**
 * Componente que renderiza cada tipo de pregunta
 */

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronDown } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { isValidEmail } from './utils';
import type { Question } from './types';

export interface QuestionStepProps {
  question: Question;
  value: string | number | string[] | Record<string, string> | undefined;
  onChange: (value: string | number | string[] | Record<string, string>) => void;
  onBlur?: () => void;
  error?: string;
  disabled?: boolean;
  /** Oculta el label (útil cuando el padre renderiza la pregunta) */
  hideLabel?: boolean;
  /** Llamado al seleccionar (para auto-avanzar en radio/select). Recibe el valor seleccionado. */
  onSelect?: (value: string) => void;
  /** Ref para leer valores del DOM (fallback para contacto en validación) */
  formContainerRef?: React.RefObject<HTMLDivElement | null>;
  /** Ref del input file (para que el padre pueda abrir el selector o limpiar) */
  fileInputRef?: React.RefObject<HTMLInputElement | null>;
  /** Si se proporciona, al elegir archivo se sube y se guarda { name, path }; si no, solo se guarda el nombre (string) */
  onUploadFile?: (file: File) => Promise<{ name: string; path: string }>;
  /** Color de acento (bordes radio, contacto, subida). Por defecto verde corporativo CRM. */
  accentColor?: string;
}

export function QuestionStep({
  question,
  value,
  onChange,
  onBlur,
  error,
  disabled,
  hideLabel,
  onSelect,
  formContainerRef,
  fileInputRef,
  onUploadFile,
  accentColor = '#26606b',
}: QuestionStepProps) {
  const id = `q-${question.id}`;
  const accent = accentColor;
  const [uploadLoading, setUploadLoading] = React.useState(false);
  const isRequired = question.required !== false;

  const handleChange = (v: string | number | string[]) => {
    onChange(v);
  };

  const baseInput = !hideLabel ? (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-lg font-medium">
        {question.label}
        {isRequired && <span className="text-destructive ml-1">*</span>}
      </Label>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  ) : null;

  switch (question.type) {
    case 'text':
      return (
        <div className="space-y-4">
          {baseInput}
          <Input
            id={id}
            type="text"
            placeholder={question.placeholder}
            value={(value as string) ?? ''}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={onBlur}
            disabled={disabled}
            className="h-12 text-base"
            autoFocus
          />
        </div>
      );

    case 'number':
      return (
        <div className="space-y-4">
          {baseInput}
          <Input
            id={id}
            type="number"
            placeholder={question.placeholder}
            value={(value as number) ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              handleChange(v === '' ? '' : Number(v));
            }}
            onBlur={onBlur}
            disabled={disabled}
            min={question.min}
            max={question.max}
            className="h-12 text-base"
            autoFocus
          />
        </div>
      );

    case 'email':
      return (
        <div className="space-y-4">
          {baseInput}
          <Input
            id={id}
            type="email"
            placeholder={question.placeholder ?? 'tu@email.com'}
            value={(value as string) ?? ''}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={onBlur}
            disabled={disabled}
            className="h-12 text-base"
            autoComplete="email"
            autoFocus
          />
        </div>
      );

    case 'phone':
      return (
        <div className="space-y-4">
          {baseInput}
          <Input
            id={id}
            type="tel"
            placeholder={question.placeholder ?? '612 345 678'}
            value={(value as string) ?? ''}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={onBlur}
            disabled={disabled}
            className="h-12 text-base"
            autoComplete="tel"
            autoFocus
          />
        </div>
      );

    case 'select':
      return (
        <div className="space-y-4">
          {baseInput}
          <Select
            value={(value as string) ?? ''}
            onValueChange={handleChange}
            disabled={disabled}
          >
            <SelectTrigger className="h-12 text-base" id={id}>
              <SelectValue placeholder={question.placeholder ?? 'Selecciona...'} />
            </SelectTrigger>
            <SelectContent>
              {question.options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    case 'radio':
      const radioQ = question as import('./types').RadioQuestion;
      const useLetters = radioQ.optionLetters ?? false;
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      const otherOpt = radioQ.otherOption;
      const isOtherSelected = otherOpt && (value === otherOpt.value || (typeof value === 'string' && value.startsWith(otherOpt.value + ':')));
      const otherText = typeof value === 'string' && value.startsWith(otherOpt?.value + ':') ? value.slice(otherOpt!.value.length + 1) : '';
      const radioValue = isOtherSelected ? otherOpt!.value : (value as string) ?? '';
      const handleRadioChange = (v: string) => {
        handleChange(v);
        if (v !== otherOpt?.value) onSelect?.(v);
      };
      const handleLabelClick = (optValue: string) => {
        if (value === optValue && onSelect) onSelect(optValue);
      };
      const handleOtherInputChange = (text: string) => {
        handleChange(text.trim() ? `${otherOpt!.value}:${text.trim()}` : otherOpt!.value);
      };
      return (
        <div className="space-y-4">
          {baseInput}
          <RadioGroup
            value={radioValue}
            onValueChange={handleRadioChange}
            disabled={disabled}
            className="flex flex-col gap-2"
          >
            {radioQ.options.map((opt, idx) => {
              const letter = useLetters ? letters[idx] : null;
              const selected = radioValue === opt.value;
              return (
                <label
                  key={opt.value}
                  onClick={() => handleLabelClick(opt.value)}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 cursor-pointer transition-all',
                    'hover:border-neutral-300',
                    selected
                      ? useLetters
                        ? 'border-transparent bg-white'
                        : 'border-primary bg-accent/30'
                      : 'border-neutral-200'
                  )}
                  style={
                    selected && useLetters
                      ? { borderColor: accent, borderWidth: 2 }
                      : undefined
                  }
                >
                  {useLetters ? (
                    <>
                      <span
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                          selected ? 'text-white' : 'border-2 border-neutral-300 text-neutral-600'
                        )}
                        style={selected ? { backgroundColor: accent } : undefined}
                      >
                        {letter}
                      </span>
                      <RadioGroupItem
                        value={opt.value}
                        id={`${id}-${opt.value}`}
                        className="sr-only"
                      />
                    </>
                  ) : (
                    <RadioGroupItem value={opt.value} id={`${id}-${opt.value}`} />
                  )}
                  <span className="text-sm">{opt.label}</span>
                </label>
              );
            })}
          </RadioGroup>
          {otherOpt && isOtherSelected && (
            <Input
              type="text"
              placeholder={otherOpt.placeholder}
              value={otherText}
              onChange={(e) => handleOtherInputChange(e.target.value)}
              disabled={disabled}
              className="mt-2 h-10 text-sm border-gray-300"
              onFocus={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      );

    case 'file_upload': {
      const fileQ = question as import('./types').FileUploadQuestion;
      const maxSize = (fileQ.maxSizeMb ?? 10) * 1024 * 1024;
      const fileValue = value as string | { name: string; path: string } | undefined;
      const fileName = typeof fileValue === 'object' && fileValue && 'name' in fileValue ? fileValue.name : (fileValue ?? '');
      const hasFile = !!fileValue && (typeof fileValue === 'object' ? !!fileValue.name : String(fileValue).trim() !== '');
      const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || file.size > maxSize) return;
        if (onUploadFile) {
          setUploadLoading(true);
          try {
            const result = await onUploadFile(file);
            onChange(result);
          } catch {
            // Error: el padre puede mostrar toast; no actualizamos valor
          } finally {
            setUploadLoading(false);
          }
        } else {
          onChange(file.name);
        }
      };
      return (
        <div className="space-y-4" style={{ ['--form-accent' as string]: accent }}>
          {baseInput}
          {fileQ.description && (
            <p className="text-sm text-neutral-600 mb-2">{fileQ.description}</p>
          )}
          <label className="flex flex-col items-center justify-center w-full min-h-[180px] border-2 border-dashed rounded-2xl cursor-pointer transition-colors bg-neutral-50/60 border-neutral-300 hover:border-neutral-400 focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-[color:var(--form-accent)] focus-within:border-[color:var(--form-accent)] has-[:focus]:ring-2 has-[:focus]:ring-[color:var(--form-accent)] has-[:focus]:border-[color:var(--form-accent)]">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={fileQ.accept ?? '.pdf,image/*'}
              onChange={handleFileChange}
              disabled={disabled || uploadLoading}
            />
            {uploadLoading ? (
              <div className="flex flex-col items-center gap-3 py-8 px-4">
                <div className="h-12 w-12 animate-spin rounded-full border-2 border-neutral-200 border-t-[color:var(--form-accent)]" />
                <span className="text-sm text-neutral-600">Subiendo archivo...</span>
              </div>
            ) : hasFile ? (
              <div className="flex flex-col items-center gap-3 py-8 px-4">
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${accent}1a`, color: accent }}
                  aria-hidden
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <p className="text-sm font-medium text-neutral-800 text-center break-all px-2">
                  {fileName}
                </p>
                <p className="text-xs text-neutral-500">Archivo listo. Puedes cambiarlo si lo necesitas.</p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange('');
                    if (fileInputRef?.current) fileInputRef.current.value = '';
                  }}
                  className="text-sm font-medium hover:underline"
                  style={{ color: accent }}
                >
                  Elegir otro archivo
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-8 px-4">
                <svg className="w-12 h-12 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span className="text-sm text-neutral-600">Elige el archivo o arrastra aquí</span>
                <span className="text-xs text-neutral-400">Límite de tamaño: {fileQ.maxSizeMb ?? 10}MB</span>
              </div>
            )}
          </label>
        </div>
      );
    }

    case 'contact':
      const contactQ = question as import('./types').ContactQuestion;
      const contactVal = (value as Record<string, string>) ?? {};
      const updateContact = (field: string, v: string) => {
        onChange({ ...contactVal, [field]: v });
      };
      // Render privacy note with optional highlighted (underlined) text
      const renderPrivacyNote = () => {
        if (!contactQ.privacyNote) return null;
        const highlight = contactQ.privacyNoteHighlight;
        if (!highlight || !contactQ.privacyNote.includes(highlight)) {
          return <p className="text-sm text-gray-500">{contactQ.privacyNote}</p>;
        }
        const parts = contactQ.privacyNote.split(highlight);
        return (
          <p className="text-sm text-gray-500">
            {parts[0]}
            <span className="underline">{highlight}</span>
            {parts[1]}
          </p>
        );
      };
      return (
        <div className="space-y-6" ref={formContainerRef} style={{ ['--form-accent' as string]: accent }}>
          {contactQ.reviewPoints && contactQ.reviewPoints.length > 0 && (
            <ul className="space-y-2">
              {contactQ.reviewPoints.map((point, i) => (
                <li key={i} className="flex items-center gap-2 text-neutral-700">
                  <span className="text-lg" style={{ color: accent }}>
                    ✓
                  </span>
                  <span dangerouslySetInnerHTML={{ __html: point }} />
                </li>
              ))}
            </ul>
          )}
          {contactQ.privacyNote && (
            <div className="mb-6">{renderPrivacyNote()}</div>
          )}
          <div className="space-y-6">
            {/* Nombre - Material style */}
            <div className="flex flex-col">
              <Label className="mb-1 text-sm font-medium text-neutral-900">Nombre</Label>
              <Input
                data-contact-field="name"
                autoComplete="name"
                className="h-11 border-0 border-b-2 border-neutral-300 rounded-none px-0 bg-transparent transition-colors placeholder:text-neutral-400 focus-visible:border-b-2 focus-visible:ring-0 focus-visible:border-[color:var(--form-accent)] no-autofill-bg"
                placeholder="Carlos"
                value={contactVal.name ?? ''}
                onChange={(e) => updateContact('name', e.target.value)}
                disabled={disabled}
              />
            </div>
            {/* Teléfono - Material style con bandera y selector */}
            <div className="flex flex-col">
              <Label className="mb-1 text-sm font-medium text-neutral-900">Número de teléfono *</Label>
              <div className="flex items-center border-b-2 border-neutral-300 transition-colors focus-within:border-b-2 focus-within:border-[color:var(--form-accent)]">
                <button
                  type="button"
                  className="flex items-center gap-1 pl-0 pr-2 h-11 text-gray-700 hover:bg-gray-50 rounded transition-colors"
                  tabIndex={-1}
                >
                  <span className="text-xl" aria-hidden>🇪🇸</span>
                  <span className="text-sm font-medium">+34</span>
                  <ChevronDown className="h-4 w-4 text-gray-500" />
                </button>
                <Input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  data-contact-field="phone"
                  className="flex-1 h-11 border-0 rounded-none px-0 bg-transparent placeholder:text-neutral-400 focus-visible:ring-0 no-autofill-bg"
                  placeholder="612 34 56 78"
                  value={contactVal.phone ?? ''}
                  onChange={(e) => updateContact('phone', e.target.value)}
                  onInput={(e) => updateContact('phone', e.currentTarget.value)}
                  disabled={disabled}
                />
              </div>
            </div>
            {/* Email - Material style */}
            <div className="flex flex-col">
              <Label className="mb-1 text-sm font-medium text-neutral-900">Correo electrónico *</Label>
              <Input
                type="email"
                data-contact-field="email"
                autoComplete="email"
                className="h-11 border-0 border-b-2 border-neutral-300 rounded-none px-0 bg-transparent transition-colors placeholder:text-neutral-400 focus-visible:border-b-2 focus-visible:ring-0 focus-visible:border-[color:var(--form-accent)] no-autofill-bg"
                placeholder="nombre@ejemplo.com"
                value={contactVal.email ?? ''}
                onChange={(e) => updateContact('email', e.target.value)}
                disabled={disabled}
              />
            </div>
          </div>
        </div>
      );

    case 'checkbox':
      return (
        <div className="space-y-4">
          {baseInput}
          <div className="flex flex-col gap-3">
            {question.options.map((opt) => {
              const arr = (value as string[]) ?? [];
              const checked = arr.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border p-4 cursor-pointer transition-colors',
                    'hover:bg-accent/50',
                    checked && 'border-primary bg-accent/30'
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(c) => {
                      const next = c
                        ? [...arr, opt.value]
                        : arr.filter((v) => v !== opt.value);
                      handleChange(next);
                    }}
                    disabled={disabled}
                  />
                  <span className="text-base">{opt.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      );

    default:
      return null;
  }
}

export function validateQuestion(
  question: Question,
  value: string | number | string[] | Record<string, string> | undefined
): string | null {
  const required = question.required !== false;

  if (question.type === 'contact') {
    const v = value as Record<string, string> | undefined;
    const phone = (v?.phone ?? v?.telefono ?? '').toString().replace(/\s/g, '').replace(/\D/g, '');
    if (!phone || phone.length < 6) return 'El teléfono es obligatorio';
    if (!v?.email?.trim()) return 'El email es obligatorio';
    if (v.email && !isValidEmail(v.email)) return 'Email no válido';
    return null;
  }

  if (required) {
    if (value === undefined || value === null || value === '') return 'Campo obligatorio';
    if (Array.isArray(value) && value.length === 0) return 'Selecciona al menos una opción';
  }

  if (question.type === 'email' && value && typeof value === 'string') {
    if (!isValidEmail(value)) return 'Email no válido';
  }

  return null;
}
