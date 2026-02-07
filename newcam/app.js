const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let audioMuted = false;
let nightMode = false;

// --- Tab switching ---

$$(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".tab-btn").forEach((b) => b.classList.remove("active"));
    $$(".tab-content").forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
    const tab = $("#tab-" + btn.dataset.tab);
    tab.classList.add("active");

    // Load data when switching to a settings tab
    if (btn.dataset.tab === "motion") loadMotion();
    if (btn.dataset.tab === "ftp") loadFtp();
  });
});

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

// --- Live View UI ---

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

// --- Motion Detection ---

let motionGrid = "1111111111111111111111111"; // 25 chars, 5x5
let motionLoaded = false;

function buildMotionGrid() {
  const container = $("#motion-grid");
  container.innerHTML = "";
  for (let i = 0; i < 25; i++) {
    const cell = document.createElement("div");
    cell.className = "motion-cell";
    if (motionGrid[i] === "1") cell.classList.add("active");
    cell.addEventListener("click", () => {
      const chars = motionGrid.split("");
      chars[i] = chars[i] === "1" ? "0" : "1";
      motionGrid = chars.join("");
      cell.classList.toggle("active");
    });
    container.appendChild(cell);
  }
}

function refreshSnapshot() {
  const img = $(".motion-snapshot");
  if (img) img.src = "/cam/image/jpeg.cgi?" + Date.now();
}

async function loadMotion() {
  if (motionLoaded) return;
  motionLoaded = true;
  try {
    const res = await fetch("/api/motion");
    const data = await res.json();

    $("#motion-enable").checked = data.MotionDetectionEnable === "1";
    $("#motion-sensitivity").value = data.MotionDetectionSensitivity || "50";
    $("#motion-sensitivity-val").textContent = data.MotionDetectionSensitivity || "50";
    $("#motion-schedule-mode").value = data.MotionDetectionScheduleMode || "0";

    if (data.MotionDetectionBlockSet) {
      motionGrid = data.MotionDetectionBlockSet;
    }

    // Schedule day bitmask
    const dayVal = parseInt(data.MotionDetectionScheduleDay || "0", 10);
    $$("#motion-schedule-opts .day-checkboxes input").forEach((cb) => {
      const bit = parseInt(cb.dataset.bit);
      cb.checked = (dayVal & (1 << bit)) !== 0;
    });

    $("#motion-time-start").value = data.MotionDetectionScheduleTimeStart || "00:00:00";
    $("#motion-time-stop").value = data.MotionDetectionScheduleTimeStop || "00:00:00";

    updateMotionScheduleVisibility();
    buildMotionGrid();
    refreshSnapshot();
  } catch (err) {
    console.error("Failed to load motion settings:", err);
    showStatus("#motion-status", "Failed to load", true);
  }
}

async function saveMotion() {
  const btn = $("#motion-save");
  btn.disabled = true;

  // Compute schedule day bitmask
  let dayVal = 0;
  $$("#motion-schedule-opts .day-checkboxes input").forEach((cb) => {
    if (cb.checked) dayVal |= 1 << parseInt(cb.dataset.bit);
  });

  const payload = {
    MotionDetectionEnable: $("#motion-enable").checked ? "1" : "0",
    MotionDetectionSensitivity: $("#motion-sensitivity").value,
    MotionDetectionScheduleMode: $("#motion-schedule-mode").value,
    MotionDetectionScheduleDay: dayVal.toString(),
    MotionDetectionScheduleTimeStart: $("#motion-time-start").value,
    MotionDetectionScheduleTimeStop: $("#motion-time-stop").value,
    MotionDetectionBlockSet: motionGrid,
  };

  try {
    const res = await fetch("/api/motion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (result.saved) {
      showStatus("#motion-status", "Saved");
      // Update grid from read-back
      if (result.current && result.current.MotionDetectionBlockSet) {
        motionGrid = result.current.MotionDetectionBlockSet;
        buildMotionGrid();
      }
    } else {
      showStatus("#motion-status", "Save failed", true);
    }
  } catch (err) {
    console.error("Failed to save motion settings:", err);
    showStatus("#motion-status", "Save failed", true);
  } finally {
    btn.disabled = false;
  }
}

