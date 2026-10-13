/** Own UI plus the user's narrowly approved, reversible rc.2 sidebar markers. */
export declare const chatStyles: string;
export declare function acquireChatStyles(doc: Document): () => void;
/** CSSOM disabling does not emit a DOM mutation; the brand measurement also checks it. */
export declare function ensureChatStyles(doc: Document): void;
