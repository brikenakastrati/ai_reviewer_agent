const state = {
  repositories: [],
  activeReport: null,
  pollTimer: null,
};

const byId = (id) => document.getElementById(id);

function setDot(id, mode) {
  const dot = byId(id);
  dot.classList.remove("online", "warning");
  if (mode) dot.classList.add(mode);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: { ...(options.headers || {}), ...(options.body ? { "Content-Type": "application/json" } : {}) },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
  return body;
}

function showEmpty(title, message, action = "") {
  const container = byId("repo-state");
  container.replaceChildren();
  const heading = document.createElement("strong");
  heading.className = "empty-title";
  heading.textContent = title;
  const description = document.createElement("p");
  description.textContent = message;
  container.append(heading, description);
  if (action) {
    const hint = document.createElement("span");
    hint.className = "empty-action";
    hint.textContent = action;
    container.append(hint);
  }
  container.hidden = false;
}

function relativeDate(value) {
  if (!value) return "Updated date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Updated date unavailable";
  const days = Math.max(0, Math.floor((Date.now() - date.valueOf()) / 86_400_000));
  if (days === 0) return "Updated today";
  if (days === 1) return "Updated yesterday";
  if (days < 30) return `Updated ${days}d ago`;
  if (days < 365) return `Updated ${Math.floor(days / 30)}mo ago`;
  return `Updated ${Math.floor(days / 365)}y ago`;
}

function createRepositoryCard(repository) {
  const card = document.createElement("article");
  card.className = "repo-card";

  const top = document.createElement("div");
  top.className = "repo-top";
  const title = document.createElement("div");
  title.className = "repo-title";
  const avatar = document.createElement("span");
  avatar.className = "repo-avatar";
  avatar.textContent = (repository.owner || "?").slice(0, 2).toUpperCase();
  const titleText = document.createElement("div");
  const name = document.createElement("h3");
  name.textContent = repository.name || repository.fullName;
  name.title = repository.fullName;
  const owner = document.createElement("div");
  owner.className = "repo-owner";
  owner.textContent = repository.owner || "";
  titleText.append(name, owner);
  title.append(avatar, titleText);
  const visibility = document.createElement("span");
  visibility.className = `visibility${repository.private ? " private" : ""}`;
  visibility.textContent = repository.private ? "Private" : "Public";
  top.append(title, visibility);

  const description = document.createElement("p");
  description.className = "repo-description";
  description.textContent = repository.description || "No description provided.";

  const meta = document.createElement("div");
  meta.className = "repo-meta";
  if (repository.language) {
    const languageDot = document.createElement("span");
    languageDot.className = "language-dot";
    const language = document.createElement("span");
    language.textContent = repository.language;
    meta.append(languageDot, language);
  } else {
    const type = document.createElement("span");
    type.textContent = "Code";
    meta.append(type);
  }
  const updated = document.createElement("span");
  updated.className = "repo-updated";
  updated.textContent = relativeDate(repository.updatedAt);
  meta.append(updated);

  const bottom = document.createElement("div");
  bottom.className = "repo-bottom";
  const branch = document.createElement("span");
  branch.className = "branch-label";
  branch.textContent = `⑂ ${repository.defaultBranch || "main"}`;
  const review = document.createElement("button");
  review.className = "review-link";
  review.type = "button";
  review.textContent = "Review →";
  review.addEventListener("click", () => openReview(repository.fullName, repository.defaultBranch));
  bottom.append(branch, review);

  card.append(top, description, meta, bottom);
  return card;
}

function renderRepositories() {
  const query = byId("repo-search").value.trim().toLowerCase();
  const visible = state.repositories.filter((repository) =>
    `${repository.fullName} ${repository.description} ${repository.language || ""}`.toLowerCase().includes(query),
  );
  byId("repo-count").textContent = String(state.repositories.length);
  const grid = byId("repo-grid");
  grid.replaceChildren();
  for (const repository of visible) grid.append(createRepositoryCard(repository));

  const empty = byId("repo-state");
  if (visible.length) {
    empty.hidden = true;
  } else if (state.repositories.length) {
    showEmpty("No matches", "Try another repository name, language, or description.");
  } else {
    showEmpty(
      "No repositories to show",
      "No repositories were returned for this account. You can still review any repository you’re authorized to access.",
      "Paste its GitHub URL above to get started.",
    );
  }
}

