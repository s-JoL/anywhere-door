# Anywhere Door — UI Redesign & Bilingual Surface Proposal

> **Status: NON-AUTHORITATIVE working proposal — for review, not yet built.** This
> document names code symbols and file paths (like `current-state.md`) and
> proposes a concrete plan. It is obligated to the design (`AGENTS.md` §17,
> `product-design.md` §2.5, `architecture.md` §5.5). Nothing here is implemented
> until signed off. Once a direction is approved, the durable parts graduate into
> `roadmap.md`; this file stays the working scratch for the redesign.

## 0. Goal

Two asks, one effort:

1. **Bilingual-first (zh / en) as two deployments.** UI, story content, and prompt
   wording designed *natively per language*; the world-running kernel shared
   (charter §17). zh and en ship as separate single-language deployments, locale
   fixed at build time — not a runtime toggle.
2. **A large UI optimization.** The current UI is a single hardcoded-Chinese skin
   of one world's mood; it needs to become a clean, themeable, two-locale surface
   for a *browser of many worlds*.

## 1. Audit — what exists today

The whole app is four client pages (`src/app/{page,play/page,create/page,
settings/page}.tsx`) + `DoorTransition.tsx` + one stylesheet (`globals.css`).
Honest findings:

| # | Finding | Where | Severity |
|---|---|---|---|
| A1 | **No i18n layer.** Every UI string is a Chinese literal inline in JSX (`推门进入`, `张力`, `上滑，换一个世界`, `世界正在苏醒`, error copy). | all pages | **blocker** for bilingual |
| A2 | **`<html lang="zh">` hardcoded.** | `layout.tsx:8` | blocker |
| A3 | **One world's mood is the global chrome.** The base background, rain texture, and CJK serif in `globals.css` are the demo "rainy-inn" skin, applied to *every* world. A multi-world browser should not wear one world's skin. | `globals.css:3-43` | high |
| A4 | **Typography is CJK-only.** `--serif: "Songti SC"…` is right for Chinese, wrong for English (Latin needs its own serif/sans pairing, different line-height and tracking). | `globals.css:16-17` | high (for en) |
| A5 | **No design tokens beyond ad-hoc CSS vars.** Sizes are magic px scattered in JSX (`text-[10.5px]`, `text-[15.5px]`, `text-[1.35rem]`…). No type scale, spacing scale, or component layer — two locale skins would be unmaintainable on this. | all pages | high |
| A6 | **Raw tension meter shown in default play.** `张力 7` is a raw meter — `product-design.md` §5.2 says *never show raw clock/meters in default play*; pressure must be diegetic. | `play/page.tsx:213-217` | medium (design violation) |
| A7 | **Play reads as a chat app.** Bubbles (user right / speaker left) risk the §25 "too much like a chat app" anti-pattern; little scene framing. | `play/page.tsx:236-265` | medium |
| A8 | **No Doorway Library.** Return-rate is the north star, yet there is no library/return surface; instances exist only in storage. | (missing) | high (product) |
| A9 | **Input is one freeform box.** No Say/Do/Observe channels (§11), no suggested actions (§13). | `play/page.tsx:300-308` | low (later) |
| A10 | **Mobile-only layout.** `max-w-md` everywhere; no desktop/tablet treatment though the app also runs on web/desktop. | all pages | low |

What is **good and worth keeping**: the vertical door-crack feed, the door-open
transition, the per-world accent color, the typewriter cold-open, the restrained
"breathe/rise/pulse" motion language, local-first taste tracking. The redesign
should preserve this character, not replace it.

## 2. Proposed architecture — two deployments, one kernel

Per charter §17 / `architecture.md` §5.5: zh and en ship as **two separate
single-language deployments of one codebase**, the locale fixed at build/deploy
time — **not a runtime toggle, no per-user config.** This is simpler than an in-app
i18n switch and matches the decision that the two communities get different
stories, not one catalog translated.

### 2.1 Build-time locale constant

- A single build-time constant selects the deployment's language, e.g.
  `NEXT_PUBLIC_LOCALE = "zh" | "en"`, read once into a typed `LOCALE`. Each deploy
  target (e.g. `zh.…` and `en.…`) builds with one value.
- `<html lang>` is set from `LOCALE` at build, not from `navigator.language`.
- No runtime locale switch, no `interfaceLocale` user-config field, no `/en/` route
  segments. (This supersedes the earlier interface-locale-toggle sketch.)

### 2.2 UI strings (per-language catalog, selected at build)

- Extract every inline Chinese string behind a typed catalog: `src/lib/i18n/
  messages/{zh,en}.ts` + a `t(key, params?)` resolving against `LOCALE`. No
  provider/router needed — `LOCALE` is constant per build.
- The `zh` catalog reproduces today's copy exactly; `en` is authored natively
  (voice, not literal translation).

### 2.3 Language-facing prompts (wording per language, logic shared)

