import type { AuthorizationState, DshChatClientMetadata } from './protocol.js';
/** Only the official credential-free surface is accepted by this adapter. */
export interface AccountReader {
    getState(): Promise<{
        status: 'signed-out' | 'credential-stored';
    }>;
    getProfile(metadata: DshChatClientMetadata): Promise<{
        status: 'ready';
        value: {
            id: string | null;
        };
    } | {
        status: 'failed';
    } | null>;
    watch(signal: AbortSignal): AsyncIterable<{
        status: 'signed-out' | 'credential-stored';
    }>;
}
/** Host authority owns the account generation; a Client cannot choose or reopen it. */
export declare class AuthorizationAuthority {
    private readonly account;
    private readonly issueEpoch;
    private state;
    private readonly lifetime;
    private readonly listeners;
    private revision;
    private started;
    private closed;
    private metadata;
    private refreshing;
    constructor(account: AccountReader, issueEpoch?: () => string);
    getSnapshot(): AuthorizationState;
    subscribe(listener: () => void): () => void;
    private publish;
    private unavailable;
    /** DSH signed-out/expiry is synchronous: UI observers run before any network refresh. */
    invalidate(): void;
    /** Public credential-record change supplies only a key; no credential record is read. */
    grantChanged(): void;
    private start;
    refresh(metadata: DshChatClientMetadata): Promise<AuthorizationState>;
    private refreshOnce;
    watch(metadata: DshChatClientMetadata, signal: AbortSignal): AsyncIterable<AuthorizationState>;
    dispose(): void;
}
