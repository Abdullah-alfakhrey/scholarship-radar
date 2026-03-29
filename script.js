const elements = {
  keywordFilter: document.getElementById("keywordFilter"),
  regionFilter: document.getElementById("regionFilter"),
  statusFilter: document.getElementById("statusFilter"),
  sourceFilter: document.getElementById("sourceFilter"),
  officialOnlyFilter: document.getElementById("officialOnlyFilter"),
  totalScholarships: document.getElementById("totalScholarships"),
  officialSources: document.getElementById("officialSources"),
  reviewCount: document.getElementById("reviewCount"),
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
    officialOnly: true,
  },
};

const actionNoteText =
  "Refresh data checks for the latest published feed. The crawler runs automatically every 12 hours via GitHub Actions.";

document.addEventListener("DOMContentLoaded", init);

async function init() {
  elements.officialOnlyFilter.checked = state.filters.officialOnly;
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
    state.items = Array.isArray(payload.items) ? payload.items.map(normalizeItem) : [];

    populateSelect(elements.regionFilter, uniqueValues(state.items.map((item) => item.region)));

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
    elements.searchActionNote.textContent = actionNoteText;
    return false;
  }
}

async function reloadDashboard(trigger) {
  const previousGeneratedAt = state.meta.generatedAt || "";
  const primaryButton =
    trigger === "search" ? elements.searchNowButton : elements.reloadFeedButton;
  const idleLabel = primaryButton.textContent;

  setReloadButtonsDisabled(true);
  primaryButton.textContent = trigger === "search" ? "Refreshing..." : "Reloading...";
  elements.statusText.textContent =
    trigger === "search"
      ? "Checking for the newest published scholarship data."
      : "Reloading the latest published scholarship feed.";

  try {
    const loaded = await loadScholarships({ force: true });

    if (!loaded) {
      elements.searchActionNote.textContent =
        "The dashboard could not reload the published feed right now. Try again in a moment.";
      return;
    }

    const generatedAtChanged =
      Boolean(previousGeneratedAt) && previousGeneratedAt !== state.meta.generatedAt;
    const refreshedAt = formatDate(state.meta.generatedAt);

    if (generatedAtChanged) {
      elements.searchActionNote.textContent = refreshedAt
        ? `A newer published feed was found from ${refreshedAt}.`
        : "A newer published feed was found.";
      return;
    }

    if (trigger === "search") {
      elements.searchActionNote.innerHTML =
        'No newer data yet. ' +
        '<a href="https://github.com/Abdullah-alfakhrey/scholarship-radar/actions" ' +
        'target="_blank" rel="noopener noreferrer" style="color:inherit;font-weight:700;">Run the crawler manually on GitHub →</a>';
    } else {
      elements.searchActionNote.textContent = "The latest published feed was reloaded.";
    }
  } finally {
    primaryButton.textContent = idleLabel;
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

    if (state.filters.source !== "all" && item.sourceType !== state.filters.source) {
      return false;
    }

    if (state.filters.officialOnly && item.sourceType !== "official") {
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

  return left.title.localeCompare(right.title);
}

function renderOverview() {
  const officialCount = state.filteredItems.filter((item) => item.sourceType === "official").length;
  const reviewCount = state.filteredItems.filter((item) => item.reviewNeeded).length;

  elements.totalScholarships.textContent = String(state.filteredItems.length);
  elements.officialSources.textContent = String(officialCount);
  elements.reviewCount.textContent = String(reviewCount);
  elements.lastUpdated.textContent = formatDate(state.meta.generatedAt) || "Not run yet";

  const totalMatches = state.filteredItems.length;
  const liveCount = Number(state.meta.liveCount || 0);
  const trackedCount = Number(state.meta.trackedCount || liveCount || 0);
  const openCount = Number(state.meta.openCount || 0);
  const closedCount = Number(state.meta.closedCount || 0);
  const rollingCount = Number(state.meta.rollingCount || 0);
  const provider = state.meta.provider || "Generated feed";
  const generatedText = formatDate(state.meta.generatedAt);

  elements.statusText.textContent =
    generatedText
      ? `Latest refresh came from ${provider} on ${generatedText}. Official pages are prioritized, but you should still check the source before applying.`
      : "The dashboard is ready, but the automated feed has not produced live scholarship data yet.";

  if (!elements.searchActionNote.textContent.trim()) {
    elements.searchActionNote.textContent = actionNoteText;
  }

  elements.resultsSummary.textContent =
    `${totalMatches} visible scholarship result${totalMatches === 1 ? "" : "s"}. ` +
    `${trackedCount} tracked in total, ${liveCount} rechecked in the latest crawl. ` +
    `${openCount} open, ${rollingCount} rolling, and ${closedCount} closed.`;
}

function renderStaleWarning() {
  if (!elements.staleDataWarning) {
    return;
  }

  const generatedAt = state.meta.generatedAt;

  if (!generatedAt) {
    elements.staleDataWarning.hidden = false;
    elements.staleDataWarning.textContent =
      "No scholarship data has been generated yet. Run the refresh pipeline or trigger the GitHub Actions workflow.";
    return;
  }

  const ageHours = (Date.now() - new Date(generatedAt).getTime()) / (1000 * 60 * 60);

  if (ageHours > 24) {
    const ageDays = Math.floor(ageHours / 24);
    elements.staleDataWarning.hidden = false;
    elements.staleDataWarning.innerHTML =
      `This data is ${ageDays} day${ageDays === 1 ? "" : "s"} old. ` +
      '<a href="https://github.com/Abdullah-alfakhrey/scholarship-radar/actions" ' +
      'target="_blank" rel="noopener noreferrer" style="color:inherit;font-weight:800;text-decoration:underline;">Run the crawler now on GitHub →</a>';
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

  state.filteredItems.forEach((item) => {
    elements.resultsGrid.appendChild(buildCard(item));
  });
}

function buildCard(item) {
  const article = document.createElement("article");
  article.className = "result-card";

  const head = document.createElement("div");
  head.className = "card-head";

  const titleWrap = document.createElement("div");
  titleWrap.className = "card-title-wrap";

  const title = document.createElement("h3");
  title.textContent = item.title;

  const meta = document.createElement("p");
  meta.className = "card-meta";
  meta.textContent = [item.institution, item.location].filter(Boolean).join(" | ");

  titleWrap.appendChild(title);
  titleWrap.appendChild(meta);

  const score = document.createElement("div");
  score.className = "score-pill";
  score.textContent = item.applicationStatus;

  head.appendChild(titleWrap);
  head.appendChild(score);

  const badges = document.createElement("div");
  badges.className = "card-badges";
  badges.appendChild(
    makeBadge(item.applicationStatus, `badge-status badge-${item.applicationStatusCode}`)
  );
  badges.appendChild(makeBadge(item.sourceType, `badge-${item.sourceType}`));

  if (item.reviewNeeded) {
    badges.appendChild(makeBadge("Review needed", "badge-review"));
  }

  const matchNote = document.createElement("p");
  matchNote.className = "match-note";
  matchNote.textContent =
    item.matchNote ||
    "This scholarship passed the current funding and Iraq-eligibility filters, but the source should still be checked before applying.";

  const facts = document.createElement("div");
  facts.className = "fact-grid";
  facts.appendChild(makeFactBox("Deadline", item.deadlineLabel));
  facts.appendChild(makeFactBox("Applications", item.applicationStatus));
  facts.appendChild(makeFactBox("Location", item.location));
  facts.appendChild(makeFactBox("Benefits", item.benefits));

  const summary = document.createElement("p");
  summary.className = "card-summary";
  summary.textContent =
    item.summary || "Automated scholarship match based on the current crawler rules.";

  const criteriaHeading = document.createElement("p");
  criteriaHeading.className = "section-kicker";
  criteriaHeading.textContent = "Criteria";

  const criteriaList = document.createElement("ul");
  criteriaList.className = "requirements";

  const criteriaItems = item.criteria.length ? item.criteria : item.requirements;

  if (criteriaItems.length) {
    criteriaItems.slice(0, 4).forEach((criteria) => {
      const listItem = document.createElement("li");
      listItem.textContent = criteria;
      criteriaList.appendChild(listItem);
    });
  } else {
    const listItem = document.createElement("li");
    listItem.textContent = "No clean criteria snippet was extracted from the source page.";
    criteriaList.appendChild(listItem);
  }

  const actions = document.createElement("div");
  actions.className = "card-actions";
  actions.appendChild(makeLink("Apply", item.applyUrl || item.url, "button-link button-primary"));
  actions.appendChild(makeLink("Source page", item.url, "button-link button-secondary"));

  article.appendChild(head);
  article.appendChild(badges);
  article.appendChild(matchNote);
  article.appendChild(facts);
  article.appendChild(summary);
  article.appendChild(criteriaHeading);
  article.appendChild(criteriaList);
  article.appendChild(actions);

  return article;
}

function makeBadge(label, className) {
  const badge = document.createElement("span");
  badge.className = `badge ${className}`.trim();
  badge.textContent = startCase(label);
  return badge;
}

function makeFactBox(label, value) {
  const box = document.createElement("dl");
  box.className = "fact-box";

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
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

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

function applicationStatusPriority(value) {
  if (value === "open") {
    return 0;
  }

  if (value === "rolling") {
    return 1;
  }

  if (value === "needs-review") {
    return 2;
  }

  if (value === "closed") {
    return 3;
  }

  return 4;
}
