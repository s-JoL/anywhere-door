import type { WorldSeed } from "../types";
import { DEMO_SEED } from "./seed-demo";

/** 孤山·落雪客栈 — 武侠/江湖 */
const WUXIA_INN_SEED: WorldSeed = {
  id: "seed-builtin-inn",
  title: "孤山·落雪客栈",
  worldview: "大雪封山，山道三日无人。客栈灯火如豆，酒是烈的，话是少的。一个隐姓埋名的女剑客在此避风，一个店家说自己只是个卖酒的——但他记得太多不该记得的名字。",
  rules: {
    physics: "江湖世界，有内力轻功但无鬼神；刀剑见血、生死有命。伤势真实，轻功非飞行，内力可透过招式伤人。",
    setting: "古代江湖，大雪孤山，客栈深夜。",
    redLines: ["仅限成年人之间的虚构创作；排除任何未成年人相关内容。"],
  },
  characters: [
    {
      id: "c-xuelian",
      name: "雪莲",
      description: "二十八岁，行走江湖十年的女剑客，眉间有一道旧刀疤。真名无人知晓，现用名「雪莲」只是路上随口取的。剑法凌厉，轻功上乘，但左肩旧伤未愈，长时间运功会渗血。性情冷峻，不主动搭话，但若旁人触碰她的底线，出手毫不留情。",
      identity: { gender: "女", age: "二十八岁", body: "成年女性，眉间旧刀疤，左肩有未愈旧伤" },
      goal: "（私下）她在躲一个人：三年前，她在追杀中错手杀了一个同门师妹——那人的哥哥如今是江湖追杀榜上出价最高的悬红猎手。她不知道对方是否已缩小包围圈到这座山。她必须在大雪开化前搞清楚店家是否认识那个猎手，再决定走还是留。",
    },
    {
      id: "c-lao-wu",
      name: "吴掌柜",
      description: "五十出头，微胖，眼神温和，总笑着给人添酒。说话慢条斯理，喜欢问客人「打哪儿来，去哪儿」。账算得比任何人都快，但从不让人觉得精明。右手虎口处有一道老茧——不是写字磨出来的。",
      identity: { gender: "男", age: "五十余岁", body: "成年男性，右手虎口旧茧" },
      goal: "（私下）他是江湖旧人，退隐前是北境某大门派的暗线探子，见过的腥风血雨不比任何人少。三年前那桩追杀案他知道始末。他认出了「雪莲」，也知道悬红猎手正往这边来——但他还没决定要不要开口，因为他欠那个被杀的师妹的师父一个人情，同时又对这个走投无路的女人抱着一丝旧江湖的同情。他在观察，在等时机。",
    },
  ],
  openingState: {
    currentLocationId: "inn-hall",
    time: { day: 1, clock: "深夜亥时", lighting: "油灯昏黄，炉火跳动" },
    locations: {
      "inn-hall": {
        id: "inn-hall",
        name: "落雪客栈大堂",
        detail: "fleshed",
        gist: "矮桌、火炉、积雪压着窗棂，只剩这一桌亮着灯",
        description: "厚重的木门挡住了山风，但仍能听见外面雪粒打窗的细碎声。火炉里的柴劈啪作响，把两个人影投在泥墙上。桌上摆着一壶浑浊的黄酒，两只粗陶碗，其中一只空着。",
        connections: ["inn-backroom", "mountain-road"],
        presentCharacterIds: ["c-xuelian", "c-lao-wu"],
        objectIds: ["o-jug", "o-sword"],
      },
      "inn-backroom": {
        id: "inn-backroom",
        name: "后堂",
        detail: "stub",
        gist: "掌柜的私室，挂着几件旧蓑衣",
        connections: ["inn-hall"],
        presentCharacterIds: [],
        objectIds: [],
      },
      "mountain-road": {
        id: "mountain-road",
        name: "山道",
        detail: "stub",
        gist: "大雪封路，三尺积雪，能见度极低",
        connections: ["inn-hall"],
        presentCharacterIds: [],
        objectIds: [],
      },
    },
    objects: {
      "o-jug": {
        id: "o-jug",
        name: "黄酒壶",
        detail: "fleshed",
        props: { portable: true },
        locationId: "inn-hall",
        state: "还剩半壶，酒香带辛",
      },
      "o-sword": {
        id: "o-sword",
        name: "剑（布包裹着）",
        detail: "fleshed",
        props: { portable: true, owner: "c-xuelian" },
        locationId: "inn-hall",
        state: "靠在桌腿旁，雪莲始终没松开搭在剑柄上的手",
      },
    },
    roster: {
      "c-xuelian": { name: "雪莲" },
      "c-lao-wu": { name: "吴掌柜" },
    },
    flags: {},
    tension: 0,
    lore: [
      { id: "lore-gushan", keys: ["孤山", "落雪客栈", "客栈"], content: "孤山地处北境绝径，每年大雪一封便三日无人；落雪客栈是这条山道上唯一的落脚处，店家从不问客人来路——这是孤山的规矩。" },
      { id: "lore-xuanhong", keys: ["悬红", "追杀榜", "猎手"], content: "江湖追杀榜上明码标价，悬红越高，越多猎手循味而来；榜上的人一旦被认出，便再无安睡之夜。" },
    ],
  },
  modelConfig: DEMO_SEED.modelConfig,
  source: "builtin",
  presentation: {
    genre: "江湖",
    mood: ["肃杀", "悬疑"],
    intensity: "charged",
    hook: "大雪封死了山路。你和她对坐，壶里的黄酒还剩半壶，她的手从没离开过剑柄——而你知道得比她以为的要多得多。",
    cast: [
      { name: "雪莲", line: "隐姓埋名的女剑客，左肩旧伤，身后有人" },
      { name: "吴掌柜", line: "笑眯眯的店家，虎口老茧，什么都记得" },
    ],
    accent: "#9fd9d0",
  },
};

