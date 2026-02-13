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
}: QuestionStepProps) {
  const id = `q-${question.id}`;
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
      const useLetters = question.optionLetters ?? false;
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      const handleRadioChange = (v: string) => {
        handleChange(v);
        onSelect?.(v);
      };
      return (
        <div className="space-y-4">
          {baseInput}
          <RadioGroup
            value={(value as string) ?? ''}
            onValueChange={handleRadioChange}
            disabled={disabled}
            className="flex flex-col gap-3"
          >
            {question.options.map((opt, idx) => {
              const letter = useLetters ? letters[idx] : null;
              const selected = value === opt.value;
              return (
                <label
                  key={opt.value}
                  className={cn(
                    'flex items-center gap-4 rounded-xl border-2 p-4 cursor-pointer transition-all',
                    'hover:border-gray-300',
                    selected
                      ? useLetters
                        ? 'border-black bg-white'
                        : 'border-primary bg-accent/30'
                      : 'border-gray-200'
                  )}
                >
                  {useLetters ? (
                    <>
                      <span
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                          selected ? 'bg-black text-white' : 'border-2 border-gray-300 text-gray-600'
                        )}
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
                  <span className="text-base">{opt.label}</span>
                </label>
              );
            })}
          </RadioGroup>
        </div>
      );

    case 'file_upload':
      const fileQ = question as import('./types').FileUploadQuestion;
      const maxSize = (fileQ.maxSizeMb ?? 10) * 1024 * 1024;
      return (
        <div className="space-y-4">
          {baseInput}
          {fileQ.description && (
            <p className="text-sm text-gray-600 mb-2">{fileQ.description}</p>
          )}
          <label className="flex flex-col items-center justify-center w-full min-h-[180px] border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-gray-400 transition-colors bg-gray-50/50">
            <input
              type="file"
              className="hidden"
              accept={fileQ.accept ?? '.pdf,image/*'}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && file.size <= maxSize) {
                  onChange(file.name);
                }
                e.target.value = '';
              }}
              disabled={disabled}
            />
            <div className="flex flex-col items-center gap-2 py-8 px-4">
              <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span className="text-sm text-gray-600">Elige el archivo o arrastra aquí</span>
              <span className="text-xs text-gray-400">Límite de tamaño: {fileQ.maxSizeMb ?? 10}MB</span>
            </div>
          </label>
        </div>
      );

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
        <div className="space-y-6">
          {contactQ.reviewPoints && contactQ.reviewPoints.length > 0 && (
            <ul className="space-y-2">
              {contactQ.reviewPoints.map((point, i) => (
                <li key={i} className="flex items-center gap-2 text-gray-700">
                  <span className="text-green-600 text-lg">✓</span>
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
              <Label className="text-sm font-medium text-gray-900 mb-1">Nombre</Label>
              <Input
                className="h-11 border-0 border-b-2 border-gray-300 rounded-none px-0 focus-visible:ring-0 focus-visible:border-blue-600 focus-visible:border-b-2 transition-colors bg-transparent placeholder:text-gray-400"
                placeholder="Carlos"
                value={contactVal.name ?? ''}
                onChange={(e) => updateContact('name', e.target.value)}
                disabled={disabled}
              />
            </div>
            {/* Teléfono - Material style con bandera y selector */}
            <div className="flex flex-col">
              <Label className="text-sm font-medium text-gray-900 mb-1">Número de teléfono *</Label>
              <div className="flex items-center border-b-2 border-gray-300 focus-within:border-blue-600 focus-within:border-b-2 transition-colors">
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
                  className="flex-1 h-11 border-0 rounded-none px-0 focus-visible:ring-0 bg-transparent placeholder:text-gray-400"
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
              <Label className="text-sm font-medium text-gray-900 mb-1">Correo electrónico *</Label>
              <Input
                type="email"
                className="h-11 border-0 border-b-2 border-gray-300 rounded-none px-0 focus-visible:ring-0 focus-visible:border-blue-600 focus-visible:border-b-2 transition-colors bg-transparent placeholder:text-gray-400"
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
    const phone = (v?.phone ?? v?.telefono ?? '').toString().replace(/\s/g, '');
    if (!phone || phone.length < 8) return 'El teléfono es obligatorio';
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
