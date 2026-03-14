const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const fetch = require("node-fetch");
const cheerio = require("cheerio");
const {
  APPLY_LINK_PATTERNS,
  DEADLINE_PATTERNS,
  EXCLUDED_DOMAINS,
  EXCLUDED_EXTENSIONS,
  FIELD_PATTERNS,
  FUNDING_PATTERNS,
  IRAQ_PATTERNS,
  MASTERS_PATTERNS,
  OPEN_INTERNATIONAL_PATTERNS,
  REGION_CONFIG,
  REQUIREMENT_PATTERNS,
  SEARCH_SETTINGS,
  STIPEND_PATTERNS,
  TOPIC_GROUPS,
  USER_AGENT,
} = require("./config");

const ROOT_DIR = path.resolve(__dirname, "..");
const OUTPUT_PATH = path.join(ROOT_DIR, "data", "scholarships.json");
const MANUAL_PATH = path.join(ROOT_DIR, "data", "manual-curation.json");

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const manual = await readJson(MANUAL_PATH, {
    include: [],
    excludeUrls: [],
    excludeDomains: [],
  });
  const previous = await readJson(OUTPUT_PATH, null);
  const queries = buildQueries();
  const provider = process.env.BRAVE_SEARCH_API_KEY ? "Brave Search API" : "Not configured";

  if (!process.env.BRAVE_SEARCH_API_KEY) {
    const emptyPayload = buildPayload({
      items: normalizeManualItems(manual.include),
      liveCount: 0,
      provider,
      notice:
        "No search API key is configured. Add BRAVE_SEARCH_API_KEY to generate live scholarship data.",
      runMode: "empty",
      stats: {
        totalQueries: queries.length,
        failedQueries: 0,
        fetchedPages: 0,
        candidatesSeen: 0,
      },
    });

    await writeJson(OUTPUT_PATH, emptyPayload);
    console.log("No BRAVE_SEARCH_API_KEY found. Wrote empty dashboard feed.");
    return;
  }

  const queryStats = {
    totalQueries: queries.length,
    failedQueries: 0,
    fetchedPages: 0,
    candidatesSeen: 0,
  };

  const searchResults = [];

  for (const query of queries) {
    try {
      const results = await searchBrave(query);
      searchResults.push(...results);
    } catch (error) {
      queryStats.failedQueries += 1;
      console.warn(`Search failed for query "${query}": ${error.message}`);
    }

    await sleep(300);
  }

  const dedupedResults = dedupeBy(searchResults, (item) => normalizeUrl(item.url)).filter(
    (item) => shouldFetchUrl(item.url, manual)
  );

  queryStats.candidatesSeen = dedupedResults.length;

  const extractedItems = [];

  for (const result of dedupedResults.slice(0, SEARCH_SETTINGS.maxPages)) {
    try {
      const html = await fetchHtml(result.url);
      queryStats.fetchedPages += 1;
      const scholarship = extractScholarship(result, html);

      if (scholarship && !isExcludedScholarship(scholarship, manual)) {
        extractedItems.push(scholarship);
      }
    } catch (error) {
      console.warn(`Fetch failed for ${result.url}: ${error.message}`);
    }

    await sleep(250);
  }

  const liveItems = dedupeBy(extractedItems, (item) => `${normalizeText(item.title)}::${normalizeText(item.institution)}`)
    .sort(sortScholarships);
  const manualItems = normalizeManualItems(manual.include);
  const mergedItems = dedupeBy([...manualItems, ...liveItems], (item) => item.id).sort(sortScholarships);

  if (!mergedItems.length && previous && Array.isArray(previous.items) && previous.items.length) {
    console.warn("No fresh scholarships were extracted. Keeping the previous dataset.");
    return;
  }

  const notice = buildNotice({
    liveItems,
    failedQueries: queryStats.failedQueries,
    manualCount: manualItems.length,
  });

  const payload = buildPayload({
    items: mergedItems,
    liveCount: liveItems.length,
    provider,
    notice,
    runMode: "live",
    stats: queryStats,
  });

  await writeJson(OUTPUT_PATH, payload);
  console.log(`Wrote ${mergedItems.length} scholarships to ${OUTPUT_PATH}`);
}

