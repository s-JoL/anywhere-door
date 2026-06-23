# 任意门 / Anywhere Door

> 一扇通往任何世界、且认得你的门 —— 像刷抖音一样竖滑发现世界，推门即入。
> A door to any world that knows you — an AI living text-world you swipe like TikTok.

> 曾用名 · 浮生 / The Reveries

**English summary** — Anywhere Door is a mobile-first, local-first web app for *living* AI text-worlds. Swipe a vertical feed of "doors" (worlds) like TikTok, push one open, and step into a world that remembers you. A single **God engine** keeps a structured, persistent world and acts as a generative director — advancing only when you interact, maintaining each character's subjective memory, pacing the drama, and introducing new characters on demand. The medium is text, but the world's core behaves like the real world: causality, persistence, consequence. Bring your own model key (OpenRouter / DeepSeek); everything lives in your browser. MIT licensed.

---

## 定位 / 第一性原则

一扇通往**任意世界**、且**认得你**的门。

- **沉浸第一**。一切设计服务于"你真的在那个世界里"。
- **内核要像真实世界**。媒介是文字，但世界核心遵循真实规律：**因果、持久、后果**。你做的每件事都会在世界里留痕，并被后续记住。
- **门的意象**。一扇可以通往任何世界的门 —— 而那个世界，认得你。命名灵感致敬哆啦A梦的任意门。曾用名 **浮生**。

> **文字不是限制，是解锁。** 配音的 AAA 级 NPC 受限于录音成本，对话深度封顶（往往 ~2 行）；文字让世界的反应性可以做到深得多 —— 任意角色、任意分支、任意后果，都只是更多 token。详见 [`docs/research/2026-06-23-gap-analysis-vs-first-principle.md`](docs/research/2026-06-23-gap-analysis-vs-first-principle.md)。

## 核心特性

- **抖音式竖滑「无数门」feed** —— 像短视频一样竖滑发现世界。
- **一眼可判的冷开场世界卡** —— 不用读说明，扫一眼就知道这扇门通向哪。
- **推门进入的开门转场** —— 从卡片到世界的沉浸式过渡。
- **God 引擎** —— 多角色自由发言、为每个角色维护主观记忆 + 反思、导演式节奏把控、按需引入新角色。
- **World Reactor** —— 每回合产出结构化 delta 落库：物态 / 处境 / 移动 / 时间 / 关系 / 新地点 / 新物体 / lore。
- **可游走空间** —— 世界有地理，你可以在其中移动。
- **持久社会后果** —— 关系与声誉会累积，世界记得你做过什么。
- **Lorebook 关键词触发设定** —— 命中关键词时按需注入世界设定。
- **口味引擎** —— 行为 → 口味模型 → 利用 / 探索 / MMR 排序 → LLM 世界生成器 + 后台预生成，feed 越刷越懂你。
- **本地优先** —— 数据全部存在浏览器（IndexedDB），无服务器数据库。
- **自带模型 key（BYO-key）** —— 用你自己的 OpenRouter / DeepSeek key，成本与隐私都在你手里。
- **创作者世界 + SillyTavern 角色卡导入** —— 复用既有生态资产。
- **不设限** —— 世界由你与模型共同决定走向。

## 快速开始

```bash
npm install
npm run dev
# 打开 http://localhost:3000
```

1. 进入 **/settings**，填入**你自己的模型 key**（OpenRouter 或 DeepSeek）。
2. 回到 feed，竖滑挑一扇门，**推门进入**。

> 开发便利：本地 `dev` 下可在 `.env.local` 放 `OPENROUTER_API_KEY` 作便利回退（见 [`.env.example`](.env.example)），省去每次粘贴。
> **生产部署不内置任何 key，纯 BYO-key** —— 部署版只会用访客自己在 /settings 填的 key。

## 隐私 / 安全

- **数据全部存在你的浏览器**：本地优先，无服务器数据库。
- **你的 key 只存在你这台浏览器，绝不上传**。
- **部署版不提供任何共享 key**：生产环境严格 BYO-key，主机不会把自己的 key 借给匿名访客（见 [`src/lib/llm/resolve-key.ts`](src/lib/llm/resolve-key.ts)）。

## 技术栈

Next.js 15（App Router）· React 19 · TypeScript（strict）· Tailwind CSS 4 · Dexie / IndexedDB · Vitest。
LLM 走 OpenAI 兼容代理（OpenRouter / DeepSeek）。

## 架构 / 设计文档

- 设计规格：[`docs/superpowers/specs/`](docs/superpowers/specs/)
- 研究与差距分析：[`docs/research/`](docs/research/)

## 测试 / 构建

```bash
npm test    # 318 passing
npm run build
```

## 致谢

前身 **Speakeasy**。

## License

[MIT](LICENSE) © 2026 Anywhere Door contributors
