import schema from '@deepseek-ai/schemastery';
import type { Context } from '@deepseek-ai/cordis';
export declare const Config: schema<Schemastery.ObjectS<NoInfer<{
    language: schema<"" | "zh-CN" | "en" | "system", "" | "zh-CN" | "en" | "system", "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    language: schema<"" | "zh-CN" | "en" | "system", "" | "zh-CN" | "en" | "system", "volatile-defined">;
}>>, "plain">;
export declare const name = "dsh-deepseek-chat";
/** Host-half entry. Browser UI is declared separately by the `dsh.client` manifest. */
export declare const inject: string[];
export declare function apply(ctx: Context): void;
