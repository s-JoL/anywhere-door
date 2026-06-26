"use client";
import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { getRepository } from "@/lib/storage";
import { ensureBuiltinSeeds, ensureInstanceForSeed } from "@/lib/engine/bootstrap";
import { RETURN_ECHO_MS, reconcileReturnOpenBeat, forkLastTurn, markInstanceSeen, regenerateLastTurn, restoreTimelineBranch, rewindLastTurn, runTurn, type TurnEvent } from "@/lib/engine/turn";
import { streamChat } from "@/lib/llm/stream";
import { DEMO_SEED } from "@/lib/world/seed-demo";
import { derivePresentation } from "@/lib/world/presentation";
import { recordDwell } from "@/lib/taste/record";
import { recordFunnel, recordPrebakedTaste } from "@/lib/taste/funnel";
import { getUserConfig, resolveModelConfig } from "@/lib/settings/user-config";
import { composePrebakedTasteLines, shouldUsePrebakedTaste } from "@/lib/world/prebaked-taste";
import { PLAYER_INPUT_CHANNELS, STUDIO_INPUT_CHANNELS, isPlayerInputChannel } from "@/lib/studio/channels";
import { buildStudioInspector, type StudioInspectorSnapshot } from "@/lib/studio/inspector";
import { formatBeliefLine } from "@/lib/studio/display";
import { canRunLiveTurn, classifyPlaySendGate, playAccessNotice, playControlSurface, settingsHrefForControlSurface } from "@/lib/play/access";
import { t } from "@/lib/i18n";
import Link from "next/link";
import type { InputChannel, Message, TimelineBranch, WorldSeed, WorldState } from "@/lib/types";

type Item = {
  id: string;
  kind: "user" | "speaker" | "narration";
  speakerName?: string;
  content: string;
  streaming?: boolean;
};

