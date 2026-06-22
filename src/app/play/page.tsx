"use client";
import { useEffect, useRef, useState } from "react";
import { getRepository } from "@/lib/storage";
import { ensureDemoInstance } from "@/lib/engine/bootstrap";
import { runTurn } from "@/lib/engine/turn";
import { streamChat } from "@/lib/llm/stream";
import { DEMO_SEED } from "@/lib/world/seed-demo";
import type { Message } from "@/lib/types";

export default function Play() {
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const id = await ensureDemoInstance();
      setInstanceId(id);
      setMessages(await getRepository().listMessages(id));
    })();
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "auto" }); }, [messages]);

  async function send() {
    if (!input.trim() || busy || !instanceId) return;
    setBusy(true); setErr("");
    const text = input.trim(); setInput("");
    try {
      await runTurn({
        seed: DEMO_SEED, repo: getRepository(), instanceId, input: text,
        llm: (msgs, onContent) => streamChat({ cfg: DEMO_SEED.modelConfig, messages: msgs, onContent }),
      });
      setMessages(await getRepository().listMessages(instanceId));
    } catch (e) {
      setErr(`生成失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex h-[100dvh] max-w-md flex-col">
      <header className="shrink-0 border-b border-white/10 px-4 py-3 text-sm text-amber-200/80">
        {DEMO_SEED.title}
      </header>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {messages.map((m) => {
          if (m.role === "system") {
            return (
              <div key={m.id} className="my-1 text-center text-[12px] italic text-amber-200/70">
                {m.narration ? `— 🌍 ${m.content} —` : `— ${m.content} —`}
              </div>
            );
          }
          const speaker = m.role === "assistant" ? DEMO_SEED.characters.find((c) => c.id === m.speakerId)?.name : undefined;
          return (
            <div key={m.id} className={m.role === "user" ? "self-end text-right" : "self-start"}>
              {speaker && <div className="text-[11px] text-amber-300/70">{speaker}</div>}
              <div className="whitespace-pre-wrap rounded-lg bg-white/5 px-3 py-2 text-[15px] leading-relaxed">{m.content}</div>
            </div>
          );
        })}
        {busy && <p className="text-center text-xs tracking-[0.3em] text-amber-300/70">···</p>}
        {err && <p className="text-center text-sm text-red-400/90">{err}</p>}
        <div ref={bottomRef} />
      </div>
      <div className="shrink-0 border-t border-white/10 p-3" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <div className="flex items-end gap-2">
          <textarea
            className="max-h-32 flex-1 resize-none rounded-lg bg-white/5 px-3 py-2.5 text-[15px] outline-none"
            rows={1} value={input} placeholder="说点什么，或描述你的动作…"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          />
          <button className="rounded-lg bg-amber-300/90 px-5 py-2.5 text-[15px] text-black disabled:opacity-50" onClick={send} disabled={busy}>发送</button>
        </div>
      </div>
    </main>
  );
}
