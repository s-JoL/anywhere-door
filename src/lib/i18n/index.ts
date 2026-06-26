/**
 * Tiny build-time i18n. The deployment's language is fixed (LOCALE), so this is
 * a plain dictionary lookup — no provider, no router, no runtime switch. See
 * AGENTS.md §17 and docs/product-design.md §2.5.
 *
 *   import { t } from "@/lib/i18n";
 *   t("feed.cta")                       // → "开始行动" / "Take action"
 *   t("library.minutesAgo", { n: 3 })   // → "3 分钟前" / "3 min ago"
 */
import { LOCALE } from "./locale";
import { zh, type MessageKey } from "./messages/zh";
import { en } from "./messages/en";

export type { MessageKey };
export { LOCALE, HTML_LANG } from "./locale";

const catalog: Record<MessageKey, string> = LOCALE === "en" ? en : zh;

export function t(
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  let out: string = catalog[key] ?? zh[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      out = out.replaceAll(`{${k}}`, String(v));
    }
  }
  return out;
}
