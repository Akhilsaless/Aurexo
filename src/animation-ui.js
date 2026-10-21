import { assembleScenes } from "./assemble.js";
import { localMedia } from "./media.js";
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function animationPanel(p) {
  return `<details class="panel"><summary>AI animated scenes</summary><p class="hint">Generate original animated clips with your activated Gemini account. Each clip is up to 10 seconds with generated audio. Video access and charges are separate from text generation. Default limit: 3 requests per day. Preview every scene before assembly; character and narration consistency require review.</p><div class="actions">${p.plan.scenes.map((_, i) => `<button data-animation="generate" data-id="${esc(p.id)}" data-scene="${i}">Generate scene ${i + 1}</button>`).join("")}<button data-animation="status" data-id="${esc(p.id)}">Refresh animated scenes</button><button data-animation="assemble" data-id="${esc(p.id)}">Assemble animated scenes</button></div><div class="animation-status" data-id="${esc(p.id)}"></div></details>`;
}
export function bindAnimation(c) {
  document.querySelectorAll("[data-animation]").forEach((button) =>
    button.addEventListener("click", () =>
      c.action(async () => {
        const p = c.projects().find((p) => p.id === button.dataset.id),
          action = button.dataset.animation;
        if (!p) throw Error("Project not found");
        if (action === "generate") {
          if (
            !confirm(
              "Generate this scene using Gemini paid video quota? Default daily limit is 3 scenes. Model access is required. Interrupted requests can still incur charges.",
            )
          )
            return;
          await c.save();
          await c.api("/api/animation", "POST", {
            projectId: p.id,
            scene: Number(button.dataset.scene),
            allowUsage: true,
          });
          c.notify(
            "Animation queued on the server. Refresh animated scenes to check progress; this tab can be closed.",
          );
          return;
        }
        const jobs = (await c.api("/api/animation")).jobs.filter(
          (j) => j.projectId === p.id,
        );
        if (action === "status") {
          c.afterRender(() => {
            const host = document.querySelector(
              `.animation-status[data-id="${p.id}"]`,
            );
            if (host)
              host.innerHTML = jobs.length
                ? jobs
                    .map(
                      (j) =>
                        `<p>Scene ${j.scene + 1}: ${esc(j.state)} · ${esc(j.message || "Waiting for provider")}${j.media ? ` <a target="_blank" rel="noopener" href="${esc(c.backend() + "/api/media/" + encodeURIComponent(j.media.key))}">Preview clip ↗</a>` : ""}</p>`,
                    )
                    .join("")
                : "<p>No animation jobs yet.</p>";
          });
          return;
        }
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify(p.plan)),
        );
        const fingerprint = Array.from(new Uint8Array(digest), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join("");
        const selected = p.plan.scenes.map((_, i) =>
          jobs.find(
            (j) =>
              j.scene === i &&
              j.state === "completed" &&
              j.fingerprint === fingerprint,
          ),
        );
        if (selected.some((j) => !j))
          throw Error(
            "Generate every scene in the current plan before assembly. Changed plans need new clips.",
          );
        const blobs = [];
        for (const j of selected) {
          const r = await fetch(
            c.backend() + "/api/media/" + encodeURIComponent(j.media.key),
            { credentials: "include", signal: AbortSignal.timeout(60000) },
          );
          if (!r.ok)
            throw Error(
              "Could not load a generated scene. Sign in and refresh.",
            );
          blobs.push(await r.blob());
        }
        const host = document.querySelector(
            `.animation-status[data-id="${p.id}"]`,
          ),
          controller = new AbortController();
        if (host) {
          host.innerHTML =
            '<progress max="1" value="0"></progress><p>Assembling… keep this tab visible.</p><button>Cancel assembly</button>';
          host.querySelector("button").onclick = () => controller.abort();
        }
        const output = await assembleScenes(blobs, {
          signal: controller.signal,
          onProgress: (v) => {
            if (host) host.querySelector("progress").value = v;
          },
        });
        await localMedia(p.id, "video", output.blob);
        p.localVideo = {
          id: crypto.randomUUID(),
          type: output.blob.type,
          size: output.blob.size,
          duration: output.duration,
        };
        p.finalApproval = null;
        p.localFinalApproval = null;
        await c.save();
        c.notify(
          "Animated video assembled with scene audio. Preview it, save to backend, and complete final review. Caption timing and narration accuracy need review.",
        );
      }),
    ),
  );
}
