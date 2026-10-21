import { migrateLegacy } from "./migration.js";
import {
  researchPanel,
  editor,
  mediaPanel,
  publishControls,
  socialSettings,
  growthPanel,
  discoveryPanel,
  bindProduction,
} from "./production-ui.js";
import { validProject } from "./validation.js";
import { AGENTS } from "./domain.js";
const root = document.querySelector("#app");
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
let projects = read("aurexo_projects_v3", []),
  backend = read("aurexo_backend_v3", ""),
  authenticated = false,
  providers = [],
  busy = false,
  message = "",
  notice = "",
  page = location.hash.slice(1) || "create";
projects = Array.isArray(projects) ? projects.filter(validProject) : [];
let serverRevision = read("aurexo_revision_v3", 0),
  afterRenderTask = null;
const nav = [
  ["create", "Create"],
  ["projects", "Projects"],
  ["review", "Review"],
  ["publish", "Publish"],
  ["integrations", "Integrations"],
];
function persist() {
  localStorage.setItem("aurexo_projects_v3", JSON.stringify(projects));
}
async function api(path, method = "GET", data) {
  if (!backend)
    throw Error("Connect your secure backend in Integrations first.");
  const r = await fetch(backend + path, {
    method,
    credentials: "include",
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(90000),
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401) authenticated = false;
    throw Error(b.error?.message || `Request failed (${r.status})`);
  }
  return b;
}
function download(name, text, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const badge = (s) =>
  `<span class="badge ${s === "approved" ? "success" : ""}">${esc(s)}</span>`;
function card(p, detail = false) {
  return `<article class="project"><div class="project-top"><div><small>${p.mode === "kids" ? "KIDS · " + esc(p.age) : "GENERAL CONTENT"}</small><h3>${esc(p.title)}</h3></div>${badge(p.state)}</div><p>${esc(p.plan?.script?.hook || "Your production brief is ready to write.")}</p><small>${p.provider ? esc(p.provider + " · " + p.model) : "Manual brief"} · ${new Date(p.createdAt).toLocaleDateString()}</small><div class="actions"><button data-action="open" data-id="${esc(p.id)}">${detail ? "Hide details" : "Open project"}</button><button data-action="export" data-id="${esc(p.id)}">Export brief</button></div>${detail ? details(p) : ""}</article>`;
}
let selected = null;
function details(p) {
  const plan = p.plan;
  return `<div class="details">${
    plan
      ? `<h4>Script</h4><p class="script">${esc(plan.script.hook)}\n\n${esc(plan.script.body)}\n\n${esc(plan.script.cta)}</p><h4>Scene plan</h4>${plan.scenes.map((s, i) => `<div class="scene"><b>${i + 1}</b><div><p>${esc(s.visual)}</p><small>${esc(s.narration)}</small></div></div>`).join("")}<h4>Platform versions</h4>${Object.entries(
          plan.variants,
        )
          .map(
            ([k, v]) =>
              `<details><summary>${esc(k)} · ${esc(v.title)}</summary><p>${esc(v.caption)}</p></details>`,
          )
          .join(
            "",
          )}<h4>Thumbnail direction</h4><p>${esc(plan.thumbnailPrompt || "Not provided")}</p><button data-action="cover" data-id="${esc(p.id)}">Download text cover (SVG)</button><h4>Review flags</h4><ul>${[...plan.reviewFlags, "Verify every factual claim against original sources.", "Create and inspect real media before publishing.", ...(p.mode === "kids" ? ["Adult review required for age suitability, rights and learning value."] : [])].map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`
      : "<p>This is a saved brief, not an AI-generated script. Connect a provider, then create an AI plan.</p>"
  }${editor(p)}${researchPanel(p)}${p.plan ? mediaPanel(p, backend) : ""}<h4>Source notes</h4><p class="script">${esc(p.notes || "No source notes supplied.")}</p><h4>Activity</h4>${(p.audit || []).map((a) => `<p><small>${esc(a.at)} · ${esc(a.action)}</small></p>`).join("")}<button class="danger" data-action="delete" data-id="${esc(p.id)}">Delete project</button></div>`;
}
function create() {
  return `<section class="intro"><small>YOUR CONTENT STUDIO</small><h1>What shall we create?</h1><p>Start with an idea. AUREXO prepares a script and scene plan for your review.</p></section><form id="create-form" class="panel create-form"><label>Topic or story idea<input name="topic" required maxlength="300" placeholder="For example: Why do rainbows appear?" autofocus></label><div class="two"><label>Content mode<select name="mode" id="mode"><option value="general">General content</option><option value="kids">Kids Content Mode</option></select></label><label id="age-label" hidden>Age group<select name="age"><option>3–5</option><option selected>6–8</option><option>9–12</option></select></label><label>AI provider<select name="provider"><option value="gemini">Gemini${providers.find((x) => x.id === "gemini")?.active ? " · active" : ""}</option><option value="openai">OpenAI${providers.find((x) => x.id === "openai")?.active ? " · active" : ""}</option></select></label></div><label>Source notes and learning goal<textarea name="notes" rows="5" maxlength="12000" placeholder="Paste reliable facts, source links and what your audience should learn. AI output still needs your review."></textarea></label><label class="check"><input name="usage" type="checkbox"> Allow this generation to use my provider account and quota</label><div class="actions"><button type="submit" class="primary" ${busy ? "disabled" : ""}>${busy ? "Preparing your plan…" : "Generate content plan"}</button><button type="button" data-action="save-brief">Save idea without AI</button></div><p class="hint">Scripts and scene plans are text. Video, voice and publishing are separate production steps.</p></form>${discoveryPanel()}<details class="panel"><summary>Your 16-role team</summary><div class="team">${AGENTS.map(([n, d]) => `<div><b>${esc(n)}</b><p>${esc(d)}</p></div>`).join("")}</div><p class="hint">These are workflow responsibilities. Automated research, media production and performance analysis require additional connected services.</p></details>`;
}
function projectList() {
  return `<section class="intro"><h1>Your projects</h1><p>Ideas, scripts and production briefs in one place.</p></section><div class="actions"><a class="button primary" href="#create">Create a project</a><button data-action="backup">Download backup</button>${read("aurexo_recovery_v3", null) ? '<button data-action="recovery">Download recovery backup</button>' : ""}<button data-action="migrate">Import earlier AUREXO drafts</button><label class="button">Restore backup<input id="restore" type="file" accept="application/json" hidden></label>${authenticated ? '<button data-action="sync">Load server projects</button>' : ""}</div>${projects.length ? projects.map((p) => card(p, selected === p.id)).join("") : '<section class="panel empty">No projects yet. Start with one idea.</section>'}`;
}
function review() {
  const items = projects.filter((p) => p.state === "review");
  return `<section class="intro"><h1>Ready for your review</h1><p>Approve the content plan after checking its facts, rights and audience suitability. Approval does not publish anything.</p></section>${items.length ? items.map((p) => `<section class="panel">${card(p, selected === p.id)}<form class="review-form" data-id="${esc(p.id)}">${["I checked factual claims and source notes.", "I checked originality, rights and audience suitability.", "I understand this approves a plan; final media still needs review."].map((t, i) => `<label class="check"><input type="checkbox" name="check${i}" required>${t}</label>`).join("")}<div class="actions"><button class="primary">Approve plan</button><button type="button" data-action="revision" data-id="${esc(p.id)}">Request revision</button></div></form></section>`).join("") : '<section class="panel empty">Nothing waiting. Generated plans appear here.</section>'}`;
}
function publish() {
  const items = projects.filter((p) => p.state === "approved");
  return `<section class="intro"><h1>Prepare to publish</h1><p>Export approved scripts and platform copy for your production tools.</p></section><section class="panel callout"><b>Publish with your approval</b><p>Render or upload your video, approve its final media, then queue it for a connected account. Jobs show a confirmed upload only after the platform returns its video ID. You can also export files for manual upload.</p><div class="actions"><a class="button" href="https://studio.youtube.com" target="_blank" rel="noopener">YouTube Studio ↗</a><a class="button" href="https://business.facebook.com" target="_blank" rel="noopener">Meta Business Suite ↗</a></div></section>${items.length ? items.map((p) => card(p, selected === p.id) + publishControls(p)).join("") : '<section class="panel empty">Approved plans will appear here.</section>'}`;
}
function integrations() {
  return `<section class="intro"><h1>Connect your tools</h1><p>Add your Gemini or OpenAI key when you are ready. A successful test activates that provider.</p></section><section class="panel"><h3>Secure backend</h3><form id="backend-form"><label>Backend URL<input name="url" type="url" required value="${esc(backend)}" placeholder="https://studio-api.example.com"></label><p class="hint">Use a backend on the same site as the app so secure sign-in cookies work.</p><button>Connect backend</button></form>${backend ? `<form id="login-form"><label>Owner password<input type="password" name="password" autocomplete="current-password" required minlength="16"></label><button ${authenticated ? "disabled" : ""}>${authenticated ? "Signed in" : "Sign in"}</button>${authenticated ? '<button type="button" data-action="logout">Sign out</button>' : ""}</form>` : ""}</section><div class="two">${[
    "gemini",
    "openai",
  ]
    .map((id) => {
      const status = providers.find((p) => p.id === id);
      return `<section class="panel"><div class="project-top"><h3>${id === "gemini" ? "Google Gemini" : "OpenAI"}</h3>${badge(status?.active ? "active" : "not connected")}</div><form class="provider-form" data-provider="${id}"><label>API key<input name="key" type="password" autocomplete="off" required placeholder="Enter key securely" minlength="10"></label><label>Model ID<input name="model" required maxlength="150" placeholder="Your provider’s model ID" value="${esc(status?.model || "")}"></label><label class="check"><input type="checkbox" name="usage" required>Allow a small API test using my provider quota</label><button class="primary" ${!authenticated || busy ? "disabled" : ""}>Save, test & activate</button>${status?.active ? `<button type="button" data-action="disconnect" data-provider="${id}">Disconnect</button>` : ""}</form><p class="hint">${status?.testedAt ? "Last tested " + esc(new Date(status.testedAt).toLocaleString()) : "Waiting for setup. No key is saved in this browser."}</p></section>`;
    })
    .join(
      "",
    )}</div>${socialSettings()}${growthPanel()}<section class="panel"><h3>Production connections</h3><p>Text planning: ${providers.some((p) => p.active) ? "provider active" : "awaiting API key"}. Local video rendering and uploads are available in each project. Connect social apps for publishing and performance sync. AI narration uses an active OpenAI account.</p></section>`;
}
function render() {
  root.innerHTML = `<div class="shell"><aside><a class="brand" href="#create"><i>A</i><div><b>AUREXO</b><small>CONTENT STUDIO</small></div></a><nav aria-label="Main navigation">${nav.map(([id, n]) => `<a href="#${id}" ${page === id ? 'aria-current="page"' : ""}>${n}${id === "review" && projects.some((p) => p.state === "review") ? ` <span>${projects.filter((p) => p.state === "review").length}</span>` : ""}</a>`).join("")}</nav><div class="foot">${authenticated ? "Backend signed in" : "Local drafts"}<small>${projects.length} projects</small></div></aside><main><header><span>Idea → Plan → Review → Produce</span><a href="#integrations">${providers.some((p) => p.active) ? "AI connected" : "Connect AI"}</a></header><div id="feedback" role="status" aria-live="polite">${message ? `<p class="error">${esc(message)}</p>` : ""}${notice ? `<p class="notice">${esc(notice)}</p>` : ""}</div>${({ create, projects: projectList, review, publish, integrations }[page] || create)()}<footer>Human approval stays in your hands.</footer></main></div>`;
  bind();
  const task = afterRenderTask;
  afterRenderTask = null;
  task?.();
}
async function action(fn) {
  if (busy) return;
  busy = true;
  message = "";
  notice = "";
  try {
    await fn();
  } catch (e) {
    message = e.message;
  } finally {
    busy = false;
    render();
  }
}
async function syncProviders() {
  providers = (await api("/api/integrations")).providers;
}
async function saveProjects() {
  persist();
  if (authenticated) {
    const result = await api("/api/projects", "PUT", {
      projects,
      revision: serverRevision,
    });
    applySnapshot(result);
  }
}
function applySnapshot(result) {
  if (result.projects) {
    const local = projects;
    projects = result.projects.map((p) => ({
      ...p,
      ...Object.fromEntries(
        Object.entries(local.find((l) => l.id === p.id) || {}).filter(([k]) =>
          k.startsWith("local"),
        ),
      ),
    }));
    persist();
  }
  if (result.revision !== undefined) {
    serverRevision = result.revision;
    localStorage.setItem("aurexo_revision_v3", JSON.stringify(serverRevision));
  }
}

function draft(form) {
  const f = new FormData(form);
  return {
    id: crypto.randomUUID(),
    title: String(f.get("topic") || "").trim(),
    mode: f.get("mode"),
    age: f.get("age"),
    notes: f.get("notes"),
    createdAt: new Date().toISOString(),
    state: "draft",
    audit: [],
  };
}
function bind() {
  const createForm = document.querySelector("#create-form");
  if (createForm) {
    createForm.onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(createForm);
      action(async () => {
        if (!f.get("usage"))
          throw Error("Confirm provider usage before generating.");
        const b = await api("/api/campaign/generate", "POST", {
          ...draft(createForm),
          topic: f.get("topic"),
          provider: f.get("provider"),
          allowUsage: true,
        });
        projects.unshift(b.project);
        serverRevision = b.revision;
        localStorage.setItem(
          "aurexo_revision_v3",
          JSON.stringify(serverRevision),
        );
        persist();
        page = "review";
        location.hash = "review";
        notice = "Content plan created. Facts and media still need review.";
      });
    };
    document.querySelector("#mode").onchange = (e) => {
      document.querySelector("#age-label").hidden = e.target.value !== "kids";
    };
  }
  document.querySelector("#backend-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const candidate = new FormData(e.target)
      .get("url")
      .trim()
      .replace(/\/$/, "");
    action(async () => {
      const u = new URL(candidate);
      if (
        u.protocol !== "https:" ||
        u.username ||
        u.password ||
        u.pathname !== "/" ||
        u.search ||
        u.hash
      )
        throw Error(
          "Use an HTTPS backend origin without a path or credentials.",
        );
      const r = await fetch(candidate + "/api/health", {
        signal: AbortSignal.timeout(10000),
      });
      const h = await r.json();
      if (!r.ok || h.version !== "2.0.0")
        throw Error("Connect the AUREXO Studio v2 backend.");
      backend = candidate;
      localStorage.setItem("aurexo_backend_v3", JSON.stringify(backend));
      authenticated = false;
      providers = [];
      notice = "Backend connected. Sign in to manage your integrations.";
    });
  });
  document.querySelector("#login-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const password = new FormData(e.target).get("password");
    action(async () => {
      await api("/api/session", "POST", { password });
      authenticated = true;
      await syncProviders();
      const remote = await api("/api/projects");
      serverRevision = remote.revision;
      if (projects.length)
        localStorage.setItem("aurexo_recovery_v3", JSON.stringify(projects));
      const saved = remote.projects;
      projects = [
        ...saved,
        ...projects.filter((p) => !saved.some((s) => s.id === p.id)),
      ];
      persist();
      notice = "Signed in. Keys can now be saved securely.";
    });
  });
  document.querySelectorAll(".provider-form").forEach(
    (form) =>
      (form.onsubmit = (e) => {
        e.preventDefault();
        const f = new FormData(form);
        const key = f.get("key");
        form.querySelector("[name=key]").value = "";
        action(async () => {
          await api("/api/integrations", "POST", {
            provider: form.dataset.provider,
            key,
            model: f.get("model"),
            allowUsage: Boolean(f.get("usage")),
          });
          await syncProviders();
          notice = "Connection tested and activated.";
        });
      }),
  );
  document.querySelectorAll(".review-form").forEach(
    (form) =>
      (form.onsubmit = (e) => {
        e.preventDefault();
        action(async () => {
          const p = projects.find((p) => p.id === form.dataset.id);
          if (!p?.plan) throw Error("No generated plan to approve.");
          if (!form.reportValidity())
            throw Error("Complete all plan-review checks.");
          p.state = "approved";
          p.audit.push({
            at: new Date().toISOString(),
            action: "Owner approved plan; final media not approved",
          });
          await saveProjects();
          notice = "Plan approved. Export it from Publish.";
        });
      }),
  );
  document.querySelector("#restore")?.addEventListener("change", (e) =>
    action(async () => {
      const file = e.target.files[0];
      if (!file || file.size > 500000)
        throw Error("Choose an AUREXO backup under 500 KB.");
      const data = JSON.parse(await file.text());
      if (
        !Array.isArray(data.projects) ||
        data.projects.length > 200 ||
        data.projects.some((p) => !validProject(p))
      )
        throw Error("Invalid backup.");
      if (!confirm("Replace local projects with this backup?")) return;
      projects = data.projects;
      persist();
      notice = "Backup restored locally. Server data was not replaced.";
    }),
  );
  document.querySelectorAll("[data-action]").forEach(
    (button) =>
      (button.onclick = () => {
        const a = button.dataset.action,
          id = button.dataset.id,
          p = projects.find((p) => p.id === id);
        if (a === "open") {
          selected = selected === id ? null : id;
          render();
          return;
        }
        if (a === "export") {
          download("aurexo-brief.json", JSON.stringify(p, null, 2));
          return;
        }
        if (a === "recovery") {
          download(
            "aurexo-recovery.json",
            JSON.stringify({
              version: 3,
              projects: read("aurexo_recovery_v3", []),
            }),
          );
          return;
        }
        if (a === "backup") {
          download(
            "aurexo-backup.json",
            JSON.stringify({ version: 3, projects }, null, 2),
          );
          return;
        }
        if (a === "cover") {
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#172f29"/><text x="80" y="120" fill="#d3ec9d" font-family="sans-serif" font-size="32">AUREXO</text><foreignObject x="80" y="220" width="1100" height="400"><div xmlns="http://www.w3.org/1999/xhtml" style="font:700 66px sans-serif;color:white;overflow-wrap:anywhere">${esc(p.title)}</div></foreignObject></svg>`;
          download("aurexo-cover.svg", svg, "image/svg+xml");
          return;
        }
        action(async () => {
          if (a === "migrate") {
            const old = read("aurexo_v2_state", {});
            const imported = migrateLegacy(old.campaigns, projects);
            projects = [...projects, ...imported];
            await saveProjects();
            notice =
              imported.length +
              " earlier drafts imported for review. Previous data remains untouched.";
          }
          if (a === "save-brief") {
            if (!createForm.reportValidity()) return;
            projects.unshift(draft(createForm));
            await saveProjects();
            notice = "Idea saved.";
            page = "projects";
            location.hash = page;
          }
          if (a === "logout") {
            await api("/api/session", "DELETE");
            authenticated = false;
            providers = [];
          }
          if (a === "disconnect") {
            await api("/api/integrations", "DELETE", {
              provider: button.dataset.provider,
            });
            await syncProviders();
            notice = "Provider disconnected.";
          }
          if (a === "sync") {
            const b = await api("/api/projects");
            if (
              projects.length &&
              !confirm("Replace local projects with server projects?")
            )
              return;
            applySnapshot(b);
            notice = "Server projects loaded.";
          }
          if (a === "delete") {
            if (!confirm("Delete this project?")) return;
            projects = projects.filter((x) => x.id !== id);
            await saveProjects();
          }
          if (a === "revision") {
            p.state = "draft";
            p.audit.push({
              at: new Date().toISOString(),
              action: "Owner requested revision",
            });
            await saveProjects();
            notice =
              "Moved to drafts. Open the project to edit its script and scenes.";
          }
        });
      }),
  );
  bindProduction({
    projects: () => projects,
    api,
    backend: () => backend,
    action,
    save: saveProjects,
    apply: applySnapshot,
    notify: (text) => {
      notice = text;
    },
    afterRender: (fn) => {
      afterRenderTask = fn;
    },
  });
}
addEventListener("hashchange", () => {
  page = location.hash.slice(1) || "create";
  message = "";
  notice = "";
  render();
});
render();
async function initializeBackend() {
  if (!backend) {
    try {
      const response = await fetch(new URL("/api/health", location.href), {
        signal: AbortSignal.timeout(5000),
      });
      const health = await response.json();
      if (health.service === "AUREXO Studio" && health.version === "2.0.0") {
        backend = location.origin;
        localStorage.setItem("aurexo_backend_v3", JSON.stringify(backend));
        render();
      }
    } catch {}
  }
  if (backend)
    api("/api/session")
      .then(async (s) => {
        authenticated = s.authenticated;
        if (authenticated) {
          await syncProviders();
          const snapshot = await api("/api/projects");
          if (snapshot.revision !== serverRevision) {
            if (projects.length)
              localStorage.setItem(
                "aurexo_recovery_v3",
                JSON.stringify(projects),
              );
            const onlyLocal = projects.filter(
              (p) => !snapshot.projects.some((remote) => remote.id === p.id),
            );
            applySnapshot({
              ...snapshot,
              projects: [...snapshot.projects, ...onlyLocal],
            });
            notice =
              "Server workspace refreshed. Earlier device drafts are available in the recovery backup.";
          }
        }
        render();
      })
      .catch(() => {});
}
initializeBackend();
