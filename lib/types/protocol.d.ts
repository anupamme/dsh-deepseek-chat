import { z } from 'zod';
import type { InvocationDescriptor, RemoteResult, RemoteStreamHandle, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry';
/** Credential-free identity of the UI making the official DSH account operation. */
export interface DshChatClientMetadata {
    version: string;
    locale: string;
    timezoneOffsetSeconds: number;
}
/** DSH account authorization only; this does not describe the separate chat website login. */
export interface AuthorizationState {
    status: 'pending' | 'authorized' | 'unauthorized' | 'unavailable';
    accountId: string | null;
    /** Host-issued generation fence; it is an identifier, never an account credential. */
    epoch: string;
    error: string | null;
}
/** The website's own login result, transported only by the internal CHAT Client bridge. */
export interface WebsiteSession {
    token: string;
    userId: string;
    deviceId: string;
}
export declare const WEBSITE_SESSION_ORIGIN: "https://chat.deepseek.com";
export declare const authorizationEpochSchema: z.ZodString;
export declare const clientMetadataSchema: z.ZodObject<{
    version: z.ZodString;
    locale: z.ZodString;
    timezoneOffsetSeconds: z.ZodNumber;
}, z.core.$strict>;
export declare const authorizationSchema: z.ZodObject<{
    status: z.ZodEnum<{
        pending: "pending";
        authorized: "authorized";
        unauthorized: "unauthorized";
        unavailable: "unavailable";
    }>;
    accountId: z.ZodNullable<z.ZodString>;
    epoch: z.ZodString;
    error: z.ZodNullable<z.ZodString>;
}, z.core.$strict>;
export declare const websiteSessionSchema: z.ZodObject<{
    token: z.ZodString;
    userId: z.ZodString;
    deviceId: z.ZodString;
}, z.core.$strict>;
/** Explicit strict descriptors use the public registry; no source-mode method discovery. */
export declare const DSH_CHAT_DESCRIPTORS: readonly InvocationDescriptor[];
export declare const DSH_CHAT_REMOTE_CONTRIBUTION: TypertRemoteContribution;
export declare const DSH_CHAT_HOST_CONTRIBUTION: TypertContribution;
declare module '@deepseek-ai/dsh-typert-protocol' {
    interface TypertRemoteMap {
        'dshChat/authorization': (metadata: DshChatClientMetadata, signal?: AbortSignal) => Promise<RemoteResult<AuthorizationState>>;
        'dshChat/watchAuthorization': (metadata: DshChatClientMetadata, signal?: AbortSignal) => RemoteStreamHandle<AuthorizationState, never>;
        'dshChat/loadWebsiteSession': (metadata: DshChatClientMetadata, epoch: string, signal?: AbortSignal) => Promise<RemoteResult<WebsiteSession | null>>;
        'dshChat/saveWebsiteSession': (metadata: DshChatClientMetadata, epoch: string, session: WebsiteSession, signal?: AbortSignal) => Promise<RemoteResult<boolean>>;
        'dshChat/clearWebsiteSession': (metadata: DshChatClientMetadata, epoch: string, signal?: AbortSignal) => Promise<RemoteResult<boolean>>;
    }
    interface TypertRemoteNamespaceMap {
        dshChat: import('@deepseek-ai/dsh-typert-protocol').TypertRemoteNamespace<'dshChat'>;
    }
}
