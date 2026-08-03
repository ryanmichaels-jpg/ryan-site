// doc 69 §6 checks 6-9, driven in a real headless browser against the
// astro dev server (proxy active) and the live demo service.
//
//   node scripts/check-widgets.mjs live      # checks 6 + 7 (needs :3200 up)
//   node scripts/check-widgets.mjs down      # check 8 (run with :3200 DOWN)
//   node scripts/check-widgets.mjs mobile    # check 9
//
// Puppeteer is borrowed from gtm-os-mvp's gateway (mermaid-cli dependency);
// nothing is installed into this repo.

import { createRequire } from "node:module";
const require = createRequire("/Users/ryan/Desktop/gtm-os-mvp/gateway/node_modules/");
const puppeteer = require("puppeteer");

const A = "http://localhost:4321/diagrams/junto-widget-seven-steps.html";
const B = "http://localhost:4321/diagrams/junto-widget-normalize-event.html";
const mode = process.argv[2] ?? "live";

let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };

const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });

// The widgets guard against double-submits (#go disabled while busy, and
// released only after render pacing finishes) — wait for idle before any
// follow-up interaction.
const waitIdle = (page) =>
  page.waitForFunction(() => document.getElementById("go") && !document.getElementById("go").disabled, { timeout: 30_000 });

async function runPrompt(page, prompt, timeoutMs = 120_000) {
  await page.evaluate((p) => { document.getElementById("q").value = p; }, prompt);
  await page.click("#go");
  // Completion = receipts footer (every finished flow), the silence state,
  // or an error card. A CLARIFY exit finishes with 3 cards, so counting
  // cards is not a completion signal.
  await page.waitForFunction(
    () => (document.getElementById("foot")?.textContent ?? "").length > 0 ||
          document.querySelector(".err") || document.querySelector(".silent"),
    { timeout: timeoutMs, polling: 500 },
  );
  return page.evaluate(() => ({
    done: document.querySelectorAll(".step.done").length,
    fired: document.querySelectorAll(".rule.fired").length,
    rules: document.querySelectorAll(".rule").length,
    err: document.querySelector(".err")?.textContent ?? null,
    silent: Boolean(document.querySelector(".silent")),
    foot: document.getElementById("foot")?.textContent ?? "",
    badge: document.getElementById("badge")?.textContent ?? "",
    citesQuotes: [...document.querySelectorAll(".cquote")].map((n) => n.textContent),
  }));
}

if (mode === "live") {
  const page = await browser.newPage();
  await page.goto(A, { waitUntil: "networkidle0" });
  const badge = await page.evaluate(() => document.getElementById("badge")?.textContent ?? "");
  ok(badge.includes("live"), `widget A live badge: "${badge}"`);

  // check 6 + 7a: agreement run — all seven cards from a live stream. The
  // front door legitimately CLARIFYs this ask sometimes (correction 2.1
  // territory), so retry with a fresh page until the ANSWER path runs.
  let agree;
  for (let i = 0; i < 3; i++) {
    agree = await runPrompt(page, "@junto what has CorePay said about pricing on past calls?");
    if (agree.done === 7) break;
    console.log(`  (attempt ${i + 1}: ${agree.done} cards — front door took a non-run exit, retrying)`);
    await page.goto(A, { waitUntil: "networkidle0" });
  }
  ok(agree.done === 7, `check 6: seven cards settled (got ${agree.done}${agree.err ? `, err: ${agree.err.slice(0, 80)}` : ""})`);
  ok(agree.rules === 5, `check 6: route card expands to five rules (got ${agree.rules})`);
  ok(agree.fired === 0, "check 7: agreement run shows zero fired rules");
  ok(agree.foot.includes("Receipts"), "check 7: agreement run reads as finished (receipts footer)");

  // check 7b: override run — visually distinct, still finished.
  const over = await runPrompt(page, "which of my accounts launched something new?");
  ok(over.done === 7, `check 7: override run settles all seven cards (got ${over.done})`);
  ok(over.fired >= 1, `check 7: override run renders a fired rule distinctly (got ${over.fired})`);
  ok(over.foot.includes("Receipts"), "check 7: override run reads as finished");

  // silent outcome, for completeness (§2.2's second gate outcome).
  const silent = await runPrompt(page, "@dana can you take the deck review pass today?");
  ok(silent.silent === true, "silent run renders the distinct silence state");
  ok(silent.done <= 1, "silent run: phases 2-7 never render");

  // widget B live: chip resolves through the real classifier.
  const pb = await browser.newPage();
  await pb.goto(B, { waitUntil: "networkidle0" });
  const bBadge = await pb.evaluate(() => document.getElementById("badge")?.textContent ?? "");
  ok(bBadge.includes("live"), `widget B live badge: "${bBadge}"`);
  await pb.evaluate(() => { document.getElementById("q").value = "an opportunity moves from Discovery to Negotiation"; });
  await pb.click("#go");
  await pb.waitForFunction(() => document.querySelectorAll(".card.show").length >= 4 || document.querySelector(".miss"), { timeout: 30_000 });
  const bCards = await pb.evaluate(() => document.querySelectorAll(".card.show").length);
  ok(bCards >= 4, `widget B: four-stage resolution rendered live (got ${bCards})`);
  await waitIdle(pb);
  await pb.evaluate(() => { document.getElementById("q").value = "a rep hears a rumour at a conference"; });
  await pb.click("#go");
  await pb.waitForFunction(() => document.querySelector(".miss"), { timeout: 30_000 });
  const missText = await pb.evaluate(() => document.querySelector(".miss")?.textContent ?? "");
  ok(missText.includes("Nothing sees it"), "widget B: uncovered path told plainly");
}

