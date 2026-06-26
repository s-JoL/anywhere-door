import type { UserConfig } from "@/lib/settings/user-config";
import type { PrebakedTasteBeat, WorldSeed } from "@/lib/types";

export type PrebakedTasteLine =
  | { kind: "user"; content: string }
  | { kind: "narration"; content: string }
  | { kind: "speaker"; speakerId: string | null; content: string };

export function hasUserSuppliedModelKey(config: UserConfig | null): boolean {
  return (config?.apiKey.trim().length ?? 0) > 0;
}

export function shouldUsePrebakedTaste(seed: WorldSeed, config: UserConfig | null): boolean {
  const isBuiltin = seed.source === "builtin";
  return isBuiltin && !!seed.prebakedTaste && !hasUserSuppliedModelKey(config);
}

export function composePrebakedTasteLines(seed: WorldSeed): PrebakedTasteLine[] {
  if (!seed.prebakedTaste) return [];
  return [
    { kind: "user", content: seed.prebakedTaste.userAction },
    ...seed.prebakedTaste.beats.map((beat) => toLine(beat)),
  ];
}

function toLine(beat: PrebakedTasteBeat): PrebakedTasteLine {
  if (beat.kind === "speaker") {
    return { kind: "speaker", speakerId: beat.speakerId ?? null, content: beat.content };
  }
  return { kind: "narration", content: beat.content };
}
