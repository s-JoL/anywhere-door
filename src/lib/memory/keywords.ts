const STOPWORDS = new Set([
  "的","了","你","我","他","她","它","在","是","和","也","就","都","与","着","吗","呢","啊","把","被","会","要","有","这","那","个",
  "a","an","of","to","and","is","it","in","on","at","you","i","the",
]);

/** Approximate tokenization: CJK single characters (a relational/semantic granularity that suffices) + Latin words (len≥2), with stopwords removed and deduplicated. */
export function keywordsOf(text: string): string[] {
  const runs = text.match(/[一-龥]+|[a-zA-Z0-9]{2,}/g) ?? [];
  const out: string[] = [];
  for (const run of runs) {
    if (/^[一-龥]+$/.test(run)) {
      for (const ch of run) out.push(ch);
    } else {
      out.push(run.toLowerCase());
    }
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const k of out) {
    if (STOPWORDS.has(k) || seen.has(k)) continue;
    seen.add(k);
    result.push(k);
  }
  return result;
}

/** Relevance approximation = number of shared features. */
export function relevance(queryKw: string[], memKw: string[]): number {
  const set = new Set(memKw);
  let n = 0;
  for (const k of queryKw) if (set.has(k)) n++;
  return n;
}
