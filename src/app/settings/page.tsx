"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getUserConfig, setUserConfig, clearUserConfig, type UserConfig } from "@/lib/settings/user-config";
import { testModel } from "@/lib/llm/test-model";
import type { ProviderId } from "@/lib/types";

const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: "openrouter", label: "OpenRouter" },
  { id: "deepseek", label: "DeepSeek 官方" },
];

/** 每个供应商的若干常用模型 id，供 datalist 提示（非强制）。 */
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

  // 挂载时载入本地配置（如有）
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
    // 经由 /api/llm/chat 代理：apiKey 为空时在 dev 下回退到 env（仅 openrouter）。
    const res = await testModel({
      provider: form.provider,
      apiKey: form.apiKey.trim(),
      model: form.model.trim(),
      reasoningEnabled: form.reasoningEnabled,
    });
    if (res.ok) setTest({ kind: "ok", latency: Date.now() - t0 });
    else setTest({ kind: "err", message: res.error ?? "未知错误" });
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
    <main className="world-bg relative mx-auto flex min-h-[100dvh] max-w-md flex-col door-arrive">
      <header
        className="glass-bar relative z-10 shrink-0 border-b border-[var(--line)] px-5 pb-3"
        style={{ paddingTop: "max(0.9rem, env(safe-area-inset-top))" }}
      >
        <div className="flex items-center justify-between">
          <div className="eyebrow">任意门 · 模型设置</div>
          <Link href="/" className="text-[12.5px] text-[var(--smoke)] transition hover:text-[var(--mist)]">
            ← 返回
          </Link>
        </div>
        <h1 className="mt-1 text-[1.15rem] text-[var(--mist)]" style={{ fontFamily: "var(--serif)" }}>
          自带模型 key
        </h1>
      </header>

      <div className="relative z-10 flex flex-1 flex-col gap-5 px-5 py-6">
        {/* Provider */}
        <label className="flex flex-col gap-2">
          <span className="eyebrow">供应商</span>
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
          <span className="eyebrow">API Key</span>
          <div className="relative">
            <input
              className="field w-full px-3.5 py-3 pr-16 text-[15px]"
              type={showKey ? "text" : "password"}
              value={form.apiKey}
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-…（留空则在 dev 下回退到服务器 env）"
              onChange={(e) => patch({ apiKey: e.target.value })}
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              aria-pressed={showKey}
              aria-label={showKey ? "隐藏 key" : "显示 key"}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-[12px] text-[var(--smoke)] transition hover:text-[var(--mist)]"
            >
              {showKey ? "隐藏" : "显示"}
            </button>
          </div>
        </label>

        {/* Model */}
        <label className="flex flex-col gap-2">
          <span className="eyebrow">模型</span>
          <input
            className="field px-3.5 py-3 text-[15px]"
            type="text"
            list="model-suggestions"
            value={form.model}
            autoComplete="off"
            spellCheck={false}
            placeholder="模型 id"
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
            <span className="text-[14px] text-[var(--mist)]">推理模式</span>
            <span className="text-[11.5px] text-[var(--smoke)]">仅部分模型支持（OpenRouter reasoning）。</span>
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
            {testing ? <span className="breathe">◍ 正在连接…</span> : "测试可用"}
          </button>
          {test.kind === "ok" && (
            <p className="text-[13px] text-[var(--teal)]">✓ 可用 · {test.latency}ms</p>
          )}
          {test.kind === "err" && (
            <p className="text-[13px] text-[var(--rose)]">✗ {test.message}</p>
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
            保存
          </button>
          <button
            type="button"
            onClick={onClear}
            className="px-3 py-3 text-[13px] text-[var(--smoke)] underline-offset-4 transition hover:text-[var(--mist)] hover:underline"
          >
            清除
          </button>
        </div>
        {saved && <p className="text-[13px] text-[var(--teal)]">已保存 · 默认与生成的世界将用你的配置运行</p>}

        <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--smoke)]">
          key 仅保存在<span className="text-[var(--mist)]"> 这台浏览器（本地）</span>，绝不会上传到任何服务器。
        </p>
      </div>
    </main>
  );
}
