import type { WorldSeed } from "../types";

export const DEMO_SEED: WorldSeed = {
  id: "seed-demo-tavern",
  title: "雨夜·無燈酒馆",
  worldview: "一座永远在下雨的港口小城，霓虹与潮湿交织。酒馆『無燈』是夜里唯一亮着的地方，藏着各自有故事的人。",
  rules: {
    physics: "现实世界物理，无超自然；人会受伤、会累、会醉。",
    setting: "近未来港口城市，永夜多雨。",
    redLines: ["仅限成年人之间的虚构创作；排除任何未成年人相关内容。"],
  },
  characters: [
    { id: "c-lan", name: "阿岚", description: "無燈酒馆的女主人，三十出头，话不多但看人很准；左手有一道旧疤。表面冷淡，熟了之后毒舌又护短。", identity: { gender: "女", body: "成年女性，左手旧疤" }, goal: "摸清这位深夜来客到底想要什么。" },
  ],
  openingState: {
    currentLocationId: "bar",
    time: { day: 1, clock: "深夜 23:40", lighting: "霓虹透过雨窗的冷光" },
    locations: {
      bar: { id: "bar", name: "無燈酒馆", detail: "fleshed", gist: "狭长的吧台，半空的酒架，雨声敲窗", description: "暖黄的吊灯只剩一盏，吧台木纹被岁月磨得发亮。门口的霓虹把雨珠染成红蓝。", connections: ["street"], presentCharacterIds: ["c-lan"], objectIds: ["o-glass"] },
      street: { id: "street", name: "雨街", detail: "stub", gist: "湿漉漉的霓虹长街", connections: ["bar"], presentCharacterIds: [], objectIds: [] },
    },
    objects: { "o-glass": { id: "o-glass", name: "威士忌杯", detail: "fleshed", props: { portable: true }, locationId: "bar", state: "空着，杯底一圈水痕" } },
    roster: { "c-lan": { name: "阿岚" } },
    flags: {},
  },
  modelConfig: { provider: "openrouter", apiKey: "", model: "deepseek/deepseek-v4-pro", reasoningEnabled: false },
};
