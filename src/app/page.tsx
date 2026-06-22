"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getRepository } from "@/lib/storage";
import { ensureBuiltinSeeds } from "@/lib/engine/bootstrap";
import { parseCardFile, cardToSeed } from "@/lib/import/character-card";
import { DEMO_SEED } from "@/lib/world/seed-demo";
import type { WorldSeed } from "@/lib/types";

const ACCENT_COLORS = [
  { glow: "rgba(240, 195, 107, 0.13)", border: "var(--lamp)", dot: "var(--lamp)" },
  { glow: "rgba(255, 61, 127, 0.10)", border: "var(--rose)", dot: "var(--rose)" },
  { glow: "rgba(56, 225, 200, 0.09)", border: "var(--teal)", dot: "var(--teal)" },
];

function WorldPanel({
  seed,
  index,
  isFirst,
}: {
  seed: WorldSeed;
  index: number;
  isFirst: boolean;
}) {
  const accent = ACCENT_COLORS[index % ACCENT_COLORS.length];
  const openingLoc = seed.openingState.locations[seed.openingState.currentLocationId];
  const presentChars = (openingLoc?.presentCharacterIds ?? [])
    .map((id) => seed.characters.find((c) => c.id === id))
    .filter(Boolean) as typeof seed.characters;

  return (
    <section
      className="relative h-[100dvh] w-full snap-start flex flex-col world-bg"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Accent glow overlay */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: `radial-gradient(80% 60% at 50% 0%, ${accent.glow}, transparent 70%)` }}
      />

      {/* Top eyebrow */}
      <div className="relative z-10 flex items-center justify-between px-6 pt-6">
        <div className="eyebrow">浮生 · THE REVERIES</div>
        {seed.source && (
          <div
            className="eyebrow rounded-full border px-2 py-0.5 capitalize"
            style={{ borderColor: accent.border, color: accent.border }}
          >
            {seed.source}
          </div>
        )}
      </div>

      {/* Main content — centered, takes remaining space */}
      <div className="relative z-10 flex flex-1 flex-col justify-center px-6">
        <h2
          className="text-[2.2rem] leading-tight text-[var(--mist)] rise"
          style={{ fontFamily: "var(--serif)" }}
        >
          {seed.title}
        </h2>
        <p className="mt-3 max-w-[22rem] text-[13.5px] leading-relaxed text-[var(--smoke)]">
          {seed.worldview}
        </p>

        {/* Characters */}
        {presentChars.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {presentChars.map((char) => (
              <div key={char.id} className="flex items-center gap-1.5">
                <div
                  className="presence-dot"
                  style={{ background: accent.dot, boxShadow: `0 0 9px ${accent.dot}` }}
                />
                <span className="tag" style={{ color: accent.dot }}>
                  {char.name}
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
            borderColor: accent.border,
            boxShadow: `0 0 24px -8px ${accent.dot}`,
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

function CreatePanel({
  onImportSuccess,
}: {
  onImportSuccess: () => void;
}) {
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
      if (!card) {
        setImportError("这张卡读不出来，换一张试试");
        return;
      }
      const suffix = Math.random().toString(36).slice(2, 8);
      const seed = cardToSeed(card, DEMO_SEED.modelConfig, Date.now(), suffix);
      if (!seed) {
        setImportError("这张卡读不出来，换一张试试");
        return;
      }
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
        style={{
          background: "radial-gradient(80% 60% at 50% 0%, rgba(240, 195, 107, 0.07), transparent 70%)",
        }}
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
          {importError && (
            <p className="text-[11px] text-red-400">{importError}</p>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.json"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      <div className="relative z-10 pb-6 text-center">
        <div className="text-[11px] text-[var(--smoke)]">自带模型 key · 本地优先 · 不设限</div>
      </div>
    </section>
  );
}

export default function Home() {
  const [seeds, setSeeds] = useState<WorldSeed[]>([]);

  async function refreshSeeds() {
    setSeeds(await getRepository().listSeeds());
  }

  useEffect(() => {
    (async () => {
      await ensureBuiltinSeeds();
      await refreshSeeds();
    })();
  }, []);

  return (
    <main
      className="h-[100dvh] w-full overflow-y-auto overscroll-none"
      style={{ scrollSnapType: "y mandatory" }}
    >
      {seeds.map((seed, i) => (
        <WorldPanel key={seed.id} seed={seed} index={i} isFirst={i === 0} />
      ))}
      {seeds.length === 0 && (
        <section className="h-[100dvh] snap-start flex items-center justify-center world-bg">
          <div className="text-[13px] text-[var(--smoke)] pulse">世界正在苏醒…</div>
        </section>
      )}
      <CreatePanel onImportSuccess={refreshSeeds} />
    </main>
  );
}
