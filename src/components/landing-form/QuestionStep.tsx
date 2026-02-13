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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { isValidEmail } from './utils';
import type { Question } from './types';

export interface QuestionStepProps {
  question: Question;
  value: string | number | string[] | undefined;
  onChange: (value: string | number | string[]) => void;
  onBlur?: () => void;
  error?: string;
  disabled?: boolean;
  /** Oculta el label (útil cuando el padre renderiza la pregunta) */
  hideLabel?: boolean;
}

export function QuestionStep({
  question,
  value,
  onChange,
  onBlur,
  error,
  disabled,
  hideLabel,
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
      return (
        <div className="space-y-4">
          {baseInput}
          <RadioGroup
            value={(value as string) ?? ''}
            onValueChange={(v) => handleChange(v)}
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
  value: string | number | string[] | undefined
): string | null {
  const required = question.required !== false;

  if (required) {
    if (value === undefined || value === null || value === '') return 'Campo obligatorio';
    if (Array.isArray(value) && value.length === 0) return 'Selecciona al menos una opción';
  }

  if (question.type === 'email' && value) {
    if (!isValidEmail(String(value))) return 'Email no válido';
  }

  return null;
}
