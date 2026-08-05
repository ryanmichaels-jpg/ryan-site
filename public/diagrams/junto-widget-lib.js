// junto-widget-lib.js
// Shared by both essay widgets (seven-steps, normalize-event) and by the
// mechanical check-10 script, so it must run in a browser AND in node.
//
// The one rule that governs everything here: nothing on screen is invented.
// Events come from the real service or from a recorded trace that says so.
// Quoted material is rendered ONLY from citation `quote` fields, which the
// backend guarantees are character-for-character substrings of the source
// records. Model prose never gets to put words inside quotation marks.

export const DEPLOYED_BASE = "https://demo.ryanmichaels.dev/demo";

/** Env-gated endpoint. On localhost the widget talks to the SAME origin
 *  ("/demo"), which the Astro dev server proxies to :3200 with the Origin
 *  header stripped. Deployed pages talk to the demo host directly under
 *  its real CORS policy. The deployed policy is never widened. */
export function demoBase(loc) {
  const l = loc ?? (typeof location !== "undefined" ? location : undefined);
  if (l && (l.hostname === "localhost" || l.hostname === "127.0.0.1")) return "/demo";
  return DEPLOYED_BASE;
}

export function isMobileViewport(win) {
  const w = win ?? (typeof window !== "undefined" ? window : undefined);
  if (!w || !w.matchMedia) return false;
  return w.matchMedia("(max-width: 720px)").matches;
}

// --- talking to the service -----------------------------------------------------

export async function mintSession(base) {
  const r = await fetch(`${base}/session`, { method: "POST" });
  if (!r.ok) throw new Error(`session mint failed: ${r.status}`);
  return (await r.json()).session_id;
}

/** POST /demo/message and deliver each SSE event to onEvent as it arrives.
 *  fetch + reader because EventSource cannot POST. `thread` (optional) is
 *  the client thread key the Slack surface uses so referents and pending
 *  clarifies resolve per thread. */
export async function streamMessage(base, sessionId, text, onEvent, thread) {
  const r = await fetch(`${base}/message`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, text, mode: "full", ...(thread ? { thread } : {}) }),
  });
  if (!r.ok || !r.body) throw new Error(`message failed: ${r.status}`);
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const ev = /^event: (.+)$/m.exec(block)?.[1];
      const data = /^data: (.+)$/m.exec(block)?.[1];
      if (ev && data) onEvent({ event: ev, data: JSON.parse(data) });
    }
  }
}

export async function postNormalize(base, sessionId, text) {
  const r = await fetch(`${base}/normalize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, text }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error ?? `normalize failed: ${r.status}`);
  return body;
}

/** Replays a recorded event array through the same onEvent handler the live
 *  stream uses, paced so phases read as happening rather than dumped. */
export async function playRecorded(events, onEvent, pace = defaultPace) {
  for (const e of events) {
    onEvent(e);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, pace(e)));
  }
}

function defaultPace(e) {
  const d = e.data ?? {};
  if (d.stage === "phase" && d.state === "start") return 240;
  if (d.stage === "phase") return 120;
  if (d.stage === "post_rule") return 130;
  if (e.event === "answer") return 200;
  return 90;
}

// --- rendering helpers ----------------------------------------------------------

export function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

/** System copy (summaries, reasons, notes) is displayed without em dashes,
 *  matching the essay's prose. NEVER applied to quotes or answer text:
 *  quotes are verbatim by contract, and answers are the model's own words. */
export function tidySystemCopy(s) {
  return String(s).replace(/\s*—\s*/g, ", ");
}

const QUOTE_SPAN_RE = /"([^"\n]{2,})"|“([^”\n]{2,})”/g;

/** A span may keep its quotation marks ONLY if it appears character-for-
 *  character inside a citation's `quote` field. Anything else loses the
 *  marks and stands as an unquoted claim (doc 69 §5.3). */
export function stripUnverbatimQuoteMarks(text, citations) {
  const quotes = (citations ?? []).map((c) => c.quote).filter((q) => typeof q === "string");
  return String(text).replace(QUOTE_SPAN_RE, (match, straight, curly) => {
    const inner = straight ?? curly;
    return quotes.some((q) => q.includes(inner)) ? match : inner;
  });
}

/** The model's prose, escaped, quote-marks policed, paragraphs kept.
 *  No markdown engine: the constitution linter already keeps answers to
 *  plain text, and an escape-then-break render cannot smuggle HTML. */
export function renderAnswerHtml(markdown, citations) {
  const policed = stripUnverbatimQuoteMarks(markdown ?? "", citations);
  return escapeHtml(policed)
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replaceAll("\n", "<br>")}</p>`)
    .join("");
}

/** Citations list. The `snippet` is a summary and renders WITHOUT quotation
 *  marks; only the verbatim `quote` field is quoted, and when it was cut at
 *  a word boundary the ellipsis sits OUTSIDE the closing mark. */
export function renderCitationsHtml(citations) {
  if (!citations || citations.length === 0) return "";
  const items = citations.map((c) => {
    const head = `<span class="csrc">${escapeHtml(c.source ?? "")}</span> · ${escapeHtml(c.date ?? "")}`;
    const snippet = c.snippet ? `<div class="csnip">${escapeHtml(c.snippet)}</div>` : "";
    const quote = typeof c.quote === "string"
      ? `<div class="cquote">“${escapeHtml(c.quote)}”${c.quote_truncated === true ? "…" : ""}</div>`
      : "";
    const ref = c.ref ? `<div class="cref">ref: ${escapeHtml(String(c.ref))}</div>` : "";
    return `<li>${head}${snippet}${quote}${ref}</li>`;
  });
  return `<div class="cites"><div class="cites-h">receipts</div><ul>${items.join("")}</ul></div>`;
}

/** For the mechanical check: every span that appears inside double
 *  quotation marks (straight or curly) in rendered TEXT. */
export function extractQuotations(html) {
  const text = String(html)
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&quot;", '"').replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">");
  const out = [];
  for (const m of text.matchAll(QUOTE_SPAN_RE)) out.push(m[1] ?? m[2]);
  return out;
}
