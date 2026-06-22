"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { getRepository } from "@/lib/storage";
import { ensureBuiltinSeeds } from "@/lib/engine/bootstrap";
import { parseCardFile, cardToSeed } from "@/lib/import/character-card";
import { DEMO_SEED } from "@/lib/world/seed-demo";
import { derivePresentation } from "@/lib/world/presentation";
import type { WorldSeed } from "@/lib/types";

// ---------------------------------------------------------------------------
// Typewriter hook
// ---------------------------------------------------------------------------
function useTypewriter(text: string, active: boolean, charPerMs = 0.06): string {
  const [displayed, setDisplayed] = useState("");
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced || !active) {
      setDisplayed(active ? text : "");
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
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [text, active, charPerMs]);

  return displayed;
}

// ---------------------------------------------------------------------------
// Intensity indicator
// ---------------------------------------------------------------------------
const INTENSITY_META = {
  calm:     { label: "平和", color: "var(--lamp)" },
  charged:  { label: "张力", color: "var(--rose)" },
  explicit: { label: "热烈", color: "#ff6b6b" },
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
}: {
  seed: WorldSeed;
  isFirst: boolean;
  isFocused: boolean;
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
        <div className="eyebrow">浮生 · THE REVERIES</div>
        {/* Intensity indicator */}
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: intensityMeta.color, boxShadow: `0 0 7px ${intensityMeta.color}` }}
          />
          <span className="eyebrow" style={{ color: intensityMeta.color }}>
            {intensityMeta.label}
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

        {/* CTA */}
        <Link
          href={`/play?world=${seed.id}`}
          className="mt-8 inline-flex w-fit items-center gap-2 rounded-2xl border px-6 py-3 text-[15px] text-[var(--mist)] transition active:scale-[0.97]"
          style={{
            fontFamily: "var(--serif)",
            borderColor: accent,
            boxShadow: `0 0 24px -8px ${accent}`,
            background: "rgba(11, 14, 20, 0.55)",
            backdropFilter: "blur(12px)",
          }}
        >
          推门进入 <span className="text-[17px]">➤</span>
        </Link>
      </div>

      {/* Bottom hint on first panel */}
      {isFirst && (
        <div className="relative z-10 flex flex-col items-center gap-1 pb-6">
          <span className="text-[18px] text-[var(--smoke)] pulse">↑</span>
          <span className="eyebrow text-[var(--smoke)]">上滑，换一个世界</span>
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
      if (!card) { setImportError("这张卡读不出来，换一张试试"); return; }
      const suffix = Math.random().toString(36).slice(2, 8);
      const seed = cardToSeed(card, DEMO_SEED.modelConfig, Date.now(), suffix);
      if (!seed) { setImportError("这张卡读不出来，换一张试试"); return; }
      await getRepository().upsertSeed(seed);
      onImportSuccess();
    } catch {
      setImportError("这张卡读不出来，换一张试试");
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
        <div className="eyebrow">浮生 · THE REVERIES</div>
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div
          className="mb-2 text-[1.6rem] leading-snug text-[var(--mist)]"
          style={{ fontFamily: "var(--serif)" }}
        >
          造一个属于你的世界
        </div>
        <p className="mb-8 max-w-[18rem] text-[13px] text-[var(--smoke)]">
          带上你的设定、你的角色——或者导入一张角色卡，让世界从你开始。
        </p>

        <div className="flex flex-col items-center gap-3 w-full max-w-[240px]">
          <Link
            href="/create"
            className="w-full rounded-2xl border border-[var(--lamp)] bg-[var(--ink-2)]/50 px-6 py-3 text-center text-[14px] text-[var(--lamp)] transition active:scale-[0.97]"
            style={{ fontFamily: "var(--serif)", backdropFilter: "blur(12px)" }}
          >
            ✎ 造一个世界
          </Link>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-2xl border border-[var(--line)] bg-[var(--ink-2)]/40 px-6 py-3 text-[14px] text-[var(--smoke)] transition hover:border-[var(--smoke)] active:scale-[0.97]"
            style={{ backdropFilter: "blur(12px)" }}
          >
            导入角色卡
          </button>
          {importError && <p className="text-[11px] text-red-400">{importError}</p>}
        </div>

        <input ref={fileInputRef} type="file" accept=".png,.json" className="hidden" onChange={handleFileChange} />
      </div>

      <div className="relative z-10 pb-6 text-center">
        <div className="text-[11px] text-[var(--smoke)]">自带模型 key · 本地优先 · 不设限</div>
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

  async function refreshSeeds() {
    setSeeds(await getRepository().listSeeds());
  }

  useEffect(() => {
    (async () => {
      await ensureBuiltinSeeds();
      await refreshSeeds();
    })();
  }, []);

  // IntersectionObserver: track which panel is ≥50% visible → focusedIndex
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
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setFocusedIndex(i); },
        { threshold: 0.5 },
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, [seeds]);

  return (
    <main
      ref={containerRef}
      className="h-[100dvh] w-full overflow-y-auto overscroll-none snap-y snap-mandatory"
    >
      {seeds.map((seed, i) => (
        <div key={seed.id} ref={(el) => setRef(el, i)}>
          <WorldPanel seed={seed} isFirst={i === 0} isFocused={focusedIndex === i} />
        </div>
      ))}
      {seeds.length === 0 && (
        <section className="h-[100dvh] w-full snap-start flex items-center justify-center world-bg">
          <div className="text-[13px] text-[var(--smoke)] pulse">世界正在苏醒…</div>
        </section>
      )}
      <CreatePanel onImportSuccess={refreshSeeds} />
    </main>
  );
}