function normalizeRepository(input) {
  const raw = input.trim();
  if (!raw) throw new Error("Enter a GitHub repository URL or owner/name.");
  if (/^https?:\/\//i.test(raw)) {
    let url;
    try {
      url = new URL(raw);
    } catch {
      throw new Error("That does not look like a valid GitHub URL.");
    }
    if (url.hostname.toLowerCase() !== "github.com") {
      throw new Error("For safety, repository URLs must use github.com.");
    }
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length < 2) throw new Error("Include both the repository owner and repository name.");
    return `${segments[0]}/${segments[1].replace(/\.git$/i, "")}`;
  }
  return raw.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
}

function openReview(fullName, defaultBranch = "") {
  byId("dialog-repo").value = fullName;
  byId("dialog-branch").value = "";
  byId("dialog-branch").placeholder = defaultBranch ? `Default: ${defaultBranch}` : "Default branch";
  byId("review-dialog").showModal();
}

function showResultDialog() {
  byId("result-title").textContent = "Preparing review…";
  byId("result-subtitle").textContent = "Pinning a commit and collecting repository evidence.";
  byId("review-loader").hidden = false;
  byId("result-error").hidden = true;
  byId("result-report").hidden = true;
  byId("result-actions").hidden = true;
  byId("result-report").replaceChildren();
  byId("result-dialog").showModal();
}

function addReportSection(parent, title, className = "") {
  const section = document.createElement("section");
  section.className = `report-section${className ? ` ${className}` : ""}`;
  const heading = document.createElement("h3");
  heading.textContent = title;
  section.append(heading);
  parent.append(section);
  return section;
}

function addTextList(parent, values, className = "") {
  if (!Array.isArray(values) || !values.length) return;
  const list = document.createElement("ul");
  if (className) list.className = className;
  for (const value of values) {
    if (typeof value !== "string" || !value) continue;
    const item = document.createElement("li");
    item.textContent = value;
    list.append(item);
  }
  if (list.childElementCount) parent.append(list);
}

