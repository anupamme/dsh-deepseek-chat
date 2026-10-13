/** User-approved rc.2 sidebar exception. No services, Session state or credentials. */
export interface SidebarAdapterState {
    readonly chat: boolean;
    readonly canCreate: boolean;
}
/** Client-owned lifetime survives the brand seat unmounting on sidebar collapse. */
export declare function createSidebarBinding(read: () => SidebarAdapterState, create: () => void, report: (ready: boolean) => void): {
    attach(name: HTMLElement): void;
    sync(): void;
    dispose(): void;
};
/** Start at our own brand seat and require the shipped, direct-child shell shape.
 * Unknown layouts are left alone; no global search or hashed CSS selectors. */
export declare function attachSidebarAdapter(name: HTMLElement, read: () => SidebarAdapterState, create: () => void): {
    sync(): void;
    valid(): boolean;
    dispose(): void;
} | null;
