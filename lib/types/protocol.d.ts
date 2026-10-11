import { z } from 'zod';
import type { InvocationDescriptor, RemoteResult, RemoteStreamHandle, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry';
/** Credential-free identity of the UI using the plugin's own Host bridge. */
export interface DshChatClientMetadata {
    version: string;
    locale: string;
    timezoneOffsetSeconds: number;
}
/** Host lifetime and profile scope; website login is observed separately in our guest. */
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
        'dshDeepseekChat/authorization': (metadata: DshChatClientMetadata, signal?: AbortSignal) => Promise<RemoteResult<AuthorizationState>>;
        'dshDeepseekChat/watchAuthorization': (metadata: DshChatClientMetadata, signal?: AbortSignal) => RemoteStreamHandle<AuthorizationState, never>;
        'dshDeepseekChat/loadWebsiteSession': (metadata: DshChatClientMetadata, epoch: string, signal?: AbortSignal) => Promise<RemoteResult<WebsiteSession | null>>;
        'dshDeepseekChat/saveWebsiteSession': (metadata: DshChatClientMetadata, epoch: string, session: WebsiteSession, signal?: AbortSignal) => Promise<RemoteResult<boolean>>;
        'dshDeepseekChat/clearWebsiteSession': (metadata: DshChatClientMetadata, epoch: string, signal?: AbortSignal) => Promise<RemoteResult<boolean>>;
    }
    interface TypertRemoteNamespaceMap {
        dshDeepseekChat: import('@deepseek-ai/dsh-typert-protocol').TypertRemoteNamespace<'dshDeepseekChat'>;
    }
}
