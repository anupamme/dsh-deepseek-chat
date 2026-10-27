export interface WindowDragRegion {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
}
export interface WindowDragGeometry {
    readonly width: number;
    readonly height: number;
    readonly regions: readonly WindowDragRegion[];
}
export interface WindowDragTrackerTimers {
    setTimeout(callback: () => void, delayMs: number): unknown;
    clearTimeout(handle: unknown): void;
}
export interface WindowDragTrackerOptions {
    /** Return parsed, safe full-height gaps, or [] when the surface is not safe. */
    read(): readonly WindowDragRegion[] | PromiseLike<readonly WindowDragRegion[]>;
    onChange(regions: readonly WindowDragRegion[]): void;
    readonly intervalMs?: number;
    readonly timeoutMs?: number;
    readonly timers?: WindowDragTrackerTimers;
}
export interface WindowDragTracker {
    start(): void;
    /** Fence an in-flight result and coalesce a fresh read, without clearing the last geometry. */
    refresh(): void;
    dispose(): void;
}
/** A deadline belongs to the current read, never to an already successful geometry sample. */
export declare function createWindowDragTracker(options: WindowDragTrackerOptions): WindowDragTracker;
/** Serialized into our own guest. Geometry only: never read text, input values or storage. */
export declare function readWebsiteWindowDragGeometry(doc: Document, origin: string, hostInset?: number): WindowDragGeometry | null;
export declare function websiteWindowDragScript(hostInset?: number): string;
/** Guest numbers are untrusted: keep every native hit target inside this measured viewport. */
export declare function parseWindowDragGeometry(value: unknown, viewport: {
    readonly width: number;
    readonly height: number;
}): readonly WindowDragRegion[];
/** Holes in a full 40px drag row. Invalid gaps fail closed to one full-width exclusion. */
export declare function windowDragExclusions(regions: readonly WindowDragRegion[], width: number): readonly WindowDragRegion[];
