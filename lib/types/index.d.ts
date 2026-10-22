import schema from '@deepseek-ai/schemastery';
import type { Context } from '@deepseek-ai/cordis';
export declare const Config: schema<Schemastery.ObjectS<{}>, Schemastery.ObjectT<{}>, "plain">;
export declare const name = "dsh-deepseek-chat";
/** Host-half entry. Browser UI is declared separately by the `dsh.client` manifest. */
export declare const inject: string[];
export declare function apply(ctx: Context): void;
