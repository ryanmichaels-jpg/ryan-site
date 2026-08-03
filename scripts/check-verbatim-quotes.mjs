// doc 69 §6 check 10 — THE TEST THAT PROTECTS THE ESSAY.
// Every quotation that reaches a reader's screen must appear verbatim in
// the payload it was rendered from. This diffs mechanically, using the SAME
// render functions the widgets execute, so what is checked is what ships.
//
// Run: node scripts/check-verbatim-quotes.mjs [--live]
//   --live also drives a fresh run against localhost:3200 and checks it.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderAnswerHtml, renderCitationsHtml, extractQuotations,
} from "../public/diagrams/junto-widget-lib.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const collapse = (s) => String(s).replace(/\s+/g, " ").trim();

let checked = 0, failures = 0;
function assertVerbatim(label, spans, haystacks) {
  const hs = haystacks.map(collapse);
  for (const span of spans) {
    checked++;
    const ok = hs.some((h) => h.includes(collapse(span)));
    if (!ok) {
      failures++;
      console.log(`FAIL  ${label}: on-screen quotation not verbatim in payload: "${span.slice(0, 100)}"`);
    }
  }
}

// --- widget A: answers render through renderAnswerHtml + renderCitationsHtml ----
function checkMessageTrace(label, events) {
  const answer = events.find((e) => e.event === "answer")?.data;
  if (!answer) { console.log(`  (${label}: no answer event, nothing rendered in quotes)`); return; }
  const citations = answer.citations ?? [];
  const html = renderAnswerHtml(answer.markdown, citations) + renderCitationsHtml(citations);
  const spans = extractQuotations(html);
  // The ONLY legitimate source of on-screen quotation marks is a citation's
  // verbatim quote field.
  assertVerbatim(label, spans, citations.map((c) => c.quote).filter((q) => typeof q === "string"));
  console.log(`  ${label}: ${spans.length} on-screen quotation(s), ${citations.filter((c) => c.quote).length} citation quote(s)`);
}

// --- widget B: everything rendered IS the response; quotations must trace ------
function checkNormalize(label, resp) {
  const rendered = [];
  if (resp.covered === false) rendered.push(resp.why ?? "");
  else {
    for (const s of resp.stores ?? []) {
      rendered.push(`"${s.question}"`);
      for (const v of Object.values(s.fields ?? {})) rendered.push(typeof v === "string" ? v : JSON.stringify(v));
    }
    for (const row of [resp.retrieval_row, resp.evidence_row]) {
      if (row) for (const v of Object.values(row)) rendered.push(typeof v === "string" ? v : JSON.stringify(v));
    }
    rendered.push(resp.note ?? "");
  }
  const spans = extractQuotations(rendered.join("\n"));
  assertVerbatim(label, spans, [JSON.stringify(resp)]);
}

const replay = JSON.parse(readFileSync(resolve(HERE, "../public/diagrams/junto-widget-replay.json"), "utf-8"));
console.log(`recorded traces (${replay.recorded_at}):`);
for (const [name, rec] of Object.entries(replay.message)) checkMessageTrace(`message/${name}`, rec.events);
for (const [text, resp] of Object.entries(replay.normalize)) checkNormalize(`normalize/${text.slice(0, 40)}`, resp);

if (process.argv.includes("--live")) {
  console.log("live run against localhost:3200:");
  const mint = await fetch("http://localhost:3200/demo/session", { method: "POST" });
  const sid = (await mint.json()).session_id;
  const r = await fetch("http://localhost:3200/demo/message", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id: sid, text: "what has CorePay said about pricing on past calls?", mode: "full" }),
  });
  const raw = await r.text();
  const events = [];
  for (const block of raw.split("\n\n")) {
    const ev = /^event: (.+)$/m.exec(block)?.[1];
    const data = /^data: (.+)$/m.exec(block)?.[1];
    if (ev && data) events.push({ event: ev, data: JSON.parse(data) });
  }
  checkMessageTrace("live/pricing-ask", events);
}

console.log(`\n${checked} quotation(s) checked, ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