function updateMotionScheduleVisibility() {
  const mode = $("#motion-schedule-mode").value;
  const opts = $("#motion-schedule-opts");
  if (mode === "1") opts.classList.remove("hidden");
  else opts.classList.add("hidden");
}

// --- FTP ---

let ftpLoaded = false;

async function loadFtp() {
  if (ftpLoaded) return;
  ftpLoaded = true;
  try {
    const res = await fetch("/api/ftp");
    const data = await res.json();

    $("#ftp-host").value = data.FTPHostAddress || "";
    $("#ftp-port").value = data.FTPPortNumber || "21";
    $("#ftp-user").value = data.FTPUserName || "";
    $("#ftp-pass").value = data.FTPPassword || "";
    $("#ftp-path").value = data.FTPDirectoryPath || "/";
    $("#ftp-passive").value = data.FTPPassiveMode || "1";

    // Image upload
    $("#ftp-image-enable").checked = data.FTPScheduleEnable === "1";
    $("#ftp-image-mode").value = data.FTPScheduleMode || "0";
    $("#ftp-image-filename").value = data.FTPScheduleBaseFileName || "DCS-5020L";
    $("#ftp-image-filemode").value = data.FTPScheduleFileMode || "1";

    // Image schedule days
    const imgDayVal = parseInt(data.FTPScheduleDay || "0", 10);
    $$("#ftp-image-days input").forEach((cb) => {
      const bit = parseInt(cb.dataset.bit);
      cb.checked = (imgDayVal & (1 << bit)) !== 0;
    });
    $("#ftp-image-time-start").value = data.FTPScheduleTimeStart || "00:00:00";
    $("#ftp-image-time-stop").value = data.FTPScheduleTimeStop || "00:00:00";

    // Video upload
    $("#ftp-video-enable").checked = data.FTPScheduleEnableVideo === "1";
    $("#ftp-video-mode").value = data.FTPScheduleModeVideo || "0";
    $("#ftp-video-filename").value = data.FTPScheduleBaseFileNameVideo || "DCS-5020L";
    $("#ftp-video-size").value = data.FTPScheduleVideoLimitSize || "2048";
    $("#ftp-video-time").value = data.FTPScheduleVideoLimitTime || "10";

    // Video schedule days
    const vidDayVal = parseInt(data.FTPScheduleDayVideo || "0", 10);
    $$("#ftp-video-days input").forEach((cb) => {
      const bit = parseInt(cb.dataset.bit);
      cb.checked = (vidDayVal & (1 << bit)) !== 0;
    });
    $("#ftp-video-time-start").value = data.FTPScheduleTimeStartVideo || "00:00:00";
    $("#ftp-video-time-stop").value = data.FTPScheduleTimeStopVideo || "00:00:00";



    // Auto-browse the configured FTP path
    browseFtp(data.FTPDirectoryPath || "/");
  } catch (err) {
    console.error("Failed to load FTP settings:", err);
    showStatus("#ftp-status", "Failed to load", true);
  }
}

