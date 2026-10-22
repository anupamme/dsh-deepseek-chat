import type { ChatLanguage } from './website-settings.js';
/** Translate plugin-owned display text; keep state values and user content intact. */
export declare function translate(language: ChatLanguage | null, source: string | null | undefined): string;
