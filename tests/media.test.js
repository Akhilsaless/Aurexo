import { test } from "node:test";
import assert from "node:assert/strict";
let createCanvas;
try {
  ({ createCanvas } = await import("@napi-rs/canvas"));
} catch (e) {
  if (process.platform !== "win32") throw e;
}
import { indexedDB } from "fake-indexeddb";
import { captionCues, subtitles, drawFrame, localMedia } from "../src/media.js";
import {
  reviewChecklist,
  scoreOpportunity,
  recommendations,
} from "../src/quality.js";
import { safeSource } from "../cloudflare-worker/src/research.js";
const project = {
  title: "Why rainbows appear",
  mode: "kids",
  plan: {
    scenes: [
      {
        visual: "A rainbow",
        narration: "Sunlight can separate into many beautiful colors.",
      },
      { visual: "A drop", narration: "Tiny water drops help us see them." },
    ],
  },
};
test("captions cover narration exactly with monotonic timing and SRT output", () => {
  const cues = captionCues(project.plan.scenes, 45);
  assert.equal(cues[0].start, 0);
  assert.equal(cues.at(-1).end, 45);
  assert.ok(
    cues.every(
      (c, i) => c.end > c.start && (!i || c.start === cues[i - 1].end),
    ),
  );
  assert.match(subtitles(cues), /00:00:00,000 -->/);
  assert.match(subtitles(cues), /Sunlight/);
});
test("renderer draws a real original PNG frame rather than returning a mock asset", (t) => {
  if (!createCanvas) {
    t.skip(
      "Windows application control blocks native Canvas; this test runs in Linux CI.",
    );
    return;
  }
  const canvas = createCanvas(720, 1280);
  drawFrame(canvas.getContext("2d"), project, 12, 45);
  const png = canvas.toBuffer("image/png");
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.ok(png.length > 10000);
  const data = canvas.getContext("2d").getImageData(0, 0, 720, 1280).data;
  assert.ok(new Set([...data].filter((_, i) => i % 4 !== 3)).size > 50);
});
test("media blobs survive a local storage round trip", async () => {
  globalThis.indexedDB = indexedDB;
  const blob = new Blob(["real-audio-bytes"], { type: "audio/mpeg" });
  await localMedia("sample", "audio", blob);
  const restored = await localMedia("sample", "audio");
  assert.equal(await restored.text(), "real-audio-bytes");
});
test("source retrieval rejects private addresses, credentials and hostile redirects", () => {
  for (const value of [
    "http://nasa.gov",
    "https://127.0.0.1/",
    "https://nasa.gov.evil.test/",
    "https://user:pass@nasa.gov/",
    "https://nasa.gov:8443/",
  ])
    assert.throws(() => safeSource(value));
  assert.equal(
    safeSource("https://science.nasa.gov/").hostname,
    "science.nasa.gov",
  );
});
test("kids final review contains explicit age and designation checks", () => {
  assert.match(
    reviewChecklist(project).find(([key]) => key === "audience")[1],
    /made-for-kids/,
  );
});
test("growth suggestions require real observations and scoring remains bounded", () => {
  assert.match(recommendations([])[0], /before drawing conclusions/);
  assert.equal(
    scoreOpportunity({
      ageHours: 10000,
      audienceFit: 0,
      competition: 100,
      effort: 100,
    }),
    0,
  );
});
