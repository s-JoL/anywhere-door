/**
 * Build-time locale. Anywhere Door ships as two separate single-language
 * deployments (zh / en) of one shared, language-agnostic kernel — see
 * docs/ui-redesign-proposal.md §2 and AGENTS.md §17. The locale is fixed at
 * build time via NEXT_PUBLIC_LOCALE; there is no runtime language switch.
 */
export type Locale = "zh" | "en";

export const LOCALE: Locale =
  process.env.NEXT_PUBLIC_LOCALE === "en" ? "en" : "zh";

/** The lang attribute for <html>, driving locale-aware typography in CSS. */
export const HTML_LANG: string = LOCALE === "en" ? "en" : "zh";
