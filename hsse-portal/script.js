const CONFIG = {
  API_BASE_URL: "http://localhost:8000",
  USE_MOCK_DATA: false,
  STORAGE_KEY: "oilSifFieldReports",
};

const RULES = ["Energy Isolation", "Confined Space", "Hot Work", "Line of Fire", "Working at Height"];

const PRECURSOR_KEYWORDS = {
  "Energy Isolation": ["energy isolation", "lockout", "tagout", "isolation", "live circuit", "de-energ"],
  "Confined Space": ["confined space", "gas testing", "atmospheric", "ventilation", "manhole"],
  "Hot Work": ["hot work", "welding", "grinding", "spark", "flammable"],
  "Line of Fire": ["line of fire", "suspended load", "crane", "dropped object", "pinch point"],
  "Working at Height": ["scaffold", "height", "fall protection", "harness", "ladder"],
};

function mockClassify(text) {
  const lower = (text || "").toLowerCase();
  let bestRule = null;
  let hits = [];

  for (const [rule, keywords] of Object.entries(PRECURSOR_KEYWORDS)) {
    const matched = keywords.filter((k) => lower.includes(k));
    if (matched.length) {
      hits = hits.concat(matched);
      if (!bestRule || matched.length > 0) bestRule = rule;
    }
  }

  const sifPotential = hits.length > 0;
  const confidence = sifPotential
    ? Math.min(0.99, 0.62 + hits.length * 0.11 + Math.random() * 0.08)
    : Math.random() * 0.25;

  return {
    sif_potential: sifPotential,
    confidence: Number(confidence.toFixed(2)),
    rule_tag: sifPotential ? bestRule : null,
    precursor_keywords: hits,
  };
}

/*Sample data*/
const MOCK_REPORTS = [
  { id: 1, site: "Site A - Duliajan", activity: "Pipeline maintenance", report_type: "Unsafe Condition", description: "Worker entered confined space without gas testing being carried out first.", submitted_at: daysAgoIso(1), status: "pending" },
  { id: 2, site: "Site A - Duliajan", activity: "Electrical panel repair", report_type: "Unsafe Act", description: "Technician worked on panel without confirming energy isolation and lockout.", submitted_at: daysAgoIso(2), status: "pending" },
  { id: 3, site: "Site B - Digboi", activity: "Crane lift", report_type: "Near Miss", description: "A suspended load passed very close to a worker standing in the line of fire.", submitted_at: daysAgoIso(2), status: "pending" },
  { id: 4, site: "Site C - Numaligarh", activity: "Housekeeping", report_type: "Unsafe Condition", description: "Worker forgot to wear safety shoes near the storage yard.", submitted_at: daysAgoIso(3), status: "pending" },
  { id: 5, site: "Site A - Duliajan", activity: "Welding on tank", report_type: "Unsafe Act", description: "Hot work performed near flammable vapors without a gas test or fire watch.", submitted_at: daysAgoIso(3), status: "pending" },
  { id: 6, site: "Site D - Moran", activity: "Scaffold erection", report_type: "Near Miss", description: "Worker on scaffold at height without a harness clipped to fall protection.", submitted_at: daysAgoIso(4), status: "pending" },
  { id: 7, site: "Site B - Digboi", activity: "Vehicle movement", report_type: "Unsafe Condition", description: "Reversing truck had no working alarm; site is generally busy with pedestrians.", submitted_at: daysAgoIso(5), status: "pending" },
  { id: 8, site: "Site A - Duliajan", activity: "Confined space cleaning", report_type: "Incident", description: "Worker felt dizzy inside a tank; atmospheric testing had not been completed beforehand.", submitted_at: daysAgoIso(5), status: "pending" },
];

function daysAgoIso(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

/*Data loading*/
let allReports = [];
let filteredReports = [];

async function loadReports() {
  if (CONFIG.USE_MOCK_DATA) {
    let stored = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY) || "null");
    if (!stored || !stored.length) {
      stored = MOCK_REPORTS;
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(stored));
    }
     
    let changed = false;
    stored = stored.map((r) => {
      if (r.sif_potential === null || r.sif_potential === undefined) {
        changed = true;
        return { ...r, ...mockClassify(r.description), status: r.status === "pending" ? "processed" : r.status };
      }
      return r;
    });
    if (changed) localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(stored));

    document.getElementById("connStatus").textContent = "● Demo data (mock)";
    return stored;
  }

  //Backend call
  const res = await fetch(`${CONFIG.API_BASE_URL}/api/reports`);
  if (!res.ok) throw new Error(`Server responded ${res.status}`);
  document.getElementById("connStatus").textContent = "● Live backend";
  document.getElementById("connStatus").classList.add("live");
  return res.json();
}

