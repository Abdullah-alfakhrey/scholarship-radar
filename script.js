/* Scholarship Radar — client dashboard (April 2026) */

const elements = {
  keywordFilter: document.getElementById("keywordFilter"),
  regionFilter: document.getElementById("regionFilter"),
  statusFilter: document.getElementById("statusFilter"),
  sourceFilter: document.getElementById("sourceFilter"),
  officialOnlyFilter: document.getElementById("officialOnlyFilter"),
  degreeToggle: document.querySelector(".degree-toggle"),
  totalScholarships: document.getElementById("totalScholarships"),
  mastersCount: document.getElementById("mastersCount"),
  phdCount: document.getElementById("phdCount"),
  officialSources: document.getElementById("officialSources"),
  lastUpdated: document.getElementById("lastUpdated"),
  statusText: document.getElementById("statusText"),
  searchNowButton: document.getElementById("searchNowButton"),
  reloadFeedButton: document.getElementById("reloadFeedButton"),
  searchActionNote: document.getElementById("searchActionNote"),
  staleDataWarning: document.getElementById("staleDataWarning"),
  dataNotice: document.getElementById("dataNotice"),
  resultsSummary: document.getElementById("resultsSummary"),
  resultsGrid: document.getElementById("resultsGrid"),
  emptyState: document.getElementById("emptyState"),
};

const state = {
  items: [],
  filteredItems: [],
  meta: {},
  filters: {
    keyword: "",
    region: "all",
    status: "all",
    source: "all",
    officialOnly: false,
    degree: "all",
  },
};

const ACTION_NOTE_DEFAULT =
  "The crawler runs automatically every 12 hours via GitHub Actions.";

const GITHUB_ACTIONS_URL =
  "https://github.com/Abdullah-alfakhrey/scholarship-radar/actions";

document.addEventListener("DOMContentLoaded", init);

async function init() {
  if (elements.officialOnlyFilter) {
    elements.officialOnlyFilter.checked = state.filters.officialOnly;
  }
  bindEvents();
  await loadScholarships();
}

function bindEvents() {
  elements.keywordFilter.addEventListener("input", (event) => {
    state.filters.keyword = event.target.value.trim().toLowerCase();
    applyFilters();
  });

  elements.regionFilter.addEventListener("change", (event) => {
    state.filters.region = event.target.value;
    applyFilters();
  });

  elements.statusFilter.addEventListener("change", (event) => {
    state.filters.status = event.target.value;
    applyFilters();
  });

  elements.sourceFilter.addEventListener("change", (event) => {
    state.filters.source = event.target.value;
    applyFilters();
  });

  elements.officialOnlyFilter.addEventListener("change", (event) => {
    state.filters.officialOnly = event.target.checked;
    applyFilters();
  });

  if (elements.degreeToggle) {
    elements.degreeToggle.addEventListener("click", (event) => {
      const chip = event.target.closest("[data-degree]");
      if (!chip) return;

      [...elements.degreeToggle.querySelectorAll("[data-degree]")].forEach(
        (node) => {
          node.classList.toggle("chip-active", node === chip);
          node.setAttribute("aria-selected", node === chip ? "true" : "false");
        }
      );
      state.filters.degree = chip.getAttribute("data-degree");
      applyFilters();
    });
  }

  elements.searchNowButton.addEventListener("click", () => {
    reloadDashboard("search");
  });

  elements.reloadFeedButton.addEventListener("click", () => {
    reloadDashboard("reload");
  });
}

