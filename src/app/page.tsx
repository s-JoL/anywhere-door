"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getRepository } from "@/lib/storage";
import { ensureDemoSeed } from "@/lib/engine/bootstrap";
import type { WorldSeed } from "@/lib/types";

export default function Home() {
  const [seeds, setSeeds] = useState<WorldSeed[]>([]);

  useEffect(() => {
    (async () => {
      await ensureDemoSeed();
      setSeeds(await getRepository().listSeeds());
    })();
  }, []);

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

      <div className="relative z-10 text-center text-[11px] text-[var(--smoke)]">
        自带模型 key · 本地优先 · 不设限
      </div>
    </main>
  );
}
