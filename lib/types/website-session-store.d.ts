import { type CredentialProvider } from '@deepseek-ai/dsh-credentials';
import type { AuthorizationAuthority } from './authorization.js';
import type { WebsiteSession } from './protocol.js';
export interface WebsiteSessionFence {
    accountId: string;
    epoch: string;
}
type WebsiteCredentials = Pick<CredentialProvider, 'readRecord' | 'modifyRecord' | 'deleteRecord'>;
type WebsiteAuthority = Pick<AuthorizationAuthority, 'getSnapshot'>;
/** Owns only explicitly supplied CHAT website grants, never the official DSH account grant. */
export declare class WebsiteSessionStore {
    private readonly credentials;
    private readonly authority;
    private pending;
    constructor(credentials: WebsiteCredentials, authority: WebsiteAuthority);
    private current;
    private key;
    /** Keep delayed clearing/writing ordered; a new generation rechecks its fence after waiting. */
    private exclusive;
    load(fence: WebsiteSessionFence, signal: AbortSignal): Promise<WebsiteSession | null>;
    save(fence: WebsiteSessionFence, session: WebsiteSession, signal: AbortSignal): Promise<boolean>;
    clear(fence: WebsiteSessionFence, signal: AbortSignal): Promise<boolean>;
}
export {};