if (mode === "down") {
  // check 8 — endpoint down: recorded trace + honest badge, both widgets.
  const page = await browser.newPage();
  await page.goto(A, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 800));
  const badge = await page.evaluate(() => document.getElementById("badge")?.textContent ?? "");
  ok(badge.includes("unreachable") && badge.includes("replayed honestly"), `check 8 A: honest replay badge: "${badge}"`);
  await page.evaluate(() => document.querySelectorAll(".eg")[0].click());
  await page.waitForFunction(() => document.querySelectorAll(".step.done").length >= 7, { timeout: 30_000 });
  const done = await page.evaluate(() => document.querySelectorAll(".step.done").length);
  ok(done === 7, `check 8 A: recorded trace renders all seven cards (got ${done})`);
  await waitIdle(page);
  const free = await page.evaluate(async () => {
    document.getElementById("q").value = "some free text nobody recorded";
    document.getElementById("go").click();
    await new Promise((r) => setTimeout(r, 600));
    return document.querySelector(".err")?.textContent ?? "";
  });
  ok(free.includes("recording only exists for the suggested prompts"), "check 8 A: free text refused honestly, never faked");

  const pb = await browser.newPage();
  await pb.goto(B, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 800));
  const bBadge = await pb.evaluate(() => document.getElementById("badge")?.textContent ?? "");
  ok(bBadge.includes("unreachable"), `check 8 B: honest replay badge: "${bBadge}"`);
  await pb.evaluate(() => document.querySelectorAll(".eg")[1].click());
  await pb.waitForFunction(() => document.querySelectorAll(".card.show").length >= 4, { timeout: 30_000 });
  ok(true, "check 8 B: recorded example renders the four stages");
  await waitIdle(pb);
  const bFree = await pb.evaluate(async () => {
    document.getElementById("q").value = "someone waters the office plants";
    document.getElementById("go").click();
    await new Promise((r) => setTimeout(r, 600));
    return document.querySelector(".miss")?.textContent ?? "";
  });
  ok(bFree.includes("live classifier is unreachable"), "check 8 B: free text refused honestly (no keyword table)");
}

if (mode === "mobile") {
  // check 9 — mobile viewport: replay, and NOT ONE request to /demo/*.
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 800 });
  const demoCalls = [];
  page.on("request", (req) => { if (req.url().includes("/demo/")) demoCalls.push(req.url()); });
  await page.goto(A, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 500));
  const badge = await page.evaluate(() => document.getElementById("badge")?.textContent ?? "");
  ok(badge.includes("phone") && badge.includes("recording"), `check 9: mobile badge: "${badge}"`);
  await page.evaluate(() => document.querySelectorAll(".eg")[0].click());
  await page.waitForFunction(() => document.querySelectorAll(".step.done").length >= 7, { timeout: 30_000 });
  ok(true, "check 9: recorded run plays on mobile");
  ok(demoCalls.length === 0, `check 9: zero live attempts (saw ${demoCalls.length} /demo/* requests)`);
}

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
