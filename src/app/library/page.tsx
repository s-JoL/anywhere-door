"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getRepository } from "@/lib/storage";
import { derivePresentation } from "@/lib/world/presentation";
import { recordFunnel } from "@/lib/taste/funnel";
import { useDoorEnter } from "@/app/DoorTransition";
import { t } from "@/lib/i18n";
import type { WorldInstance, WorldSeed } from "@/lib/types";

type Row = {
  instance: WorldInstance;
  seed: WorldSeed | undefined;
  title: string;
  accent: string;
  location: string;
  hook: string;
};

/** A one-line "what's pulling you back" from the exit settlement (§5.6). */
function settlementHook(instance: WorldInstance): string {
  const s = instance.settlement;
  if (!s) return "";
  return s.candidates[0] || s.unresolved[0] || (s.bond ? `${s.bond.who}：${s.bond.stance}` : "");
}

function relTime(ts: number | undefined): string {
  if (!ts) return "";
  const diff = Math.max(0, Date.now() - ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return t("library.justNow");
  if (m < 60) return t("library.minutesAgo", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("library.hoursAgo", { n: h });
  return t("library.daysAgo", { n: Math.floor(h / 24) });
}

function DoorRow({ row, onPin, onEnter }: { row: Row; onPin: (r: Row) => void; onEnter: (r: Row) => void }) {
  const { instance, title, accent, location } = row;
  const when = relTime(instance.lastSeenAt ?? instance.updatedAt);
  return (
    <div
      className="relative flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--ink-2)]/50 px-4 py-3.5"
      style={{ ["--accent" as string]: accent, borderLeft: `2px solid ${accent}` }}
    >
      <button
        onClick={() => onEnter(row)}
        className="flex flex-1 flex-col items-start gap-1 text-left transition active:scale-[0.99]"
        aria-label={t("library.resume")}
      >
        <span className="text-[15px] text-[var(--mist)]" style={{ fontFamily: "var(--serif)", color: accent }}>
          {title}
        </span>
        <span className="flex items-center gap-2 text-[11.5px] text-[var(--smoke)]">
          <span className="presence-dot" style={{ background: accent, boxShadow: `0 0 6px ${accent}` }} />
          {location}
          {when && <span>· {t("library.lastSeen", { when })}</span>}
        </span>
        {row.hook && (
          <span className="mt-0.5 line-clamp-1 text-[11.5px] italic text-[var(--smoke)]/80" style={{ fontFamily: "var(--serif)" }}>
            ↩ {row.hook}
          </span>
        )}
      </button>
      <button
        onClick={() => onPin(row)}
        aria-label={instance.pinned ? t("library.unpin") : t("library.pin")}
        title={instance.pinned ? t("library.unpin") : t("library.pin")}
        className="shrink-0 rounded-full px-2 py-1 text-[16px] transition hover:opacity-100"
        style={{ color: instance.pinned ? accent : "var(--smoke)", opacity: instance.pinned ? 1 : 0.6 }}
      >
        {instance.pinned ? "★" : "☆"}
      </button>
    </div>
  );
}

export default function LibraryPage() {
  const { enter, Overlay } = useDoorEnter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const repo = getRepository();
    const instances = await repo.listInstances();
    const seeds = await repo.listSeeds();
    const seedById = new Map(seeds.map((s) => [s.id, s]));
    const built: Row[] = instances.map((instance) => {
      const seed = seedById.get(instance.seedId);
      const pres = seed ? derivePresentation(seed) : undefined;
      const locId = instance.state?.currentLocationId;
      const location = (locId && instance.state?.locations?.[locId]?.name) || t("library.locationUnknown");
      return {
        instance,
        seed,
        title: seed?.title ?? t("library.locationUnknown"),
        accent: pres?.accent ?? "var(--lamp)",
        location,
        hook: settlementHook(instance),
      };
    });
    setRows(built);
    setLoaded(true);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function onPin(r: Row) {
    const repo = getRepository();
    const nextPinned = !r.instance.pinned;
    await repo.upsertInstance({ ...r.instance, pinned: nextPinned });
    if (nextPinned && r.seed) recordFunnel(repo, "pin", r.seed); // §5.9 funnel: pin
    await refresh();
  }

  function onEnter(r: Row) {
    // §5.9 funnel: reopening an already-opened world is a return.
    if (r.seed) recordFunnel(getRepository(), "return", r.seed);
    enter(`/play?world=${r.seed?.id ?? r.instance.seedId}`);
  }

  const pinned = rows.filter((r) => r.instance.pinned);
  const others = rows.filter((r) => !r.instance.pinned);

  return (
    <main className="app-bg relative mx-auto flex min-h-[100dvh] max-w-md flex-col door-arrive">
      <Overlay />
      <header
        className="glass-bar relative z-10 shrink-0 border-b border-[var(--line)] px-5 pb-3"
        style={{ paddingTop: "max(0.9rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center justify-between">
          <div className="eyebrow">{t("library.title")}</div>
          <Link href="/" className="text-[12.5px] text-[var(--smoke)] transition hover:text-[var(--mist)]">
            {t("common.back")}
          </Link>
        </div>
        <h1 className="mt-1 text-[1.15rem] text-[var(--mist)]" style={{ fontFamily: "var(--serif)" }}>
          {t("library.subtitle")}
        </h1>
      </header>

      <div className="relative z-10 flex flex-1 flex-col gap-6 px-5 py-6">
        {loaded && rows.length === 0 && (
          <div className="mt-16 flex flex-col items-center gap-4 text-center">
            <p className="text-[14px] text-[var(--smoke)]">{t("library.empty")}</p>
            <Link
              href="/"
              className="rounded-2xl border border-[var(--lamp)] px-6 py-3 text-[14px] text-[var(--lamp)] transition active:scale-[0.97]"
              style={{ fontFamily: "var(--serif)" }}
            >
              {t("library.emptyCta")}
            </Link>
          </div>
        )}

        {pinned.length > 0 && (
          <section className="flex flex-col gap-3">
            <div className="eyebrow">{t("library.pinned")}</div>
            {pinned.map((r) => (
              <DoorRow key={r.instance.id} row={r} onPin={onPin} onEnter={onEnter} />
            ))}
          </section>
        )}

        {others.length > 0 && (
          <section className="flex flex-col gap-3">
            {pinned.length > 0 && <div className="eyebrow">{t("library.opened")}</div>}
            {others.map((r) => (
              <DoorRow key={r.instance.id} row={r} onPin={onPin} onEnter={onEnter} />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
