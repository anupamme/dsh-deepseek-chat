import type { WebsiteCommand } from './website-navigation.js';
export type ChatLanguage = 'zh-CN' | 'en';
/** DSH publishes its resolved locale through document language. No website default. */
export declare function readHostLanguage(doc: Document): ChatLanguage | null;
/** Public profile menu and General controls only; no site APIs or storage. */
export declare function adaptWebsiteSettings(doc: Document, profile: HTMLElement | null, command: WebsiteCommand): {
    language: string | null;
    theme: string | null;
    error: string | null;
    pending: boolean;
};
