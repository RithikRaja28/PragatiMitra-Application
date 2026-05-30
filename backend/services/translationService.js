"use strict";

const path = require("path");
const { Translate } = require("@google-cloud/translate").v2;

const translate = new Translate({
  keyFilename: path.join(__dirname, "../config/pragatimitra-497416-6a889477f089.json"),
});

// Caches (all persist for process lifetime):
//   wordCache      — individual word → Hindi   (transliteration path)
//   phraseCache    — full phrase → Hindi        (transliteration path)
//   sentenceCache  — full sentence → Hindi      (translation path)
const wordCache = new Map();
const phraseCache = new Map();
const sentenceCache = new Map();

// Only process pure English alphabetic text
const PURE_TEXT_RE = /^[A-Za-z\s]+$/;
const HAS_ALPHA_RE = /[A-Za-z]/;
const DEVANAGARI_RE = /[ऀ-ॿ]/;

function isTranslatableText(value) {
  if (typeof value !== "string") return false;
  const t = value.trim();
  return t.length > 0 && PURE_TEXT_RE.test(t);
}

/* ─── Translation modes ──────────────────────────────────────────────────────
   transliterate — phonetic/script conversion, good for names & proper nouns
                   (Divakar → दिवाकर).  This is the legacy behavior.
   translate     — actual language translation of full sentences, good for
                   descriptions/remarks (I am walking → मैं चल रहा हूँ).
   none          — value copied verbatim (numbers, dates, emails, files, etc.).

   The mode for a field is taken from its explicit `translation_mode` when set;
   otherwise it falls back to a sensible default derived from the field type.
   Existing schemas have no `translation_mode`, so `text`/`textarea` default to
   `transliterate` — exactly the pre-existing behavior. */
const DEFAULT_MODE_BY_TYPE = {
  text:        "transliterate",
  textarea:    "transliterate",
  description: "translate",
  number:      "none",
  date:        "none",
  boolean:     "none",
  email:       "none",
  phone:       "none",
  document:    "none",
};

const VALID_MODES = new Set(["transliterate", "translate", "none"]);

function resolveTranslationMode(field) {
  if (field && VALID_MODES.has(field.translation_mode)) return field.translation_mode;
  return DEFAULT_MODE_BY_TYPE[field?.type] || "transliterate";
}

// ─── English letter names in Devanagari (for ALL-CAPS abbreviations) ────────
const LETTER_NAME = {
  a: "ए", b: "बी", c: "सी", d: "डी", e: "ई", f: "एफ",
  g: "जी", h: "एच", i: "आई", j: "जे", k: "के", l: "एल",
  m: "एम", n: "एन", o: "ओ", p: "पी", q: "क्यू", r: "आर",
  s: "एस", t: "टी", u: "यू", v: "वी", w: "डब्ल्यू",
  x: "एक्स", y: "वाई", z: "ज़ेड",
};

// ─── Phonetic rules: English → Devanagari ────────────────────────────────────
// Vowel pairs  [pattern, fullForm, matraForm]
const VOWEL_PAIRS = [
  ["aa", "आ", "ा"], ["ai", "ऐ", "ै"], ["au", "औ", "ौ"], ["ay", "ऐ", "ै"],
  ["ee", "ई", "ी"], ["ei", "ई", "ी"], ["ii", "ई", "ी"], ["oo", "ऊ", "ू"],
  ["ou", "ओ", "ो"], ["ow", "ओ", "ो"], ["ue", "यू", "यू"], ["uu", "ऊ", "ू"],
];
// Single vowels  [char, fullForm, matraForm]  ('a' matra is context-sensitive — handled in code)
const VOWEL_SINGLE = [
  ["e", "ए", "े"], ["i", "इ", "ि"], ["o", "ओ", "ो"], ["u", "उ", "ु"],
];
const VOWELS = new Set("aeiou");

// Multi-char consonant clusters (longest-first for greedy match)
const CONSONANT_MULTI = [
  ["ksh", "क्ष"], ["shr", "श्र"], ["thr", "त्र"],
  ["ch",  "च"],   ["sh",  "श"],   ["kh",  "ख"],  ["gh",  "घ"],
  ["jh",  "झ"],   ["th",  "त"],   ["dh",  "ध"],  ["ph",  "फ"],
  ["bh",  "भ"],   ["ng",  "ं"],
  ["ll",  "ल्ल"], ["tt",  "त्त"], ["nn",  "न्न"], ["mm",  "म्म"],
  ["pp",  "प्प"], ["kk",  "क्क"], ["ss",  "स्स"], ["rr",  "र्र"],
  ["cc",  "क्क"], ["ck",  "क"],   ["bb",  "ब्ब"], ["dd",  "ड्ड"],
  ["ff",  "फ्फ"], ["gg",  "ग्ग"],
];

