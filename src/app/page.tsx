"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { getRepository } from "@/lib/storage";
import { ensureBuiltinSeeds } from "@/lib/engine/bootstrap";
import { parseCardFile, cardToSeed } from "@/lib/import/character-card";
import { DEMO_SEED } from "@/lib/world/seed-demo";
import { derivePresentation } from "@/lib/world/presentation";
import { useDoorEnter } from "@/app/DoorTransition";
import { recordEnter, recordAuthor, recordSkip } from "@/lib/taste/record";
import { computeTasteProfile } from "@/lib/taste/profile";
import { rankFeed } from "@/lib/taste/rank";
import { tagsOfSeed } from "@/lib/taste/tags";
import { ensureGeneratedPool } from "@/lib/world/pregenerate";
import { streamChat } from "@/lib/llm/stream";
import { getUserConfig, resolveModelConfig } from "@/lib/settings/user-config";
import { t } from "@/lib/i18n";
import type { WorldSeed } from "@/lib/types";

// ---------------------------------------------------------------------------
// Typewriter hook
// ---------------------------------------------------------------------------
function useTypewriter(text: string, active: boolean, charPerMs = 0.06): string {
  const [displayed, setDisplayed] = useState("");
  const rafRef = useRef<number | null>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!active) {
      setDisplayed("");
      // do NOT reset doneRef here — we want to remember completion on revisit
      return;
    }

    if (prefersReduced || doneRef.current) {
      setDisplayed(text);
      return;
    }

    setDisplayed("");
    let i = 0;
    let last = performance.now();

    function tick(now: number) {
      const elapsed = now - last;
      const newChars = Math.floor(elapsed * charPerMs);
      if (newChars > 0) {
        i = Math.min(i + newChars, text.length);
        setDisplayed(text.slice(0, i));
        last = now;
      }
      if (i < text.length) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        doneRef.current = true; // mark as completed
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [text, active, charPerMs]);

  // Reset doneRef when the text itself changes
  useEffect(() => {
    doneRef.current = false;
    setDisplayed("");
  }, [text]);

  return displayed;
}

// ---------------------------------------------------------------------------
// Intensity indicator
// ---------------------------------------------------------------------------
const INTENSITY_META = {
  calm:     { labelKey: "intensity.calm", color: "var(--lamp)" },
  charged:  { labelKey: "intensity.charged", color: "var(--rose)" },
  explicit: { labelKey: "intensity.explicit", color: "#ff6b6b" },
} as const;