function renderReport(report) {
  const container = byId("result-report");
  container.replaceChildren();
  if (!report || typeof report !== "object") return;

  const repository = report.repository || {};
  const status = report.status || "incomplete";
  const statusLabel = report.legacy ? "Archived · not revalidated" : status === "complete" ? "Assessment complete" : status === "partial" ? "Partial assessment" : status === "evidence_only" ? "Evidence only" : "Review incomplete";
  const intro = document.createElement("section");
  intro.className = `report-intro report-status-${status}`;
  const introTop = document.createElement("div");
  introTop.className = "report-intro-top";
  const repoName = document.createElement("h3");
  repoName.textContent = repository.full_name || "Project review";
  const badge = document.createElement("span");
  badge.className = "report-status-badge";
  badge.textContent = statusLabel;
  introTop.append(repoName, badge);
  const summary = document.createElement("p");
  summary.className = "report-summary";
  summary.textContent = report.summary || "No summary was provided.";
  const metadata = document.createElement("p");
  metadata.className = "report-metadata";
  const commit = repository.commit || "Commit unavailable";
  const captured = repository.captured_at ? new Date(repository.captured_at).toLocaleString() : "Capture time unavailable";
  metadata.textContent = `${repository.branch || "Branch unavailable"} · ${commit.slice(0, 12)} · ${captured}`;
  intro.append(introTop, summary, metadata);
  container.append(intro);

  const scoring = report.scoring;
  if (scoring) {
    const scoreSection = addReportSection(container, "Score", "score-section");
    const scoreHeader = document.createElement("div");
    scoreHeader.className = "score-header";
    const scoreValue = document.createElement("div");
    scoreValue.className = "score-value";
    scoreValue.textContent = String(scoring.normalized);
    const scoreDenominator = document.createElement("span");
    scoreDenominator.textContent = `/100 normalized · ${scoring.earned}/${scoring.possible} rubric points`;
    scoreValue.append(scoreDenominator);
    const confidence = document.createElement("span");
    confidence.className = `confidence confidence-${scoring.confidence || "low"}`;
    confidence.textContent = `${scoring.confidence || "low"} confidence`;
    scoreHeader.append(scoreValue, confidence);
    scoreSection.append(scoreHeader);

    const categories = document.createElement("div");
    categories.className = "score-categories";
    for (const category of scoring.categories || []) {
      const row = document.createElement("div");
      row.className = "score-category";
      const label = document.createElement("div");
      label.className = "score-category-label";
      const name = document.createElement("span");
      name.textContent = category.name;
      const value = document.createElement("span");
      value.textContent = category.status === "not_applicable" ? "N/A" : `${category.earned}/${category.possible}`;
      label.append(name, value);
      row.append(label);
      if (category.status !== "not_applicable") {
        const track = document.createElement("div");
        track.className = "score-track";
        const fill = document.createElement("span");
        fill.style.width = `${Math.max(0, Math.min(100, category.earned * 100 / category.possible))}%`;
        track.append(fill);
        row.append(track);
      }
      if (category.evidence) {
        const evidence = document.createElement("p");
        evidence.className = "score-evidence";
        evidence.textContent = category.evidence;
        row.append(evidence);
      }
      categories.append(row);
    }
    scoreSection.append(categories);
  }

  const panels = document.createElement("div");
  panels.className = "report-panels";
  if (Array.isArray(report.findings) && report.findings.length) {
    const section = addReportSection(panels, "Key findings", "findings-section");
    for (const finding of report.findings) {
      const card = document.createElement("article");
      card.className = `finding-card finding-${finding.severity || "info"}`;
      const title = document.createElement("h4");
      title.textContent = finding.title || "Finding";
      const severity = document.createElement("span");
      severity.className = "finding-severity";
      severity.textContent = finding.severity || "info";
      const header = document.createElement("div");
      header.className = "finding-header";
      header.append(title, severity);
      card.append(header);
      for (const [label, value] of [["Evidence", finding.evidence], ["Impact", finding.impact], ["Recommendation", finding.recommendation]]) {
        if (!value) continue;
        const detail = document.createElement("p");
        const prefix = document.createElement("strong");
        prefix.textContent = `${label}: `;
        detail.append(prefix, document.createTextNode(value));
        card.append(detail);
      }
      section.append(card);
    }
  }
  if (Array.isArray(report.strengths) && report.strengths.length) {
    const section = addReportSection(panels, "Strengths");
    addTextList(section, report.strengths, "report-list-items");
  }
  if (report.ai_ml) {
    const section = addReportSection(panels, "AI/ML methodology");
    const text = document.createElement("p");
    text.textContent = report.ai_ml;
    section.append(text);
  }
  if (report.similarity) {
    const section = addReportSection(panels, "Similarity");
    const label = document.createElement("span");
    label.className = "neutral-label";
    label.textContent = "Not assessed";
    const text = document.createElement("p");
    text.textContent = report.similarity.summary || "No comparison repositories were provided.";
    section.append(label, text);
  }
  if (Array.isArray(report.next_steps) && report.next_steps.length) {
    const section = addReportSection(panels, "Recommended next steps");
    addTextList(section, report.next_steps, "report-list-items");
  }
  if (panels.childElementCount) container.append(panels);

  const verification = report.verification || {};
  const evidence = document.createElement("div");
  evidence.className = "report-panels evidence-panels";
  const checks = addReportSection(evidence, "Verification");
  const tests = document.createElement("p");
  tests.textContent = verification.tests || "Tests not run.";
  checks.append(tests);
  const metrics = verification.scc || [];
  if (metrics.length) {
    const section = addReportSection(evidence, "Code statistics · scc");
    const note = document.createElement("p");
    note.className = "report-note";
    note.textContent = report.legacy ? "Archived counts; not revalidated or a quality score." : "Descriptive counts only; not a quality score.";
    section.append(note);
    const table = document.createElement("table");
    table.className = "evidence-table";
    const header = document.createElement("tr");
    for (const value of ["Language", "Files", "Lines", "Code"]) {
      const cell = document.createElement("th");
      cell.textContent = value;
      header.append(cell);
    }
    const head = document.createElement("thead");
    head.append(header);
    const body = document.createElement("tbody");
    for (const metric of metrics) {
      const row = document.createElement("tr");
      for (const value of [metric.language, metric.files, metric.lines, metric.code]) {
        const cell = document.createElement("td");
        cell.textContent = String(value ?? "—");
        row.append(cell);
      }
      body.append(row);
    }
    table.append(head, body);
    section.append(table);
  }
  const commits = verification.commits || [];
  if (commits.length) {
    const countLabel = commits.length > 5 ? `latest 5 of ${commits.length}` : String(commits.length);
    const section = addReportSection(evidence, `Recent commits · ${countLabel}`);
    const list = document.createElement("ul");
    list.className = "commit-list";
    for (const commitItem of commits.slice(0, 5)) {
      const item = document.createElement("li");
      const hash = document.createElement("code");
      hash.textContent = commitItem.sha || "";
      const message = document.createElement("span");
      message.textContent = commitItem.message || "No commit message";
      const date = document.createElement("time");
      date.textContent = commitItem.date ? new Date(commitItem.date).toLocaleDateString() : "";
      item.append(hash, message, date);
      list.append(item);
    }
    section.append(list);
  }
  if (evidence.childElementCount) container.append(evidence);

  if (Array.isArray(report.limitations) && report.limitations.length) {
    const section = addReportSection(container, "Limitations");
    section.classList.add("limitations-section");
    addTextList(section, report.limitations, "report-list-items");
  }
}

