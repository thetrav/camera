const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let audioMuted = false;
let nightMode = false;

// --- Camera API (all requests proxied through /cam/) ---

async function ptz(direction) {
  await fetch("/cam/setControlPanTilt", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `PanSingleMoveDegree=5&TiltSingleMoveDegree=5&PanTiltSingleMove=${direction}`,
  });
}

async function setAudioMute(muted) {
  await fetch("/cam/setControlAudio", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `AudioMute=${muted ? 1 : 0}`,
  });
}

async function setNightMode(on) {
  await fetch("/cam/setControlDayNight", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `IRLed=${on ? 1 : 0}`,
  });
}

// --- UI ---

function updateToggles() {
  const audioBtn = $("#audio-toggle");
  const nightBtn = $("#night-toggle");

  audioBtn.classList.toggle("active", audioMuted);
  audioBtn.querySelector(".toggle-state").textContent = audioMuted ? "Muted" : "Unmuted";

  nightBtn.classList.toggle("active", nightMode);
  nightBtn.querySelector(".toggle-state").textContent = nightMode ? "On" : "Off";
}

function takeSnapshot() {
  const feed = $("#video-feed");
  const canvas = document.createElement("canvas");
  canvas.width = feed.naturalWidth || 640;
  canvas.height = feed.naturalHeight || 480;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(feed, 0, 0, canvas.width, canvas.height);

  const link = document.createElement("a");
  link.download = `snapshot-${Date.now()}.jpg`;
  link.href = canvas.toDataURL("image/jpeg", 0.95);
  link.click();
}

// --- Event listeners ---

const feed = $("#video-feed");
const overlay = $("#video-overlay");

feed.onload = () => overlay.classList.add("hidden");
feed.onerror = () => {
  overlay.classList.remove("hidden");
  overlay.textContent = "Video stream failed";
};

$$(".ptz-btn").forEach((btn) => {
  btn.addEventListener("click", () => ptz(btn.dataset.dir));
});

$("#audio-toggle").addEventListener("click", async () => {
  audioMuted = !audioMuted;
  updateToggles();
  await setAudioMute(audioMuted);
});

$("#night-toggle").addEventListener("click", async () => {
  nightMode = !nightMode;
  updateToggles();
  await setNightMode(nightMode);
});

$("#snapshot-btn").addEventListener("click", takeSnapshot);
