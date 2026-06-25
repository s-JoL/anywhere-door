"use client";
import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { getRepository } from "@/lib/storage";
import { ensureDemoSeed, ensureInstanceForSeed } from "@/lib/engine/bootstrap";
import { regenerateLastTurn, runTurn, type TurnEvent } from "@/lib/engine/turn";
import { streamChat } from "@/lib/llm/stream";
import { DEMO_SEED } from "@/lib/world/seed-demo";
import { derivePresentation } from "@/lib/world/presentation";
import { recordDwell } from "@/lib/taste/record";
import { recordFunnel } from "@/lib/taste/funnel";
import { getUserConfig, resolveModelConfig } from "@/lib/settings/user-config";
import { t } from "@/lib/i18n";
import Link from "next/link";
import type { Message, WorldSeed, WorldState } from "@/lib/types";

type Item = {
  id: string;
  kind: "user" | "speaker" | "narration";
  speakerName?: string;
  content: string;
  streaming?: boolean;
};

/** 把对白里的（动作）压暗成斜体，叙述本体保持明亮。 */
function Spoken({ text }: { text: string }) {
  const parts = text.split(/(（[^）]*）|\([^)]*\))/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        /^[（(]/.test(p) ? <span key={i} className="act">{p}</span> : <span key={i}>{p}</span>,
      )}
    </>
  );
}

function tensionColor(t: number): string {
  const x = Math.max(0, Math.min(10, t)) / 10;
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * x);
  return `rgb(${lerp(240, 255)},${lerp(195, 61)},${lerp(107, 127)})`;
}

