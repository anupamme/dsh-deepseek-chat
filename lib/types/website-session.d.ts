import type { WebsiteSession } from './protocol.js';
/**
 * Standard DOM storage access in our approved Chat guest only. These three
 * shapes reflect the current public website implementation; they are not a
 * stable OAuth API. No cookies, other storage, page text or app stores are read.
 */
export type WebsiteSessionCommand = {
    readonly type: 'capture';
} | {
    readonly type: 'restore';
    readonly session: WebsiteSession;
} | {
    readonly type: 'clear';
};
export type WebsiteSessionRestoreResult = 'present' | 'restored' | 'failed';
/** Keep every runtime helper inside this function: it is serialized into the guest. */
export declare function adaptWebsiteSession(doc: Document, command: WebsiteSessionCommand): WebsiteSession | null | WebsiteSessionRestoreResult | boolean;
/** Validate an untrusted guest result without logging or returning other fields. */
export declare function parseWebsiteSession(value: unknown): WebsiteSession | null;
/** Serialize only typed, normalized arguments; never interpolate a credential as source code. */
export declare function websiteSessionScript(command: WebsiteSessionCommand): string;
export declare const websiteSessionCaptureScript: () => string;
export declare const websiteSessionRestoreScript: (session: WebsiteSession) => string;
export declare const websiteSessionClearScript: () => string;
