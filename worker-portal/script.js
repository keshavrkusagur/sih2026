const CONFIG = {
  API_BASE_URL: "http://localhost:8000",
  USE_MOCK_STORAGE: false,
  STORAGE_KEY: "oilSifFieldReports",
};

/*Clock*/
function updateClock() {
  const el = document.getElementById("clock");
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleString(undefined, {
    weekday: "short", hour: "2-digit", minute: "2-digit",
  });
}
updateClock();
setInterval(updateClock, 30000);

/*Report type selector*/
let selectedType = null;
const typeButtons = document.querySelectorAll(".type-btn");
typeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    typeButtons.forEach((b) => b.setAttribute("aria-checked", "false"));
    btn.setAttribute("aria-checked", "true");
    selectedType = btn.dataset.value;
  });
});

/*Speech-to-text*/
const micBtn = document.getElementById("micBtn");
const micLabel = document.getElementById("micLabel");
const micStatus = document.getElementById("micStatus");
const descriptionInput = document.getElementById("descriptionInput");

const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isRecording = false;

if (SpeechRecognitionAPI) {
  recognition = new SpeechRecognitionAPI();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  let finalTranscript = "";

  recognition.addEventListener("start", () => {
    isRecording = true;
    finalTranscript = descriptionInput.value ? descriptionInput.value + " " : "";
    micBtn.classList.add("recording");
    micLabel.textContent = "Listening… tap to stop";
    micStatus.textContent = "";
  });

  recognition.addEventListener("result", (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript + " ";
      } else {
        interim += transcript;
      }
    }
    descriptionInput.value = (finalTranscript + interim).trim();
  });

  recognition.addEventListener("error", (event) => {
    micStatus.textContent = `Mic error: ${event.error}. You can type instead.`;
  });

  recognition.addEventListener("end", () => {
    isRecording = false;
    micBtn.classList.remove("recording");
    micLabel.textContent = "Tap to speak";
  });

  micBtn.addEventListener("click", () => {
    if (isRecording) {
      recognition.stop();
    } else {
      try {
        recognition.start();
      } catch (err) {
        micStatus.textContent = "Could not start microphone.";
      }
    }
  });
} else {
  micBtn.disabled = true;
  micLabel.textContent = "Voice input not supported here";
  micStatus.textContent = "Try Chrome, or type your report below.";
}

/*Toast*/
function showToast(message, isError = false) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.hidden = false;
  setTimeout(() => { toast.hidden = true; }, 3200);
}

/*Build payload*/
function buildReportPayload() {
  return {
    worker_id: document.getElementById("workerId").value.trim(),
    site: document.getElementById("siteSelect").value,
    activity: document.getElementById("activityInput").value.trim(),
    location: document.getElementById("locationInput").value.trim(),
    report_type: selectedType,
    description: descriptionInput.value.trim(),
    weather: document.getElementById("weatherSelect").value,
    equipment: document.getElementById("equipmentInput").value.trim(),
    ppe_compliant: document.getElementById("ppeCheckbox").checked ? 1 : 0,
    submitted_at: new Date().toISOString(),
    sif_potential: null,
    confidence: null,
    rule_tag: null,
    precursor_keywords: null,
    status: "pending",
  };
}

function validatePayload(payload) {
  if (!payload.site) return "Please select a site.";
  if (!payload.worker_id) return "Please enter your worker ID.";
  if (!payload.activity) return "Please describe the activity in progress.";
  if (!payload.report_type) return "Please select a report type.";
  if (!payload.description || payload.description.length < 5) return "Please describe what you saw.";
  return null;
}

/*Storage / API*/
function saveMock(payload) {
  const existing = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY) || "[]");
  payload.id = existing.length ? existing[existing.length - 1].id + 1 : 1;
  existing.push(payload);
  localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(existing));
  return Promise.resolve(payload);
}

async function submitReport(payload) {
  if (CONFIG.USE_MOCK_STORAGE) {
    return saveMock(payload);
  }
  const res = await fetch(`${CONFIG.API_BASE_URL}/api/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Server responded ${res.status}`);
  return res.json();
}

/*Recent reports list*/
function renderRecent() {
  const list = document.getElementById("recentList");
  const all = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY) || "[]");
  const mine = all.slice(-5).reverse();

  if (!mine.length) {
    list.innerHTML = `<li class="recent-empty">No reports submitted yet this session.</li>`;
    return;
  }

  list.innerHTML = mine.map((r) => `
    <li class="recent-item">
      <div class="recent-item__main">
        <span class="recent-item__type">${escapeHtml(r.report_type || "Report")}</span>
        <span class="recent-item__desc">${escapeHtml(r.description || "")}</span>
      </div>
      <span class="recent-item__status">${r.status === "pending" ? "Submitted" : escapeHtml(r.status)}</span>
    </li>
  `).join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/*Submit handler*/
document.getElementById("submitBtn").addEventListener("click", async () => {
  const payload = buildReportPayload();
  const error = validatePayload(payload);

  if (error) {
    showToast(error, true);
    return;
  }

  const submitBtn = document.getElementById("submitBtn");
  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting…";

  try {
    await submitReport(payload);
    showToast("Report submitted. Thank you for keeping the site safe.");
    resetForm();
    renderRecent();
  } catch (err) {
    console.error(err);
    showToast("Could not submit — check your connection and try again.", true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit report";
  }
});

function resetForm() {
  document.getElementById("activityInput").value = "";
  document.getElementById("locationInput").value = "";
  descriptionInput.value = "";
  document.getElementById("equipmentInput").value = "";
  document.getElementById("ppeCheckbox").checked = false;
  document.getElementById("weatherSelect").selectedIndex = 0;
  typeButtons.forEach((b) => b.setAttribute("aria-checked", "false"));
  selectedType = null;
}
renderRecent();
