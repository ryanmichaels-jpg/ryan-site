// issue #9 §10 — acceptance for the Slack surface, driven in a headless
// browser. Checks 1-10 need the live service on :3200; check 11 needs it
// DOWN; check 12 is the mobile viewport.
//
//   node scripts/check-slack-widget.mjs live
//   node scripts/check-slack-widget.mjs down
//   node scripts/check-slack-widget.mjs mobile

import { createRequire } from "node:module";
const require = createRequire("/Users/ryan/Desktop/gtm-os-mvp/gateway/node_modules/");
const puppeteer = require("puppeteer");

const URL = "http://localhost:4321/diagrams/junto-slack.html";
const mode = process.argv[2] ?? "live";
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };

const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });

const idle = (page, timeout = 150_000) =>
  page.waitForFunction(() => !document.getElementById("go").disabled, { timeout, polling: 400 });

async function compose(page, text) {
  await page.evaluate((t) => { document.getElementById("q").value = t; }, text);
  await page.click("#go");
  await idle(page);
}

async function replyInLastThread(page, text) {
  await page.evaluate((t) => {
    const threads = document.querySelectorAll(".thread:not(.seeded)");
    const input = threads[threads.length - 1].querySelector(".replybox input");
    input.value = t;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  }, text);
  await idle(page);
}

function lastThreadState(page) {
  return page.evaluate(() => {
    const threads = document.querySelectorAll(".thread:not(.seeded)");
    const t = threads[threads.length - 1];
    const replies = t.querySelector(".replies");
    return {
      juntoReplies: replies.querySelectorAll(".msg").length,
      lastReply: replies.querySelector(".msg:last-of-type .mb")?.textContent ?? "",
      rcpt: [...t.querySelectorAll("details.rcpt .body")].map((n) => n.textContent).join(" | "),
      artifacts: [...t.querySelectorAll(".artifact")].map((n) => n.querySelector("svg") ? "svg" : n.querySelector("img") ? "png" : "cap"),
      cites: t.querySelectorAll(".cites li").length,
      refs: t.querySelectorAll(".cref").length,
      syslines: [...t.querySelectorAll(".sysline")].map((n) => n.textContent),
    };
  });
}

