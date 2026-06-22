"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { buildSeedFromDraft } from "@/lib/world/author";
import type { CharDraft, WorldDraft } from "@/lib/world/author";
import { DEMO_SEED } from "@/lib/world/seed-demo";
import { getRepository } from "@/lib/storage";

interface CharCard {
  name: string;
  description: string;
  gender: string;
  body: string;
  goal: string;
  systemPrompt: string;
  postHistoryInstructions: string;
  present: boolean;
}

function emptyChar(): CharCard {
  return { name: "", description: "", gender: "", body: "", goal: "", systemPrompt: "", postHistoryInstructions: "", present: true };
}

export default function CreatePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [worldview, setWorldview] = useState("");
  const [physics, setPhysics] = useState("");
  const [setting, setSetting] = useState("");
  const [redLinesText, setRedLinesText] = useState("仅限成年人之间的虚构创作；排除任何未成年人相关内容。");
  const [sceneName, setSceneName] = useState("");
  const [sceneDescription, setSceneDescription] = useState("");
  const [clock, setClock] = useState("");
  const [lighting, setLighting] = useState("");
  const [chars, setChars] = useState<CharCard[]>([emptyChar()]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [genre, setGenre] = useState("");
  const [moodText, setMoodText] = useState("");
  const [intensity, setIntensity] = useState<"calm" | "charged" | "explicit" | "">("");
  const [hook, setHook] = useState("");

  function updateChar(i: number, patch: Partial<CharCard>) {
    setChars((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  function addChar() {
    setChars((cs) => [...cs, emptyChar()]);
  }

  function removeChar(i: number) {
    setChars((cs) => cs.filter((_, idx) => idx !== i));
  }

  async function handleCreate() {
    setError(null);
    setSaving(true);
    const charDrafts: CharDraft[] = chars.map((c) => ({
      name: c.name,
      description: c.description,
      gender: c.gender || undefined,
      body: c.body || undefined,
      goal: c.goal || undefined,
      systemPrompt: c.systemPrompt || undefined,
      postHistoryInstructions: c.postHistoryInstructions || undefined,
      present: c.present,
    }));
    const redLines = redLinesText.split("\n").map((s) => s.trim()).filter(Boolean);
    const moodArr = moodText.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
    const draft: WorldDraft = {
      title,
      worldview,
      physics: physics || undefined,
      setting: setting || undefined,
      redLines: redLines.length > 0 ? redLines : undefined,
      sceneName: sceneName || undefined,
      sceneDescription: sceneDescription || undefined,
      clock: clock || undefined,
      lighting: lighting || undefined,
      characters: charDrafts,
      genre: genre.trim() || undefined,
      mood: moodArr.length > 0 ? moodArr : undefined,
      intensity: intensity || undefined,
      hook: hook.trim() || undefined,
    };
    const seed = buildSeedFromDraft(draft, DEMO_SEED.modelConfig, Date.now());
    if (!seed) {
      setError("至少要有世界名和一个角色名");
      setSaving(false);
      return;
    }
    try {
      await getRepository().upsertSeed(seed);
      router.push("/play?world=" + seed.id);
    } catch {
      setError("保存失败，请重试");
      setSaving(false);
    }
  }

  return (
    <main className="world-bg relative mx-auto flex min-h-[100dvh] max-w-md flex-col gap-8 px-6 py-10">
      {/* Header */}
      <header className="relative z-10 mt-6">
        <div className="eyebrow">创作者 · 造世</div>
        <h1 className="mt-2 text-[2.4rem] leading-none text-[var(--mist)]" style={{ fontFamily: "var(--serif)" }}>
          造世
        </h1>
        <div className="mt-1 text-[13px] tracking-[0.3em] text-[var(--smoke)]">从一个念头开始</div>
      </header>

      {/* 世界 */}
      <section className="relative z-10 flex flex-col gap-4">
        <div className="eyebrow">世界</div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[var(--smoke)]">世界名 *</label>
          <input
            className="field w-full"
            placeholder="雨夜·無燈酒馆"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[var(--smoke)]">世界观</label>
          <textarea
            className="field w-full resize-none"
            rows={3}
            placeholder="用一段话描述这个世界的氛围与基调……"
            value={worldview}
            onChange={(e) => setWorldview(e.target.value)}
          />
        </div>
        <details className="rounded-xl border border-[var(--line)] bg-[var(--ink-2)]/40 px-4 py-3">
          <summary className="cursor-pointer text-[11px] text-[var(--smoke)] select-none">高级设定</summary>
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[var(--smoke)]">物理规则</label>
              <input className="field w-full" placeholder="现实物理，无超自然…" value={physics} onChange={(e) => setPhysics(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[var(--smoke)]">世界设定</label>
              <input className="field w-full" placeholder="近未来港口城市…" value={setting} onChange={(e) => setSetting(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[var(--smoke)]">红线（每行一条）</label>
              <textarea
                className="field w-full resize-none"
                rows={2}
                value={redLinesText}
                onChange={(e) => setRedLinesText(e.target.value)}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-[11px] text-[var(--smoke)]">开场地点名</label>
                <input className="field w-full" placeholder="無燈酒馆" value={sceneName} onChange={(e) => setSceneName(e.target.value)} />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-[11px] text-[var(--smoke)]">时刻</label>
                <input className="field w-full" placeholder="深夜 23:40" value={clock} onChange={(e) => setClock(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[var(--smoke)]">光线</label>
              <input className="field w-full" placeholder="霓虹透过雨窗的冷光" value={lighting} onChange={(e) => setLighting(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[var(--smoke)]">开场场景描述</label>
              <textarea
                className="field w-full resize-none"
                rows={2}
                placeholder="暖黄的吊灯只剩一盏……"
                value={sceneDescription}
                onChange={(e) => setSceneDescription(e.target.value)}
              />
            </div>
          </div>
        </details>
      </section>

      {/* 卖相 (可选) */}
      <section className="relative z-10 flex flex-col gap-4">
        <div className="eyebrow">卖相（可选）</div>
        <p className="text-[11px] text-[var(--smoke)] -mt-2">
          让路过的人在一秒内决定要不要进来。
        </p>
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-[11px] text-[var(--smoke)]">类型</label>
            <input
              className="field w-full"
              placeholder="都市夜谈 / 江湖 / 科幻…"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-[11px] text-[var(--smoke)]">调性（逗号分隔）</label>
            <input
              className="field w-full"
              placeholder="暧昧, 危险"
              value={moodText}
              onChange={(e) => setMoodText(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[var(--smoke)]">烈度</label>
          <select
            className="field w-full px-3 py-2 text-[13px]"
            value={intensity}
            onChange={(e) => setIntensity(e.target.value as "calm" | "charged" | "explicit" | "")}
          >
            <option value="">自动</option>
            <option value="calm">平和</option>
            <option value="charged">张力</option>
            <option value="explicit">热烈</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[var(--smoke)]">冷开场钩子</label>
          <textarea
            className="field w-full resize-none"
            rows={3}
            placeholder="用一句话把人拽进来：第二人称、结尾悬住——「你推开那扇门……」"
            value={hook}
            onChange={(e) => setHook(e.target.value)}
          />
          <span className="text-[10px] text-[var(--smoke)]">
            留空则自动从场景描述生成。
          </span>
        </div>
      </section>

      {/* 角色 */}
      <section className="relative z-10 flex flex-col gap-4">
        <div className="eyebrow">角色</div>
        {chars.map((c, i) => (
          <div key={i} className="rounded-2xl border border-[var(--line)] bg-[var(--ink-2)]/60 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-[var(--lamp)]">角色 {i + 1}</span>
              {chars.length > 1 && (
                <button onClick={() => removeChar(i)} className="text-[11px] text-[var(--smoke)] hover:text-red-400">移除</button>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[var(--smoke)]">名字 *</label>
              <input className="field w-full" placeholder="角色名" value={c.name} onChange={(e) => updateChar(i, { name: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[var(--smoke)]">描述</label>
              <textarea
                className="field w-full resize-none"
                rows={2}
                placeholder="外貌、性格、背景……"
                value={c.description}
                onChange={(e) => updateChar(i, { description: e.target.value })}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-[11px] text-[var(--smoke)]">性别</label>
                <input className="field w-full" placeholder="女" value={c.gender} onChange={(e) => updateChar(i, { gender: e.target.value })} />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-[11px] text-[var(--smoke)]">身体</label>
                <input className="field w-full" placeholder="成年女性" value={c.body} onChange={(e) => updateChar(i, { body: e.target.value })} />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[var(--smoke)]">目标</label>
              <input className="field w-full" placeholder="这个角色的秘密目标……" value={c.goal} onChange={(e) => updateChar(i, { goal: e.target.value })} />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-[11px] text-[var(--smoke)]">开场在场</label>
              <button
                onClick={() => updateChar(i, { present: !c.present })}
                className={`h-6 w-11 rounded-full transition-colors ${c.present ? "bg-[var(--lamp)]" : "bg-[var(--line)]"} relative`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-[var(--ink)] transition-transform ${c.present ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
              <span className="text-[10px] text-[var(--smoke)]">{c.present ? "在场" : "不在场"}</span>
            </div>
            <details className="rounded-lg border border-[var(--line)] px-3 py-2">
              <summary className="cursor-pointer text-[10px] text-[var(--smoke)] select-none">高级 · 提示词</summary>
              <div className="mt-2 flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-[var(--smoke)]">系统提示词</label>
                  <textarea
                    className="field w-full resize-none text-[11px]"
                    rows={2}
                    placeholder="覆盖默认角色扮演前置……"
                    value={c.systemPrompt}
                    onChange={(e) => updateChar(i, { systemPrompt: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-[var(--smoke)]">后置强化</label>
                  <textarea
                    className="field w-full resize-none text-[11px]"
                    rows={2}
                    placeholder="每轮对话末尾追加的指令……"
                    value={c.postHistoryInstructions}
                    onChange={(e) => updateChar(i, { postHistoryInstructions: e.target.value })}
                  />
                </div>
              </div>
            </details>
          </div>
        ))}
        <button
          onClick={addChar}
          className="rounded-xl border border-dashed border-[var(--line)] py-3 text-[13px] text-[var(--smoke)] transition hover:border-[var(--lamp)] hover:text-[var(--lamp)]"
        >
          ＋ 添加角色
        </button>
      </section>

      {/* Create button */}
      <div className="relative z-10 flex flex-col items-center gap-3 pb-8">
        {error && <p className="text-[12px] text-red-400">{error}</p>}
        <button
          onClick={handleCreate}
          disabled={saving}
          className="w-full rounded-2xl bg-[var(--lamp)] py-4 text-[15px] font-medium text-[var(--ink)] transition active:scale-[0.98] disabled:opacity-50"
          style={{ fontFamily: "var(--serif)" }}
        >
          {saving ? "创建中…" : "创建并进入"}
        </button>
      </div>
    </main>
  );
}
