"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getUserConfig, setUserConfig, clearUserConfig, type UserConfig } from "@/lib/settings/user-config";
import { testModel } from "@/lib/llm/test-model";
import { t } from "@/lib/i18n";
import type { ProviderId } from "@/lib/types";

const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: "openrouter", label: "OpenRouter" },
  { id: "deepseek", label: t("settings.provider.deepseek") },
];

/** A few common model ids per provider, used as datalist hints (not enforced). */
const MODEL_SUGGESTIONS: Record<ProviderId, string[]> = {
  openrouter: ["deepseek/deepseek-v4-pro", "deepseek/deepseek-chat", "google/gemini-2.5-flash"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
};

const DEFAULT_FORM: UserConfig = {
  provider: "openrouter",
  apiKey: "",
  model: "deepseek/deepseek-v4-pro",
  reasoningEnabled: false,
};
const API_KEY_PLACEHOLDER = "sk-…";

type TestState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "ok"; latency: number }
  | { kind: "err"; message: string };

export default function SettingsPage() {
  const [form, setForm] = useState<UserConfig>(DEFAULT_FORM);
  const [showKey, setShowKey] = useState(false);
  const [test, setTest] = useState<TestState>({ kind: "idle" });
  const [saved, setSaved] = useState(false);

  // On mount, load local config if present
  useEffect(() => {
    const existing = getUserConfig();
    if (existing) setForm(existing);
  }, []);

  const modelList = useMemo(() => MODEL_SUGGESTIONS[form.provider] ?? [], [form.provider]);

  function patch(p: Partial<UserConfig>) {
    setForm((f) => ({ ...f, ...p }));
    setSaved(false);
    setTest({ kind: "idle" });
  }

  async function onTest() {
    setTest({ kind: "testing" });
    const t0 = Date.now();
    const res = await testModel({
      provider: form.provider,
      apiKey: form.apiKey.trim(),
      model: form.model.trim(),
      reasoningEnabled: form.reasoningEnabled,
    });
    if (res.ok) setTest({ kind: "ok", latency: Date.now() - t0 });
    else setTest({ kind: "err", message: res.error ?? t("settings.unknownError") });
  }

  function onSave() {
    setUserConfig({
      provider: form.provider,
      apiKey: form.apiKey.trim(),
      model: form.model.trim(),
      reasoningEnabled: form.reasoningEnabled,
    });
    setSaved(true);
  }

  function onClear() {
    clearUserConfig();
    setForm(DEFAULT_FORM);
    setSaved(false);
    setTest({ kind: "idle" });
  }

  const testing = test.kind === "testing";

  return (
    <main className="app-bg relative mx-auto flex min-h-[100dvh] max-w-md flex-col door-arrive">
      <header
        className="glass-bar relative z-10 shrink-0 border-b border-[var(--line)] px-5 pb-3"
        style={{ paddingTop: "max(0.9rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center justify-between">
          <div className="eyebrow">{t("settings.eyebrow")}</div>
          <Link href="/" className="text-[12.5px] text-[var(--smoke)] transition hover:text-[var(--mist)]">
            {t("common.back")}
          </Link>
        </div>
        <h1 className="mt-1 text-[1.15rem] text-[var(--mist)]" style={{ fontFamily: "var(--serif)" }}>
          {t("settings.title")}
        </h1>
      </header>

      <div className="relative z-10 flex flex-1 flex-col gap-5 px-5 py-6">
        {/* Provider */}
        <label className="flex flex-col gap-2">
          <span className="eyebrow">{t("settings.provider")}</span>
          <select
            className="field px-3.5 py-3 text-[15px]"
            value={form.provider}
            onChange={(e) => patch({ provider: e.target.value as ProviderId })}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id} style={{ background: "var(--ink-2)" }}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        {/* API Key */}
        <label className="flex flex-col gap-2">
          <span className="eyebrow">{t("settings.apiKey")}</span>
          <div className="relative">
            <input
              className="field w-full px-3.5 py-3 pr-16 text-[15px]"
              type={showKey ? "text" : "password"}
              value={form.apiKey}
              autoComplete="off"
              spellCheck={false}
              placeholder={API_KEY_PLACEHOLDER}
              onChange={(e) => patch({ apiKey: e.target.value })}
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              aria-pressed={showKey}
              aria-label={showKey ? t("settings.hideKeyAria") : t("settings.showKeyAria")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-[12px] text-[var(--smoke)] transition hover:text-[var(--mist)]"
            >
              {showKey ? t("settings.hide") : t("settings.show")}
            </button>
          </div>
        </label>

        {/* Model */}
        <label className="flex flex-col gap-2">
          <span className="eyebrow">{t("settings.model")}</span>
          <input
            className="field px-3.5 py-3 text-[15px]"
            type="text"
            list="model-suggestions"
            value={form.model}
            autoComplete="off"
            spellCheck={false}
            placeholder={t("settings.modelPlaceholder")}
            onChange={(e) => patch({ model: e.target.value })}
          />
          <datalist id="model-suggestions">
            {modelList.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>

        {/* Reasoning toggle */}
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="flex flex-col">
            <span className="text-[14px] text-[var(--mist)]">{t("settings.reasoning")}</span>
            <span className="text-[11.5px] text-[var(--smoke)]">{t("settings.reasoningHint")}</span>
          </span>
          <input
            type="checkbox"
            className="h-5 w-5 accent-[var(--lamp)]"
            checked={form.reasoningEnabled}
            onChange={(e) => patch({ reasoningEnabled: e.target.checked })}
          />
        </label>

        {/* Test */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onTest}
            disabled={testing}
            className="field send-glow flex items-center justify-center gap-2 px-4 py-3 text-[14px] text-[var(--lamp)] transition active:scale-[0.98] disabled:opacity-50 disabled:shadow-none"
          >
            {testing ? <span className="breathe">{t("settings.testing")}</span> : t("settings.test")}
          </button>
          {test.kind === "ok" && (
            <p className="text-[13px] text-[var(--teal)]">{t("settings.testOk", { ms: test.latency })}</p>
          )}
          {test.kind === "err" && (
            <p className="text-[13px] text-[var(--rose)]">{t("settings.testErr", { msg: test.message })}</p>
          )}
        </div>

        {/* Save / Clear */}
        <div className="mt-1 flex items-center gap-3">
          <button
            type="button"
            onClick={onSave}
            className="field flex-1 px-4 py-3 text-[14px] text-[var(--mist)] transition active:scale-[0.98]"
            style={{ borderColor: "rgba(240, 195, 107, 0.42)" }}
          >
            {t("settings.save")}
          </button>
          <button
            type="button"
            onClick={onClear}
            className="px-3 py-3 text-[13px] text-[var(--smoke)] underline-offset-4 transition hover:text-[var(--mist)] hover:underline"
          >
            {t("settings.clear")}
          </button>
        </div>
        {saved && <p className="text-[13px] text-[var(--teal)]">{t("settings.saved")}</p>}

        <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--smoke)]">{t("settings.privacy")}</p>
      </div>
    </main>
  );
}