/** Dim the (actions) inside dialogue into italics, keeping the narration body itself bright. */
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
  const [inputChannel, setInputChannel] = useState<InputChannel>("act");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [needsKey, setNeedsKey] = useState(false);
  const [prebakedMode, setPrebakedMode] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [inspector, setInspector] = useState<StudioInspectorSnapshot | null>(null);
  const [hasTurnSnapshot, setHasTurnSnapshot] = useState(false);
  const [branches, setBranches] = useState<TimelineBranch[]>([]);
  const [presenceReady, setPresenceReady] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const streamingId = useRef<string | null>(null);
  const turnCountRef = useRef(0);
  const dwellFiredRef = useRef(false);
  const openDoorFiredRef = useRef(false);
  const firstActionFiredRef = useRef(false);
  const prebakedTasteFiredRef = useRef<string | null>(null);
  const hiddenAtRef = useRef<number | null>(null);

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

  function prebakedToItems(seed_: WorldSeed, resolveName: (id: string | null | undefined) => string): Item[] {
    return composePrebakedTasteLines(seed_).map((line, i) => {
      const id = `prebaked-${seed_.id}-${i}`;
      if (line.kind === "user") return { id, kind: "user", content: line.content };
      if (line.kind === "narration") return { id, kind: "narration", content: line.content };
      return { id, kind: "speaker", speakerName: resolveName(line.speakerId), content: line.content };
    });
  }

  const reload = useCallback(
    async (id: string, resolveName: (cid: string | null | undefined) => string) => {
      const repo = getRepository();
      const [msgs, inst, memories, deltaLog, timelineBranches] = await Promise.all([
        repo.listMessages(id),
        repo.getInstance(id),
        repo.listAllMemories(id),
        repo.listDeltaLog(id),
        repo.listTimelineBranches(id),
      ]);
      setItems(msgs.map((m) => msgToItem(m, resolveName)));
      setWorld(inst?.state ?? null);
      setInspector(inst ? buildStudioInspector({ instance: inst, memories, deltaLog }) : null);
      setHasTurnSnapshot(Boolean(inst?.lastTurnSnapshot));
      setBranches(timelineBranches);
    },
    [],
  );

  useEffect(() => {
    (async () => {
      setPresenceReady(false);
      await ensureBuiltinSeeds();
      const repo = getRepository();
      const loaded = (await repo.getSeed(worldId)) ?? DEMO_SEED;
      setSeed(loaded);
      if (!openDoorFiredRef.current) { openDoorFiredRef.current = true; recordFunnel(repo, "open-door", loaded); } // §5.9 funnel
      const resolve = (id: string | null | undefined) =>
        loaded.characters.find((c) => c.id === id)?.name ?? t("play.someone");
      const iid = await ensureInstanceForSeed(worldId);
      setInstanceId(iid);
      const existingMessages = await repo.listMessages(iid);
      const usePrebaked = existingMessages.length === 0 && shouldUsePrebakedTaste(loaded, getUserConfig());
      setPrebakedMode(usePrebaked);
      if (usePrebaked) setNeedsKey(false);
      const userConfig = getUserConfig();
      const liveTurnAllowed = canRunLiveTurn(loaded, userConfig);
      if (!usePrebaked && liveTurnAllowed) {
        const cfg = resolveModelConfig(loaded, userConfig);
        const beat = await reconcileReturnOpenBeat({
          seed: loaded,
          repo,
          instanceId: iid,
          llm: (msgs, onContent) => streamChat({ cfg, messages: msgs, onContent }),
        });
        if (beat) recordFunnel(repo, "return", loaded);
      }
      await reload(iid, resolve);
      if (usePrebaked) {
        if (prebakedTasteFiredRef.current !== loaded.id) {
          prebakedTasteFiredRef.current = loaded.id;
          recordPrebakedTaste(repo, loaded);
        }
        setItems(prebakedToItems(loaded, resolve));
      }
      setPresenceReady(true);
    })();
  }, [worldId, reload]);

  useEffect(() => {
    if (!presenceReady || !instanceId || !seed || prebakedMode) return;
    let cancelled = false;

    const touch = () => {
      if (cancelled || document.visibilityState !== "visible") return;
      void markInstanceSeen({ repo: getRepository(), instanceId });
    };

    const reconcileVisibleReturn = async () => {
      if (cancelled) return;
      if (!canRunLiveTurn(seed, getUserConfig())) {
        touch();
        return;
      }
      try {
        const cfg = resolveModelConfig(seed, getUserConfig());
        const beat = await reconcileReturnOpenBeat({
          seed,
          repo: getRepository(),
          instanceId,
          llm: (msgs, onContent) => streamChat({ cfg, messages: msgs, onContent }),
        });
        if (beat) recordFunnel(getRepository(), "return", seed);
        await reload(instanceId, nameOf);
      } catch (e) {
        setErr(t("play.error", { msg: (e as Error).message ?? "" }));
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (hiddenAt && Date.now() - hiddenAt >= RETURN_ECHO_MS) {
        void reconcileVisibleReturn();
      } else {
        touch();
      }
    };

    touch();
    const interval = window.setInterval(touch, 60_000);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onVisibilityChange);
    };
  }, [presenceReady, instanceId, seed, prebakedMode, reload, nameOf]);

  // §5.9 funnel: still here after ten minutes → a retention signal.
  useEffect(() => {
    if (!seed) return;
    const id = setTimeout(() => recordFunnel(getRepository(), "ten-minute-retain", seed), 10 * 60 * 1000);
    return () => clearTimeout(id);
  }, [seed]);

  // Only auto-scroll to bottom when already near the bottom, to avoid interrupting scrolling up; use auto for per-character streaming to debounce
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
    const gate = classifyPlaySendGate({
      text: input,
      busy,
      hasInstance: Boolean(instanceId),
      hasSeed: Boolean(seed),
      prebakedMode,
      canRunLiveTurn: seed ? canRunLiveTurn(seed, getUserConfig()) : false,
    });
    if (gate !== "live") {
      if (gate === "blocked-prebaked") {
        setNeedsKey(false);
        setInput("");
      } else if (gate === "blocked-key") {
        setNeedsKey(true);
      }
      return;
    }
    if (!instanceId || !seed) return;
    const text = input.trim();
    setInput("");
    setBusy(true);
    setErr("");
    setNeedsKey(false);
    const playerFacingInput = isPlayerInputChannel(inputChannel);
    if (playerFacingInput && !firstActionFiredRef.current) { firstActionFiredRef.current = true; recordFunnel(getRepository(), "first-action", seed); } // §5.9 funnel
    if (playerFacingInput) setItems((xs) => [...xs, { id: `u-${Date.now()}`, kind: "user", content: text }]);
    try {
      const cfg = resolveModelConfig(seed, getUserConfig());
      await runTurn({
        seed,
        repo: getRepository(),
        instanceId,
        input: text,
        inputChannel,
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
    if (prebakedMode) return;
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

  async function rewind() {
    if (busy || !instanceId || prebakedMode || !hasTurnSnapshot) return;

    setBusy(true);
    setErr("");
    setNeedsKey(false);
    try {
      await rewindLastTurn({ repo: getRepository(), instanceId });
      await reload(instanceId, nameOf);
    } catch (e) {
      const msg = (e as Error).message ?? "";
      setErr(t("play.rewindError", { msg }));
      await reload(instanceId, nameOf);
    } finally {
      streamingId.current = null;
      setBusy(false);
    }
  }

  async function forkTimeline() {
    if (busy || !instanceId || prebakedMode || !hasTurnSnapshot) return;

    setBusy(true);
    setErr("");
    setNeedsKey(false);
    try {
      await forkLastTurn({ repo: getRepository(), instanceId, title: t("play.timeline.archivedBranch") });
      setStudioOpen(true);
      await reload(instanceId, nameOf);
    } catch (e) {
      const msg = (e as Error).message ?? "";
      setErr(t("play.forkError", { msg }));
      await reload(instanceId, nameOf);
    } finally {
      streamingId.current = null;
      setBusy(false);
    }
  }

  async function restoreBranch(branchId: string) {
    if (busy || !instanceId || prebakedMode) return;

    setBusy(true);
    setErr("");
    setNeedsKey(false);
    try {
      await restoreTimelineBranch({
        repo: getRepository(),
        instanceId,
        branchId,
        title: t("play.timeline.beforeRestore"),
      });
      await reload(instanceId, nameOf);
    } catch (e) {
      const msg = (e as Error).message ?? "";
      setErr(t("play.restoreBranchError", { msg }));
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
  const liveTurnAllowed = canRunLiveTurn(seed, getUserConfig());
  const controlSurface = playControlSurface({ prebakedMode, liveTurnAllowed });
  const settingsHref = settingsHrefForControlSurface(controlSurface, seed?.id ?? worldId);
  const canRegenerate = !prebakedMode && liveTurnAllowed && hasTurnSnapshot && items.some((it) => it.kind === "user");
  const canRewind = !prebakedMode && hasTurnSnapshot;
  const canFork = !prebakedMode && hasTurnSnapshot;
  const studioControlsDisabled = busy || prebakedMode;
  function channelLabel(channel: InputChannel): string {
    if (channel === "speak") return t("play.channel.speak");
    if (channel === "act") return t("play.channel.act");
    if (channel === "observe") return t("play.channel.observe");
    if (channel === "scene-contract") return t("play.channel.sceneContract");
    if (channel === "god-edit") return t("play.channel.god");
    return t("play.channel.director");
  }
  function channelTitle(channel: InputChannel): string {
    if (channel === "speak") return t("play.channel.speakTitle");
    if (channel === "act") return t("play.channel.actTitle");
    if (channel === "observe") return t("play.channel.observeTitle");
    if (channel === "scene-contract") return t("play.channel.sceneContractTitle");
    if (channel === "god-edit") return t("play.channel.godTitle");
    return t("play.channel.directorTitle");
  }
  function channelPlaceholder(channel: InputChannel): string {
    if (channel === "speak") return t("play.placeholder.speak");
    if (channel === "act") return t("play.placeholder.act");
    if (channel === "observe") return t("play.placeholder.observe");
    if (channel === "scene-contract") return t("play.placeholder.sceneContract");
    if (channel === "god-edit") return t("play.placeholder.god");
    return t("play.placeholder.director");
  }
  const inputPlaceholder = prebakedMode ? t("play.sampleInputPlaceholder") : channelPlaceholder(inputChannel);
  const accessNotice = playAccessNotice({ prebakedMode, needsKey: needsKey || (!prebakedMode && !liveTurnAllowed) });

  function selectInputChannel(channel: InputChannel): void {
    setInputChannel(channel);
  }

  function toggleStudio(): void {
    setStudioOpen((open) => {
      const next = !open;
      if (!next && !isPlayerInputChannel(inputChannel)) setInputChannel("act");
      return next;
    });
  }

  function MiniList({ items, empty }: { items: string[]; empty: string }) {
    if (items.length === 0) return <p className="text-[12px] text-[var(--smoke)]">{empty}</p>;
    return (
      <div className="flex flex-col gap-1">
        {items.map((item, i) => (
          <p key={`${item}-${i}`} className="truncate text-[12px] text-[var(--mist)]">{item}</p>
        ))}
      </div>
    );
  }

  return (
    <main
      className="world-bg relative mx-auto flex h-[100dvh] max-w-md flex-col door-arrive"
      style={{ ["--accent" as string]: accent }}
    >
      {/* world-state bar */}
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

      {/* text world */}
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
        {accessNotice === "needs-key" && (
          <div className="self-center text-center text-[13px] text-[var(--smoke)]">
            {t("play.needKey")}
            <Link href="/settings" className="text-[var(--accent)] underline underline-offset-4">
              {t("play.needKeyLink")}
            </Link>
          </div>
        )}
        {accessNotice === "sample" && (
          <div className="self-center text-center text-[13px] leading-relaxed text-[var(--smoke)]">
            {t("play.sampleNotice")}
          </div>
        )}
        {items.length === 0 && !busy && (
          <div className="breathe mt-10 self-center text-center text-[13px] text-[var(--smoke)]">{t("play.empty")}</div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* immersive input */}
      <div
        className="glass-bar relative z-10 shrink-0 border-t border-[var(--line)] px-4 pt-3"
        style={{ paddingBottom: "max(0.9rem, env(safe-area-inset-bottom))" }}
      >
        {controlSurface === "live-controls" ? (
          <>
            <div className="mb-2 grid grid-cols-4 gap-1 rounded-xl border border-[var(--line)] bg-[rgba(6,10,18,0.55)] p-1">
              {PLAYER_INPUT_CHANNELS.map((channel) => {
                const active = inputChannel === channel;
                return (
                  <button
                    key={channel}
                    type="button"
                    title={channelTitle(channel)}
                    aria-label={channelTitle(channel)}
                    aria-pressed={active}
                    disabled={busy}
                    onClick={() => selectInputChannel(channel)}
                    className="h-8 rounded-lg text-[12px] transition disabled:opacity-35"
                    style={{
                      color: active ? "var(--ink)" : "var(--smoke)",
                      background: active ? "var(--accent)" : "transparent",
                      boxShadow: active ? "0 0 14px rgba(255,255,255,0.12)" : "none",
                      fontFamily: "var(--serif)",
                    }}
                  >
                    {channelLabel(channel)}
                  </button>
                );
              })}
              <button
                type="button"
                title={t("play.studio.title")}
                aria-label={t("play.studio.title")}
                aria-expanded={studioOpen}
                disabled={busy}
                onClick={toggleStudio}
                className="h-8 rounded-lg text-[12px] transition disabled:opacity-35"
                style={{
                  color: studioOpen ? "var(--ink)" : "var(--smoke)",
                  background: studioOpen ? "var(--accent)" : "transparent",
                  boxShadow: studioOpen ? "0 0 14px rgba(255,255,255,0.12)" : "none",
                  fontFamily: "var(--serif)",
                }}
              >
                {t("play.studio.short")}
              </button>
            </div>
            {studioOpen && (
              <section className="mb-2 rounded-xl border border-[var(--line)] bg-[rgba(6,10,18,0.72)] p-3">
                <div className="mb-2 grid grid-cols-3 gap-1">
                  {STUDIO_INPUT_CHANNELS.map((channel) => {
                    const active = inputChannel === channel;
                    return (
                      <button
                        key={channel}
                        type="button"
                        title={channelTitle(channel)}
                        aria-label={channelTitle(channel)}
                        aria-pressed={active}
                        disabled={studioControlsDisabled}
                        onClick={() => selectInputChannel(channel)}
                        className="h-8 rounded-lg text-[12px] transition disabled:opacity-35"
                        style={{
                          color: active ? "var(--ink)" : "var(--smoke)",
                          background: active ? "var(--accent)" : "rgba(255,255,255,0.04)",
                          fontFamily: "var(--serif)",
                        }}
                      >
                        {channelLabel(channel)}
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  <div>
                    <div className="tag mb-1">{t("play.studio.where")}</div>
                    <MiniList
                      items={[
                        inspector?.locationName ?? "",
                        ...(inspector?.presentCharacters.map((c) => c.name) ?? []),
                      ].filter(Boolean)}
                      empty={t("play.studio.empty")}
                    />
                  </div>
                  <div>
                    <div className="tag mb-1">{t("play.studio.control")}</div>
                    <MiniList
                      items={[
                        ...(inspector?.directorNotes.map((note) => `${t("play.channel.director")} ${note}`) ?? []),
                        ...(inspector?.sceneContract ? [`${t("play.channel.sceneContract")} ${inspector.sceneContract}`] : []),
                      ]}
                      empty={t("play.studio.noControl")}
                    />
                  </div>
                  <div>
                    <div className="tag mb-1">{t("play.studio.facts")}</div>
                    <MiniList
                      items={inspector?.facts.map((fact) => `${fact.label} (${fact.hardness})`) ?? []}
                      empty={t("play.studio.noFacts")}
                    />
                  </div>
                  <div>
                    <div className="tag mb-1">{t("play.studio.pressure")}</div>
                    <MiniList
                      items={inspector?.pressureLines.map((line) => `${line.summary} · ${line.status}/${line.intensity}`) ?? []}
                      empty={t("play.studio.noPressure")}
                    />
                  </div>
                  <div>
                    <div className="tag mb-1">{t("play.studio.beliefs")}</div>
                    <MiniList
                      items={inspector?.beliefs.map((belief) => formatBeliefLine(belief)) ?? []}
                      empty={t("play.studio.noBeliefs")}
                    />
                  </div>
                  <div>
                    <div className="tag mb-1">{t("play.studio.recent")}</div>
                    <MiniList
                      items={inspector?.recentDeltas.map((delta) => `T${delta.turn} ${delta.source}/${delta.kind}`) ?? []}
                      empty={t("play.studio.noRecent")}
                    />
                  </div>
                </div>
                <div className="mt-3 border-t border-[var(--line)] pt-2">
                  <div className="tag mb-1">{t("play.timeline.title")}</div>
                  {branches.length === 0 ? (
                    <p className="text-[12px] text-[var(--smoke)]">{t("play.timeline.empty")}</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5">
                      {branches.slice(0, 4).map((branch) => (
                        <button
                          key={branch.id}
                          type="button"
                          title={t("play.restoreBranch")}
                          aria-label={`${t("play.restoreBranch")} ${branch.title}`}
                          disabled={studioControlsDisabled}
                          onClick={() => restoreBranch(branch.id)}
                          className="min-h-9 rounded-lg border border-[var(--line)] bg-[rgba(255,255,255,0.04)] px-2 py-1 text-left text-[11.5px] leading-tight text-[var(--mist)] transition disabled:opacity-35"
                        >
                          <span className="block truncate">{branch.title}</span>
                          <span className="block text-[10px] text-[var(--smoke)]">T{branch.forkedFromTurn ?? 0}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}
            <div className="flex items-end gap-2.5">
              <button
                onClick={rewind}
                disabled={busy || !canRewind}
                aria-label={t("play.rewind")}
                title={t("play.rewind")}
                className="field send-glow flex h-12 w-11 shrink-0 items-center justify-center text-[18px] text-[var(--lamp)] transition disabled:opacity-35 disabled:shadow-none"
              >
                ↶
              </button>
              <button
                onClick={regenerate}
                disabled={busy || !canRegenerate}
                aria-label={t("play.regenerate")}
                title={t("play.regenerate")}
                className="field send-glow flex h-12 w-11 shrink-0 items-center justify-center text-[18px] text-[var(--lamp)] transition disabled:opacity-35 disabled:shadow-none"
              >
                ↻
              </button>
              <button
                onClick={forkTimeline}
                disabled={busy || !canFork}
                aria-label={t("play.fork")}
                title={t("play.fork")}
                className="field send-glow flex h-12 w-11 shrink-0 items-center justify-center text-[18px] text-[var(--lamp)] transition disabled:opacity-35 disabled:shadow-none"
              >
                ⎇
              </button>
              <textarea
                className="field max-h-32 flex-1 resize-none px-4 py-3 text-[15px] leading-relaxed"
                rows={1}
                value={input}
                disabled={busy}
                placeholder={inputPlaceholder}
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
          </>
        ) : (
          <Link
            href={settingsHref}
            className="field send-glow flex min-h-12 w-full items-center justify-center px-4 text-center text-[14px] font-semibold text-[var(--lamp)]"
          >
            {controlSurface === "sample-cta" ? t("play.sampleCta") : t("play.keyCta")}
          </Link>
        )}
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
