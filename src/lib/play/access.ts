import type { UserConfig } from "@/lib/settings/user-config";
import type { WorldSeed } from "@/lib/types";

export type PlaySendGate =
  | "live"
  | "blocked-empty"
  | "blocked-busy"
  | "blocked-unready"
  | "blocked-prebaked"
  | "blocked-key";

export interface PlaySendGateArgs {
  text: string;
  busy: boolean;
  hasInstance: boolean;
  hasSeed: boolean;
  prebakedMode: boolean;
  canRunLiveTurn?: boolean;
}

export function classifyPlaySendGate({
  text,
  busy,
  hasInstance,
  hasSeed,
  prebakedMode,
  canRunLiveTurn = true,
}: PlaySendGateArgs): PlaySendGate {
  if (!text.trim()) return "blocked-empty";
  if (busy) return "blocked-busy";
  if (!hasInstance || !hasSeed) return "blocked-unready";
  if (prebakedMode) return "blocked-prebaked";
  if (!canRunLiveTurn) return "blocked-key";
  return "live";
}

function hasUserSuppliedKey(config: UserConfig | null): boolean {
  return (config?.apiKey.trim().length ?? 0) > 0;
}

export function canRunLiveTurn(_seed: WorldSeed, config: UserConfig | null): boolean {
  if (hasUserSuppliedKey(config)) return true;
  return false;
}

export type PlayAccessNotice = "sample" | "needs-key" | null;
export type PlayControlSurface = "live-controls" | "sample-cta" | "key-cta";

export function playControlSurface({
  prebakedMode,
  liveTurnAllowed,
}: {
  prebakedMode: boolean;
  liveTurnAllowed: boolean;
}): PlayControlSurface {
  if (prebakedMode) return "sample-cta";
  if (!liveTurnAllowed) return "key-cta";
  return "live-controls";
}

export function settingsHrefForControlSurface(surface: PlayControlSurface, worldId?: string | null): string {
  if (surface !== "sample-cta" || !worldId?.trim()) return "/settings";
  return `/settings?from=prebaked-taste&world=${encodeURIComponent(worldId.trim())}`;
}

export function playAccessNotice({
  prebakedMode,
  needsKey,
}: {
  prebakedMode: boolean;
  needsKey: boolean;
}): PlayAccessNotice {
  if (prebakedMode) return "sample";
  if (needsKey) return "needs-key";
  return null;
}