function PlayInner() {
  const params = useSearchParams();
  const worldId = params.get("world") ?? DEMO_SEED.id;

  const [seed, setSeed] = useState<WorldSeed | null>(null);
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [world, setWorld] = useState<WorldState | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [needsKey, setNeedsKey] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const streamingId = useRef<string | null>(null);
  const turnCountRef = useRef(0);
  const dwellFiredRef = useRef(false);
  const openDoorFiredRef = useRef(false);
  const firstActionFiredRef = useRef(false);

  const nameOf = useCallback(
    (id: string | null | undefined) =>
      (seed ?? DEMO_SEED).characters.find((c) => c.id === id)?.name ?? t("play.someone"),
    [seed],
  );

  function msgToItem(m: Message, resolveName: (id: string | null | undefined) => string): Item {
    if (m.role === "user") return { id: m.id, kind: "user", content: m.content };
    if (m.role === "system") return { id: m.id, kind: "narration", content: m.content };
    return { id: m.id, kind: "speaker", speakerName: resolveName(m.speakerId), content: m.content };
  }

  const reload = useCallback(
    async (id: string, resolveName: (cid: string | null | undefined) => string) => {
      const repo = getRepository();
      const [msgs, inst] = await Promise.all([repo.listMessages(id), repo.getInstance(id)]);
      setItems(msgs.map((m) => msgToItem(m, resolveName)));
      setWorld(inst?.state ?? null);
    },
    [],
  );

  useEffect(() => {
    (async () => {
      await ensureDemoSeed();
      const repo = getRepository();
      const loaded = (await repo.getSeed(worldId)) ?? DEMO_SEED;
      setSeed(loaded);
      if (!openDoorFiredRef.current) { openDoorFiredRef.current = true; recordFunnel(repo, "open-door", loaded); } // §5.9 funnel
      const resolve = (id: string | null | undefined) =>
        loaded.characters.find((c) => c.id === id)?.name ?? t("play.someone");
      const iid = await ensureInstanceForSeed(worldId);
      setInstanceId(iid);
      await reload(iid, resolve);
    })();
  }, [worldId, reload]);

  // §5.9 funnel: still here after ten minutes → a retention signal.
  useEffect(() => {
    if (!seed) return;
    const id = setTimeout(() => recordFunnel(getRepository(), "ten-minute-retain", seed), 10 * 60 * 1000);
    return () => clearTimeout(id);
  }, [seed]);

  // 贴近底部时才自动吸底，避免打断上翻；流式逐字用 auto 防抖
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (near) bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [items]);

  function onEvent(e: TurnEvent) {
    if (e.type === "speaker-start") {
      streamingId.current = e.id;
      setItems((xs) => [...xs, { id: e.id, kind: "speaker", speakerName: e.speakerName, content: "", streaming: true }]);
    } else if (e.type === "delta") {
      setItems((xs) => xs.map((it) => (it.id === e.id ? { ...it, content: it.content + e.text } : it)));
    } else if (e.type === "speaker-end") {
      streamingId.current = null;
      setItems((xs) => xs.map((it) => (it.id === e.id ? { ...it, content: e.content, streaming: false } : it)));
    } else if (e.type === "narration") {
      setItems((xs) => [...xs, { id: e.id, kind: "narration", content: e.content }]);
    }
  }

  async function send() {
    if (!input.trim() || busy || !instanceId || !seed) return;
    const text = input.trim();
    setInput("");
    setBusy(true);
    setErr("");
    setNeedsKey(false);
    if (!firstActionFiredRef.current) { firstActionFiredRef.current = true; recordFunnel(getRepository(), "first-action", seed); } // §5.9 funnel
    setItems((xs) => [...xs, { id: `u-${Date.now()}`, kind: "user", content: text }]);
    try {
      const cfg = resolveModelConfig(seed, getUserConfig());
      await runTurn({
        seed,
        repo: getRepository(),
        instanceId,
        input: text,
        llm: (msgs, onContent) => streamChat({ cfg, messages: msgs, onContent }),
        onEvent,
      });
      await reload(instanceId, nameOf);
      if (!dwellFiredRef.current) {
        turnCountRef.current += 1;
        if (turnCountRef.current >= 3) {
          dwellFiredRef.current = true;
          recordDwell(getRepository(), seed);
        }
      }
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (/missing api key/i.test(msg) || /upstream 40[0-3]/i.test(msg)) {
        setNeedsKey(true);
      } else {
        setErr(t("play.error", { msg }));
      }
      await reload(instanceId, nameOf);
    } finally {
      streamingId.current = null;
      setBusy(false);
    }
  }

  async function regenerate() {
    if (busy || !instanceId || !seed) return;
    const lastUserIndex = [...items].map((it) => it.kind).lastIndexOf("user");
    if (lastUserIndex < 0) return;
    const text = items[lastUserIndex].content;

    setBusy(true);
    setErr("");
    setNeedsKey(false);
    setItems((xs) => [...xs.slice(0, lastUserIndex), { id: `regen-u-${Date.now()}`, kind: "user", content: text }]);
    try {
      const cfg = resolveModelConfig(seed, getUserConfig());
      await regenerateLastTurn({
        seed,
        repo: getRepository(),
        instanceId,
        llm: (msgs, onContent) => streamChat({ cfg, messages: msgs, onContent }),
        onEvent,
      });
      await reload(instanceId, nameOf);
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (/missing api key/i.test(msg) || /upstream 40[0-3]/i.test(msg)) {
        setNeedsKey(true);
      } else {
        setErr(t("play.regenError", { msg }));
      }
      await reload(instanceId, nameOf);
    } finally {
      streamingId.current = null;
      setBusy(false);
    }
  }

  if (!seed) {
    return (
      <main className="world-bg relative mx-auto flex h-[100dvh] max-w-md flex-col items-center justify-center">
        <div className="breathe text-[13px] tracking-[0.3em] text-[var(--smoke)]">{t("play.waking")}</div>
      </main>
    );
  }

  const accent = derivePresentation(seed).accent ?? "var(--lamp)";
  const loc = world ? world.locations[world.currentLocationId] : null;
  const present = loc ? loc.presentCharacterIds.map(nameOf) : [];
  const waitingForFirst = busy && streamingId.current === null;
  const canRegenerate = items.some((it) => it.kind === "user");

  return (
    <main
      className="world-bg relative mx-auto flex h-[100dvh] max-w-md flex-col door-arrive"
      style={{ ["--accent" as string]: accent }}
    >
      {/* 世界状态条 */}
      <header
        className="glass-bar relative z-10 shrink-0 border-b border-[var(--line)] px-4 pb-2.5"
        style={{ paddingTop: "max(0.7rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center justify-between">
          <div className="eyebrow">{t("brand.eyebrow")}</div>
          {/* Ambient mood cue — color carries pressure; no raw meter (design §5.2). */}
          {world && (
            <span
              className="presence-dot pulse"
              aria-hidden="true"
              style={{ background: tensionColor(world.tension ?? 0), boxShadow: `0 0 9px ${tensionColor(world.tension ?? 0)}` }}
            />
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[12.5px]">
          <span style={{ color: "var(--lamp)" }}>📍 {loc?.name ?? seed.title}</span>
          {world && <span className="text-[var(--smoke)]">· {world.time.clock} · {world.time.lighting}</span>}
        </div>
        {present.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            {present.map((n) => (
              <span key={n} className="flex items-center gap-1.5 text-[11px] text-[var(--mist)]">
                <span className="presence-dot" /> {n}
              </span>
            ))}
          </div>
        )}
      </header>

      {/* 文字世界 */}
      <div ref={scrollRef} className="relative z-10 flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-6">
        {items.map((it) => {
          if (it.kind === "narration") {
            return (
              <div key={it.id} className="rise my-1 flex flex-col items-center gap-2">
                <div className="rule sweep h-px w-24" />
                <p className="narr max-w-[90%]">{it.content}</p>
                <div className="rule h-px w-24" />
              </div>
            );
          }
          if (it.kind === "user") {
            return (
              <div key={it.id} className="rise self-end" style={{ maxWidth: "85%" }}>
                <div className="you-line rounded-r-lg rounded-tl-lg bg-[rgba(255,61,127,0.07)] px-3.5 py-2.5 text-[15px] leading-relaxed text-[var(--mist)]">
                  <Spoken text={it.content} />
                </div>
              </div>
            );
          }
          return (
            <div key={it.id} className="rise self-start" style={{ maxWidth: "92%" }}>
              <div className="tag mb-1 flex items-center gap-1.5">
                <span className="presence-dot" /> {it.speakerName}
              </div>
              <div className={`text-[15.5px] leading-[1.75] text-[var(--mist)] ${it.streaming ? "caret" : ""}`}>
                <Spoken text={it.content} />
              </div>
            </div>
          );
        })}

        {waitingForFirst && (
          <div className="breathe self-center text-[12px] tracking-[0.3em] text-[var(--smoke)]">{t("play.whisper")}</div>
        )}
        {err && <div className="self-center text-center text-[13px] text-[var(--rose)]">{err}</div>}
        {needsKey && (
          <div className="self-center text-center text-[13px] text-[var(--smoke)]">
            {t("play.needKey")}
            <Link href="/settings" className="text-[var(--accent)] underline underline-offset-4">
              {t("play.needKeyLink")}
            </Link>
          </div>
        )}
        {items.length === 0 && !busy && (
          <div className="breathe mt-10 self-center text-center text-[13px] text-[var(--smoke)]">{t("play.empty")}</div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 沉浸输入 */}
      <div
        className="glass-bar relative z-10 shrink-0 border-t border-[var(--line)] px-4 pt-3"
        style={{ paddingBottom: "max(0.9rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-end gap-2.5">
          <button
            onClick={regenerate}
            disabled={busy || !canRegenerate}
            aria-label={t("play.regenerate")}
            title={t("play.regenerate")}
            className="field send-glow flex h-12 w-12 shrink-0 items-center justify-center text-[18px] text-[var(--lamp)] transition disabled:opacity-35 disabled:shadow-none"
          >
            {busy ? <span className="breathe">◍</span> : "↻"}
          </button>
          <textarea
            className="field max-h-32 flex-1 resize-none px-4 py-3 text-[15px] leading-relaxed"
            rows={1}
            value={input}
            disabled={busy}
            placeholder={t("play.inputPlaceholder")}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          />
          <button
            onClick={send}
            disabled={busy || !input.trim()}
            aria-label={t("play.send")}
            className={`field send-glow flex h-12 w-12 shrink-0 items-center justify-center text-[18px] text-[var(--lamp)] transition disabled:opacity-35 disabled:shadow-none`}
          >
            {busy ? <span className="breathe">◍</span> : "➤"}
          </button>
        </div>
      </div>
    </main>
  );
}

export default function Play() {
  return (
    <Suspense
      fallback={
        <main className="world-bg relative mx-auto flex h-[100dvh] max-w-md flex-col items-center justify-center">
          <div className="breathe text-[13px] tracking-[0.3em] text-[var(--smoke)]">{t("play.waking")}</div>
        </main>
      }
    >
      <PlayInner />
    </Suspense>
  );
}