async function saveFtp() {
  const btn = $("#ftp-save");
  btn.disabled = true;

  // Image schedule day bitmask
  let imgDayVal = 0;
  $$("#ftp-image-days input").forEach((cb) => {
    if (cb.checked) imgDayVal |= 1 << parseInt(cb.dataset.bit);
  });

  // Video schedule day bitmask
  let vidDayVal = 0;
  $$("#ftp-video-days input").forEach((cb) => {
    if (cb.checked) vidDayVal |= 1 << parseInt(cb.dataset.bit);
  });

  const payload = {
    FTPHostAddress: $("#ftp-host").value,
    FTPPortNumber: $("#ftp-port").value,
    FTPUserName: $("#ftp-user").value,
    FTPPassword: $("#ftp-pass").value,
    FTPDirectoryPath: $("#ftp-path").value,
    FTPPassiveMode: $("#ftp-passive").value,
    FTPScheduleEnable: $("#ftp-image-enable").checked ? "1" : "0",
    FTPScheduleMode: $("#ftp-image-mode").value,
    FTPScheduleDay: imgDayVal.toString(),
    FTPScheduleTimeStart: $("#ftp-image-time-start").value,
    FTPScheduleTimeStop: $("#ftp-image-time-stop").value,
    FTPScheduleBaseFileName: $("#ftp-image-filename").value,
    FTPScheduleFileMode: $("#ftp-image-filemode").value,
    FTPScheduleEnableVideo: $("#ftp-video-enable").checked ? "1" : "0",
    FTPScheduleModeVideo: $("#ftp-video-mode").value,
    FTPScheduleDayVideo: vidDayVal.toString(),
    FTPScheduleTimeStartVideo: $("#ftp-video-time-start").value,
    FTPScheduleTimeStopVideo: $("#ftp-video-time-stop").value,
    FTPScheduleBaseFileNameVideo: $("#ftp-video-filename").value,
    FTPScheduleVideoLimitSize: $("#ftp-video-size").value,
    FTPScheduleVideoLimitTime: $("#ftp-video-time").value,
  };

  try {
    const res = await fetch("/api/ftp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (result.saved) {
      showStatus("#ftp-status", "Saved");
    } else {
      showStatus("#ftp-status", "Save failed", true);
    }
  } catch (err) {
    console.error("Failed to save FTP settings:", err);
    showStatus("#ftp-status", "Save failed", true);
  } finally {
    btn.disabled = false;
  }
}

async function testFtp() {
  const btn = $("#ftp-test");
  btn.disabled = true;
  showStatus("#ftp-test-status", "Testing...");

  try {
    const res = await fetch("/api/ftp/test", { method: "POST" });
    const result = await res.json();
    if (result.tested) {
      showStatus("#ftp-test-status", "Test sent");
    } else {
      showStatus("#ftp-test-status", "Test failed", true);
    }
  } catch (err) {
    console.error("FTP test failed:", err);
    showStatus("#ftp-test-status", "Test failed", true);
  } finally {
    btn.disabled = false;
  }
}

async function writeTestFtp() {
  const btn = $("#ftp-write-test");
  btn.disabled = true;
  showStatus("#ftp-write-test-status", "Writing...");

  try {
    const res = await fetch("/api/ftp/write-test", { method: "POST" });
    const result = await res.json();
    if (result.ok) {
      showStatus("#ftp-write-test-status", "File written");
      // Refresh the file browser if it's been loaded
      if (ftpCurrentPath) browseFtp(ftpCurrentPath);
    } else {
      showStatus("#ftp-write-test-status", result.error || "Write failed", true);
    }
  } catch (err) {
    console.error("FTP write test failed:", err);
    showStatus("#ftp-write-test-status", "Write failed", true);
  } finally {
    btn.disabled = false;
  }
}

// --- FTP File Browser ---

let ftpCurrentPath = "/";

