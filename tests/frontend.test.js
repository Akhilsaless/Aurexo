import { autopilotPanel } from "../src/autopilot-ui.js";
import { PROFILES, profileName } from "../src/profiles.js";
import { migrateLegacy } from "../src/migration.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import { AGENTS } from "../src/domain.js";
import {
  researchPanel,
  editor,
  mediaPanel,
  publishControls,
  socialSettings,
  growthPanel,
  discoveryPanel,
} from "../src/production-ui.js";
import { validProject } from "../src/validation.js";
const source = (
  await readFile(new URL("../src/app.js", import.meta.url), "utf8")
).replace(/^import [\s\S]*?from ["'][^"']+["'];\r?\n/gm, "");
const tick = () => new Promise((r) => setTimeout(r, 20));
function app(data = {}) {
  const dom = new JSDOM('<div id="app"></div>', { url: "https://studio.test" });
  for (const [k, v] of Object.entries(data))
    dom.window.localStorage.setItem(k, JSON.stringify(v));
  const w = dom.window;
  const context = vm.createContext({
    document: w.document,
    location: w.location,
    localStorage: w.localStorage,
    addEventListener: w.addEventListener.bind(w),
    FormData: w.FormData,
    crypto: globalThis.crypto,
    URL,
    Blob,
    AbortSignal,
    setTimeout,
    clearTimeout,
    AGENTS,
    autopilotPanel,
    bindAutopilot: () => {},
    PROFILES,
    profileName,
    migrateLegacy,
    researchPanel,
    editor,
    mediaPanel,
    publishControls,
    socialSettings,
    growthPanel,
    discoveryPanel,
    bindProduction: () => {},
    validProject,
    confirm: () => true,
    fetch: async () => {
      throw Error("Offline");
    },
  });
  vm.runInContext(source, context);
  return { dom, w, doc: w.document, context };
}
test("three studios default to kids and hide age selection for comedy", () => {
  const a = app();
  assert.equal(a.doc.querySelectorAll("nav a").length, 5);
  assert.equal(a.doc.querySelector("#age-label").hidden, false);
  assert.deepEqual(
    [...a.doc.querySelector("#mode").options].map((o) => o.value),
    ["kids", "comedy", "ai"],
  );
  const mode = a.doc.querySelector("#mode");
  mode.value = "comedy";
  mode.dispatchEvent(new a.w.Event("change"));
  assert.equal(a.doc.querySelector("#age-label").hidden, true);
});
test("manual idea saves persistently without API credentials", async () => {
  const a = app();
  a.doc.querySelector("[name=topic]").value = "Why rainbows appear";
  a.doc.querySelector("[data-action=save-brief]").click();
  await tick();
  const saved = JSON.parse(a.w.localStorage.getItem("aurexo_projects_v3"));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].state, "draft");
  assert.match(a.doc.body.textContent, /Why rainbows appear/);
});
test("generation without usage consent gives an actionable error instead of pretending success", async () => {
  const a = app();
  a.doc.querySelector("[name=topic]").value = "Rainbows";
  a.doc
    .querySelector("#create-form")
    .dispatchEvent(new a.w.Event("submit", { cancelable: true }));
  await tick();
  assert.match(
    a.doc.querySelector("[role=status]").textContent,
    /Confirm provider usage/,
  );
  assert.equal(a.w.localStorage.getItem("aurexo_projects_v3"), null);
});
test("malformed saved projects are discarded safely", () => {
  const a = app({ aurexo_projects_v3: [{ title: "broken" }] });
  assert.match(a.doc.querySelector(".foot").textContent, /0 projects/);
});
test("integration forms remain disabled before backend sign-in and keys are not stored", async () => {
  const a = app();
  a.w.location.hash = "integrations";
  await tick();
  assert.equal(a.doc.querySelectorAll(".provider-form").length, 2);
  assert.ok(
    [...a.doc.querySelectorAll(".provider-form button.primary")].every(
      (b) => b.disabled,
    ),
  );
  assert.equal(a.w.localStorage.length, 0);
});
test("saved project titles are escaped rather than interpreted as HTML", async () => {
  const a = app();
  a.doc.querySelector("[name=topic]").value = "<img src=x onerror=alert(1)>";
  a.doc.querySelector("[data-action=save-brief]").click();
  await tick();
  assert.equal(a.doc.querySelector(".project img"), null);
  assert.match(a.doc.querySelector(".project").textContent, /<img/);
});
