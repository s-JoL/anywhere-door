import Link from "next/link";
import { DEMO_SEED } from "@/lib/world/seed-demo";

export default function Home() {
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

      {/* 世界卡（P3 将成为可竖滑的世界 feed） */}
      <Link href="/play" className="relative z-10 block">
        <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--ink-2)]/60 p-5 backdrop-blur transition active:scale-[0.99]">
          <div className="eyebrow">第一个世界</div>
          <div className="mt-2 text-[19px] text-[var(--mist)]" style={{ fontFamily: "var(--serif)" }}>
            {DEMO_SEED.title}
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--smoke)]">{DEMO_SEED.worldview}</p>
          <div className="mt-4 flex items-center gap-2 text-[13px]" style={{ color: "var(--lamp)" }}>
            推门进入 <span className="text-[15px]">➤</span>
          </div>
        </div>
      </Link>

      <div className="relative z-10 text-center text-[11px] text-[var(--smoke)]">
        自带模型 key · 本地优先 · 不设限
      </div>
    </main>
  );
}