async function markReviewed(id) {
  if (CONFIG.USE_MOCK_DATA) {
    const stored = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY) || "[]");
    const updated = stored.map((r) => (r.id === id ? { ...r, status: "reviewed" } : r));
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(updated));
    return;
  }
  await fetch(`${CONFIG.API_BASE_URL}/api/reports/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "reviewed" }),
  });
}

/*Filters*/
function populateFilterOptions() {
  const sites = [...new Set(allReports.map((r) => r.site).filter(Boolean))].sort();
  const siteSelect = document.getElementById("siteFilter");
  siteSelect.innerHTML = `<option value="">All sites</option>` +
    sites.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");

  const ruleSelect = document.getElementById("ruleFilter");
  ruleSelect.innerHTML = `<option value="">All rules</option>` +
    RULES.map((r) => `<option value="${r}">${r}</option>`).join("");
}

function applyFilters() {
  const site = document.getElementById("siteFilter").value;
  const rule = document.getElementById("ruleFilter").value;
  const status = document.getElementById("statusFilter").value;
  const search = document.getElementById("searchFilter").value.trim().toLowerCase();

  filteredReports = allReports.filter((r) => {
    if (site && r.site !== site) return false;
    if (rule && r.rule_tag !== rule) return false;
    if (status === "sif" && !r.sif_potential) return false;
    if (status === "non-sif" && r.sif_potential) return false;
    if (search && !(r.description || "").toLowerCase().includes(search)) return false;
    return true;
  });

  renderAll();
}

document.getElementById("siteFilter").addEventListener("change", applyFilters);
document.getElementById("ruleFilter").addEventListener("change", applyFilters);
document.getElementById("statusFilter").addEventListener("change", applyFilters);
document.getElementById("searchFilter").addEventListener("input", debounce(applyFilters, 200));
document.getElementById("clearFilters").addEventListener("click", () => {
  document.getElementById("siteFilter").value = "";
  document.getElementById("ruleFilter").value = "";
  document.getElementById("statusFilter").value = "";
  document.getElementById("searchFilter").value = "";
  applyFilters();
});
document.getElementById("refreshBtn").addEventListener("click", init);

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/*Rendering*/
function renderAll() {
  renderStats();
  renderDensityChart();
  renderTable();
}

function renderStats() {
  const total = filteredReports.length;
  const sifCount = filteredReports.filter((r) => r.sif_potential).length;
  const sifReports = filteredReports.filter((r) => r.sif_potential);
  const avgConf = sifReports.length
    ? (sifReports.reduce((sum, r) => sum + (r.confidence || 0), 0) / sifReports.length) * 100
    : 0;

  const bySite = densityBySite(filteredReports);
  const topSite = bySite[0] ? bySite[0].site.split(" - ")[0] : "–";

  document.getElementById("reportCount").textContent = `${total} report${total === 1 ? "" : "s"} in view`;
  document.getElementById("statTotal").textContent = total;
  document.getElementById("statSif").textContent = sifCount;
  document.getElementById("statConfidence").textContent = sifReports.length ? `${avgConf.toFixed(0)}%` : "–";
  document.getElementById("statTopSite").textContent = topSite;
}

function densityBySite(reports) {
  const counts = {};
  const sifCounts = {};
  reports.forEach((r) => {
    counts[r.site] = (counts[r.site] || 0) + 1;
    if (r.sif_potential) sifCounts[r.site] = (sifCounts[r.site] || 0) + 1;
  });
  return Object.keys(counts)
    .map((site) => ({
      site,
      total: counts[site],
      sif: sifCounts[site] || 0,
      density: (sifCounts[site] || 0) / counts[site],
    }))
    .sort((a, b) => b.density - a.density);
}

function renderDensityChart() {
  const container = document.getElementById("densityChart");
  const data = densityBySite(filteredReports);

  if (!data.length) {
    container.innerHTML = `<p class="muted">No reports match the current filters.</p>`;
    return;
  }

  const maxDensity = Math.max(...data.map((d) => d.density), 0.01);

  container.innerHTML = data.map((d) => {
    const pct = (d.density / maxDensity) * 100;
    const fillClass = d.density >= 0.6 ? "high" : d.density >= 0.3 ? "med" : "";
    return `
      <div class="density-row">
        <span class="density-row__label">${escapeHtml(d.site.split(" - ")[0])}</span>
        <div class="density-row__track"><div class="density-row__fill ${fillClass}" style="width:${pct}%"></div></div>
        <span class="density-row__value">${d.sif}/${d.total}</span>
      </div>
    `;
  }).join("");
}

function renderTable() {
  const tbody = document.getElementById("reportTableBody");

  if (!filteredReports.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="muted">No reports match the current filters.</td></tr>`;
    return;
  }

  const sorted = [...filteredReports].sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));

  tbody.innerHTML = sorted.map((r) => `
    <tr>
      <td class="mono">#${r.id}</td>
      <td>${formatDate(r.submitted_at)}</td>
      <td>${escapeHtml((r.site || "").split(" - ")[0])}</td>
      <td>${escapeHtml(r.activity || "—")}</td>
      <td>${escapeHtml(r.report_type || "—")}</td>
      <td>${r.sif_potential
        ? `<span class="pill pill--sif">SIF potential</span>`
        : `<span class="pill pill--nonsif">Non-SIF</span>`}</td>
      <td>${r.rule_tag ? `<span class="pill pill--rule">${escapeHtml(r.rule_tag)}</span>` : `<span class="pill pill--none">—</span>`}</td>
      <td class="mono">${r.confidence != null ? Math.round(r.confidence * 100) + "%" : "—"}</td>
      <td><button type="button" class="view-btn" data-id="${r.id}">View</button></td>
    </tr>
  `).join("");

  tbody.querySelectorAll(".view-btn").forEach((btn) => {
    btn.addEventListener("click", () => openModal(Number(btn.dataset.id)));
  });
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " +
         d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

