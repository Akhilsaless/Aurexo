import { assembleScenes } from "../src/assemble.js";
const status = document.querySelector("#status");
async function clip(color, frequency) {
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 1280;
  const ctx = canvas.getContext("2d");
  const ac = new AudioContext();
  await ac.resume();
  const dst = ac.createMediaStreamDestination(),
    osc = ac.createOscillator(),
    gain = ac.createGain();
  gain.gain.value = 0.04;
  osc.frequency.value = frequency;
  osc.connect(gain);
  gain.connect(dst);
  osc.start();
  const stream = canvas.captureStream(25);
  stream.addTrack(dst.stream.getAudioTracks()[0]);
  const chunks = [],
    recorder = new MediaRecorder(stream, { mimeType: "video/mp4" });
  const result = new Promise((resolve) => {
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => resolve(new Blob(chunks, { type: "video/mp4" }));
  });
  recorder.start();
  let frame;
  const start = performance.now();
  function draw() {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 720, 1280);
    ctx.fillStyle = "white";
    ctx.font = "50px sans-serif";
    ctx.fillText(
      "AUREXO " + Math.floor((performance.now() - start) / 100),
      80,
      640,
    );
    frame = requestAnimationFrame(draw);
  }
  draw();
  await new Promise((r) => setTimeout(r, 2000));
  cancelAnimationFrame(frame);
  recorder.stop();
  const blob = await result;
  osc.stop();
  stream.getTracks().forEach((t) => t.stop());
  await ac.close();
  return blob;
}
document.querySelector("#run").onclick = async () => {
  try {
    status.textContent = "Creating test scenes…";
    const a = await clip("#164c50", 440),
      b = await clip("#71492e", 660);
    status.textContent = "Assembling production output…";
    const output = await assembleScenes([a, b]);
    const video = document.querySelector("#result");
    video.src = URL.createObjectURL(output.blob);
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = reject;
    });
    status.textContent = `PASS: ${output.blob.type}, ${output.blob.size} bytes, source duration ${output.duration.toFixed(2)}s, playable ${video.videoWidth}×${video.videoHeight}`;
  } catch (e) {
    status.textContent = "FAIL: " + e.message;
  }
};
