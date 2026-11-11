"use strict";
// Flexible location matching, shared by property search (propertyQuery.js) and the
// autocomplete endpoint. Pure module: no dependencies, fully unit-testable.
//
// Goal: users find listings even with incomplete, abbreviated or slightly different
// location names — "Bad" finds Badda, "Gulshan" finds "Gulshan 1" and "Gulshan 2",
// "bashundhara r/a" finds "Bashundhara Residential Area" — while weak character
// similarity ("Bad" vs "Dhaka") must NOT match.
//
// Approach (maintainable, no external service):
//   1. normalize(): lowercase, collapse repeated spaces, trim, expand a few very common
//      Bangladeshi address abbreviations. Applied to BOTH queries and stored text, so
//      matching is consistent.
//   2. tokens(): split into words; single-character tokens are dropped (they cause
//      unrelated matches — "Gulshan 1" still matches through the word "gulshan").
//   3. matchText(): a token matches when the normalized text CONTAINS the token
//      (substring, so prefixes and sub-areas both work). No edit-distance or fuzzy
//      scoring, which is what keeps irrelevant results out.

// Very common abbreviations only; anything rarer is better served by substring matching.
const ABBREVIATIONS = [
  [/\br\/a\b/g, "residential area"],
  [/\bblk\b/g, "block"],
  [/\bsec[\b.]?(\d)/g, "sector $1"],
  [/\brd\b/g, "road"],
];
const CONTROL = /[\u0000-\u001f\u007f]/;

function normalize(value) {
  if (typeof value !== "string") return "";
  let s = value.toLowerCase().replace(/\s+/g, " ").trim();
  for (const [rx, expansion] of ABBREVIATIONS) s = s.replace(rx, expansion);
  return s;
}

function splitWords(value) {
  return normalize(value).split(/[\s,]+/).filter(Boolean);
}

function tokens(value) {
  const words = splitWords(value);
  if (words.some(w => w.length > 1)) {
    return words.filter(t => t.length > 1 || !/^[a-z0-9]$/i.test(t));
  }
  return words;
}

// True when every query token appears in the normalized haystack text.
function matchText(haystack, queryTokens) {
  if (!queryTokens.length) return true;
  const text = normalize(haystack);
  if (!text) return false;
  return queryTokens.every(t => text.includes(t));
}

// Build tokens from a raw user query. Returns { tokens, error } — error when the query
// is too long, has too many words, or contains control characters.
function parseLocationQuery(raw, { maxTokens = 5, maxTokenLength = 50 } = {}) {
  const value = typeof raw === "string" ? raw : "";
  if (CONTROL.test(value)) return { tokens: [], error: "Location contains unsupported characters." };
  const rawWords = splitWords(value);
  if (value.trim().length > 100 || rawWords.length > maxTokens || rawWords.some(t => t.length > maxTokenLength)) {
    return { tokens: [], error: "Location is too long." };
  }
  return { tokens: tokens(value), error: "" };
}

// Ranking for autocomplete: exact > prefix > substring. Pure; sort with it.
function rankSuggestion(name, query) {
  const n = normalize(name), q = normalize(query);
  if (!q) return 3;
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.includes(q)) return 2;
  return 99;
}

module.exports = { normalize, tokens, matchText, parseLocationQuery, rankSuggestion };