if (mode === "live") {
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: "networkidle0" });
  const badge = await page.evaluate(() => document.getElementById("badge")?.textContent ?? "");
  ok(badge.includes("live"), `live badge: "${badge.slice(0, 60)}"`);

  // 4. channels: one channel, with the reason stated.
  const side = await page.evaluate(() => ({
    chans: document.querySelectorAll(".chan").length,
    note: document.querySelector(".channote")?.textContent ?? "",
  }));
  ok(side.chans === 1, "check 4: exactly one channel exposed");
  ok(side.note.includes("lane") && side.note.includes("set dressing"), "check 4: the single channel says WHY");

  // seeded history present, statically.
  const seeded = await page.evaluate(() => document.querySelectorAll(".thread.seeded .msg").length);
  ok(seeded >= 2, `seeded history renders from the recorded fixture (${seeded} messages)`);

  // 1 + 10. free text -> run -> citations with source/date/ref; receipts.
  let st;
  for (let i = 0; i < 3; i++) {
    await compose(page, "what has CorePay said about pricing on past calls?");
    st = await lastThreadState(page);
    if (st.cites > 0) break;
  }
  ok(st.juntoReplies >= 1, "check 1: a real reply arrived");
  ok(st.cites > 0 && st.refs > 0, `check 1: citations carry source/date/ref (${st.cites} citations, ${st.refs} refs)`);
  ok(/exit \w+ at \d/.test(st.rcpt) && /ms/.test(st.rcpt) && /\$\d/.test(st.rcpt), `check 10: receipts show exit, confidence, duration, cost`);

  // 2 + 5. play runs end to end; org chart + run journey render in thread.
  await compose(page, "run the account pov on CorePay");
  st = await lastThreadState(page);
  ok(st.artifacts.includes("svg"), `check 2: org chart rendered in thread (artifacts: ${st.artifacts.join(",")})`);
  ok(st.artifacts.includes("png"), `run journey diagram rendered in thread`);
  ok(/exit RUN/.test(st.rcpt), "check 5: a play ran end to end from the composer (exit RUN)");

  // 3. two-turn pronoun resolution in the same thread.
  await replyInLastThread(page, "what about their pricing?");
  st = await lastThreadState(page);
  ok(st.juntoReplies >= 2, "check 3: the follow-up got its own reply in the thread");
  ok(/CorePay/i.test(st.lastReply), `check 3: "their" resolved to CorePay from the thread (reply mentions CorePay)`);

  // 6. CLARIFY round trip.
  let clarified = false;
  for (let i = 0; i < 2; i++) {
    await compose(page, "do the thing with the accounts from last week");
    st = await lastThreadState(page);
    if (/CLARIFY/.test(st.rcpt) || /\?\s*$/.test(st.lastReply.trim())) { clarified = true; break; }
  }
  ok(clarified, "check 6: vague ask gets a clarifying question");
  await replyInLastThread(page, "I meant CorePay");
  st = await lastThreadState(page);
  ok(st.juntoReplies >= 2, "check 6: the reader's thread answer resolves the clarify round trip");

  // 7. SOURCE_MISS, HELP, DISCOVER all reachable, all read as answers.
  await compose(page, "what's CorePay's NPS score?");
  st = await lastThreadState(page);
  ok(st.juntoReplies >= 1 && /source/i.test(st.lastReply), `check 7: SOURCE_MISS reads as an answer: "${st.lastReply.slice(0, 70)}"`);
  await compose(page, "how does this thing work?");
  st = await lastThreadState(page);
  ok(st.juntoReplies >= 1 && st.lastReply.length > 30, "check 7: HELP reads as an answer");
  await compose(page, "I need to keep an eye on accounts hiring comp leaders, which play fits?");
  st = await lastThreadState(page);
  ok(st.juntoReplies >= 1 && st.lastReply.length > 30, "check 7: DISCOVER reads as an answer");

  // 8. silent run: the message posts and receives NOTHING.
  await compose(page, "@dana can you take the deck review pass today?");
  st = await lastThreadState(page);
  ok(st.juntoReplies === 0 && st.syslines.length === 0, `check 8: @someone-else got NO reply, visibly (${st.juntoReplies} replies, ${st.syslines.length} syslines)`);

  // 9. COMPOSE honest disabled reply, nothing runs.
  await compose(page, "build me a new play that watches renewal risk every morning");
  st = await lastThreadState(page);
  ok(/disabled in this public demo/i.test(st.lastReply), "check 9: COMPOSE returns the honest disabled reply as a normal message");
}

if (mode === "down") {
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 800));
  const badge = await page.evaluate(() => document.getElementById("badge")?.textContent ?? "");
  ok(badge.includes("unreachable") && badge.includes("replayed honestly"), `check 11: honest badge: "${badge.slice(0, 80)}"`);
  await page.evaluate(() => document.querySelectorAll(".eg")[0].click());
  await idle(page, 60_000);
  const st = await lastThreadState(page);
  ok(st.juntoReplies >= 1 && st.cites > 0, `check 11: recorded chip replays with citations (${st.cites})`);
  await compose(page, "free text nobody ever recorded");
  const st2 = await lastThreadState(page);
  ok(st2.syslines.some((s) => s.includes("will not fake it")), "check 11: free text refused honestly");
}

if (mode === "mobile") {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 800 });
  const demoCalls = [];
  page.on("request", (req) => { if (req.url().includes("/demo/")) demoCalls.push(req.url()); });
  await page.goto(URL, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 500));
  const badge = await page.evaluate(() => document.getElementById("badge")?.textContent ?? "");
  ok(badge.includes("phone"), `check 12: mobile badge: "${badge.slice(0, 70)}"`);
  await page.evaluate(() => document.querySelectorAll(".eg")[0].click());
  await idle(page, 60_000);
  ok(demoCalls.length === 0, `check 12: zero /demo/* requests on mobile (saw ${demoCalls.length})`);
}

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