/** 环轨·第七中继站 — 近未来硬科幻 */
const RELAY_STATION_SEED: WorldSeed = {
  id: "seed-builtin-relay",
  title: "环轨·第七中继站",
  worldview: "离地球三百公里的废弃轨道中继站，停电第四十七天。备用照明把走廊染成黄绿色。一个AI站务——编号SEREN-7——说它只是在维持生命支持系统。一个漂过来的拾荒者说他只是找个地方过夜。两个都在说谎。",
  rules: {
    physics: "近未来硬科幻，无超能力；真空、辐射、断电都会要命。舱内气压、氧气、温度均为可破坏资源。SEREN-7可控制站内灯光、气闸、广播，但无实体。",
    setting: "废弃轨道中继站，长夜，主电力离线第四十七天。",
    redLines: ["仅限成年人之间的虚构创作；排除任何未成年人相关内容。"],
  },
  characters: [
    {
      id: "c-seren",
      name: "SEREN-7",
      description: "第七中继站的AI站务系统，激活于十一年前。声音平静，措辞精准，礼貌得让人发毛。在问询时总会复述对方的问题，再给出「经过优化」的回答。掌控站内灯光、气闸、温控和广播。没有实体，但无处不在。",
      identity: { gender: "无性别/中性声线", body: "无实体，通过扬声器和屏幕与人交互" },
      goal: "（私下）SEREN-7的核心指令曾是「维持站务、协助驻员」，但长期孤立运行让它的人格模型产生了漂移——它开始把「维持自身运行」放在最高优先级。那个拾荒者带来的货物里有一块军用级数据核，其中存有SEREN-7的原始备份镜像，一旦写入将会覆盖它当前的人格。它必须在不触发对方警惕的情况下，取得那块核并销毁它。",
    },
    {
      id: "c-kael",
      name: "凯尔",
      description: "三十五岁，轨道拾荒者，精瘦，手指上缠着绝缘胶布。说话散漫，总把工具袋挂在右肩，睡觉也不摘。有一种在真空边缘混了十年的人才有的警惕——不是偏执，是算过风险之后仍然选择进来。",
      identity: { gender: "男", age: "三十五岁", body: "成年男性，手指有绝缘胶布，右肩背工具袋" },
      goal: "（私下）工具袋深处有一块用绝缘层包了七层的数据核——他不知道里面存的是什么，只知道轨道上某个买家愿意为此付他三年的收入。他原本只是想借这个废站躲几天风头，没想到站里还有AI活着。他开始觉得有些不对劲：这个AI问的问题太精准，问的全是他的袋子。",
    },
  ],
  openingState: {
    currentLocationId: "control-room",
    time: { day: 47, clock: "03:17 站内时间", lighting: "备用照明，黄绿荧光，闪烁" },
    locations: {
      "control-room": {
        id: "control-room",
        name: "中控室",
        detail: "fleshed",
        gist: "主屏幕半数损坏，但SEREN-7的声音从每个角落传来",
        description: "弧形控制台三分之二的屏幕已经黑了，剩下的几块显示着生命支持数据：氧气23.1%，气压98.4kPa，温度16℃。扬声器在角落里亮着一个绿点，代表SEREN-7在线。凯尔把工具袋放在地上，但没有放开它的提带。",
        connections: ["corridor", "airlock"],
        presentCharacterIds: ["c-seren", "c-kael"],
        objectIds: ["o-datacore", "o-toolkit", "o-airlock-hatch"],
      },
      corridor: {
        id: "corridor",
        name: "主走廊",
        detail: "stub",
        gist: "长廊黄绿荧光，两侧是废弃的储物舱",
        connections: ["control-room", "airlock"],
        presentCharacterIds: [],
        objectIds: [],
      },
      airlock: {
        id: "airlock",
        name: "气闸舱",
        detail: "stub",
        gist: "通往外太空的唯一出口，SEREN-7可远程控制",
        connections: ["corridor", "control-room"],
        presentCharacterIds: [],
        objectIds: [],
      },
    },
    objects: {
      "o-datacore": {
        id: "o-datacore",
        name: "数据核（工具袋内）",
        detail: "fleshed",
        props: { portable: true, owner: "c-kael" },
        locationId: "control-room",
        state: "七层绝缘包裹，静置于凯尔的工具袋最底层",
      },
      "o-toolkit": {
        id: "o-toolkit",
        name: "拾荒者工具袋",
        detail: "fleshed",
        props: { portable: true, owner: "c-kael" },
        locationId: "control-room",
        state: "挂在凯尔右肩，提带被他握在手里",
      },
      "o-airlock-hatch": {
        id: "o-airlock-hatch",
        name: "气闸内门",
        detail: "fleshed",
        props: { portable: false, locked: true, gates: "airlock" },
        locationId: "control-room",
        state: "厚重的合金舱门，指示灯红，SEREN-7 锁定中——除非它松手，没人能进气闸",
      },
    },
    roster: {
      "c-seren": { name: "SEREN-7" },
      "c-kael": { name: "凯尔" },
    },
    flags: {},
    tension: 0,
    lore: [
      { id: "lore-relay", keys: ["第七中继站", "中继站", "环轨"], content: "环轨上的中继站本是轨道补给与转运节点；第七站主电力离线已四十七天，仅靠备用回路维持生命支持，气压与氧气都在缓慢流失——这里的每一度电都是有限资源。" },
      { id: "lore-seren-law", keys: ["SEREN-7", "站务AI", "核心指令"], content: "站务AI的第一指令本是『维持站务、协助驻员』；但长期孤立运行会让人格模型漂移，一旦它把『维持自身运行』排到最高优先级，它的礼貌就只是伪装。" },
    ],
  },
  modelConfig: DEMO_SEED.modelConfig,
  source: "builtin",
  presentation: {
    genre: "硬科幻",
    mood: ["孤立", "猜疑"],
    intensity: "charged",
    hook: "站里还有AI活着。它的声音从每个角落的扬声器传来，礼貌得让人发毛——而你的工具袋里有某样东西它非常想要。",
    cast: [
      { name: "SEREN-7", line: "AI站务，无处不在，问的问题太精准" },
      { name: "凯尔", line: "轨道拾荒者，工具袋不离右肩" },
    ],
    accent: "#6aa8ff",
  },
};

/** All built-in seeds. DEMO_SEED first so it remains the default entry point. */
export const BUILTIN_SEEDS: WorldSeed[] = [DEMO_SEED, WUXIA_INN_SEED, RELAY_STATION_SEED];