// Single consonants
const CONSONANT_SINGLE = {
  b:"ब", c:"क", d:"द", f:"फ", g:"ग", h:"ह", j:"ज", k:"क", l:"ल",
  m:"म", n:"न", p:"प", q:"क", r:"र", s:"स", t:"त", v:"व", w:"व",
  x:"क्स", y:"य", z:"ज़",
};

/**
 * Rule-based phonetic transliteration for a single English word.
 * Used when Google Translate returns the word unchanged (unknown proper noun)
 * or when the word is ALL-CAPS (abbreviation).
 */
function phoneticWord(originalWord) {
  // ALL-CAPS abbreviation → spell each letter by its Hindi name
  if (/^[A-Z]{2,}$/.test(originalWord)) {
    return originalWord.toLowerCase().split("").map((c) => LETTER_NAME[c] || c).join("");
  }

  let w = originalWord.toLowerCase();

  // Strip a trailing silent 'e' when preceded by a consonant  (e.g. "Vellore" → "vellor")
  if (w.length > 3 && w.endsWith("e") && !VOWELS.has(w[w.length - 2])) {
    w = w.slice(0, -1);
  }

  let output = "";
  let pos = 0;
  let prevWasConsonant = false;

  while (pos < w.length) {
    const rest = w.slice(pos);
    let matched = false;

    // ── 1. Multi-char vowel pairs ─────────────────────────────────────────
    for (const [pat, full, matra] of VOWEL_PAIRS) {
      if (rest.startsWith(pat)) {
        output += prevWasConsonant ? matra : full;
        prevWasConsonant = false;
        pos += pat.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // ── 2. Multi-char consonant clusters ─────────────────────────────────
    for (const [pat, deva] of CONSONANT_MULTI) {
      if (rest.startsWith(pat)) {
        if (prevWasConsonant) output += "्"; // halant between consonants
        output += deva;
        prevWasConsonant = true;
        pos += pat.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // ── 3. Single vowel ──────────────────────────────────────────────────
    const ch = rest[0];
    if (ch === "a") {
      if (!prevWasConsonant) {
        output += "अ"; // standalone
      } else {
        // Use 'ā' matra if more vowels follow; otherwise use inherent (empty)
        const afterA = w.slice(pos + 1);
        output += /[aeiou]/.test(afterA) ? "ा" : "";
      }
      prevWasConsonant = false;
      pos++;
      matched = true;
    } else {
      for (const [pat, full, matra] of VOWEL_SINGLE) {
        if (ch === pat) {
          output += prevWasConsonant ? matra : full;
          prevWasConsonant = false;
          pos++;
          matched = true;
          break;
        }
      }
    }
    
    if (matched) continue;

    // ── 4. Single consonant ──────────────────────────────────────────────
    if (CONSONANT_SINGLE[ch]) {
      if (prevWasConsonant) output += "्";
      output += CONSONANT_SINGLE[ch];
      prevWasConsonant = true;
      pos++;
    } else {
      output += ch; // unknown char — pass through
      prevWasConsonant = false;
      pos++;
    }
  }

  return output || originalWord;
}

/**
 * Translate a phrase to Hindi using:
 *   1. Google Translate per word (batch call; excellent for known Indian names/places)
 *   2. Phonetic fallback for any word Google returns unchanged (unknown proper nouns)
 *   3. ALL-CAPS words always go through the letter-name path (abbreviations)
 *
 * Results are cached at the word level so repeated values across bulk inserts
 * never trigger extra API calls.
 */
async function transliteratePhrase(phrase) {
  const trimmed = phrase.trim();
  if (phraseCache.has(trimmed)) return phraseCache.get(trimmed);

  const words = trimmed.split(/\s+/);

  // Collect unique words not yet cached
  const uncached = [...new Set(words.filter((w) => !wordCache.has(w.toLowerCase())))];

  if (uncached.length > 0) {
    // Separate abbreviations (ALL-CAPS) from normal words
    const abbrevs = uncached.filter((w) => /^[A-Z]{2,}$/.test(w));
    const normals = uncached.filter((w) => !/^[A-Z]{2,}$/.test(w));

    // Abbreviations → phonetic letter names (no API needed)
    for (const w of abbrevs) {
      wordCache.set(w.toLowerCase(), phoneticWord(w));
    }

    // Normal words → Google Translate (one batch call)
    if (normals.length > 0) {
      try {
        const [results] = await translate.translate(normals, "hi");
        const arr = Array.isArray(results) ? results : [results];
        normals.forEach((w, i) => {
          const translated = arr[i] || "";
          const key = w.toLowerCase();
          if (translated && DEVANAGARI_RE.test(translated)) {
            // Google returned real Devanagari — use it
            wordCache.set(key, translated);
          } else {
            // Google returned the word unchanged (or non-Devanagari) — apply phonetic rules
            wordCache.set(key, phoneticWord(w));
          }
        });
      } catch {
        // On API failure, fall back to phonetic for all
        for (const w of normals) {
          wordCache.set(w.toLowerCase(), phoneticWord(w));
        }
      }
    }
  }

  const hindi = words.map((w) => wordCache.get(w.toLowerCase()) ?? phoneticWord(w)).join(" ");
  phraseCache.set(trimmed, hindi);
  return hindi;
}

/**
 * Translate a full sentence to Hindi using Google Translate as ONE phrase
 * (not word-by-word). This is the correct path for descriptions / remarks /
 * comments where word-by-word transliteration would be meaningless.
 *
 *   "I am walking to college" → "मैं कॉलेज जा रहा हूँ"
 *
 * Cached at the sentence level so repeated values across bulk inserts never
 * trigger extra API calls. On API failure or a non-Devanagari result the
 * original text is returned unchanged.
 */
async function translateSentence(sentence) {
  const trimmed = sentence.trim();
  if (sentenceCache.has(trimmed)) return sentenceCache.get(trimmed);

  let hindi = trimmed;
  try {
    const [result] = await translate.translate(trimmed, "hi");
    const out = Array.isArray(result) ? result[0] : result;
    if (out && DEVANAGARI_RE.test(out)) hindi = out;
  } catch {
    // keep original on failure
  }

  sentenceCache.set(trimmed, hindi);
  return hindi;
}

/**
 * Convert all eligible string fields in a data row to Hindi, respecting each
 * field's translation mode.
 *
 *   transliterate → transliteratePhrase  (names, cities, proper nouns)
 *   translate     → translateSentence    (descriptions, remarks, long text)
 *   none          → value copied verbatim
 *
 * `fieldModes` maps a (snake_cased) column name to its resolved mode. When it
 * is omitted (legacy callers), every translatable string is transliterated —
 * exactly the original behavior, so existing forms are unaffected.
 *
 * Non-translatable values (numbers, IDs, emails, mixed alphanumeric) are
 * preserved unchanged.
 *
 * @param {Record<string, any>} dataMap
 * @param {Record<string, "transliterate"|"translate"|"none">|null} [fieldModes]
 * @returns {Promise<Record<string, any>>}
 */
async function translateRow(dataMap, fieldModes = null) {
  const result = { ...dataMap };
  const tasks = [];

  for (const [col, val] of Object.entries(dataMap)) {
    if (typeof val !== "string" || !val.trim()) continue;
    const trimmed = val.trim();

    // No fieldModes → legacy transliterate-everything behavior.
    const mode = fieldModes ? (fieldModes[col] || "transliterate") : "transliterate";
    if (mode === "none") continue;

    if (mode === "translate") {
      if (!HAS_ALPHA_RE.test(trimmed)) continue; // nothing to translate (e.g. "78")
      tasks.push(translateSentence(trimmed).then((hi) => { if (hi) result[col] = hi; }));
    } else {
      // transliterate — keep the strict pure-text gate so values like emails,
      // dates or mixed alphanumerics are never mangled.
      if (!isTranslatableText(val)) continue;
      tasks.push(transliteratePhrase(trimmed).then((hi) => { if (hi) result[col] = hi; }));
    }
  }

  await Promise.all(tasks);
  return result;
}

module.exports = { isTranslatableText, translateRow, resolveTranslationMode };