- The prompt builders (`src/lib/engine/prompt.ts`, `world/generate.ts`, reactor /
  director prompts) keep one **shared structure**; only the language-specific
  wording is selected by `LOCALE`. Run logic, schemas, and validation are identical
  across deployments.

### 2.4 Story / seed content (per-deployment pool)

- Each deployment carries its **own** cold-start / built-in seed pool, authored
  natively for that community (`src/lib/world/seed-*`, `bootstrap.ts`). Generated
  worlds are produced in the deployment's language. There is no shared catalog
  translated between them.

### 2.5 What stays language-agnostic (must not regress)

- `WorldState`, `deltaLog`, identity, `validateDelta`/`applyDelta`, the turn loop,
  and the perception boundary move identifiers and structured facts only — **one
  shared kernel**, byte-identical across deployments. Storage is per-origin
  (IndexedDB), so the two deployments are naturally separate instances with no
  cross-locale state.

## 3. Proposed design system

Replace ad-hoc px with a small token layer (CSS vars + Tailwind theme), so two
locale skins share one structure:

- **Type scale** — a named ramp (`--fs-eyebrow … --fs-hero`) instead of
  `text-[10.5px]`. **Locale-aware families:** `--font-cjk` (Songti/Noto Serif SC)
  and `--font-latin` (a Latin serif for world prose + a Latin sans for chrome).
  Since language is fixed per deployment (`LOCALE`), the family set is chosen at
  build — the zh build ships CJK, the en build ships Latin. Line-height/tracking
  tuned per script (CJK wants tighter leading than the current `1.75`/`1.95` for
  Latin).
- **Color roles, theme-decoupled** — keep `--lamp/--rose/--mist/--smoke` as
  *roles*, but split the **base chrome theme** (neutral, world-agnostic) from the
  **per-world accent/mood** (the existing `pres.accent` + intensity). The rainy-inn
  background becomes *one world's mood*, not the global chrome.
- **Spacing + radius scale**, a thin **component layer** (`Eyebrow`, `Chip`,
  `Button`, `Field`, `PanelShell`) so feed/play/library stop re-implementing the
  same primitives.
- **Motion** — keep the current keyframes; move them behind tokens; preserve
  `prefers-reduced-motion`.

## 4. Proposed surface changes

- **Feed** — trim toward "door crack, not encyclopedia": hook hero stays; soften
  competing chrome (genre/mood chips + cast + intensity all at once); make the
  base background world-agnostic so each card's accent reads. (All worlds are in
  the deployment's language, so no per-card locale tag is needed.)
- **Play** — de-chat: stronger scene framing over bubbles; **remove the raw
  `张力 N` meter from default play** (A6), express pressure diegetically; keep
  narration interludes (the signature element). Channels (§11) and suggested
  actions (§13) are *later*, not this pass.
- **Doorway Library (new)** — a first-class return surface: opened worlds, pins,
  last location / unresolved tension / latest consequence, light return hints
  (`product-design.md` §3.3). This is also where return-rate becomes visible.
- **Settings** — the existing key field; no language switch (language is the
  deployment). Optionally a link to the other-language deployment.
- **Create** — localized; unchanged in function.

## 5. Decisions — resolved and still open

**Resolved by your direction:**

- Two separate single-language deployments, locale fixed at build time — no runtime
  toggle, no config. (Supersedes the earlier interface-locale switch.)
- Stories authored natively per community, not translated; separate content pools.
- Kernel = shared world-running logic; only UI, content, and prompt wording differ.

**Still open:**

1. **Content bootstrap order** — author the built-in / cold-start pool natively in
   *both* zh and en now, or ship the zh deployment first and build the en content
   pool second?
2. **Shared repo, two builds vs. harder split** — one codebase + a build flag (my
   recommendation: one repo, `NEXT_PUBLIC_LOCALE`), or split further later if the
   surfaces diverge a lot?
3. **Redesign depth this pass** — token system + string/prompt extraction +
   theme-decouple only, leaving Library and Play-de-chat as follow-ups; or include
   the full Play + Library redesign now (bigger, fewer round-trips)?

## 6. Suggested sequencing (once approved)

- **P0 — Foundations, zero visual change.** Token layer + component primitives;
  extract every inline string behind `t()` with a `zh` catalog reproducing today's
  copy; introduce the `LOCALE` build constant defaulted to `zh`. (Pure refactor;
  `npm test/build/typecheck` stays green; the live zh build is unchanged.)
- **P1 — Second deployment stands up.** `en` catalog + per-language prompt wording
  + `<html lang>` from `LOCALE`; an `en` build target with its own (initial)
  content pool. zh and en now deploy independently from one kernel.
- **P2 — Surface redesign.** World-agnostic chrome + per-world mood; Feed trim;
  Play de-chat + remove the raw tension meter (A6); native per-language typography.
- **P3 — Doorway Library.** The return surface, in both deployments.

Each step is independently shippable and reversible.
