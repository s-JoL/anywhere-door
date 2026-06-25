"use client";
import { useState } from "react";
import { buildSeedFromDraft } from "@/lib/world/author";
import type { CharDraft, WorldDraft } from "@/lib/world/author";
import { DEMO_SEED } from "@/lib/world/seed-demo";
import { getRepository } from "@/lib/storage";
import { useDoorEnter } from "@/app/DoorTransition";
import { recordAuthor } from "@/lib/taste/record";
import { t } from "@/lib/i18n";

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
  const { enter, Overlay } = useDoorEnter();
  const [title, setTitle] = useState("");
  const [worldview, setWorldview] = useState("");
  const [physics, setPhysics] = useState("");
  const [setting, setSetting] = useState("");
  const [redLinesText, setRedLinesText] = useState(t("create.redLinesDefault"));
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
      setError(t("create.errNeedNames"));
      setSaving(false);
      return;
    }
    try {
      await getRepository().upsertSeed(seed);
      recordAuthor(getRepository(), seed);  // fire-and-forget
      enter("/play?world=" + seed.id);
    } catch {
      setError(t("create.errSaveFailed"));
      setSaving(false);
    }
  }

  return (
    <main className="app-bg relative mx-auto flex min-h-[100dvh] max-w-md flex-col gap-8 px-6 py-10">
      <Overlay />
      {/* Header */}
      <header className="relative z-10 mt-6">
        <div className="eyebrow">{t("create.eyebrow")}</div>
        <h1 className="mt-2 text-[2.4rem] leading-none text-[var(--mist)]" style={{ fontFamily: "var(--serif)" }}>
          {t("create.title")}
        </h1>
        <div className="mt-1 text-[13px] tracking-[0.3em] text-[var(--smoke)]">{t("create.subtitle")}</div>
      </header>

      {/* world */}
      <section className="relative z-10 flex flex-col gap-4">
        <div className="eyebrow">{t("create.section.world")}</div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[var(--smoke)]">{t("create.worldName")}</label>
          <input
            className="field w-full"
            placeholder={t("create.worldNamePlaceholder")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[var(--smoke)]">{t("create.worldview")}</label>
          <textarea
            className="field w-full resize-none"
            rows={3}
            placeholder={t("create.worldviewPlaceholder")}
            value={worldview}
            onChange={(e) => setWorldview(e.target.value)}
          />
        </div>
        <details className="rounded-xl border border-[var(--line)] bg-[var(--ink-2)]/40 px-4 py-3">
          <summary className="cursor-pointer text-[11px] text-[var(--smoke)] select-none">{t("create.advanced")}</summary>
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[var(--smoke)]">{t("create.physics")}</label>
              <input className="field w-full" placeholder={t("create.physicsPlaceholder")} value={physics} onChange={(e) => setPhysics(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[var(--smoke)]">{t("create.setting")}</label>
              <input className="field w-full" placeholder={t("create.settingPlaceholder")} value={setting} onChange={(e) => setSetting(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[var(--smoke)]">{t("create.redLines")}</label>
              <textarea
                className="field w-full resize-none"
                rows={2}
                value={redLinesText}
                onChange={(e) => setRedLinesText(e.target.value)}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-[11px] text-[var(--smoke)]">{t("create.sceneName")}</label>
                <input className="field w-full" placeholder={t("create.sceneNamePlaceholder")} value={sceneName} onChange={(e) => setSceneName(e.target.value)} />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-[11px] text-[var(--smoke)]">{t("create.clock")}</label>
                <input className="field w-full" placeholder={t("create.clockPlaceholder")} value={clock} onChange={(e) => setClock(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[var(--smoke)]">{t("create.lighting")}</label>
              <input className="field w-full" placeholder={t("create.lightingPlaceholder")} value={lighting} onChange={(e) => setLighting(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[var(--smoke)]">{t("create.sceneDesc")}</label>
              <textarea
                className="field w-full resize-none"
                rows={2}
                placeholder={t("create.sceneDescPlaceholder")}
                value={sceneDescription}
                onChange={(e) => setSceneDescription(e.target.value)}
              />
            </div>
          </div>
        </details>
      </section>

      {/* presentation (optional) */}
      <section className="relative z-10 flex flex-col gap-4">
        <div className="eyebrow">{t("create.section.presentation")}</div>
        <p className="text-[11px] text-[var(--smoke)] -mt-2">
          {t("create.presentationHint")}
        </p>
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-[11px] text-[var(--smoke)]">{t("create.genre")}</label>
            <input
              className="field w-full"
              placeholder={t("create.genrePlaceholder")}
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-[11px] text-[var(--smoke)]">{t("create.mood")}</label>
            <input
              className="field w-full"
              placeholder={t("create.moodPlaceholder")}
              value={moodText}
              onChange={(e) => setMoodText(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[var(--smoke)]">{t("create.intensity")}</label>
          <select
            className="field w-full px-3 py-2 text-[13px]"
            value={intensity}
            onChange={(e) => setIntensity(e.target.value as "calm" | "charged" | "explicit" | "")}
          >
            <option value="">{t("create.intensityAuto")}</option>
            <option value="calm">{t("intensity.calm")}</option>
            <option value="charged">{t("create.intensityCharged")}</option>
            <option value="explicit">{t("intensity.explicit")}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[var(--smoke)]">{t("create.hook")}</label>
          <textarea
            className="field w-full resize-none"
            rows={3}
            placeholder={t("create.hookPlaceholder")}
            value={hook}
            onChange={(e) => setHook(e.target.value)}
          />
          <span className="text-[10px] text-[var(--smoke)]">
            {t("create.hookHint")}
          </span>
        </div>
      </section>

      {/* characters */}
      <section className="relative z-10 flex flex-col gap-4">
        <div className="eyebrow">{t("create.section.characters")}</div>
        {chars.map((c, i) => (
          <div key={i} className="rounded-2xl border border-[var(--line)] bg-[var(--ink-2)]/60 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-[var(--lamp)]">{t("create.charN", { n: i + 1 })}</span>
              {chars.length > 1 && (
                <button onClick={() => removeChar(i)} className="text-[11px] text-[var(--smoke)] hover:text-red-400">{t("create.charRemove")}</button>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[var(--smoke)]">{t("create.charName")}</label>
              <input className="field w-full" placeholder={t("create.charNamePlaceholder")} value={c.name} onChange={(e) => updateChar(i, { name: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[var(--smoke)]">{t("create.charDesc")}</label>
              <textarea
                className="field w-full resize-none"
                rows={2}
                placeholder={t("create.charDescPlaceholder")}
                value={c.description}
                onChange={(e) => updateChar(i, { description: e.target.value })}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-[11px] text-[var(--smoke)]">{t("create.charGender")}</label>
                <input className="field w-full" placeholder={t("create.charGenderPlaceholder")} value={c.gender} onChange={(e) => updateChar(i, { gender: e.target.value })} />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <label className="text-[11px] text-[var(--smoke)]">{t("create.charBody")}</label>
                <input className="field w-full" placeholder={t("create.charBodyPlaceholder")} value={c.body} onChange={(e) => updateChar(i, { body: e.target.value })} />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[var(--smoke)]">{t("create.charGoal")}</label>
              <input className="field w-full" placeholder={t("create.charGoalPlaceholder")} value={c.goal} onChange={(e) => updateChar(i, { goal: e.target.value })} />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-[11px] text-[var(--smoke)]">{t("create.charPresent")}</label>
              <button
                onClick={() => updateChar(i, { present: !c.present })}
                className={`h-6 w-11 rounded-full transition-colors ${c.present ? "bg-[var(--lamp)]" : "bg-[var(--line)]"} relative`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-[var(--ink)] transition-transform ${c.present ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
              <span className="text-[10px] text-[var(--smoke)]">{c.present ? t("create.charPresentOn") : t("create.charPresentOff")}</span>
            </div>
            <details className="rounded-lg border border-[var(--line)] px-3 py-2">
              <summary className="cursor-pointer text-[10px] text-[var(--smoke)] select-none">{t("create.charAdvanced")}</summary>
              <div className="mt-2 flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-[var(--smoke)]">{t("create.charSystemPrompt")}</label>
                  <textarea
                    className="field w-full resize-none text-[11px]"
                    rows={2}
                    placeholder={t("create.charSystemPromptPlaceholder")}
                    value={c.systemPrompt}
                    onChange={(e) => updateChar(i, { systemPrompt: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-[var(--smoke)]">{t("create.charPostHistory")}</label>
                  <textarea
                    className="field w-full resize-none text-[11px]"
                    rows={2}
                    placeholder={t("create.charPostHistoryPlaceholder")}
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
          {t("create.addChar")}
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
          {saving ? t("create.creating") : t("create.submit")}
        </button>
      </div>
    </main>
  );
}