function buildQueries() {
  const queries = [];

  for (const region of REGION_CONFIG) {
    for (const topic of TOPIC_GROUPS) {
      const regionQuery = region.searchTerms.map(quoteTerm).join(" OR ");
      const topicQuery = topic.searchTerms.map(quoteTerm).join(" OR ");
      queries.push(
        `"fully funded master's scholarship" stipend (${topicQuery}) (${regionQuery}) ("international students" OR Iraq)`
      );
    }
  }

  return queries;
}

function quoteTerm(value) {
  return `"${value}"`;
}

async function searchBrave(query) {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(SEARCH_SETTINGS.resultCount));
  url.searchParams.set("search_lang", "en");
  url.searchParams.set("spellcheck", "0");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
      "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY,
    },
    timeout: 15000,
  });

  if (!response.ok) {
    throw new Error(`Brave API returned ${response.status}`);
  }

  const payload = await response.json();
  const results = payload.web && Array.isArray(payload.web.results) ? payload.web.results : [];

  return results.map((result) => ({
    title: cleanText(result.title),
    description: cleanText(result.description),
    url: normalizeUrl(result.url),
  }));
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
    timeout: 15000,
  });

  if (!response.ok) {
    throw new Error(`Source page returned ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    throw new Error(`Unsupported content type: ${contentType}`);
  }

  return response.text();
}

function extractScholarship(searchResult, html) {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg").remove();

  const title = cleanTitle(
    $('meta[property="og:title"]').attr("content") ||
      $("h1").first().text() ||
      $("title").first().text() ||
      searchResult.title
  );
  const metaDescription = cleanText(
    $('meta[name="description"]').attr("content") ||
      $('meta[property="og:description"]').attr("content") ||
      searchResult.description
  );
  const siteName = cleanText(
    $('meta[property="og:site_name"]').attr("content") ||
      $('meta[name="application-name"]').attr("content")
  );
  const bodyText = cleanText($("body").text()).slice(0, 50000);

  if (!bodyText || bodyText.length < 300) {
    return null;
  }

  const combinedText = [title, metaDescription, bodyText].join(" ");
  const topicTags = extractTopics(combinedText);
  const region = detectRegion(combinedText, searchResult.url);
  const deadline = extractDeadline(bodyText);
  const eligibility = extractEligibility(bodyText);
  const funding = extractFunding(bodyText, metaDescription);
  const requirements = extractRequirements(bodyText);
  const applyUrl = extractApplyUrl($, searchResult.url);
  const sourceType = classifySource(searchResult.url);
  const institution = inferInstitution(title, siteName, searchResult.url);

  const signals = {
    masters: hasMastersSignal(combinedText),
    funded: matchesAny(combinedText, FUNDING_PATTERNS),
    stipend: matchesAny(combinedText, STIPEND_PATTERNS),
    iraqEligible: eligibility.isMatch,
    region: Boolean(region),
    topics: topicTags.length > 0,
  };

  const score = scoreSignals(signals, sourceType, deadline.iso);

  if (!passesFilters(signals, score)) {
    return null;
  }

  return {
    id: createId(searchResult.url, title),
    title,
    institution,
    region: region ? region.label : "Unclear",
    url: searchResult.url,
    applyUrl,
    deadline: deadline.label || "Not found",
    deadlineIso: deadline.iso || "",
    funding: funding || "Funding signal found, but a clean stipend summary still needs review.",
    requirements,
    eligibility:
      eligibility.text ||
      "Source page suggests international eligibility, but Iraq should be checked manually.",
    topics: topicTags,
    summary:
      metaDescription ||
      "Automated match found from scholarship page content and the configured relevance rules.",
    sourceType,
    reviewNeeded:
      !deadline.iso ||
      requirements.length === 0 ||
      sourceType !== "official" ||
      !eligibility.text ||
      !funding,
    score,
  };
}

function hasMastersSignal(text) {
  return matchesAny(text, MASTERS_PATTERNS);
}

function scoreSignals(signals, sourceType, hasDeadline) {
  let score = 0;

  if (signals.masters) score += 3;
  if (signals.funded) score += 3;
  if (signals.stipend) score += 3;
  if (signals.iraqEligible) score += 3;
  if (signals.region) score += 2;
  if (signals.topics) score += 2;
  if (sourceType === "official") score += 1;
  if (hasDeadline) score += 1;

  return score;
}

function passesFilters(signals, score) {
  return (
    signals.masters &&
    signals.funded &&
    signals.stipend &&
    signals.iraqEligible &&
    signals.region &&
    signals.topics &&
    score >= SEARCH_SETTINGS.minScore
  );
}

function extractTopics(text) {
  return FIELD_PATTERNS.filter((entry) => matchesAny(text, entry.patterns)).map(
    (entry) => entry.tag
  );
}

function detectRegion(text, url) {
  const haystack = `${text} ${url}`.toLowerCase();
  return REGION_CONFIG.find((region) =>
    region.detectionTerms.some((term) => haystack.includes(term.toLowerCase()))
  );
}

function extractDeadline(text) {
  for (const pattern of DEADLINE_PATTERNS) {
    const match = text.match(pattern);

    if (match && match[1]) {
      const label = match[1].replace(/(\d)(st|nd|rd|th)/gi, "$1").trim();
      const parsed = new Date(label);
      const iso = Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);

      return { label, iso };
    }
  }

  return { label: "", iso: "" };
}

function extractEligibility(text) {
  const sentences = splitIntoSentences(text);
  const iraqSentence = sentences.find((sentence) => matchesAny(sentence, IRAQ_PATTERNS));

  if (iraqSentence) {
    return { isMatch: true, text: iraqSentence };
  }

  const internationalSentence = sentences.find((sentence) =>
    matchesAny(sentence, OPEN_INTERNATIONAL_PATTERNS)
  );

  if (internationalSentence) {
    return { isMatch: true, text: internationalSentence };
  }

  return { isMatch: false, text: "" };
}

function extractFunding(text, fallback) {
  const sentences = splitIntoSentences(`${fallback}. ${text}`);
  const sentence = sentences.find(
    (entry) => matchesAny(entry, FUNDING_PATTERNS) && matchesAny(entry, STIPEND_PATTERNS)
  );

  if (sentence) {
    return sentence;
  }

  const fallbackSentence = sentences.find((entry) => matchesAny(entry, FUNDING_PATTERNS));
  return fallbackSentence || "";
}

function extractRequirements(text) {
  const sentences = splitIntoSentences(text);
  return dedupeBy(
    sentences.filter((sentence) => {
      if (sentence.length < 35 || sentence.length > 240) {
        return false;
      }

      return matchesAny(sentence, REQUIREMENT_PATTERNS);
    }),
    (sentence) => normalizeText(sentence)
  ).slice(0, 3);
}

function extractApplyUrl($, baseUrl) {
  let foundUrl = "";

  $("a[href]").each((_, node) => {
    if (foundUrl) {
      return;
    }

    const text = cleanText($(node).text());
    const href = $(node).attr("href");

    if (!href || !text || !matchesAny(text, APPLY_LINK_PATTERNS)) {
      return;
    }

    try {
      const absoluteUrl = new URL(href, baseUrl).toString();

      if (isFileLikeUrl(absoluteUrl)) {
        return;
      }

      foundUrl = absoluteUrl;
    } catch (error) {
      return;
    }
  });

  return foundUrl || baseUrl;
}

function inferInstitution(title, siteName, url) {
  if (siteName) {
    return siteName;
  }

  const titleSegments = title.split(/\s\|\s|\s-\s/).map((segment) => segment.trim());

  if (titleSegments.length > 1) {
    return titleSegments[titleSegments.length - 1];
  }

  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return hostname;
  } catch (error) {
    return "Unknown institution";
  }
}

function classifySource(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();

    if (
      hostname.endsWith(".edu") ||
      hostname.includes(".edu.") ||
      hostname.endsWith(".ac.uk") ||
      hostname.includes(".ac.") ||
      hostname.includes(".gov") ||
      hostname.includes("university") ||
      hostname.includes("college") ||
      hostname.includes("institute")
    ) {
      return "official";
    }

    return "directory";
  } catch (error) {
    return "directory";
  }
}

function shouldFetchUrl(url, manual) {
  if (!url) {
    return false;
  }

  if (manual.excludeUrls.includes(url)) {
    return false;
  }

  if (isFileLikeUrl(url)) {
    return false;
  }

  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "").toLowerCase();

    if (EXCLUDED_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
      return false;
    }

    if (
      manual.excludeDomains.some(
        (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
      )
    ) {
      return false;
    }
  } catch (error) {
    return false;
  }

  return true;
}

function isExcludedScholarship(scholarship, manual) {
  return manual.excludeUrls.includes(scholarship.url);
}

function isFileLikeUrl(url) {
  const lowered = url.toLowerCase();
  return EXCLUDED_EXTENSIONS.some((extension) => lowered.endsWith(extension));
}

function normalizeManualItems(items) {
  return Array.isArray(items)
    ? items.map((item) => ({
        id: item.id || createId(item.url || item.applyUrl || item.title || "", item.title || ""),
        title: item.title || "Manual scholarship entry",
        institution: item.institution || "Manual source",
        region: item.region || "Unclear",
        url: item.url || item.applyUrl || "#",
        applyUrl: item.applyUrl || item.url || "#",
        deadline: item.deadline || "Manual entry",
        deadlineIso: item.deadlineIso || "",
        funding: item.funding || "Added manually",
        requirements: Array.isArray(item.requirements) ? item.requirements : [],
        eligibility: item.eligibility || "Added manually",
        topics: Array.isArray(item.topics) ? item.topics : [],
        summary: item.summary || "Pinned manually by the project owner.",
        sourceType: "manual",
        reviewNeeded: Boolean(item.reviewNeeded),
        score: Number(item.score || 99),
      }))
    : [];
}

function buildNotice({ liveItems, failedQueries, manualCount }) {
  if (!process.env.BRAVE_SEARCH_API_KEY) {
    return "No live search API key was configured for this run.";
  }

  if (!liveItems.length && manualCount) {
    return "Only manual scholarship entries are visible right now. The automated crawler did not find fresh matches in this run.";
  }

  if (!liveItems.length) {
    return "The crawler ran, but it did not find any scholarship pages that passed the current filters.";
  }

  if (failedQueries > 0) {
    return "Some search queries failed during this refresh, so the dashboard may be missing a few opportunities.";
  }

  return "";
}

function buildPayload({ items, liveCount, provider, notice, runMode, stats }) {
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      provider,
      runMode,
      liveCount,
      notice,
      cadence: "Every 12 hours",
      stats,
    },
    items,
  };
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

function splitIntoSentences(text) {
  return cleanText(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function createId(url, title) {
  return crypto.createHash("sha1").update(`${url}::${title}`).digest("hex").slice(0, 12);
}

function normalizeUrl(url) {
  try {
    const parsedUrl = new URL(url);
    parsedUrl.hash = "";
    return parsedUrl.toString();
  } catch (error) {
    return url;
  }
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanTitle(value) {
  const text = cleanText(value);
  return text.replace(/\s+\|\s+[^|]+$/, "").replace(/\s+-\s+[^-]+$/, "");
}

function normalizeText(value) {
  return cleanText(value).toLowerCase();
}

function dedupeBy(items, keyFn) {
  const seen = new Set();
  const unique = [];

  items.forEach((item) => {
    const key = keyFn(item);

    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    unique.push(item);
  });

  return unique;
}

async function readJson(filePath, fallbackValue) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    return fallbackValue;
  }
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
