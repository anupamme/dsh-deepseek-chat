import type { WebsiteCommand } from './website-navigation.js';
/** Drive only a verified row's public website menu. Dialogs stay owned by the site. */
export declare function performWebsiteConversationAction(doc: Document, command: Extract<WebsiteCommand, {
    type: 'conversation-action';
}>): Promise<string | null>;
