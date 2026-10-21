// Assemble generated MP4 scenes in order using the browser encoder, retaining their audio.
export async function assembleScenes(
  blobs,
  { signal, onProgress = () => {} } = {},
) {
  if (!blobs.length || blobs.length > 20)
    throw Error("Choose 1–20 scene clips");
  if (typeof MediaRecorder === "undefined")
    throw Error("Use desktop Chrome or Edge for assembly");
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 1280;
  const ctx = canvas.getContext("2d"),
    audio = new AudioContext(),
    urls = [],
    videos = [],
    nodes = [];
  let stream, recorder, frame, stopRecording;
  const aborted = () => {
    throw new DOMException("Assembly canceled", "AbortError");
  };
  try {
    await audio.resume();
    const destination = audio.createMediaStreamDestination();
    for (const blob of blobs) {
      const video = document.createElement("video");
      video.playsInline = true;
      video.preload = "auto";
      const url = URL.createObjectURL(blob);
      urls.push(url);
      video.src = url;
      videos.push(video);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(Error("Scene could not load")),
          15000,
        );
        video.onloadedmetadata = () => {
          clearTimeout(timer);
          resolve();
        };
        video.onerror = () => {
          clearTimeout(timer);
          reject(Error("Scene could not decode"));
        };
      });
      if (
        !Number.isFinite(video.duration) ||
        video.duration <= 0 ||
        video.duration > 30
      )
        throw Error("Each generated scene must be 1–30 seconds");
      const node = audio.createMediaElementSource(video);
      node.connect(destination);
      nodes.push(node);
    }
    const total = videos.reduce((n, v) => n + v.duration, 0);
    const mime = ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm"].find(
      (m) => MediaRecorder.isTypeSupported(m),
    );
    if (!mime) throw Error("No browser video encoder available");
    ctx.fillStyle = "#163f50";
    ctx.fillRect(0, 0, 720, 1280);
    stream = canvas.captureStream(25);
    stream.addTrack(destination.stream.getAudioTracks()[0]);
    recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 2500000,
    });
    const chunks = [];
    const recorded = new Promise((resolve, reject) => {
      stopRecording = () => {
        if (recorder.state !== "inactive") recorder.stop();
      };
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onerror = () => reject(Error("Assembly encoder failed"));
      recorder.onstop = () =>
        resolve(new Blob(chunks, { type: mime.split(";")[0] }));
    });
    // Avoid an unhandled rejection if playback fails before awaiting the recording.
    recorded.catch(() => {});
    recorder.start(1000);
    let elapsed = 0;
    for (const video of videos) {
      if (signal?.aborted) aborted();
      await video.play();
      await new Promise((resolve, reject) => {
        const abort = () => {
          cleanup();
          reject(new DOMException("Assembly canceled", "AbortError"));
        };
        const cleanup = () => {
          cancelAnimationFrame(frame);
          clearTimeout(timer);
          signal?.removeEventListener("abort", abort);
        };
        const timer = setTimeout(
          () => {
            cleanup();
            reject(Error("Scene playback stalled"));
          },
          (video.duration + 20) * 1000,
        );
        signal?.addEventListener("abort", abort, { once: true });
        video.onended = () => {
          cleanup();
          resolve();
        };
        video.onerror = () => {
          cleanup();
          reject(Error("Scene playback failed"));
        };
        const draw = () => {
          ctx.drawImage(video, 0, 0, 720, 1280);
          onProgress(Math.min(1, (elapsed + video.currentTime) / total));
          frame = requestAnimationFrame(draw);
        };
        draw();
      });
      elapsed += video.duration;
    }
    stopRecording();
    const blob = await recorded;
    if (signal?.aborted) aborted();
    if (blob.size < 100) throw Error("Assembly produced no video");
    return { blob, duration: total };
  } finally {
    cancelAnimationFrame(frame);
    stopRecording?.();
    for (const video of videos) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    for (const node of nodes) node.disconnect();
    for (const track of stream?.getTracks() || []) track.stop();
    await audio.close();
    for (const url of urls) URL.revokeObjectURL(url);
  }
}