function finishResult(job) {
  byId("review-loader").hidden = true;
  if (job.status === "error") {
    byId("result-title").textContent = "Review could not be completed";
    byId("result-subtitle").textContent = "No report was saved for this request.";
    byId("result-error").textContent = job.error;
    byId("result-error").hidden = false;
    return;
  }
  state.activeReport = job.report || null;
  const status = state.activeReport?.status;
  byId("result-title").textContent = status === "complete" ? "Review complete" : status === "partial" ? "Review complete (partial score)" : status === "evidence_only" ? "Evidence report ready" : "Review incomplete";
  byId("result-subtitle").textContent = `${job.repository} · ${job.branch} · ${job.sha}`;
  renderReport(state.activeReport);
  byId("result-report").hidden = false;
  byId("result-actions").hidden = false;
  loadReports();
}

async function pollJob(jobId) {
  try {
    const job = await api(`/api/jobs/${encodeURIComponent(jobId)}`);
    if (job.status === "running") {
      state.pollTimer = window.setTimeout(() => pollJob(jobId), 1200);
    } else {
      finishResult(job);
    }
  } catch (error) {
    byId("review-loader").hidden = true;
    byId("result-title").textContent = "Could not retrieve review";
    byId("result-subtitle").textContent = "";
    byId("result-error").textContent = error.message;
    byId("result-error").hidden = false;
  }
}

async function submitReview(repository, branch = "") {
  showResultDialog();
  try {
    const response = await api("/api/reviews", {
      method: "POST",
      body: JSON.stringify({ repository, branch }),
    });
    pollJob(response.jobId);
  } catch (error) {
    byId("review-loader").hidden = true;
    byId("result-title").textContent = "Review could not be started";
    byId("result-subtitle").textContent = "";
    byId("result-error").textContent = error.message;
    byId("result-error").hidden = false;
  }
}

