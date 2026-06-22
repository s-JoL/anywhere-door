export type IntentAction = "speak" | "pass";

export interface Intent {
  action: IntentAction;
  eagerness: number;
}

export interface Candidate extends Intent {
  id: string;
}

export interface Selection {
  ids: string[];
  forced: boolean;
}

const byEagernessDesc = (a: Candidate, b: Candidate) => b.eagerness - a.eagerness;

/** 想说的按 eagerness 取前 N；全员 pass 则破冰强选一个；无候选则空。 */
export function selectSpeakers(cands: Candidate[], maxSpeakers: number): Selection {
  const speakers = cands.filter((c) => c.action === "speak").sort(byEagernessDesc);
  if (speakers.length > 0) {
    return {
      ids: speakers.slice(0, Math.max(1, maxSpeakers)).map((c) => c.id),
      forced: false,
    };
  }
  const pool = cands.slice().sort(byEagernessDesc);
  if (pool.length === 0) return { ids: [], forced: false };
  return { ids: [pool[0].id], forced: true };
}
