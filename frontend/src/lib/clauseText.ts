const COMMON_SEGMENT_WORDS = [
  "a",
  "all",
  "an",
  "and",
  "as",
  "at",
  "be",
  "been",
  "between",
  "breach",
  "by",
  "can",
  "carried",
  "condition",
  "confidential",
  "contract",
  "demised",
  "dispute",
  "due",
  "during",
  "early",
  "electrical",
  "etc",
  "event",
  "every",
  "example",
  "expiry",
  "expire",
  "fittings",
  "for",
  "from",
  "good",
  "handover",
  "hereinabove",
  "if",
  "immediately",
  "in",
  "into",
  "is",
  "it",
  "its",
  "late",
  "law",
  "leakage",
  "lease",
  "liable",
  "liability",
  "maintain",
  "maintenance",
  "major",
  "may",
  "minor",
  "must",
  "natural",
  "notice",
  "obligation",
  "of",
  "on",
  "or",
  "out",
  "party",
  "payment",
  "peaceful",
  "period",
  "possession",
  "premises",
  "privacy",
  "repair",
  "repairs",
  "rent",
  "renewal",
  "responsibility",
  "risk",
  "said",
  "same",
  "sanitary",
  "security",
  "session",
  "shall",
  "state",
  "stated",
  "subject",
  "such",
  "taps",
  "tear",
  "tenant",
  "tenable",
  "termination",
  "terms",
  "than",
  "that",
  "the",
  "their",
  "thereof",
  "thereon",
  "thereunder",
  "this",
  "to",
  "under",
  "upon",
  "usage",
  "vacant",
  "was",
  "water",
  "wear",
  "what",
  "when",
  "where",
  "which",
  "who",
  "will",
  "with",
  "without",
];

const SEGMENT_WORD_SET = new Set(COMMON_SEGMENT_WORDS);
const MAX_SEGMENT_WORD_LENGTH = Math.max(...COMMON_SEGMENT_WORDS.map((word) => word.length));
const COLLAPSED_TOKEN_LENGTH = 8;

function normalizeBaseText(text: string | null | undefined) {
  return String(text ?? "")
    .replace(/ï¬/g, "fi")
    .replace(/ï¬‚/g, "fl")
    .replace(/â€™/g, "'")
    .replace(/â€œ|â€/g, '"')
    .replace(/\uFB01/g, "fi")
    .replace(/\uFB02/g, "fl")
    .replace(/\u2019/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\r\n/g, "\n");
}

function scoreSegment(word: string) {
  return word.length * word.length;
}

function segmentCollapsedWord(token: string) {
  const lower = token.toLowerCase();
  const bestScore = new Array<number>(token.length + 1).fill(Number.NEGATIVE_INFINITY);
  const bestSplit = new Array<number>(token.length + 1).fill(-1);
  bestScore[0] = 0;

  for (let start = 0; start < token.length; start += 1) {
    if (!Number.isFinite(bestScore[start])) {
      continue;
    }

    for (let end = start + 1; end <= Math.min(token.length, start + MAX_SEGMENT_WORD_LENGTH); end += 1) {
      const slice = lower.slice(start, end);
      if (!SEGMENT_WORD_SET.has(slice)) {
        continue;
      }

      const candidate = bestScore[start] + scoreSegment(slice);
      if (candidate > bestScore[end]) {
        bestScore[end] = candidate;
        bestSplit[end] = start;
      }
    }
  }

  if (!Number.isFinite(bestScore[token.length])) {
    return token;
  }

  const segments: string[] = [];
  let cursor = token.length;
  while (cursor > 0) {
    const start = bestSplit[cursor];
    if (start < 0) {
      return token;
    }
    segments.unshift(token.slice(start, cursor));
    cursor = start;
  }

  const coverage = segments.join("").length / token.length;
  if (coverage < 0.85 || segments.length < 2) {
    return token;
  }

  return segments.join(" ");
}

function restoreCollapsedSpacing(text: string) {
  const withCaseBreaks = text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");

  return withCaseBreaks.replace(/[A-Za-z]{8,}/g, (token) => segmentCollapsedWord(token));
}

export function formatClauseDisplayText(text: string | null | undefined) {
  const normalized = normalizeBaseText(text);
  const restoredSpacing = restoreCollapsedSpacing(normalized);

  return restoredSpacing
    .replace(/\s*([,.;:!?])\s*/g, "$1 ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s+/g, " ")
    .trim();
}

export function looksCollapsedClauseText(text: string | null | undefined) {
  const normalized = normalizeBaseText(text).replace(/\s+/g, " ").trim();
  return normalized.split(" ").some((token) => /^[A-Za-z]+$/.test(token) && token.length >= COLLAPSED_TOKEN_LENGTH);
}
