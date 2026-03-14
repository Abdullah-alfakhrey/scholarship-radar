const elements = {
  keywordFilter: document.getElementById("keywordFilter"),
  regionFilter: document.getElementById("regionFilter"),
  fieldFilter: document.getElementById("fieldFilter"),
  sourceFilter: document.getElementById("sourceFilter"),
  officialOnlyFilter: document.getElementById("officialOnlyFilter"),
  totalScholarships: document.getElementById("totalScholarships"),
  officialSources: document.getElementById("officialSources"),
  reviewCount: document.getElementById("reviewCount"),
  lastUpdated: document.getElementById("lastUpdated"),
  statusText: document.getElementById("statusText"),
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
    field: "all",
    source: "all",
    officialOnly: false,
  },
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
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

  elements.fieldFilter.addEventListener("change", (event) => {
    state.filters.field = event.target.value;
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
}

async function loadScholarships() {
  try {
    const response = await fetch("./data/scholarships.json", { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Dashboard feed returned ${response.status}`);
    }

    const payload = await response.json();
    state.meta = payload.meta || {};
    state.items = Array.isArray(payload.items) ? payload.items.map(normalizeItem) : [];

    populateSelect(elements.regionFilter, uniqueValues(state.items.map((item) => item.region)));
    populateSelect(
      elements.fieldFilter,
      uniqueValues(state.items.flatMap((item) => item.topics || []))
    );

    renderNotice();
    applyFilters();
  } catch (error) {
    elements.statusText.textContent =
      "The scholarship feed could not be loaded. Check that the generated JSON file exists.";
    elements.resultsSummary.textContent = error.message;
    elements.emptyState.hidden = false;
    elements.dataNotice.hidden = false;
    elements.dataNotice.textContent =
      "Dashboard data is unavailable right now. Run the refresh script locally or through GitHub Actions.";
  }
}

function normalizeItem(item) {
  return {
    ...item,
    topics: Array.isArray(item.topics) ? item.topics : [],
    requirements: Array.isArray(item.requirements) ? item.requirements : [],
    score: Number(item.score || 0),
    deadlineIso: item.deadlineIso || "",
    deadlineLabel: item.deadline || "Not found",
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
      state.filters.field !== "all" &&
      !item.topics.some((topic) => topic === state.filters.field)
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
      item.summary,
      item.eligibility,
      item.funding,
      item.region,
      ...(item.topics || []),
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
  const leftDeadline = left.deadlineIso ? new Date(left.deadlineIso).getTime() : Number.POSITIVE_INFINITY;
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
  const provider = state.meta.provider || "Generated feed";
  const generatedText = formatDate(state.meta.generatedAt);

  elements.statusText.textContent =
    generatedText
      ? `Latest refresh came from ${provider} on ${generatedText}. Manual review is still important before applying.`
      : "The dashboard is ready, but the automated feed has not produced live scholarship data yet.";

  elements.resultsSummary.textContent =
    `${totalMatches} visible result${totalMatches === 1 ? "" : "s"} from ${liveCount} automated ` +
    `match${liveCount === 1 ? "" : "es"}. Scheduled to refresh every 12 hours.`;
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
  meta.textContent = [item.institution, item.region].filter(Boolean).join(" | ");

  titleWrap.appendChild(title);
  titleWrap.appendChild(meta);

  const score = document.createElement("div");
  score.className = "score-pill";
  score.textContent = `Score ${item.score}`;

  head.appendChild(titleWrap);
  head.appendChild(score);

  const badges = document.createElement("div");
  badges.className = "card-badges";
  badges.appendChild(makeBadge(item.sourceType, `badge-${item.sourceType}`));

  if (item.reviewNeeded) {
    badges.appendChild(makeBadge("Review needed", "badge-review"));
  }

  const topicRow = document.createElement("div");
  topicRow.className = "topic-row";
  item.topics.slice(0, 4).forEach((topic) => {
    topicRow.appendChild(makeChip(topic));
  });

  const facts = document.createElement("div");
  facts.className = "fact-grid";
  facts.appendChild(makeFactBox("Deadline", item.deadlineLabel));
  facts.appendChild(makeFactBox("Funding", item.funding || "Funding details not extracted"));
  facts.appendChild(makeFactBox("Eligibility", item.eligibility || "Eligibility details need review"));
  facts.appendChild(makeFactBox("Apply link", item.applyUrl === item.url ? "Source page doubles as the application route" : "Separate application link found"));

  const summary = document.createElement("p");
  summary.className = "card-summary";
  summary.textContent =
    item.summary || "Automated match based on scholarship page content and the configured rules.";

  const requirementsHeading = document.createElement("p");
  requirementsHeading.className = "section-kicker";
  requirementsHeading.textContent = "Basic requirements";

  const requirementsList = document.createElement("ul");
  requirementsList.className = "requirements";

  if (item.requirements.length) {
    item.requirements.slice(0, 3).forEach((requirement) => {
      const listItem = document.createElement("li");
      listItem.textContent = requirement;
      requirementsList.appendChild(listItem);
    });
  } else {
    const listItem = document.createElement("li");
    listItem.textContent = "No clean requirement snippet was extracted from the source page.";
    requirementsList.appendChild(listItem);
  }

  const actions = document.createElement("div");
  actions.className = "card-actions";
  actions.appendChild(makeLink("Apply", item.applyUrl || item.url, "button-link button-primary"));
  actions.appendChild(makeLink("Source page", item.url, "button-link button-secondary"));

  article.appendChild(head);
  article.appendChild(badges);
  article.appendChild(topicRow);
  article.appendChild(facts);
  article.appendChild(summary);
  article.appendChild(requirementsHeading);
  article.appendChild(requirementsList);
  article.appendChild(actions);

  return article;
}

function makeBadge(label, className) {
  const badge = document.createElement("span");
  badge.className = `badge ${className}`.trim();
  badge.textContent = startCase(label);
  return badge;
}

function makeChip(label) {
  const chip = document.createElement("span");
  chip.className = "topic-chip";
  chip.textContent = label;
  return chip;
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
