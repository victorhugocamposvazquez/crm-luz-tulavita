/**
 * Tipos para el formulario multi-step tipo Typeform
 */

export type QuestionType =
  | 'text'
  | 'number'
  | 'email'
  | 'phone'
  | 'select'
  | 'radio'
  | 'checkbox';

export interface QuestionOption {
  value: string;
  label: string;
}

/** Condición para mostrar la pregunta: si questionId tiene valor en values, mostrar */
export interface QuestionCondition {
  questionId: string;
  value: string | string[]; // string[] para checkbox (cualquiera)
}

export interface BaseQuestion {
  id: string;
  type: QuestionType;
  label: string;
  required?: boolean;
  placeholder?: string;
  /** Mapea a name, email, phone en el payload final; resto va a custom_fields */
  mapTo?: 'name' | 'email' | 'phone';
  /** Mostrar solo si se cumple esta condición */
  showWhen?: QuestionCondition;
}

export interface TextQuestion extends BaseQuestion {
  type: 'text';
}

export interface NumberQuestion extends BaseQuestion {
  type: 'number';
  min?: number;
  max?: number;
}

export interface EmailQuestion extends BaseQuestion {
  type: 'email';
}

export interface PhoneQuestion extends BaseQuestion {
  type: 'phone';
}

export interface SelectQuestion extends BaseQuestion {
  type: 'select';
  options: QuestionOption[];
}

export interface RadioQuestion extends BaseQuestion {
  type: 'radio';
  options: QuestionOption[];
}

export interface CheckboxQuestion extends BaseQuestion {
  type: 'checkbox';
  options: QuestionOption[];
}

export type Question =
  | TextQuestion
  | NumberQuestion
  | EmailQuestion
  | PhoneQuestion
  | SelectQuestion
  | RadioQuestion
  | CheckboxQuestion;

export interface FormConfig {
  questions: Question[];
  source?: string;
  campaign?: string;
  adset?: string;
}

export interface FormAnswers {
  [questionId: string]: string | number | string[] | undefined;
}

export interface LeadPayload {
  name?: string;
  email?: string;
  phone?: string;
  source: string;
  campaign?: string;
  adset?: string;
  custom_fields: Record<string, unknown>;
}
