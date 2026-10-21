import { localMedia, renderVideo, subtitles, drawFrame } from "./media.js";
import { reviewChecklist, recommendations } from "./quality.js";
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const emptyPlan = () => ({
  script: { hook: "", body: "", cta: "" },
  scenes: [
    { visual: "", narration: "" },
    { visual: "", narration: "" },
    { visual: "", narration: "" },
  ],
  variants: Object.fromEntries(
    ["youtube", "instagram", "facebook"].map((p) => [
      p,
      { title: "", caption: "" },
    ]),
  ),
  reviewFlags: [],
  thumbnailPrompt: "",
});
export function editor(p) {
  const q = p.plan || emptyPlan();
  return `<details class="panel" ${p.state === "draft" ? "open" : ""}><summary>Edit script & production plan</summary><form class="edit-project" data-id="${esc(p.id)}"><label>Project title<input name="title" maxlength="300" required value="${esc(p.title)}"></label><label>Source notes and learning goal<textarea name="notes" rows="4">${esc(p.notes || "")}</textarea></label>${["hook", "body", "cta"].map((k) => `<label>${k.toUpperCase()}<textarea name="${k}" rows="${k === "body" ? 5 : 2}" required>${esc(q.script[k])}</textarea></label>`).join("")}<h4>Scenes</h4>${q.scenes.map((s, i) => `<div class="two"><label>Scene ${i + 1} visual<textarea name="visual${i}" required>${esc(s.visual)}</textarea></label><label>Scene ${i + 1} narration<textarea name="narration${i}" required>${esc(s.narration)}</textarea></label></div>`).join("")}${["youtube", "instagram", "facebook"].map((k) => `<details><summary>${k} metadata</summary><label>Title<input name="${k}Title" maxlength="150" value="${esc(q.variants[k]?.title || p.title)}"></label><label>Caption<textarea name="${k}Caption">${esc(q.variants[k]?.caption || "")}</textarea></label></details>`).join("")}<label>Thumbnail direction<textarea name="thumbnail">${esc(q.thumbnailPrompt || "")}</textarea></label><button class="primary">Save revision & send to review</button><p class="hint">Any script change clears final approval. Scheduled jobs will stop if their reviewed content changes.</p></form></details>`;
}
export function mediaPanel(p, backend) {
  return `<section class="panel"><h4>Produce your video</h4><p class="hint">The local renderer creates an original Nova motion-graphic video with captions. Upload a narration track or generate one with OpenAI. Keep this tab visible during recording. Captions use estimated word timing; check them in final review.</p><div class="two"><label>Narration audio<input type="file" class="asset-file" data-kind="audio" data-id="${esc(p.id)}" accept="audio/mpeg,audio/wav,audio/mp4,audio/webm"></label><label>Original / licensed background image<input type="file" class="asset-file" data-kind="image" data-id="${esc(p.id)}" accept="image/png,image/jpeg,image/webp"></label></div><p class="hint">${esc(p.localAudio?.name || "No local narration")} · ${esc(p.localImage?.name || "Original Nova graphics")}</p><div class="actions"><button data-production="voice" data-id="${esc(p.id)}">Generate AI narration</button><button data-production="illustration" data-id="${esc(p.id)}">Generate AI illustration</button><button data-production="render" data-id="${esc(p.id)}">Render video locally</button><button data-production="video-download" data-id="${esc(p.id)}">Download video</button><button data-production="srt" data-id="${esc(p.id)}">Download captions</button><button data-production="png" data-id="${esc(p.id)}">Download PNG cover</button></div><div class="render-status" data-id="${esc(p.id)}" role="status"></div><label>Or upload a finished video (MP4/WebM, up to 40 MB)<input class="asset-file" data-kind="video" data-id="${esc(p.id)}" type="file" accept="video/mp4,video/webm"></label><div class="actions"><button data-production="preview" data-id="${esc(p.id)}">Preview current video</button>${backend ? `<button data-production="upload" data-id="${esc(p.id)}">Save video to secure backend</button>` : ""}</div><div class="video-preview" data-id="${esc(p.id)}"></div>${p.media ? `<p class="hint">Server video: ${(p.media.size / 1048576).toFixed(1)} MB · ${esc(p.media.type)}</p>` : ""}<h4>Final video approval</h4><form class="final-review" data-id="${esc(p.id)}">${reviewChecklist(
    p,
  )
    .map(
      ([key, label]) =>
        `<label class="check"><input type="checkbox" name="${key}" required>${esc(label)}</label>`,
    )
    .join(
      "",
    )}<button>Approve this exact video</button></form>${p.finalApproval || p.localFinalApproval ? '<p class="notice">Current video has final approval.</p>' : ""}</section>`;
}
export function publishControls(p) {
  return `<details class="panel"><summary>Publish or schedule this video</summary><form class="publish-job" data-id="${esc(p.id)}"><div class="two"><label>Platform<select name="platform"><option value="youtube">YouTube</option><option value="instagram">Instagram Reel</option><option value="facebook">Facebook video</option></select></label><label>YouTube visibility<select name="privacy"><option value="unlisted">Unlisted</option><option value="public">Public</option></select></label></div><label>Schedule in your local time (leave blank for now)<input type="datetime-local" name="runAt"></label><label class="check"><input type="checkbox" name="confirm" required>I authorize uploading this approved video to the selected account at this time.</label><button class="primary">Queue approved video</button><p class="hint">Requires a connected social account, server video and final approval. Instagram/Facebook require MP4. Made-for-kids designation follows Kids Content Mode.</p></form></details>`;
}
export function socialSettings() {
  return `<details class="panel"><summary>YouTube, Instagram & Facebook connections</summary><div id="social-status">Sign in and refresh connections to see their status.</div><button data-production="connections">Refresh connections</button>${["youtube", "meta"].map((type) => `<form class="social-config" data-type="${type}"><h4>${type === "youtube" ? "YouTube / Google OAuth app" : "Meta app · Instagram & Facebook"}</h4><label>Client / app ID<input name="clientId" required autocomplete="off"></label><label>Client / app secret<input name="clientSecret" type="password" required autocomplete="off"></label>${type === "meta" ? '<div class="two"><label>Graph API version<input name="version" required placeholder="Version from your Meta app dashboard"></label><label>Facebook Page ID<input name="pageId" required inputmode="numeric"></label></div>' : ""}<p class="hint">Register your backend’s /api/oauth/${type}/callback as the redirect URI in the provider console. Credentials stay encrypted on the server.</p><button>Save social app</button><button type="button" data-production="connect" data-type="${type}">Connect account</button><button type="button" data-production="disconnect-social" data-type="${type}">Disconnect account</button></form>`).join("")}</details>`;
}
export function growthPanel() {
  return `<details class="panel"><summary>Publishing jobs & growth</summary><div class="actions"><button data-production="jobs">Refresh jobs</button><button data-production="analytics">Sync platform analytics</button></div><div id="job-list"></div><div id="growth-data"></div></details>`;
}
export function discoveryPanel() {
  return `<details class="panel"><summary>Find an idea from current headlines</summary><form id="discover-form"><label>Topic to explore<input name="q" maxlength="150" placeholder="Educational science"></label><button>Search current headlines</button></form><div id="discovery-results"></div><p class="hint">Headlines are leads, not verified facts. Check the original sources before including claims in a script.</p></details>`;
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function bindProduction(c) {
  const find = (id) => c.projects().find((p) => p.id === id);
  const apply = (result) => c.apply(result);
  const raw = async (path, options = {}) => {
    if (!c.backend()) throw Error("Connect and sign in to the secure backend.");
    const r = await fetch(c.backend() + path, {
      ...options,
      credentials: "include",
      signal: AbortSignal.timeout(90000),
    });
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      throw Error(b.error?.message || `Request failed (${r.status})`);
    }
    return r;
  };
  document.querySelectorAll(".source-fetch").forEach(
    (form) =>
      (form.onsubmit = (e) => {
        e.preventDefault();
        if (!form.reportValidity()) return;
        const url = new FormData(form).get("url");
        c.action(async () => {
          await c.save();
          apply(
            await c.api("/api/research/source", "POST", {
              projectId: form.dataset.id,
              url,
            }),
          );
          c.notify("Source excerpt saved. Review its claims before approval.");
        });
      }),
  );
  document.querySelectorAll(".edit-project").forEach(
    (form) =>
      (form.onsubmit = (e) => {
        e.preventDefault();
        if (!form.reportValidity()) return;
        c.action(async () => {
          const p = find(form.dataset.id),
            f = new FormData(form),
            q = p.plan || emptyPlan();
          p.title = f.get("title").trim();
          p.notes = f.get("notes");
          p.plan = {
            ...q,
            script: Object.fromEntries(
              ["hook", "body", "cta"].map((k) => [k, String(f.get(k))]),
            ),
            scenes: q.scenes.map((s, i) => ({
              ...s,
              visual: String(f.get("visual" + i)),
              narration: String(f.get("narration" + i)),
            })),
            variants: Object.fromEntries(
              ["youtube", "instagram", "facebook"].map((k) => [
                k,
                {
                  title: String(f.get(k + "Title") || p.title),
                  caption: String(f.get(k + "Caption") || ""),
                },
              ]),
            ),
            thumbnailPrompt: String(f.get("thumbnail")),
          };
          p.state = "review";
          p.finalApproval = null;
          p.localFinalApproval = null;
          p.audit.push({
            at: new Date().toISOString(),
            action: "Owner edited script; review required",
          });
          await c.save();
          c.notify("Revision saved and sent for review.");
        });
      }),
  );
  document.querySelectorAll(".asset-file").forEach(
    (input) =>
      (input.onchange = () => {
        const file = input.files[0],
          id = input.dataset.id,
          kind = input.dataset.kind;
        if (!file) return;
        c.action(async () => {
          const limits = { video: 40, audio: 20, image: 10 };
          if (file.size > limits[kind] * 1048576)
            throw Error(`Keep this ${kind} below ${limits[kind]} MB.`);
          if (!file.type.startsWith(kind + "/"))
            throw Error("Choose a file of the expected type.");
          await localMedia(id, kind, file);
          const p = find(id);
          p["local" + kind[0].toUpperCase() + kind.slice(1)] = {
            id: crypto.randomUUID(),
            name: file.name,
            type: file.type,
            size: file.size,
          };
          if (kind === "video") {
            p.finalApproval = null;
            p.localFinalApproval = null;
          }
          await c.save();
          c.notify(
            "File saved on this device. Backups of project text do not include media files.",
          );
        });
      }),
  );
  document.querySelectorAll(".final-review").forEach(
    (form) =>
      (form.onsubmit = (e) => {
        e.preventDefault();
        if (!form.reportValidity()) return;
        c.action(async () => {
          const p = find(form.dataset.id),
            f = new FormData(form),
            checks = Object.fromEntries(
              reviewChecklist(p).map(([k]) => [k, Boolean(f.get(k))]),
            );
          if (p.state !== "approved")
            throw Error("Approve the script plan before final media.");
          if (p.media) {
            apply(
              await c.api("/api/media/approve", "POST", {
                projectId: p.id,
                mediaKey: p.media.key,
                checks,
              }),
            );
          } else {
            if (!(await localMedia(p.id, "video")))
              throw Error("Render or upload a video first.");
            p.localFinalApproval = {
              at: new Date().toISOString(),
              mediaKey: p.localVideo.id,
              checks,
            };
            await c.save();
          }
          c.notify(
            "Final video approved. Any change to the script or video clears this approval.",
          );
        });
      }),
  );
  document.querySelectorAll(".publish-job").forEach(
    (form) =>
      (form.onsubmit = (e) => {
        e.preventDefault();
        if (!form.reportValidity()) return;
        c.action(async () => {
          const f = new FormData(form);
          const b = await c.api("/api/publish/jobs", "POST", {
            projectId: form.dataset.id,
            platform: f.get("platform"),
            privacy: f.get("privacy"),
            runAt: f.get("runAt")
              ? new Date(f.get("runAt")).toISOString()
              : undefined,
            confirmPublish: Boolean(f.get("confirm")),
          });
          c.notify(
            b.deduplicated
              ? "This video already has a publishing job."
              : "Video queued. Refresh jobs to follow platform confirmation.",
          );
        });
      }),
  );
  document.querySelectorAll(".social-config").forEach(
    (form) =>
      (form.onsubmit = (e) => {
        e.preventDefault();
        const f = new FormData(form),
          secret = f.get("clientSecret");
        form.querySelector("[name=clientSecret]").value = "";
        c.action(async () => {
          await c.api("/api/social/config", "POST", {
            type: form.dataset.type,
            clientId: f.get("clientId"),
            clientSecret: secret,
            version: f.get("version"),
            pageId: f.get("pageId"),
          });
          c.notify(
            "Social app saved securely. Connect the account to grant publishing access.",
          );
        });
      }),
  );
  document.querySelector("#discover-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = new FormData(e.target).get("q");
    c.action(async () => {
      const b = await c.api("/api/discover?q=" + encodeURIComponent(q));
      c.afterRender(() => {
        const target = document.querySelector("#discovery-results");
        if (target)
          target.innerHTML = b.items
            .map(
              (item) =>
                `<article class="project"><b>${esc(item.title)}</b><p>${esc(item.source)} · freshness score ${item.score}/100</p><a href="${esc(/^https:\/\//.test(item.url) ? item.url : "#")}" target="_blank" rel="noopener">Read source ↗</a><p class="hint">${esc(item.scoreNote)}</p></article>`,
            )
            .join("");
      });
    });
  });
  document.querySelectorAll("[data-production]").forEach(
    (button) =>
      (button.onclick = () =>
        c.action(async () => {
          const a = button.dataset.production,
            p = find(button.dataset.id);
          if (a === "fact-review") {
            if (
              !confirm(
                "Use your selected provider account for a critical fact review?",
              )
            )
              return;
            const provider = document.querySelector(
              "#review-provider-" + p.id,
            ).value;
            apply(
              await c.api("/api/review/ai", "POST", {
                projectId: p.id,
                provider,
                allowUsage: true,
              }),
            );
            c.notify(
              "AI review saved. Read findings and check the original sources.",
            );
          }
          if (a === "illustration") {
            if (
              !confirm(
                "Generate an illustration using your OpenAI account and quota?",
              )
            )
              return;
            await c.save();
            const response = await raw("/api/image", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ projectId: p.id, allowUsage: true }),
            });
            const blob = await response.blob();
            await localMedia(p.id, "image", blob);
            p.localImage = {
              name: "AI illustration · review required",
              size: blob.size,
              type: blob.type,
            };
            await c.save();
            c.notify(
              "AI illustration saved locally. Check it before rendering.",
            );
          }
          if (a === "voice") {
            if (
              !confirm(
                "Generate AI narration using your OpenAI account and provider quota?",
              )
            )
              return;
            const r = await raw("/api/voice", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ projectId: p.id, allowUsage: true }),
            });
            const blob = await r.blob();
            await localMedia(p.id, "audio", blob);
            p.localAudio = {
              name: "AI narration · disclose synthetic voice",
              size: blob.size,
              type: blob.type,
            };
            await c.save();
            c.notify(
              "AI narration saved locally. Preview the voice before final approval.",
            );
          }
          if (a === "render") {
            if (!p.plan) throw Error("Add a script and scenes first.");
            let audio = await localMedia(p.id, "audio");
            if (
              !audio &&
              !confirm(
                "No narration track is saved. Render a silent captioned version?",
              )
            )
              return;
            const image = await localMedia(p.id, "image");
            const target = document.querySelector(
              `.render-status[data-id="${p.id}"]`,
            );
            const controller = new AbortController();
            if (target) {
              target.innerHTML =
                '<progress max="1" value="0"></progress><p>Rendering… keep this tab visible.</p><button type="button">Cancel render</button>';
              target.querySelector("button").onclick = () => controller.abort();
            }
            const result = await renderVideo(p, {
              audioBlob: audio,
              imageBlob: image,
              signal: controller.signal,
              onProgress: (value) => {
                if (target) target.querySelector("progress").value = value;
              },
            });
            await localMedia(p.id, "video", result.blob);
            p.localVideo = {
              id: crypto.randomUUID(),
              type: result.blob.type,
              size: result.blob.size,
              duration: result.duration,
            };
            p.finalApproval = null;
            p.localFinalApproval = null;
            await c.save();
            downloadBlob(
              result.blob,
              "aurexo-video." +
                (result.blob.type === "video/mp4" ? "mp4" : "webm"),
            );
            c.notify(
              "Playable video rendered. Review the entire file before approving.",
            );
          }
          if (a === "video-download") {
            const blob = await localMedia(p.id, "video");
            if (!blob)
              throw Error(
                "No video is saved on this device. Render or upload one.",
              );
            downloadBlob(
              blob,
              "aurexo-video." + (blob.type === "video/mp4" ? "mp4" : "webm"),
            );
          }
          if (a === "srt") {
            const { captionCues } = await import("./media.js");
            downloadBlob(
              new Blob(
                [
                  subtitles(
                    captionCues(p.plan.scenes, p.localVideo?.duration || 45),
                  ),
                ],
                { type: "text/plain" },
              ),
              "aurexo-captions.srt",
            );
          }
          if (a === "png") {
            const canvas = document.createElement("canvas");
            canvas.width = 720;
            canvas.height = 1280;
            drawFrame(canvas.getContext("2d"), p, 0, 45);
            const blob = await new Promise((resolve) =>
              canvas.toBlob(resolve, "image/png"),
            );
            downloadBlob(blob, "aurexo-cover.png");
          }
          if (a === "preview") {
            let blob = await localMedia(p.id, "video");
            if (!blob && p.media)
              blob = await (
                await raw("/api/media/" + encodeURIComponent(p.media.key))
              ).blob();
            if (!blob) throw Error("No video available.");
            const url = URL.createObjectURL(blob);
            c.afterRender(() => {
              const host = document.querySelector(
                `.video-preview[data-id="${p.id}"]`,
              );
              if (host) {
                const video = document.createElement("video");
                video.controls = true;
                video.src = url;
                video.style.maxWidth = "100%";
                video.style.maxHeight = "540px";
                host.replaceChildren(video);
                video.onemptied = () => URL.revokeObjectURL(url);
              }
            });
          }
          if (a === "upload") {
            const blob = await localMedia(p.id, "video");
            if (!blob)
              throw Error(
                "No local video. Render or upload a finished file first.",
              );
            await c.save();
            const response = await raw(
              "/api/media/upload?projectId=" +
                encodeURIComponent(p.id) +
                "&kind=video",
              {
                method: "POST",
                headers: { "content-type": blob.type },
                body: blob,
              },
            );
            apply(await response.json());
            c.notify("Video saved on the server. Final review is required.");
          }
          if (a === "connections") {
            const b = await c.api("/api/social/status");
            c.afterRender(() => {
              const el = document.querySelector("#social-status");
              if (el)
                el.innerHTML = Object.entries(b.status)
                  .map(
                    ([type, v]) =>
                      `<p><b>${esc(type)}</b>: ${v.connected ? "Connected to " + esc(v.account) : v.configured ? "App configured · account not connected" : "Not configured"}</p>`,
                  )
                  .join("");
            });
          }
          if (a === "connect") {
            const b = await c.api("/api/social/connect", "POST", {
              type: button.dataset.type,
            });
            location.href = b.url;
          }
          if (a === "disconnect-social") {
            await c.api("/api/social/disconnect", "POST", {
              type: button.dataset.type,
            });
            c.notify("Account disconnected.");
          }
          if (a === "cancel-job") {
            await c.api("/api/publish/cancel", "POST", {
              id: button.dataset.job,
            });
            c.notify(
              "Job canceled. This does not delete any existing platform upload.",
            );
          }
          if (a === "resume-job") {
            await c.api("/api/publish/resume", "POST", {
              id: button.dataset.job,
            });
            c.notify("Saved YouTube session queued for inspection and resume.");
          }
          if (a === "jobs") {
            const b = await c.api("/api/publish/jobs");
            c.afterRender(() => {
              const el = document.querySelector("#job-list");
              if (el)
                el.innerHTML = b.jobs.length
                  ? b.jobs
                      .map(
                        (j) =>
                          `<p><b>${esc(j.platform)}</b> · ${esc(j.state)} · ${new Date(j.runAt).toLocaleString()}${j.url ? ` · <a target="_blank" rel="noopener" href="${esc(j.url)}">View confirmed upload ↗</a>` : ""}${j.error ? `<br>${esc(j.error)}` : ""}</p>`,
                      )
                      .join("")
                  : "<p>No publishing jobs yet.</p>";
            });
          }
          if (a === "analytics") {
            const b = await c.api("/api/analytics/sync", "POST", {});
            c.afterRender(() => {
              const el = document.querySelector("#growth-data");
              if (el)
                el.innerHTML = `<h4>Platform performance</h4>${b.metrics.map((m) => `<p>${esc(m.title)} · ${m.views ?? "unavailable"} views · ${esc(m.platform || "youtube")} · ${esc(m.period || "")}${Number.isFinite(m.averageViewDuration) ? " · average " + Math.round(m.averageViewDuration) + " seconds" : ""}</p>`).join("")}<ul>${b.recommendations.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>${(b.errors || []).map((e) => `<p class="error">${esc(e.platform)}: ${esc(e.message)}</p>`).join("")}`;
            });
          }
        })),
  );
}

export function researchPanel(p) {
  return `<details class="panel"><summary>Research & fact review</summary><form class="source-fetch" data-id="${esc(p.id)}"><label>Original source URL<input type="url" name="url" required placeholder="https://science.nasa.gov/…"></label><button>Retrieve source text</button></form><div class="actions"><select aria-label="Fact review provider" id="review-provider-${esc(p.id)}"><option value="gemini">Gemini</option><option value="openai">OpenAI</option></select><button data-production="fact-review" data-id="${esc(p.id)}">Run AI fact review</button></div><p class="hint">This checks claims against retrieved or pasted text. It does not certify truth, copyright or legal compliance.</p>${p.aiReview ? "<h4>Reviewer findings</h4><ul>" + p.aiReview.issues.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul>" + p.aiReview.claims.map((x) => "<p><b>" + esc(x.claim) + "</b><br>" + esc(x.assessment) + "<br><small>Quote present in notes: " + (x.quotePresent ? "yes" : "no") + "</small></p>").join("") : ""}</details>`;
}