async function loadStatus() {
  try {
    const status = await api("/api/status");
    byId("github-status").textContent = status.githubMessage;
    byId("copilot-status").textContent = status.copilotMessage;
    byId("scc-status").textContent = status.scc ? "Ready for source statistics" : "Not installed";
    setDot("github-dot", status.githubAuthenticated ? "online" : "warning");
    setDot("copilot-dot", status.copilotCli ? "online" : "warning");
    setDot("scc-dot", status.scc ? "online" : "warning");
  } catch (error) {
    byId("github-status").textContent = error.message;
    setDot("github-dot", "warning");
  }
}

async function loadRepositories() {
  try {
    const response = await api("/api/repos");
    state.repositories = response.repositories || [];
    renderRepositories();
  } catch (error) {
    state.repositories = [];
    byId("repo-count").textContent = "0";
    showEmpty("GitHub connection needed", error.message, "Sign in with `gh auth login`, then refresh.");
  }
}

async function loadReports() {
  try {
    const response = await api("/api/reports");
    const container = byId("report-list");
    container.replaceChildren();
    if (!response.reports.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "Reports will appear here after a review.";
      container.append(empty);
      return;
    }
    for (const report of response.reports.slice(0, 5)) {
      const row = document.createElement("div");
      row.className = "saved-report";
      const link = document.createElement("button");
      link.className = "report-link";
      link.type = "button";
      link.textContent = report.name;
      link.title = report.name;
      link.addEventListener("click", () => openSavedReport(report.name));
      const date = document.createElement("span");
      date.className = "report-date";
      date.textContent = new Date(report.modified * 1000).toLocaleDateString();
      row.append(link, date);
      container.append(row);
    }
  } catch {
    // The dashboard remains usable if local report history is unavailable.
  }
}

async function openSavedReport(name) {
  showResultDialog();
  byId("review-loader").hidden = true;
  try {
    const response = await api(`/api/reports/${encodeURIComponent(name)}`);
    state.activeReport = response.report;
    byId("result-title").textContent = response.report?.legacy ? "Archived report" : "Saved report";
    byId("result-subtitle").textContent = response.report?.repository?.full_name || name;
    renderReport(response.report);
    byId("result-report").hidden = false;
    byId("result-actions").hidden = false;
  } catch (error) {
    byId("result-title").textContent = "Report unavailable";
    byId("result-error").textContent = error.message;
    byId("result-error").hidden = false;
  }
}

byId("quick-review").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    openReview(normalizeRepository(byId("repo-input").value));
  } catch (error) {
    showResultDialog();
    byId("review-loader").hidden = true;
    byId("result-title").textContent = "Check the repository";
    byId("result-error").textContent = error.message;
    byId("result-error").hidden = false;
  }
});

byId("review-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const repository = byId("dialog-repo").value;
  const branch = byId("dialog-branch").value.trim();
  byId("review-dialog").close();
  submitReview(repository, branch);
});

