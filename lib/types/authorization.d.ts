import type { AuthorizationState, DshChatClientMetadata } from './protocol.js';
/** Only the public, credential-free identity projection is used for legacy migration. */
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
}
/** Credentials may be shared across profiles; the Host supplies the trusted profile scope. */
export declare const WEBSITE_PROFILE_PREFIX = "chat-profile:";
export declare const PROFILE_CONTEXT_UNAVAILABLE = "profile-context-unavailable";
/** Host availability and generation fence; website sign-in is a separate Client state. */
export declare class AuthorizationAuthority {
    private readonly issueEpoch;
    private state;
    private readonly listeners;
    private closed;
    constructor(profileId: string | null, issueEpoch?: () => string);
    getSnapshot(): AuthorizationState;
    subscribe(listener: () => void): () => void;
    private publish;
    refresh(_metadata: DshChatClientMetadata): Promise<AuthorizationState>;
    watch(_metadata: DshChatClientMetadata, signal: AbortSignal): AsyncIterable<AuthorizationState>;
    dispose(): void;
}
