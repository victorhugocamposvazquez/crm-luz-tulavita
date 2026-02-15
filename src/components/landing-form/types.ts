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
  | 'checkbox'
  | 'file_upload'
  | 'contact';

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
  /** Mostrar letras A, B, C... en las opciones */
  optionLetters?: boolean;
  /** Opción "Otra" con input de texto libre */
  otherOption?: { value: string; placeholder: string };
}

export interface CheckboxQuestion extends BaseQuestion {
  type: 'checkbox';
  options: QuestionOption[];
}

export interface FileUploadQuestion extends BaseQuestion {
  type: 'file_upload';
  accept?: string;
  maxSizeMb?: number;
  description?: string;
}

export interface ContactQuestion extends BaseQuestion {
  type: 'contact';
  /** Texto de encabezado */
  header?: string;
  /** Puntos a revisar (con checkmark) */
  reviewPoints?: string[];
  /** Aviso de privacidad */
  privacyNote?: string;
  /** Texto a subrayar dentro del aviso de privacidad */
  privacyNoteHighlight?: string;
}

export type Question =
  | TextQuestion
  | NumberQuestion
  | EmailQuestion
  | PhoneQuestion
  | SelectQuestion
  | RadioQuestion
  | CheckboxQuestion
  | FileUploadQuestion
  | ContactQuestion;

/** Atribución Meta (utm_* / fbclid). Usado por useMetaAttribution. */
export interface MetaAttribution {
  source?: string;
  campaign?: string;
  adset?: string;
  ad?: string;
}

export interface FormConfig {
  questions: Question[];
  source?: string;
  campaign?: string;
  adset?: string;
  ad?: string;
  /** Prioridad sobre source/campaign/adset/ad del config cuando está presente. */
  attribution?: MetaAttribution;
  /** Llamar tras envío exitoso para limpiar atribución persistida. */
  clearAttribution?: () => void;
  /** URL para crear lead_entry + conversación tras crear lead (CRM). */
  leadEntryApiUrl?: string;
}

export interface ContactValue {
  name?: string;
  phone?: string;
  email?: string;
}

export interface FormAnswers {
  [questionId: string]: string | number | string[] | ContactValue | undefined;
}

export interface LeadPayload {
  name?: string;
  email?: string;
  phone?: string;
  source: string;
  campaign?: string;
  adset?: string;
  ad?: string;
  custom_fields: Record<string, unknown>;
}
