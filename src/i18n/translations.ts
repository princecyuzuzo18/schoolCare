import { en } from './en';
import { rw } from './rw';

export const translations = {
  en,
  rw
} as const;

export type TranslationKey = keyof typeof en;