function formatFileSize(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function renderBreadcrumb(ftpPath) {
  const el = $("#ftp-breadcrumb");
  const parts = ftpPath.split("/").filter(Boolean);
  let html = '<span data-path="/">/</span>';
  let accumulated = "/";
  for (const part of parts) {
    accumulated += part + "/";
    html += ' <span data-path="' + accumulated + '">' + part + '</span> /';
  }
  el.innerHTML = html;
  el.querySelectorAll("span").forEach((span) => {
    span.addEventListener("click", () => browseFtp(span.dataset.path));
  });
}

function isImageFile(name) {
  return /\.(jpe?g|png|gif|bmp)$/i.test(name);
}

async function browseFtp(ftpPath) {
  ftpCurrentPath = ftpPath || "/";
  renderBreadcrumb(ftpCurrentPath);

  const list = $("#ftp-file-list");
  list.innerHTML = '<div class="ftp-loading">Loading...</div>';

  try {
    const res = await fetch("/api/ftp/files?path=" + encodeURIComponent(ftpCurrentPath));
    if (!res.ok) {
      const err = await res.json();
      list.innerHTML = '<div class="ftp-loading">Error: ' + (err.error || "Failed") + '</div>';
      return;
    }
    const entries = await res.json();
    list.innerHTML = "";

    // Add ".." entry to go up unless at root
    if (ftpCurrentPath !== "/") {
      const parentPath = ftpCurrentPath.replace(/\/[^/]+\/?$/, "/") || "/";
      const upEntry = document.createElement("div");
      upEntry.className = "ftp-file-entry";
      upEntry.innerHTML = '<div class="ftp-file-icon">&#x1F519;</div><div class="ftp-file-name">..</div>';
      upEntry.addEventListener("click", () => browseFtp(parentPath));
      list.appendChild(upEntry);
    }

    // Sort: directories first, then files
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
      const el = document.createElement("div");
      el.className = "ftp-file-entry";

      const entryPath = ftpCurrentPath.replace(/\/?$/, "/") + entry.name;

      if (entry.type === "dir") {
        el.innerHTML =
          '<div class="ftp-file-icon">&#x1F4C1;</div>' +
          '<div class="ftp-file-name">' + entry.name + '</div>';
        el.addEventListener("click", () => browseFtp(entryPath + "/"));
      } else if (isImageFile(entry.name)) {
        const downloadUrl = "/api/ftp/download?path=" + encodeURIComponent(entryPath);
        el.innerHTML =
          '<img class="ftp-thumbnail" src="' + downloadUrl + '" alt="' + entry.name + '" loading="lazy">' +
          '<div class="ftp-file-name">' + entry.name + '</div>' +
          '<div class="ftp-file-size">' + formatFileSize(entry.size) + '</div>' +
          '<a class="ftp-download-link" href="' + downloadUrl + '" download>Download</a>';
        el.style.cursor = "default";
        // Prevent card click from doing anything for images
        el.querySelector("a").addEventListener("click", (e) => e.stopPropagation());
      } else {
        const downloadUrl = "/api/ftp/download?path=" + encodeURIComponent(entryPath);
        el.innerHTML =
          '<div class="ftp-file-icon">&#x1F4C4;</div>' +
          '<div class="ftp-file-name">' + entry.name + '</div>' +
          '<div class="ftp-file-size">' + formatFileSize(entry.size) + '</div>' +
          '<a class="ftp-download-link" href="' + downloadUrl + '" download>Download</a>';
        el.querySelector("a").addEventListener("click", (e) => e.stopPropagation());
      }

      list.appendChild(el);
    }

    if (entries.length === 0 && ftpCurrentPath === "/") {
      list.innerHTML = '<div class="ftp-loading">No files found</div>';
    }
  } catch (err) {
    console.error("FTP browse error:", err);
    list.innerHTML = '<div class="ftp-loading">Error: ' + err.message + '</div>';
  }
}

// --- Helpers ---

function showStatus(selector, msg, isError) {
  const el = $(selector);
  el.textContent = msg;
  el.className = "status-msg" + (isError ? " error" : "");
  if (!isError) {
    setTimeout(() => { el.textContent = ""; }, 3000);
  }
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

// Motion events
$("#motion-sensitivity").addEventListener("input", (e) => {
  $("#motion-sensitivity-val").textContent = e.target.value;
});

$("#motion-schedule-mode").addEventListener("change", updateMotionScheduleVisibility);
$("#motion-save").addEventListener("click", saveMotion);

// FTP events
$("#ftp-save").addEventListener("click", saveFtp);
$("#ftp-test").addEventListener("click", testFtp);
$("#ftp-write-test").addEventListener("click", writeTestFtp);
$("#ftp-browse").addEventListener("click", () => browseFtp(ftpCurrentPath));
