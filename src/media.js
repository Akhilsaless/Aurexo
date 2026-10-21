export function captionCues(scenes, duration = 45) {
  const words = scenes.map((s) =>
    String(s.narration || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean),
  );
  const total = words.reduce((n, w) => n + w.length, 0) || 1;
  let cursor = 0;
  return words.flatMap((w, scene) => {
    const cues = [];
    for (let i = 0; i < w.length; i += 8) {
      const n = Math.min(8, w.length - i);
      const start = (cursor / total) * duration;
      cursor += n;
      cues.push({
        start,
        end: (cursor / total) * duration,
        text: w.slice(i, i + n).join(" "),
        scene,
      });
    }
    return cues;
  });
}
export function subtitles(cues) {
  const stamp = (t) => {
    const ms = Math.round(t * 1000);
    return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
  };
  return cues
    .map(
      (c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`,
    )
    .join("\n");
}
export function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let line = "";
  for (const word of String(text).split(/\s+/)) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}
export function drawFrame(ctx, p, t, duration, image) {
  const { width: w, height: h } = ctx.canvas,
    kids = p.mode === "kids",
    accent = kids ? "#f3b846" : "#c4e4a5";
  ctx.fillStyle = kids ? "#163f50" : "#17392d";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 5; i++) {
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = i % 2 ? accent : "#9bd1dd";
    ctx.beginPath();
    ctx.arc(
      w * (0.15 + i * 0.19) + Math.sin(t * 0.22 + i) * w * 0.05,
      h * (0.22 + i * 0.13),
      w * (0.15 + i * 0.015),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (image) {
    const scale = Math.max(w / image.width, (h * 0.48) / image.height);
    const iw = image.width * scale,
      ih = image.height * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, h * 0.15, w, h * 0.48);
    ctx.clip();
    ctx.drawImage(image, (w - iw) / 2, h * 0.15 + (h * 0.48 - ih) / 2, iw, ih);
    ctx.restore();
  }
  ctx.fillStyle = accent;
  ctx.font = `700 ${Math.round(w * 0.035)}px sans-serif`;
  ctx.fillText("AUREXO", w * 0.08, h * 0.065);
  ctx.font = `500 ${Math.round(w * 0.022)}px sans-serif`;
  ctx.fillText(
    kids ? "LEARN & WONDER" : "CLEAR IDEAS. NEW POSSIBILITIES.",
    w * 0.08,
    h * 0.095,
  );
  // Original Nova mascot, drawn locally; no celebrity likeness or licensed character.
  const cx = w * 0.5,
    cy = h * 0.36,
    r = w * 0.15;
  ctx.fillStyle = "#d6ebd0";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#143b31";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(cx + side * r * 0.35, cy - r * 0.08, r * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "#143b31";
  ctx.lineWidth = w * 0.009;
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.07, r * 0.35, 0.15, Math.PI - 0.15);
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(cx + r * 0.85, cy - r * 0.8, r * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = `700 ${Math.round(w * 0.058)}px sans-serif`;
  const title = wrapText(ctx, p.title, w * 0.82).slice(0, 3);
  title.forEach((line, i) =>
    ctx.fillText(line, w * 0.09, h * 0.55 + i * w * 0.075),
  );
  const cues = captionCues(p.plan.scenes, duration),
    cue = cues.find((c) => t >= c.start && t < c.end) || cues.at(-1);
  if (cue) {
    const lines = wrapText(ctx, cue.text, w * 0.78);
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.fillRect(
      w * 0.06,
      h * 0.79,
      w * 0.88,
      Math.max(h * 0.12, lines.length * w * 0.05 + w * 0.05),
    );
    ctx.fillStyle = "#fff";
    ctx.font = `500 ${Math.round(w * 0.043)}px sans-serif`;
    lines
      .slice(0, 4)
      .forEach((line, i) =>
        ctx.fillText(line, w * 0.11, h * 0.83 + i * w * 0.058),
      );
  }
  ctx.fillStyle = accent;
  ctx.fillRect(0, h - 8, w * Math.min(1, t / duration), 8);
}
async function db() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("aurexo-assets", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("blobs");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () =>
      reject(
        Error(
          "Local media storage unavailable. Download your files before leaving.",
        ),
      );
  });
}
export async function localMedia(id, kind, value) {
  const database = await db();
  try {
    return await new Promise((resolve, reject) => {
      const tx = database.transaction(
          "blobs",
          value === undefined ? "readonly" : "readwrite",
        ),
        store = tx.objectStore("blobs"),
        request =
          value === undefined
            ? store.get(id + ":" + kind)
            : store.put(value, id + ":" + kind);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}
export async function renderVideo(
  p,
  { audioBlob, imageBlob, onProgress = () => {}, signal, duration = 45 } = {},
) {
  if (!p.plan?.scenes?.length)
    throw Error("Add a scene plan before rendering.");
  if (typeof MediaRecorder === "undefined")
    throw Error(
      "This browser does not support video recording. Use a current desktop Chrome or Edge.",
    );
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 1280;
  const ctx = canvas.getContext("2d");
  if (!ctx || !canvas.captureStream)
    throw Error("Canvas recording is not supported.");
  let audioContext, source, audioDestination, image, stream, recorder, frame;
  try {
    if (imageBlob) image = await createImageBitmap(imageBlob);
    if (audioBlob) {
      audioContext = new AudioContext();
      await audioContext.resume();
      const decoded = await audioContext.decodeAudioData(
        await audioBlob.arrayBuffer(),
      );
      duration = decoded.duration;
      if (duration < 1 || duration > 180)
        throw Error("Use a narration track between 1 and 180 seconds.");
      source = audioContext.createBufferSource();
      source.buffer = decoded;
      audioDestination = audioContext.createMediaStreamDestination();
      source.connect(audioDestination);
    }
    drawFrame(ctx, p, 0, duration, image);
    stream = canvas.captureStream(25);
    if (audioDestination)
      stream.addTrack(audioDestination.stream.getAudioTracks()[0]);
    const mime = [
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ].find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) throw Error("No supported video encoder.");
    recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 2500000,
    });
    const chunks = [];
    return await new Promise((resolve, reject) => {
      let stopped = false;
      const stop = () => {
        if (stopped) return;
        stopped = true;
        cancelAnimationFrame(frame);
        if (recorder.state !== "inactive") recorder.stop();
      };
      const abort = () => {
        stop();
        reject(new DOMException("Render canceled", "AbortError"));
      };
      signal?.addEventListener("abort", abort, { once: true });
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onerror = () => {
        stop();
        reject(Error("Video encoder failed. Try a shorter narration."));
      };
      recorder.onstop = () => {
        signal?.removeEventListener("abort", abort);
        if (!signal?.aborted) {
          const blob = new Blob(chunks, { type: mime.split(";")[0] });
          if (blob.size < 100) reject(Error("Recording produced no video"));
          else
            resolve({
              blob,
              duration,
              cues: captionCues(p.plan.scenes, duration),
            });
        }
      };
      if (signal?.aborted) {
        abort();
        return;
      }
      recorder.start(1000);
      source?.start();
      const start = performance.now();
      const draw = () => {
        const elapsed = (performance.now() - start) / 1000;
        drawFrame(ctx, p, Math.min(elapsed, duration), duration, image);
        onProgress(Math.min(1, elapsed / duration));
        if (elapsed >= duration) stop();
        else frame = requestAnimationFrame(draw);
      };
      frame = requestAnimationFrame(draw);
    });
  } finally {
    cancelAnimationFrame(frame);
    if (recorder?.state === "recording") recorder.stop();
    stream?.getTracks().forEach((t) => t.stop());
    try {
      source?.stop();
    } catch {}
    if (audioContext) await audioContext.close();
    image?.close();
  }
}
