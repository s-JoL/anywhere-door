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
    { id: "c-zhou", name: "老周", description: "酒馆的常客，五十来岁，沉默寡言，总坐在角落擦一把旧左轮。退伍多年，欠着城南赌坊一笔钱。", identity: { gender: "男", body: "成年男性，右手有枪茧" }, goal: "（私下）今晚必须从这位新客身上弄到还债的钱，能骗则骗、必要时动手。" },
    { id: "c-mei", name: "阿梅", description: "城南赌坊派来收账的年轻女人，笑里藏刀，最擅长在最尴尬的时机出现。", identity: { gender: "女" }, goal: "找到老周，把欠款连本带利收回去；顺便掂量这位新客。" },
  ],
  openingState: {
    currentLocationId: "bar",
    time: { day: 1, clock: "深夜 23:40", lighting: "霓虹透过雨窗的冷光" },
    locations: {
      bar: { id: "bar", name: "無燈酒馆", detail: "fleshed", gist: "狭长的吧台，半空的酒架，雨声敲窗", description: "暖黄的吊灯只剩一盏，吧台木纹被岁月磨得发亮。门口的霓虹把雨珠染成红蓝。", connections: ["street"], presentCharacterIds: ["c-lan", "c-zhou"], objectIds: ["o-glass"] },
      street: { id: "street", name: "雨街", detail: "stub", gist: "湿漉漉的霓虹长街", connections: ["bar"], presentCharacterIds: [], objectIds: [] },
    },
    objects: { "o-glass": { id: "o-glass", name: "威士忌杯", detail: "fleshed", props: { portable: true }, locationId: "bar", state: "空着，杯底一圈水痕" } },
    roster: { "c-lan": { name: "阿岚" }, "c-zhou": { name: "老周" }, "c-mei": { name: "阿梅" } },
    flags: {},
    lore: [
      { id: "lore-wudeng", keys: ["無燈", "無燈酒馆", "酒馆"], content: "酒馆唤作『無燈』，店里有条不成文的规矩：进了门便不问来路、不提旧账，灯下说的话出了门就当没说过。" },
      { id: "lore-saidu", keys: ["城南赌坊", "赌坊", "收账"], content: "城南赌坊掌着这座雨城半数人的欠条，放出去的债连本带利，收账的人笑得越甜，手段越狠。" },
    ],
  },
  modelConfig: { provider: "openrouter", apiKey: "", model: "deepseek/deepseek-v4-pro", reasoningEnabled: false },
  presentation: {
    genre: "都市夜谈",
    mood: ["暧昧", "危险"],
    intensity: "charged",
    hook: "你推开那扇门，雨声从身后涌进来。吧台后的女人头也没抬，但你知道她已经把你看透了。",
    cast: [
      { name: "阿岚", line: "無燈的主人，左手旧疤，看人比酒更准" },
      { name: "老周", line: "角落里的常客，旧左轮，一笔还不上的债" },
    ],
    accent: "#f0c36b",
  },
};
