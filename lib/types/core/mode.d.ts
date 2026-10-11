export type Mode = 'harness' | 'chat';
export interface ModeAuthorization {
    status: 'pending' | 'authorized' | 'unauthorized' | 'unavailable';
    accountId: string | null;
    epoch: string;
    error: string | null;
}
export interface ModeState {
    mode: Mode;
    authorization: ModeAuthorization;
    compatibilityEnabled: boolean;
    error: string | null;
}
/** Only public navigation and effect-scoped UI registration cross this boundary. */
export interface NavigationPort {
    readPanel(): string | null;
    selectPanel(panel: string | null): void;
    mountChatNavigation(): () => void;
    cancelAccount(accountId: string): void;
}
export declare const CHAT_PANEL = "dsh-chat.chat";
/** Account validity and compatibility are checked for every entry, including direct navigation. */
export declare class ModeController {
    private readonly port;
    private state;
    private readonly listeners;
    private originalPanel;
    private unmountChat;
    private transitioning;
    private disposed;
    private lastPanel;
    constructor(port: NavigationPort, compatibilityEnabled: boolean);
    getSnapshot: () => ModeState;
    subscribe: (listener: () => void) => (() => void);
    canEnter(): boolean;
    updateAuthorization(authorization: ModeAuthorization): void;
    select(mode: Mode): boolean;
    private enter;
    /** The original DSH navigation remains authoritative; never overwrite its state. */
    observePanel(panel: string | null): void;
    dispose(): void;
    private leave;
    private cleanupNavigation;
    private publish;
}
