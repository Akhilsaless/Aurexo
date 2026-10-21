import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { editor, bindProduction, mediaPanel } from "../src/production-ui.js";
const make = () => ({
  id: "editor-1",
  title: "Rainbow",
  mode: "kids",
  age: "6–8",
  notes: "Source notes",
  state: "approved",
  createdAt: new Date().toISOString(),
  audit: [],
  finalApproval: { mediaKey: "old" },
  plan: {
    script: { hook: "Look up", body: "Rainbow colors", cta: "Name a color" },
    scenes: [{ visual: "Rainbow", narration: "Look up at the rainbow" }],
    variants: Object.fromEntries(
      ["youtube", "instagram", "facebook"].map((k) => [
        k,
        { title: "Rainbows", caption: "Colors" },
      ]),
    ),
    reviewFlags: [],
  },
});
test("editing a script sends it for review and invalidates media approval", async () => {
  const p = make(),
    dom = new JSDOM(editor(p), { url: "https://studio.test" });
  const oldDoc = globalThis.document,
    oldData = globalThis.FormData;
  globalThis.document = dom.window.document;
  globalThis.FormData = dom.window.FormData;
  let pending,
    saved = 0;
  try {
    bindProduction({
      projects: () => [p],
      action: (fn) => {
        pending = fn();
      },
      save: async () => {
        saved++;
      },
      notify: () => {},
      backend: () => "",
      afterRender: () => {},
    });
    dom.window.document.querySelector("[name=body]").value =
      "A careful revised explanation";
    dom.window.document
      .querySelector("form")
      .dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
    await pending;
    assert.equal(p.state, "review");
    assert.equal(p.finalApproval, null);
    assert.equal(p.plan.script.body, "A careful revised explanation");
    assert.equal(saved, 1);
  } finally {
    globalThis.document = oldDoc;
    globalThis.FormData = oldData;
    dom.window.close();
  }
});
test("final review does not accept unchecked acknowledgements", async () => {
  const p = make(),
    dom = new JSDOM(mediaPanel(p, ""), { url: "https://studio.test" });
  const oldDoc = globalThis.document;
  globalThis.document = dom.window.document;
  let invoked = false;
  try {
    bindProduction({
      projects: () => [p],
      action: () => {
        invoked = true;
      },
      backend: () => "",
    });
    dom.window.document
      .querySelector(".final-review")
      .dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
    assert.equal(invoked, false);
  } finally {
    globalThis.document = oldDoc;
    dom.window.close();
  }
});
