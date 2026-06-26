export interface BeliefLine {
  observerName: string;
  stance: string;
  factLabel: string;
  evidenceText?: string;
}

export function formatBeliefLine(belief: BeliefLine): string {
  const base = `${belief.observerName}: ${belief.stance} ${belief.factLabel}`;
  return belief.evidenceText ? `${base} · ${belief.evidenceText}` : base;
}