// ---------------------------------------------------------------------------
// Hex color helper
// ---------------------------------------------------------------------------
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(240, 195, 107, ${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---------------------------------------------------------------------------
// WorldPanel
// ---------------------------------------------------------------------------
function WorldPanel({
  seed,
  isFirst,
  isFocused,
  onEnter,
}: {
  seed: WorldSeed;
  isFirst: boolean;
  isFocused: boolean;
  onEnter: (id: string) => void;
}) {
  const pres = derivePresentation(seed);
  const accent = pres.accent ?? "var(--lamp)";
  const intensityMeta = INTENSITY_META[pres.intensity];

  // Typewriter fires when this panel is the snapped/focused one
  const hookDisplayed = useTypewriter(pres.hook, isFocused);

  // Accent glow: radial from top, tinted per-world
  const accentIsVar = accent.startsWith("var(");
  // For CSS radial-gradient we need an rgba. If it's a hex, convert; if var(), use fallback.
  const glowColor = accentIsVar
    ? "rgba(240, 195, 107, 0.13)"  // fallback glow for CSS-var accents
    : hexToRgba(accent, 0.15);

  return (
    <section
      className="relative h-[100dvh] w-full snap-start flex flex-col world-bg"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        ["--accent" as string]: accent,
      }}
    >
      {/* Per-world accent tint — radial glow from top */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background: `radial-gradient(80% 55% at 50% 0%, ${glowColor}, transparent 68%)`,
        }}
      />

      {/* ── Top eyebrow ── */}
      <div className="relative z-10 flex items-center justify-between px-6 pt-6">
        <div className="eyebrow">{t("brand.eyebrow")}</div>
        {/* Intensity indicator */}
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: intensityMeta.color, boxShadow: `0 0 7px ${intensityMeta.color}` }}
          />
          <span className="eyebrow" style={{ color: intensityMeta.color }}>
            {t(intensityMeta.labelKey)}
          </span>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="relative z-10 flex flex-1 flex-col justify-center px-6">

        {/* Genre + mood chips */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {/* Genre chip — uses accent color */}
          <span
            className="rounded-full border px-2.5 py-0.5 text-[10.5px] tracking-widest"
            style={{ borderColor: accent, color: accent }}
          >
            {pres.genre}
          </span>
          {pres.mood.map((m) => (
            <span
              key={m}
              className="rounded-full border border-[var(--line)] px-2.5 py-0.5 text-[10.5px] tracking-widest text-[var(--smoke)]"
            >
              {m}
            </span>
          ))}
        </div>

        {/* Hook — hero text, typewriter reveal */}
        <p
          className="max-w-[24rem] text-[1.35rem] leading-[1.75] text-[var(--mist)]"
          style={{ fontFamily: "var(--serif)", minHeight: "3.5rem" }}
        >
          {hookDisplayed}
          {isFocused && hookDisplayed.length < pres.hook.length && (
            <span className="caret" />
          )}
        </p>

        {/* Title — smaller, accented */}
        <h2
          className="mt-4 text-[1rem] leading-snug text-[var(--smoke)]"
          style={{ fontFamily: "var(--serif)", color: accent }}
        >
          {seed.title}
        </h2>

        {/* Cast */}
        {pres.cast.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            {pres.cast.map((member) => (
              <div key={member.name} className="flex items-start gap-2">
                <span
                  className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: accent, boxShadow: `0 0 6px ${accent}` }}
                />
                <span className="text-[12.5px] leading-relaxed text-[var(--smoke)]">
                  <span className="tag mr-1" style={{ color: accent }}>{member.name}</span>
                  {member.line}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* CTA — door transition */}
        <button
          onClick={() => onEnter(seed.id)}
          className="mt-8 inline-flex w-fit items-center gap-2 rounded-2xl border px-6 py-3 text-[15px] text-[var(--mist)] transition active:scale-[0.97]"
          style={{
            fontFamily: "var(--serif)",
            borderColor: accent,
            boxShadow: `0 0 24px -8px ${accent}`,
            background: "rgba(11, 14, 20, 0.55)",
            backdropFilter: "blur(12px)",
          }}
        >
          {t("feed.cta")} <span className="text-[17px]">➤</span>
        </button>
      </div>

      {/* Bottom hint on first panel */}
      {isFirst && (
        <div className="relative z-10 flex flex-col items-center gap-1 pb-6">
          <span className="text-[18px] text-[var(--smoke)] pulse">↑</span>
          <span className="eyebrow text-[var(--smoke)]">{t("feed.swipeHint")}</span>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// CreatePanel
// ---------------------------------------------------------------------------
function CreatePanel({ onImportSuccess }: { onImportSuccess: () => void }) {
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const card = parseCardFile(file.name, bytes);
      if (!card) { setImportError(t("feed.create.importError")); return; }
      const suffix = Math.random().toString(36).slice(2, 8);
      const seed = cardToSeed(card, DEMO_SEED.modelConfig, Date.now(), suffix);
      if (!seed) { setImportError(t("feed.create.importError")); return; }
      await getRepository().upsertSeed(seed);
      recordAuthor(getRepository(), seed);
      onImportSuccess();
    } catch {
      setImportError(t("feed.create.importError"));
    }
  }

  return (
    <section
      className="relative h-[100dvh] w-full snap-start flex flex-col world-bg"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: "radial-gradient(80% 60% at 50% 0%, rgba(240, 195, 107, 0.07), transparent 70%)" }}
      />

      <div className="relative z-10 flex items-center justify-between px-6 pt-6">
        <div className="eyebrow">{t("brand.eyebrow")}</div>
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div
          className="mb-2 text-[1.6rem] leading-snug text-[var(--mist)]"
          style={{ fontFamily: "var(--serif)" }}
        >
          {t("feed.create.title")}
        </div>
        <p className="mb-8 max-w-[18rem] text-[13px] text-[var(--smoke)]">
          {t("feed.create.desc")}
        </p>

        <div className="flex flex-col items-center gap-3 w-full max-w-[240px]">
          <Link
            href="/create"
            className="w-full rounded-2xl border border-[var(--lamp)] bg-[var(--ink-2)]/50 px-6 py-3 text-center text-[14px] text-[var(--lamp)] transition active:scale-[0.97]"
            style={{ fontFamily: "var(--serif)", backdropFilter: "blur(12px)" }}
          >
            {t("feed.create.make")}
          </Link>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-2xl border border-[var(--line)] bg-[var(--ink-2)]/40 px-6 py-3 text-[14px] text-[var(--smoke)] transition hover:border-[var(--smoke)] active:scale-[0.97]"
            style={{ backdropFilter: "blur(12px)" }}
          >
            {t("feed.create.import")}
          </button>
          {importError && <p className="text-[11px] text-red-400">{importError}</p>}
        </div>

        <input ref={fileInputRef} type="file" accept=".png,.json" className="hidden" onChange={handleFileChange} />
      </div>

      <div className="relative z-10 pb-6 text-center">
        <div className="text-[11px] text-[var(--smoke)]">{t("feed.create.footer")}</div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Home — IntersectionObserver to track which panel is focused
// ---------------------------------------------------------------------------
export default function Home() {
  const [seeds, setSeeds] = useState<WorldSeed[]>([]);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const containerRef = useRef<HTMLElement | null>(null);
  const { enter, Overlay } = useDoorEnter();

  // Phase 3: skip tracking refs
  const skippedRef   = useRef<Set<string>>(new Set());       // guards double-recording
  const enteredRef   = useRef<Set<string>>(new Set());       // entered seeds must NOT record skip
  const dwellTimers  = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const dwellFiredRef = useRef<Set<string>>(new Set());      // seeds whose 1.2s timer fired
  const lastFocusRef  = useRef<string | null>(null);         // seedId currently focused

  async function refreshSeeds() {
    const repo = getRepository();
    const rawSeeds = await repo.listSeeds();
    const events   = await repo.listTasteEvents();
    const profile  = computeTasteProfile(events, Date.now());
    const recentlySeen = new Set(
      events.slice(-10).map((e) => e.seedId),
    );
    // Category-level 防腻: tag prevalence across the recently-seen seeds, in [0,1].
    const recentSeeds = rawSeeds.filter((s) => recentlySeen.has(s.id));
    const recentTags: Record<string, number> = {};
    if (recentSeeds.length > 0) {
      for (const s of recentSeeds) {
        for (const t of tagsOfSeed(s)) {
          recentTags[t] = (recentTags[t] ?? 0) + 1 / recentSeeds.length;
        }
      }
    }
    const ranked = rankFeed(rawSeeds, profile, recentlySeen, { recentTags });
    setSeeds(ranked);
  }

  // Guard: only top up the generated pool once per mount.
  const pregenStartedRef = useRef(false);

  useEffect(() => {
    (async () => {
      await ensureBuiltinSeeds();
      await refreshSeeds();

      // Phase 4: top up the AI-generated world pool in the BACKGROUND.
      // Do NOT await before painting the feed; do NOT reshuffle live —
      // new worlds appear on the next mount/refresh.
      if (pregenStartedRef.current) return;
      pregenStartedRef.current = true;
      (async () => {
        try {
          const repo = getRepository();
          const events = await repo.listTasteEvents();
          const profile = computeTasteProfile(events, Date.now());
          // Effective model config: global user config if present, else DEMO_SEED's
          // (apiKey:"" → server env in dev). DEMO_SEED is builtin, so resolveModelConfig
          // returns the user's config when set, otherwise DEMO_SEED.modelConfig exactly.
          const modelConfig = resolveModelConfig(DEMO_SEED, getUserConfig());
          await ensureGeneratedPool({
            repo,
            modelConfig,
            profile,
            llm: (msgs) => streamChat({ cfg: modelConfig, messages: msgs }),
          });
        } catch {
          // Safe-degrade: background generation must never break the feed.
        }
      })();
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // IntersectionObserver: track which panel is ≥50% visible → focusedIndex + skip signal
  const panelRefs = useRef<(HTMLElement | null)[]>([]);

  const setRef = useCallback((el: HTMLElement | null, i: number) => {
    panelRefs.current[i] = el;
  }, []);

  useEffect(() => {
    if (seeds.length === 0) return;
    panelRefs.current = panelRefs.current.slice(0, seeds.length); // trim stale refs
    const observers: IntersectionObserver[] = [];
    panelRefs.current.forEach((el, i) => {
      if (!el) return;
      const seed = seeds[i];
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setFocusedIndex(i);

            // Phase 3: start dwell timer for this seed
            if (!dwellTimers.current.has(seed.id)) {
              const t = setTimeout(() => {
                dwellFiredRef.current.add(seed.id);
                dwellTimers.current.delete(seed.id);
              }, 1200);
              dwellTimers.current.set(seed.id, t);
            }

            // Record skip for the previously-focused seed if it dwelled ≥1.2s
            const prev = lastFocusRef.current;
            if (prev && prev !== seed.id) {
              const prevTimer = dwellTimers.current.get(prev);
              if (prevTimer !== undefined) {
                clearTimeout(prevTimer);
                dwellTimers.current.delete(prev);
              }
              if (
                dwellFiredRef.current.has(prev) &&
                !enteredRef.current.has(prev) &&
                !skippedRef.current.has(prev)
              ) {
                const prevSeed = seeds.find((s) => s.id === prev);
                if (prevSeed) {
                  skippedRef.current.add(prev);
                  recordSkip(getRepository(), prevSeed);
                }
              }
            }

            lastFocusRef.current = seed.id;
          } else {
            // Panel scrolled out — clear any pending dwell timer
            const t = dwellTimers.current.get(seed.id);
            if (t !== undefined) {
              clearTimeout(t);
              dwellTimers.current.delete(seed.id);
            }
          }
        },
        { threshold: 0.5, root: containerRef.current },
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => {
      observers.forEach((o) => o.disconnect());
      // Clean up all pending dwell timers on unmount
      dwellTimers.current.forEach((t) => clearTimeout(t));
      dwellTimers.current.clear();
    };
  }, [seeds]);

  return (
    <main
      ref={containerRef}
      className="h-[100dvh] w-full overflow-y-auto overscroll-none snap-y snap-mandatory"
    >
      <Overlay />
      {/* 低调的入口：门廊馆 + 设置，固定右上角，不参与 snap，不拦截滚动手势 */}
      <Link
        href="/library"
        aria-label={t("feed.library")}
        title={t("feed.library")}
        className="fixed right-14 z-30 flex h-9 w-9 items-center justify-center rounded-full text-[16px] text-[var(--smoke)] opacity-55 transition hover:opacity-100"
        style={{ top: "max(0.9rem, env(safe-area-inset-top))" }}
      >
        🚪
      </Link>
      <Link
        href="/settings"
        aria-label={t("common.settings")}
        className="fixed right-4 z-30 flex h-9 w-9 items-center justify-center rounded-full text-[16px] text-[var(--smoke)] opacity-55 transition hover:opacity-100"
        style={{ top: "max(0.9rem, env(safe-area-inset-top))" }}
      >
        ⚙
      </Link>
      {seeds.map((seed, i) => (
        <div key={seed.id} ref={(el) => setRef(el, i)}>
          <WorldPanel
            seed={seed}
            isFirst={i === 0}
            isFocused={focusedIndex === i}
            onEnter={(id) => {
              // Mark as entered so skip is NOT recorded for this seed
              enteredRef.current.add(id);
              const s = seeds.find((s) => s.id === id);
              if (s) recordEnter(getRepository(), s);
              enter(`/play?world=${id}`);
            }}
          />
        </div>
      ))}
      {seeds.length === 0 && (
        <section className="h-[100dvh] w-full snap-start flex items-center justify-center world-bg">
          <div className="text-[13px] text-[var(--smoke)] pulse">{t("feed.waking")}</div>
        </section>
      )}
      <CreatePanel onImportSuccess={refreshSeeds} />
    </main>
  );
}
