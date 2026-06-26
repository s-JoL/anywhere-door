import { describe, expect, it } from "vitest";
import { routeInput } from "../input-router";

describe("InputRouter", () => {
  it("keeps default free text backward-compatible", () => {
    const routed = routeInput("我推门进来。");
    expect(routed.channel).toBe("speak");
    expect(routed.transcriptText).toBe("我推门进来。");
    expect(routed.characterText).toBe("我推门进来。");
    expect(routed.isWorldFacing).toBe(true);
  });

  it("formats surfaced in-world channels for transcript and character perception", () => {
    expect(routeInput("你昨晚看见了谁？", "speak").transcriptText).toBe("「你昨晚看见了谁？」");
    expect(routeInput("把缺角铜筹按进凹槽", "act").transcriptText).toBe("（把缺角铜筹按进凹槽）");
    expect(routeInput("检查镜子里的电梯数字", "observe").characterText).toBe("观察：检查镜子里的电梯数字");
  });

  it("keeps private action and observation details out of character observations", () => {
    const action = routeInput("趁老周低头，把铜钥匙藏到地板下", "act");
    expect(action.characterText).toContain("地板下");
    expect(action.observerText).toContain("遮掩");
    expect(action.observerText).not.toContain("地板下");

    const observe = routeInput("检查镜子里的电梯数字", "observe");
    expect(observe.characterText).toContain("电梯数字");
    expect(observe.observerText).toContain("观察");
    expect(observe.observerText).not.toContain("电梯数字");
  });

  it("keeps Director Notes out of the in-world channel", () => {
    const routed = routeInput("慢一点，保留秘密。", "director-note");
    expect(routed.isWorldFacing).toBe(false);
    expect(routed.transcriptText).toBe("【导演笔记】慢一点，保留秘密。");
    expect(routed.characterText).toBe("");
    expect(routed.directorNote).toBe("慢一点，保留秘密。");
  });

  it("keeps Scene Contracts out of the in-world channel", () => {
    const routed = routeInput("本场慢烧，暂停外部追兵，强度保持中等。", "scene-contract");
    expect(routed.isWorldFacing).toBe(false);
    expect(routed.transcriptText).toBe("【场景合约】本场慢烧，暂停外部追兵，强度保持中等。");
    expect(routed.characterText).toBe("");
    expect(routed.directorNote).toBeNull();
    expect(routed.sceneContract).toContain("暂停外部追兵");
  });

  it("keeps God Edits out of the in-world channel", () => {
    const raw = '{"kind":"setFact","id":"f-god","field":"truth","value":"阿岚是王女","hardness":"core"}';
    const routed = routeInput(raw, "god-edit");
    expect(routed.isWorldFacing).toBe(false);
    expect(routed.transcriptText).toContain("【上帝编辑】");
    expect(routed.characterText).toBe("");
    expect(routed.directorNote).toBeNull();
    expect(routed.sceneContract).toBeNull();
    expect(routed.godEdit).toContain("setFact");
  });
});
