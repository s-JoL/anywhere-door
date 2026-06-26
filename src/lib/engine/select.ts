export type IntentAction = "speak" | "pass" | "avoid";

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
  avoidIds?: string[];
}

const byEagernessDesc = (a: Candidate, b: Candidate) => b.eagerness - a.eagerness;

/** Take the top N who want to speak by eagerness; if everyone passes, force-pick one to break the lull; if no candidates, empty. */
export function selectSpeakers(cands: Candidate[], maxSpeakers: number): Selection {
  const avoiders = cands.filter((c) => c.action === "avoid").sort(byEagernessDesc);
  const topAvoidIds = avoiders.length > 0 ? [avoiders[0].id] : undefined;
  const speakers = cands.filter((c) => c.action === "speak").sort(byEagernessDesc);
  if (speakers.length > 0) {
    return {
      ids: speakers.slice(0, Math.max(1, maxSpeakers)).map((c) => c.id),
      forced: false,
      ...(topAvoidIds ? { avoidIds: topAvoidIds } : {}),
    };
  }
  const pool = cands.filter((c) => c.action !== "avoid").sort(byEagernessDesc);
  if (avoiders.length > 0 && pool.length === 0) return { ids: [], forced: false, avoidIds: [avoiders[0].id] };
  if (pool.length === 0) return { ids: [], forced: false };
  return { ids: [pool[0].id], forced: true };
}
