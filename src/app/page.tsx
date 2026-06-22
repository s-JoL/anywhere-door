"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getRepository } from "@/lib/storage";
import { ensureDemoSeed } from "@/lib/engine/bootstrap";
import { parseCardFile, cardToSeed } from "@/lib/import/character-card";
import { DEMO_SEED } from "@/lib/world/seed-demo";
import type { WorldSeed } from "@/lib/types";

export default function Home() {
  const [seeds, setSeeds] = useState<WorldSeed[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refreshSeeds() {
    setSeeds(await getRepository().listSeeds());
  }

  useEffect(() => {
    (async () => {
      await ensureDemoSeed();
      await refreshSeeds();
    })();
  }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so same file can be re-imported
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
      await refreshSeeds();
    } catch {
      setImportError("这张卡读不出来，换一张试试");
    }
  }

  return (
    <main className="world-bg relative mx-auto flex min-h-[100dvh] max-w-md flex-col justify-between px-6 py-10">
      <header className="relative z-10 mt-6">
        <div className="eyebrow">EST. 私酿 · 入梦</div>
        <h1 className="mt-2 text-[2.6rem] leading-none text-[var(--mist)]" style={{ fontFamily: "var(--serif)" }}>
          浮生
        </h1>
        <div className="mt-1 text-[13px] tracking-[0.4em] text-[var(--smoke)]">THE REVERIES</div>
        <p className="mt-4 max-w-[18rem] text-[13.5px] leading-relaxed text-[var(--smoke)]">
          滑进一个由 AI 维系的活体文字世界。角色各有心事，世界自会流转——你说的、做的，都算数。
        </p>
      </header>

      {/* 世界卡 feed（P3 将成为可竖滑的 feed） */}
      <div className="relative z-10 flex flex-col gap-4">
        {seeds.map((seed) => (
          <Link key={seed.id} href={`/play?world=${seed.id}`} className="block">
            <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--ink-2)]/60 p-5 backdrop-blur transition active:scale-[0.99]">
              {seed.source && (
                <div className="eyebrow mb-1 capitalize">{seed.source}</div>
              )}
              <div className="mt-1 text-[19px] text-[var(--mist)]" style={{ fontFamily: "var(--serif)" }}>
                {seed.title}
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--smoke)]">{seed.worldview}</p>
              <div className="mt-4 flex items-center gap-2 text-[13px]" style={{ color: "var(--lamp)" }}>
                推门进入 <span className="text-[15px]">➤</span>
              </div>
            </div>
          </Link>
        ))}
        {seeds.length === 0 && (
          <div className="text-center text-[13px] text-[var(--smoke)] py-8">世界正在苏醒…</div>
        )}
      </div>

      <div className="relative z-10 flex flex-col items-center gap-2">
        {/* Hidden file input for character card import */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.json"
          className="hidden"
          onChange={handleFileChange}
        />
        <Link
          href="/create"
          className="rounded-xl border border-[var(--line)] bg-[var(--ink-2)]/40 px-4 py-2 text-[12px] tracking-wide text-[var(--smoke)] transition hover:border-[var(--lamp)] hover:text-[var(--lamp)] active:scale-[0.98]"
        >
          ✎ 造一个世界
        </Link>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="rounded-xl border border-[var(--line)] bg-[var(--ink-2)]/40 px-4 py-2 text-[12px] tracking-wide text-[var(--smoke)] transition hover:border-[var(--lamp)] hover:text-[var(--lamp)] active:scale-[0.98]"
        >
          导入角色卡
        </button>
        {importError && (
          <p className="text-[11px] text-red-400">{importError}</p>
        )}
        <div className="text-[11px] text-[var(--smoke)]">
          自带模型 key · 本地优先 · 不设限
        </div>
      </div>
    </main>
  );
}
