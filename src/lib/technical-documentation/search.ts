export type KnowledgeChunkDraft = {
  locator: string;
  text: string;
  terms: string[];
  charCount: number;
};

const STOP_WORDS = new Set([
  "без", "более", "был", "была", "были", "быть", "вам", "вас", "весь", "для", "его", "если", "есть", "еще",
  "или", "как", "какая", "какой", "когда", "которые", "который", "между", "может", "над", "она", "они", "оно",
  "при", "про", "под", "после", "перед", "так", "такая", "также", "только", "того", "этот", "эта", "это", "эти",
  "from", "into", "that", "the", "this", "with"
]);

function baseTokens(value: string) {
  return value
    .toLocaleLowerCase("ru-RU")
    .normalize("NFKC")
    .replace(/ё/g, "е")
    .match(/[a-zа-я0-9][a-zа-я0-9._/-]*/giu) ?? [];
}
export function knowledgeTerms(value: string, max = 120) {
  const terms: string[] = [];
  const seen = new Set<string>();
  for (const token of baseTokens(value)) {
    const normalized = token.replace(/^[._/-]+|[._/-]+$/g, "");
    if (normalized.length < 2 || STOP_WORDS.has(normalized)) continue;
    for (const term of normalized.length >= 7 ? [normalized, `~${normalized.slice(0, 5)}`] : [normalized]) {
      if (seen.has(term)) continue;
      seen.add(term);
      terms.push(term);
      if (terms.length >= max) return terms;
    }
  }
  return terms;
}

function cleanChunkText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function chunkKnowledgeSections(
  sections: Array<{ locator: string; text: string }>,
  options: { maxChars?: number; overlapChars?: number } = {}
): KnowledgeChunkDraft[] {
  const maxChars = options.maxChars ?? 1_400;
  const overlapChars = Math.min(options.overlapChars ?? 180, Math.floor(maxChars / 3));
  const result: KnowledgeChunkDraft[] = [];

  for (const section of sections) {
    const text = cleanChunkText(section.text);
    if (!text) continue;
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + maxChars, text.length);
      if (end < text.length) {
        const naturalBreak = Math.max(text.lastIndexOf(". ", end), text.lastIndexOf("; ", end), text.lastIndexOf(" ", end));
        if (naturalBreak > start + Math.floor(maxChars * 0.6)) end = naturalBreak + 1;
      }
      const chunkText = text.slice(start, end).trim();
      if (chunkText) {
        result.push({ locator: section.locator, text: chunkText, terms: knowledgeTerms(chunkText), charCount: chunkText.length });
      }
      if (end >= text.length) break;
      start = Math.max(end - overlapChars, start + 1);
    }
  }
  return result;
}

export function scoreKnowledgeChunk(input: {
  questionTerms: string[];
  chunkTerms: string[];
  title?: string;
  locator?: string;
}) {
  const chunk = new Set(input.chunkTerms);
  const title = new Set(knowledgeTerms(`${input.title ?? ""} ${input.locator ?? ""}`));
  return input.questionTerms.reduce((score, term) => {
    const exactWeight = term.startsWith("~") ? 1 : 4;
    return score + (chunk.has(term) ? exactWeight : 0) + (title.has(term) ? exactWeight * 1.5 : 0);
  }, 0);
}
