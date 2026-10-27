import { type DshChatBridgeProps } from './ui.js';
/** Mode-owned native hit testing; never changes the guest or any host-owned node. */
export declare function DshChatWindowDragSurface({ bridge, signal }: DshChatBridgeProps & {
    readonly signal: AbortSignal;
}): import("react").ReactPortal | null;
