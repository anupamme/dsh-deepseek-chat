import { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { AuthorizationAuthority } from './authorization.js';
import type { AuthorizationState, DshChatClientMetadata, WebsiteSession } from './protocol.js';
/** Independent CHAT website session service scoped to the current DSH profile. */
export declare class DshChatController extends TypertRemoteService {
    static inject: string[];
    readonly authority: AuthorizationAuthority;
    private readonly websiteSessions;
    private legacyAccount;
    constructor(ctx: Context);
    private legacyAccountId;
    authorization(metadata: DshChatClientMetadata, signal: AbortSignal): Promise<AuthorizationState>;
    watchAuthorization(metadata: DshChatClientMetadata, signal: AbortSignal): AsyncIterable<AuthorizationState>;
    private websiteFence;
    loadWebsiteSession(metadata: DshChatClientMetadata, epoch: string, signal: AbortSignal): Promise<WebsiteSession | null>;
    saveWebsiteSession(metadata: DshChatClientMetadata, epoch: string, session: WebsiteSession, signal: AbortSignal): Promise<boolean>;
    clearWebsiteSession(metadata: DshChatClientMetadata, epoch: string, signal: AbortSignal): Promise<boolean>;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        dshDeepseekChat: DshChatController;
    }
}