byId("repo-search").addEventListener("input", renderRepositories);
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function exportReport(report) {
  if (!report) return;
  const repository = report.repository || {};
  const scoring = report.scoring;
  const categories = scoring?.categories || [];
  const findings = report.findings || [];
  const metrics = report.verification?.scc || [];
  const commits = report.verification?.commits || [];
  const list = (items) => items?.length ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "";
  const categoryRows = categories.map((item) =>
    `<tr><td>${escapeHtml(item.name)}</td><td>${item.status === "not_applicable" ? "N/A" : `${escapeHtml(item.earned)}/${escapeHtml(item.possible)}`}</td><td>${escapeHtml(item.evidence)}</td></tr>`,
  ).join("");
  const findingCards = findings.map((item) =>
    `<article class="finding"><small>${escapeHtml(item.severity)}</small><h3>${escapeHtml(item.title)}</h3><p><b>Evidence</b> ${escapeHtml(item.evidence)}</p><p><b>Impact</b> ${escapeHtml(item.impact)}</p><p><b>Recommendation</b> ${escapeHtml(item.recommendation)}</p></article>`,
  ).join("");
  const metricRows = metrics.map((item) =>
    `<tr><td>${escapeHtml(item.language)}</td><td>${escapeHtml(item.files)}</td><td>${escapeHtml(item.lines)}</td><td>${escapeHtml(item.code)}</td></tr>`,
  ).join("");
  const commitRows = commits.slice(0, 5).map((item) =>
    `<li><code>${escapeHtml(item.sha)}</code> ${escapeHtml(item.message)} <small>${escapeHtml(item.date)}</small></li>`,
  ).join("");
  const html = `<!doctype html><html lang="sq"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Project review · ${escapeHtml(repository.full_name)}</title><style>
    body{max-width:920px;margin:40px auto;padding:0 24px;color:#172033;font:15px/1.6 system-ui,sans-serif}header,.card{padding:22px;margin:16px 0;border:1px solid #dce2ec;border-radius:14px}header{background:#f6faf9}h1{margin:0 0 8px;font-size:28px}h2{margin:0 0 12px;font-size:19px}.meta,small{color:#5e6879;font-size:12px}.score{font-size:34px;font-weight:750;color:#087c61}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}.finding{padding:14px;border-left:3px solid #be8b36;background:#faf8f1}.finding h3{margin:4px 0;font-size:16px}p{margin:8px 0}table{width:100%;border-collapse:collapse;text-align:left}th,td{padding:8px;border-bottom:1px solid #e5e9ef;font-size:13px}ul{padding-left:22px}code{font-size:12px}@media print{body{margin:0;max-width:none}}
    </style><body><header><p class="meta">${escapeHtml(repository.full_name)} · ${escapeHtml(repository.branch)} · ${escapeHtml(repository.commit)}</p><h1>Project review</h1><p>${escapeHtml(report.summary)}</p><p class="meta">${escapeHtml(report.status)} · Captured ${escapeHtml(repository.captured_at)}</p></header>
    ${scoring ? `<section class="card"><h2>Score</h2><div class="score">${escapeHtml(scoring.normalized)}/100 <small>normalized · ${escapeHtml(scoring.earned)}/${escapeHtml(scoring.possible)} rubric points · ${escapeHtml(scoring.confidence)} confidence</small></div><table><thead><tr><th>Category</th><th>Score</th><th>Evidence</th></tr></thead><tbody>${categoryRows}</tbody></table></section>` : ""}
    ${findingCards ? `<section class="card"><h2>Key findings</h2><div class="grid">${findingCards}</div></section>` : ""}
    ${report.strengths?.length ? `<section class="card"><h2>Strengths</h2>${list(report.strengths)}</section>` : ""}
    ${report.ai_ml ? `<section class="card"><h2>AI/ML methodology</h2><p>${escapeHtml(report.ai_ml)}</p></section>` : ""}
    <section class="card"><h2>Verification</h2><p>${escapeHtml(report.verification?.tests || "Tests not run.")}</p>${metricRows ? `<h3>Code statistics · scc</h3><table><thead><tr><th>Language</th><th>Files</th><th>Lines</th><th>Code</th></tr></thead><tbody>${metricRows}</tbody></table>` : ""}${commitRows ? `<h3>Recent commits</h3><ul>${commitRows}</ul>` : ""}</section>
    <section class="card"><h2>Similarity</h2><p>${escapeHtml(report.similarity?.summary)}</p></section>
    ${report.limitations?.length ? `<section class="card"><h2>Limitations</h2>${list(report.limitations)}</section>` : ""}
    ${report.next_steps?.length ? `<section class="card"><h2>Recommended next steps</h2>${list(report.next_steps)}</section>` : ""}
    </body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${(repository.full_name || "project-review").replace(/[^A-Za-z0-9_.-]+/g, "-")}-review.html`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

byId("download-report").addEventListener("click", () => {
  exportReport(state.activeReport);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    byId("repo-search").focus();
  }
});

loadStatus();
loadRepositories();
loadReports();