async function loadScholarships({ force = false } = {}) {
  try {
    const requestUrl = force
      ? `./data/scholarships.json?refresh=${Date.now()}`
      : "./data/scholarships.json";
    const response = await fetch(requestUrl, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Dashboard feed returned ${response.status}`);
    }

    const payload = await response.json();
    state.meta = payload.meta || {};
    state.items = Array.isArray(payload.items)
      ? payload.items.map(normalizeItem)
      : [];

    populateSelect(
      elements.regionFilter,
      uniqueValues(state.items.map((item) => item.region))
    );

    renderNotice();
    renderStaleWarning();
    applyFilters();
    return true;
  } catch (error) {
    elements.statusText.textContent =
      "The scholarship feed could not be loaded. Check that the generated JSON file exists.";
    elements.resultsSummary.textContent = error.message;
    elements.emptyState.hidden = false;
    elements.dataNotice.hidden = false;
    elements.dataNotice.textContent =
      "Dashboard data is unavailable right now. Run the refresh script locally or through GitHub Actions.";
    elements.searchActionNote.textContent = ACTION_NOTE_DEFAULT;
    return false;
  }
}

async function reloadDashboard(trigger) {
  const previousGeneratedAt = state.meta.generatedAt || "";
  const primaryButton =
    trigger === "search" ? elements.searchNowButton : elements.reloadFeedButton;
  const primaryLabel = primaryButton.innerHTML;

  setReloadButtonsDisabled(true);
  primaryButton.innerHTML =
    trigger === "search" ? "Refreshing…" : "Reloading…";
  elements.statusText.textContent =
    trigger === "search"
      ? "Checking for the newest published scholarship data…"
      : "Reloading the latest published scholarship feed…";

  try {
    const loaded = await loadScholarships({ force: true });

    if (!loaded) {
      elements.searchActionNote.textContent =
        "The dashboard could not reload the published feed right now. Try again in a moment.";
      return;
    }

    const generatedAtChanged =
      Boolean(previousGeneratedAt) &&
      previousGeneratedAt !== state.meta.generatedAt;
    const refreshedAt = formatDate(state.meta.generatedAt);

    if (generatedAtChanged) {
      elements.searchActionNote.textContent = refreshedAt
        ? `A newer published feed was found — refreshed ${refreshedAt}.`
        : "A newer published feed was found.";
      return;
    }

    if (trigger === "search") {
      elements.searchActionNote.innerHTML =
        'No newer data yet. ' +
        `<a href="${GITHUB_ACTIONS_URL}" target="_blank" rel="noopener noreferrer">Trigger the crawler manually →</a>`;
    } else {
      elements.searchActionNote.textContent =
        "Latest published feed reloaded.";
    }
  } finally {
    primaryButton.innerHTML = primaryLabel;
    setReloadButtonsDisabled(false);
  }
}

function setReloadButtonsDisabled(disabled) {
  elements.searchNowButton.disabled = disabled;
  elements.reloadFeedButton.disabled = disabled;
}

function normalizeItem(item) {
  return {
    ...item,
    criteria: Array.isArray(item.criteria) ? item.criteria : [],
    requirements: Array.isArray(item.requirements) ? item.requirements : [],
    benefits: item.benefits || item.funding || "Benefits need review",
    location: item.location || item.region || "Location needs review",
    score: Number(item.score || 0),
    deadlineIso: item.deadlineIso || "",
    deadlineLabel: item.deadline || "Not found",
    applicationStatus: item.applicationStatus || "Check source",
    applicationStatusCode: item.applicationStatusCode || "needs-review",
    sourceType: item.sourceType || "directory",
    reviewNeeded: Boolean(item.reviewNeeded),
    degreeLevel: item.degreeLevel || "",
  };
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right)
  );
}

function populateSelect(select, values) {
  const currentValue = select.value;

  while (select.options.length > 1) {
    select.remove(1);
  }

  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });

  if ([...select.options].some((option) => option.value === currentValue)) {
    select.value = currentValue;
  }
}

function applyFilters() {
  const filtered = state.items.filter((item) => {
    if (state.filters.region !== "all" && item.region !== state.filters.region) {
      return false;
    }

    if (
      state.filters.status !== "all" &&
      item.applicationStatusCode !== state.filters.status
    ) {
      return false;
    }

    if (
      state.filters.source !== "all" &&
      item.sourceType !== state.filters.source
    ) {
      return false;
    }

    if (state.filters.officialOnly && item.sourceType !== "official") {
      return false;
    }

    if (
      state.filters.degree !== "all" &&
      !matchesDegree(item.degreeLevel, state.filters.degree)
    ) {
      return false;
    }

    if (!state.filters.keyword) {
      return true;
    }

    const searchable = [
      item.title,
      item.institution,
      item.location,
      item.summary,
      item.eligibility,
      item.benefits,
      item.region,
      item.applicationStatus,
      item.degreeLevel,
      ...(item.criteria || []),
      ...(item.requirements || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchable.includes(state.filters.keyword);
  });

  state.filteredItems = filtered.sort(sortScholarships);
  renderOverview();
  renderCards();
}

function matchesDegree(itemLevel, filterLevel) {
  const level = (itemLevel || "").toLowerCase();

  if (filterLevel === "Master's") {
    return level.includes("master");
  }
  if (filterLevel === "PhD") {
    return level.includes("phd") || level.includes("doctoral");
  }
  if (filterLevel === "Master's & PhD") {
    return (
      (level.includes("master") &&
        (level.includes("phd") || level.includes("doctoral"))) ||
      level.includes("master's & phd")
    );
  }
  return true;
}

function sortScholarships(left, right) {
  const leftStatus = applicationStatusPriority(left.applicationStatusCode);
  const rightStatus = applicationStatusPriority(right.applicationStatusCode);

  if (leftStatus !== rightStatus) {
    return leftStatus - rightStatus;
  }

  const leftDeadline = left.deadlineIso
    ? new Date(left.deadlineIso).getTime()
    : Number.POSITIVE_INFINITY;
  const rightDeadline = right.deadlineIso
    ? new Date(right.deadlineIso).getTime()
    : Number.POSITIVE_INFINITY;

  if (leftDeadline !== rightDeadline) {
    return leftDeadline - rightDeadline;
  }

  if (right.score !== left.score) {
    return right.score - left.score;
  }

  return (left.title || "").localeCompare(right.title || "");
}

function renderOverview() {
  const mastersOnly = state.filteredItems.filter((item) =>
    /master/i.test(item.degreeLevel || "")
  ).length;
  const phdOnly = state.filteredItems.filter((item) =>
    /phd|doctoral/i.test(item.degreeLevel || "")
  ).length;
  const officialCount = state.filteredItems.filter(
    (item) => item.sourceType === "official"
  ).length;

  if (elements.totalScholarships) {
    elements.totalScholarships.textContent = String(
      state.filteredItems.length
    );
  }
  if (elements.mastersCount) {
    elements.mastersCount.textContent = String(mastersOnly);
  }
  if (elements.phdCount) {
    elements.phdCount.textContent = String(phdOnly);
  }
  if (elements.officialSources) {
    elements.officialSources.textContent = String(officialCount);
  }
  if (elements.lastUpdated) {
    elements.lastUpdated.textContent =
      formatDate(state.meta.generatedAt) || "Not run yet";
  }

  const totalMatches = state.filteredItems.length;
  const liveCount = Number(state.meta.liveCount || 0);
  const trackedCount = Number(
    state.meta.trackedCount || liveCount || 0
  );
  const openCount = Number(state.meta.openCount || 0);
  const closedCount = Number(state.meta.closedCount || 0);
  const rollingCount = Number(state.meta.rollingCount || 0);
  const provider = state.meta.provider || "Generated feed";
  const generatedText = formatDate(state.meta.generatedAt);

  elements.statusText.textContent = generatedText
    ? `Latest refresh from ${provider} on ${generatedText}. Always verify the deadline on the source page before you apply.`
    : "The dashboard is ready, but the automated feed has not produced live scholarship data yet.";

  if (!elements.searchActionNote.textContent.trim()) {
    elements.searchActionNote.textContent = ACTION_NOTE_DEFAULT;
  }

  elements.resultsSummary.textContent =
    `${totalMatches} visible result${totalMatches === 1 ? "" : "s"}. ` +
    `${trackedCount} tracked · ${openCount} open · ${rollingCount} rolling · ${closedCount} closed.`;
}

function renderStaleWarning() {
  if (!elements.staleDataWarning) return;

  const generatedAt = state.meta.generatedAt;

  if (!generatedAt) {
    elements.staleDataWarning.hidden = false;
    elements.staleDataWarning.textContent =
      "No scholarship data has been generated yet. Run the refresh pipeline or trigger the GitHub Actions workflow.";
    return;
  }

  const ageHours =
    (Date.now() - new Date(generatedAt).getTime()) / (1000 * 60 * 60);

  if (ageHours > 24) {
    const ageDays = Math.floor(ageHours / 24);
    elements.staleDataWarning.hidden = false;
    elements.staleDataWarning.innerHTML =
      `Data is ${ageDays} day${ageDays === 1 ? "" : "s"} old. ` +
      `<a href="${GITHUB_ACTIONS_URL}" target="_blank" rel="noopener noreferrer">Trigger the crawler now →</a>`;
  } else {
    elements.staleDataWarning.hidden = true;
    elements.staleDataWarning.textContent = "";
  }
}

function renderNotice() {
  const notice = state.meta.notice;

  if (!notice) {
    elements.dataNotice.hidden = true;
    elements.dataNotice.textContent = "";
    return;
  }

  elements.dataNotice.hidden = false;
  elements.dataNotice.textContent = notice;
}

function renderCards() {
  elements.resultsGrid.innerHTML = "";

  if (!state.filteredItems.length) {
    elements.emptyState.hidden = false;
    return;
  }

  elements.emptyState.hidden = true;

  const fragment = document.createDocumentFragment();
  state.filteredItems.forEach((item) => {
    fragment.appendChild(buildCard(item));
  });
  elements.resultsGrid.appendChild(fragment);
}

function buildCard(item) {
  const article = document.createElement("article");
  article.className = "result-card";

  // Top line: status + degree + source type
  const topline = document.createElement("div");
  topline.className = "card-topline";

  topline.appendChild(
    makeBadge(
      item.applicationStatus,
      `badge-${item.applicationStatusCode}`
    )
  );

  if (item.degreeLevel) {
    topline.appendChild(
      makeBadge(item.degreeLevel, `badge-degree-${degreeClass(item.degreeLevel)}`)
    );
  }

  topline.appendChild(
    makeBadge(
      item.sourceType === "official"
        ? "Official source"
        : item.sourceType === "manual"
          ? "Curated"
          : "Directory",
      `badge-${item.sourceType}`
    )
  );

  if (item.reviewNeeded) {
    topline.appendChild(makeBadge("Verify on source", "badge-review"));
  }

  // Title & meta
  const title = document.createElement("h3");
  title.className = "card-title";
  title.textContent = item.title;

  const meta = document.createElement("p");
  meta.className = "card-meta";
  const parts = [item.institution, item.location].filter(Boolean);
  meta.innerHTML = parts
    .map((part, index) =>
      index < parts.length - 1
        ? `${escapeHtml(part)}<span class="dot">•</span>`
        : escapeHtml(part)
    )
    .join("");

  // Summary
  const summary = document.createElement("p");
  summary.className = "card-summary";
  summary.textContent =
    item.summary ||
    "Automated scholarship match based on the current crawler rules.";

  // Fact grid
  const facts = document.createElement("div");
  facts.className = "fact-grid";
  facts.appendChild(
    makeFactBox(
      "Deadline",
      item.deadlineLabel && item.deadlineLabel !== "Not found"
        ? item.deadlineLabel
        : "Check source",
      "fact-deadline"
    )
  );
  facts.appendChild(makeFactBox("Location", item.location));
  facts.appendChild(
    makeFactBox(
      "Benefits",
      truncate(item.benefits, 120) || "Benefits need review"
    )
  );
  facts.appendChild(
    makeFactBox(
      "Eligibility",
      truncate(item.eligibility, 120) ||
        "Eligibility needs manual confirmation on the source page."
    )
  );

  // Criteria list
  const criteriaItems = item.criteria.length ? item.criteria : item.requirements;
  let criteriaList = null;
  if (criteriaItems && criteriaItems.length) {
    criteriaList = document.createElement("ul");
    criteriaList.className = "criteria-list";
    criteriaItems.slice(0, 3).forEach((criteria) => {
      const listItem = document.createElement("li");
      listItem.textContent = criteria;
      criteriaList.appendChild(listItem);
    });
  }

  // Actions
  const actions = document.createElement("div");
  actions.className = "card-actions";
  actions.appendChild(
    makeLink("Apply ↗", item.applyUrl || item.url, "btn btn-primary")
  );
  actions.appendChild(makeLink("Source", item.url, "btn btn-ghost"));

  article.appendChild(topline);
  article.appendChild(title);
  article.appendChild(meta);
  article.appendChild(summary);
  article.appendChild(facts);
  if (criteriaList) article.appendChild(criteriaList);
  article.appendChild(actions);

  return article;
}

function degreeClass(level) {
  const lowered = (level || "").toLowerCase();
  if (lowered.includes("master") && (lowered.includes("phd") || lowered.includes("doctoral"))) {
    return "both";
  }
  if (lowered.includes("phd") || lowered.includes("doctoral")) {
    return "phd";
  }
  return "master";
}

function makeBadge(label, className) {
  const badge = document.createElement("span");
  badge.className = `badge ${className}`.trim();
  badge.textContent = startCase(label);
  return badge;
}

function makeFactBox(label, value, extraClass) {
  const box = document.createElement("dl");
  box.className = `fact-box${extraClass ? ` ${extraClass}` : ""}`;

  const title = document.createElement("dt");
  title.textContent = label;

  const body = document.createElement("dd");
  body.textContent = value;

  box.appendChild(title);
  box.appendChild(body);
  return box;
}

function makeLink(label, href, className) {
  const link = document.createElement("a");
  link.className = className;
  link.href = href;
  link.target = "_blank";
  link.rel = "noreferrer noopener";
  link.textContent = label;
  return link;
}

function formatDate(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function startCase(value) {
  return String(value)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function truncate(value, maxLength) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trimEnd() + "…";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function applicationStatusPriority(value) {
  if (value === "open") return 0;
  if (value === "rolling") return 1;
  if (value === "needs-review") return 2;
  if (value === "closed") return 3;
  return 4;
}
