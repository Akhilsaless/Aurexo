import { PROFILES } from "./profiles.js";
import { assembleScenes } from "./assemble.js";
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let binding = 0;
let timer,
  channels = [],
  runs = [],
  signature = "",
  encoding = false,
  requestId = null;
export function autopilotPanel() {
  return `<section class="panel"><h2>Let AUREXO make the video</h2><p>Choose a studio and channel. Gemini chooses an original idea, writes the script and generates three animated scenes with audio. AUREXO assembles and saves the short for your approval.</p><form id="autopilot-form"><div class="two"><label>Content studio<select name="studio">${PROFILES.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label><label>YouTube channel<select name="channel" required><option value="">Loading connected channels…</option></select></label><label>Upload visibility<select name="privacy"><option value="unlisted">Unlisted</option><option value="public">Public</option></select></label></div><label class="check"><input type="checkbox" name="usage" required>Allow Gemini text generation and up to three paid video requests for one short (up to 30 seconds).</label><button class="primary">Create video automatically</button><p class="hint">No upload happens until you review and approve. Keep this page open for automatic assembly. Provider limits and video-model access apply.</p></form><div id="autopilot-status" aria-live="polite"></div><p id="autopilot-message" role="status"></p></section>`;
}
export function bindAutopilot(c) {
  const version = ++binding;
  clearTimeout(timer);
  const form = document.querySelector("#autopilot-form");
  if (!form) return;
  signature = "";
  const message = (text) => {
    const el = document.querySelector("#autopilot-message");
    if (el) el.textContent = text;
  };
  function fillChannels() {
    const select = form.querySelector('[name="channel"]'),
      current = select.value;
    select.innerHTML = channels.length
      ? channels
          .map(
            (t) =>
              `<option value="${esc(t.slot)}">${esc(t.accountName)} · ${esc(t.slot === "general" ? "Existing channel" : PROFILES.find((p) => p.id === t.slot)?.name)}</option>`,
          )
          .join("")
      : '<option value="">Connect a YouTube channel in Integrations first</option>';
    if (channels.some((t) => t.slot === current)) select.value = current;
  }
  form.querySelector('[name="studio"]').onchange = (e) => {
    const select = form.querySelector('[name="channel"]');
    if (channels.some((t) => t.slot === e.target.value))
      select.value = e.target.value;
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const button = form.querySelector("button");
    button.disabled = true;
    message("");
    try {
      const data = new FormData(form),
        target = channels.find((t) => t.slot === data.get("channel"));
      if (!target)
        throw Error("Connect a YouTube channel in Integrations first");
      requestId ||= crypto.randomUUID();
      await c.api("/api/autopilot/start", "POST", {
        mode: data.get("studio"),
        channelSlot: target.slot,
        accountId: target.accountId,
        privacy: data.get("privacy"),
        allowUsage: data.get("usage") === "on",
        requestId,
      });
      requestId = null;
      message(
        "Automatic production started. The finished video will appear here for review.",
      );
      await refresh();
    } catch (e) {
      message(e.message);
    } finally {
      button.disabled = false;
    }
  };
  async function assemble(run) {
    if (encoding) return;
    encoding = true;
    try {
      const claim = await c.api("/api/autopilot/assembly", "POST", {
        id: run.id,
      });
      message(
        "Assembling generated scenes with their audio. Keep this page open…",
      );
      const blobs = [];
      for (const clip of claim.clips) {
        const r = await fetch(
          c.backend() + "/api/media/" + encodeURIComponent(clip.key),
          { credentials: "include", signal: AbortSignal.timeout(60000) },
        );
        if (!r.ok) throw Error("Could not load a generated clip");
        blobs.push(await r.blob());
      }
      const output = await assembleScenes(blobs, {
        onProgress: (v) => message(`Assembling video: ${Math.round(v * 100)}%`),
      });
      const upload = await fetch(
        c.backend() +
          "/api/media/upload?projectId=" +
          encodeURIComponent(claim.projectId) +
          "&kind=video",
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": output.blob.type },
          body: output.blob,
          signal: AbortSignal.timeout(90000),
        },
      );
      const result = await upload.json();
      if (!upload.ok)
        throw Error(result.error?.message || "Video upload failed");
      const saved = await c.api("/api/autopilot/assembled", "POST", {
        id: run.id,
        lease: claim.lease,
        mediaKey: result.media.key,
      });
      c.apply(saved);
      message(
        "Your AI video is ready. Watch it, review it, then approve the upload.",
      );
      signature = "";
    } catch (e) {
      message(
        e.message +
          " Assembly can resume after its five-minute tab lease expires.",
      );
    } finally {
      encoding = false;
    }
  }
  async function refresh() {
    if (version !== binding) return;
    try {
      const data = await c.api("/api/autopilot");
      if (version !== binding) return;
      channels = data.channels;
      runs = data.runs;
      if (!document.querySelector("#autopilot-form")) return;
      fillChannels();
      const next = JSON.stringify(
        runs.map((r) => [r.id, r.state, r.message, r.url]),
      );
      if (next !== signature) {
        signature = next;
        renderRuns();
      }
      const ready = runs.find(
        (r) =>
          r.state === "clips_ready" ||
          (r.state === "assembling" && r.leaseUntil < Date.now()),
      );
      if (ready && !encoding) await assemble(ready);
    } catch (e) {
      message(e.message);
    } finally {
      clearTimeout(timer);
      if (version === binding && document.querySelector("#autopilot-form"))
        timer = setTimeout(refresh, 5000);
    }
  }
  function renderRuns() {
    const host = document.querySelector("#autopilot-status");
    if (!host) return;
    host.innerHTML = runs
      .map(
        (r) =>
          `<article class="panel"><h3>${esc(r.title || PROFILES.find((p) => p.id === r.mode)?.name)}</h3><p><b>${esc(r.state.replaceAll("_", " "))}</b> · ${esc(r.accountName)} · ${esc(r.privacy)}</p>${r.message ? `<p class="error">${esc(r.message)}</p>` : ""}${r.state === "review" ? `<video controls playsinline preload="metadata" style="max-width:360px;width:100%" src="${esc(c.backend() + "/api/media/" + encodeURIComponent(r.mediaKey))}"></video><details><summary>AI script and YouTube metadata</summary><p>${esc(r.review?.script?.hook)} ${esc(r.review?.script?.body)} ${esc(r.review?.script?.cta)}</p><p><b>${esc(r.review?.variants?.youtube?.title)}</b></p><p>${esc(r.review?.variants?.youtube?.caption)}</p><p>Made for kids: ${r.mode === "kids" ? "Yes" : "No"}. Synthetic-media disclosure: Yes.</p><ul>${(r.review?.reviewFlags || []).map((flag) => `<li>${esc(flag)}</li>`).join("")}</ul></details><p>Review the entire video: facts or fictional framing, rights to visuals/voice/music, audio and pacing, audience suitability, made-for-kids setting and AI/sponsorship disclosures.</p><label class="check"><input type="checkbox" data-review="${esc(r.id)}">I completed this review and approve this exact video for ${esc(r.accountName)} (${esc(r.privacy)}).</label><button data-auto-approve="${esc(r.id)}">Approve & upload to YouTube</button>` : ""}${["review", "needs_attention", "clips_ready", "assembling"].includes(r.state) ? `<button data-auto-reject="${esc(r.id)}">Reject this video</button>` : ""}${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">View confirmed YouTube upload ↗</a>` : ""}</article>`,
      )
      .join("");
    host.querySelectorAll("[data-auto-approve]").forEach(
      (button) =>
        (button.onclick = async () => {
          const run = runs.find((r) => r.id === button.dataset.autoApprove);
          if (!host.querySelector(`[data-review="${run.id}"]`).checked) {
            message("Watch the video and confirm your final review first.");
            return;
          }
          button.disabled = true;
          try {
            const result = await c.api("/api/autopilot/approve", "POST", {
              id: run.id,
              mediaKey: run.mediaKey,
              checks: {
                facts: true,
                rights: true,
                media: true,
                audience: true,
                disclosure: true,
              },
            });
            c.apply(result);
            signature = "";
            message("Approved upload queued for the selected channel.");
            await refresh();
          } catch (e) {
            message(e.message);
            button.disabled = false;
          }
        }),
    );
    host.querySelectorAll("[data-auto-reject]").forEach(
      (button) =>
        (button.onclick = async () => {
          try {
            await c.api("/api/autopilot/reject", "POST", {
              id: button.dataset.autoReject,
            });
            signature = "";
            await refresh();
          } catch (e) {
            message(e.message);
          }
        }),
    );
  }
  refresh();
}