/*Modal*/
let activeReportId = null;

function openModal(id) {
  const report = allReports.find((r) => r.id === id);
  if (!report) return;
  activeReportId = id;

  document.getElementById("modalTitle").textContent = `Report #${report.id} — ${report.site || ""}`;

  const keywordsHtml = (report.precursor_keywords || []).length
    ? report.precursor_keywords.map((k) => `<span class="keyword-tag">${escapeHtml(k)}</span>`).join("")
    : `<span class="muted">None detected</span>`;

  document.getElementById("modalBody").innerHTML = `
    <dl>
      <dt>Report text</dt>
      <dd>${escapeHtml(report.description)}</dd>

      <dt>Activity / Location</dt>
      <dd>${escapeHtml(report.activity || "—")}</dd>

      <dt>SIF classification</dt>
      <dd>${report.sif_potential
        ? `<span class="pill pill--sif">SIF potential</span> — ${Math.round((report.confidence || 0) * 100)}% confidence`
        : `<span class="pill pill--nonsif">Non-SIF</span>`}</dd>

      <dt>Life-Saving Rule</dt>
      <dd>${report.rule_tag ? escapeHtml(report.rule_tag) : "Not applicable"}</dd>

      <dt>Detected precursor keywords</dt>
      <dd>${keywordsHtml}</dd>

      <dt>Status</dt>
      <dd>${escapeHtml(report.status)}</dd>
    </dl>
  `;

  const reviewBtn = document.getElementById("markReviewedBtn");
  reviewBtn.disabled = report.status === "reviewed";
  reviewBtn.textContent = report.status === "reviewed" ? "Already reviewed" : "Mark as reviewed";

  document.getElementById("modalOverlay").hidden = false;
}

document.getElementById("modalClose").addEventListener("click", closeModal);
document.getElementById("modalOverlay").addEventListener("click", (e) => {
  if (e.target.id === "modalOverlay") closeModal();
});

function closeModal() {
  document.getElementById("modalOverlay").hidden = true;
  activeReportId = null;
}

document.getElementById("markReviewedBtn").addEventListener("click", async () => {
  if (activeReportId == null) return;
  await markReviewed(activeReportId);
  closeModal();
  init();
});

/*Init*/
async function init() {
  try {
    allReports = await loadReports();
    populateFilterOptions();
    filteredReports = allReports;
    renderAll();
  } catch (err) {
    console.error(err);
    document.getElementById("reportTableBody").innerHTML =
      `<tr><td colspan="9" class="muted">Could not load reports. Is the backend running?</td></tr>`;
  }
}

init();
