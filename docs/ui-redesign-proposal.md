# Anywhere Door — UI Redesign & Bilingual Surface Proposal

> **Status: NON-AUTHORITATIVE working proposal — for review, not yet built.** This
> document names code symbols and file paths (like `current-state.md`) and
> proposes a concrete plan. It is obligated to the design (`AGENTS.md` §17,
> `product-design.md` §2.5, `architecture.md` §5.5). Nothing here is implemented
> until signed off. Once a direction is approved, the durable parts graduate into
> `roadmap.md`; this file stays the working scratch for the redesign.

## 0. Goal

Two asks, one effort:

1. **Bilingual-first (zh / en).** Story and UI designed *natively per language*,
   the kernel shared (charter §17). Story locale (a world property) and interface
   locale (a user property) chosen independently.
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

## 2. Proposed architecture — the locale model in code

Two independent axes (design: §2.5 / §5.5), kernel untouched (§15.14):

### 2.1 Interface locale (user-layer preference)

- Add `interfaceLocale: "zh" | "en"` to the user config (`src/lib/settings/
  user-config.ts`), persisted local-first like the API key. Default: detect from
  `navigator.language`, fall back to `zh`.
- A tiny client i18n boundary — **no heavyweight router**. Recommendation: a
  minimal `src/lib/i18n/` with `messages/zh.ts` + `messages/en.ts` (typed key →
  string, ICU-style interpolation only where needed) and a `useT()` hook +
  `<LocaleProvider>`. Rationale: the app is a local-first client SPA; `next-intl`
  route segments (`/en/...`) add URL/routing weight we don't need. (Open for
  debate — see §5.)
- `<html lang>` is set dynamically from the interface locale.
- Locale never enters WorldState → it structurally cannot reach a character
  (architecture §5.5). It lives only in the shell + player-safe projections.

### 2.2 Story locale (world property)

- Add `storyLocale: "zh" | "en"` to `WorldSeed` (`src/lib/types.ts`), carried in
  the seed contract beside the (future) narration rule.
- `world/generate.ts` generates a world *natively* in a target story locale
  (prompted to author, not translate); built-in cold-start seeds are authored per
  locale.
- The feed (`rankFeed` / presentation) labels and filters by story locale: show
  worlds in the user's readable story locales (default = interface locale, with an
  explicit **"show both"** toggle). A door is judged in a language the reader feels.
- Entity/world **display names become per-locale labels on a stable id** — the id
  is the truth, the label is render-layer; cross-locale play never rewrites state.

### 2.3 What stays language-agnostic (must not regress)

`WorldState`, `deltaLog`, identity, `validateDelta`/`applyDelta`, and the
perception prompt builder move identifiers and structured facts only. No
per-language fork of an instance; no second source of truth.

## 3. Proposed design system

Replace ad-hoc px with a small token layer (CSS vars + Tailwind theme), so two
locale skins share one structure:

- **Type scale** — a named ramp (`--fs-eyebrow … --fs-hero`) instead of
  `text-[10.5px]`. **Locale-aware families:** `--font-cjk` (Songti/Noto Serif SC)
  and `--font-latin` (a Latin serif for world prose + a Latin sans for chrome),
  selected by interface locale for the shell and by *story locale* for world prose.
  Line-height/tracking tuned per script (CJK wants tighter leading than the current
  `1.75`/`1.95` for Latin).
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
  base background world-agnostic so each card's accent reads. Add a per-card story-
  locale tag and the "show both" control.
- **Play** — de-chat: stronger scene framing over bubbles; **remove the raw
  `张力 N` meter from default play** (A6), express pressure diegetically; keep
  narration interludes (the signature element). Channels (§11) and suggested
  actions (§13) are *later*, not this pass.
- **Doorway Library (new)** — a first-class return surface: opened worlds, pins,
  last location / unresolved tension / latest consequence, light return hints
  (`product-design.md` §3.3). This is also where return-rate becomes visible.
- **Settings** — interface-locale switch + story-locale reading preference,
  alongside the existing key field.
- **Create** — localized; unchanged in function.

## 5. Decisions I need from you before building

1. **i18n approach** — minimal custom catalog (my recommendation) vs. `next-intl`
   with locale routes. Affects URL shape and dependency weight.
2. **Cold-start worlds across locales** — author the built-in pool *natively in
   both* zh and en (more authoring), or seed one locale first and grow? 
3. **Default feed mix** — show only the interface-locale's story worlds by default
   (cleaner), or both with a tag (more content, more mixed)?
4. **Redesign depth this pass** — token system + bilingual + theme-decouple only,
   leaving Library/Play-de-chat as follow-ups; or include the full Play + Library
   redesign now (bigger, but fewer round-trips).

## 6. Suggested sequencing (once approved)

- **P0 — Foundations, zero visual change.** Token layer + component primitives;
  extract every inline string behind `useT()` with a `zh` catalog that reproduces
  today's copy exactly. (Pure refactor; `npm test/build/typecheck` stays green.)
- **P1 — Bilingual live.** `interfaceLocale` + `en` catalog + dynamic `<html
  lang>`; `storyLocale` on the seed; feed labels/filters; locale-aware typography.
- **P2 — Surface redesign.** World-agnostic chrome + per-world mood; Feed trim;
  Play de-chat + remove raw meter.
- **P3 — Doorway Library.** The return surface.

Each step is independently shippable and reversible.
