const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const fetch = require("node-fetch");
const cheerio = require("cheerio");
const {
  APPLY_LINK_PATTERNS,
  BROAD_FIELD_PATTERNS,
  CRAWL_SETTINGS,
  DEADLINE_PATTERNS,
  DISCOVERY_EXCLUDE_KEYWORDS,
  DISCOVERY_KEYWORDS,
  EXCLUDED_DOMAINS,
  EXCLUDED_EXTENSIONS,
  FIELD_PATTERNS,
  FUNDING_PATTERNS,
  IRAQ_PATTERNS,
  MASTERS_PATTERNS,
  NON_TARGET_LEVEL_PATTERNS,
  OPEN_INTERNATIONAL_PATTERNS,
  REGION_CONFIG,
  REQUIREMENT_PATTERNS,
  SCHOLARSHIP_PAGE_PATTERNS,
  SITEMAP_HINTS,
  SOURCE_SITES,
  STIPEND_PATTERNS,
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
  const crawlStats = {
    totalSources: SOURCE_SITES.length,
    failedSources: 0,
    discoveredUrls: 0,
    fetchedPages: 0,
    sources: [],
  };
  const discoveredCandidates = [];

  for (const source of SOURCE_SITES) {
    console.log(`Discovering candidates from ${source.label}...`);
    try {
      const candidateUrls = await discoverSourceCandidates(source, manual);
      crawlStats.sources.push({
        id: source.id,
        label: source.label,
        candidateUrls: candidateUrls.length,
      });
      discoveredCandidates.push(
        ...candidateUrls.map((url) => ({
          url,
          source,
        }))
      );
    } catch (error) {
      crawlStats.failedSources += 1;
      crawlStats.sources.push({
        id: source.id,
        label: source.label,
        error: error.message,
      });
      console.warn(`Source discovery failed for ${source.label}: ${error.message}`);
    }

    await sleep(250);
  }

  const uniqueCandidates = dedupeBy(
    discoveredCandidates,
    (item) => normalizeUrl(item.url)
  ).slice(0, CRAWL_SETTINGS.maxScholarshipPages);

  crawlStats.discoveredUrls = uniqueCandidates.length;

  const liveItems = [];

  for (const candidate of uniqueCandidates) {
    try {
      const html = await fetchMarkup(candidate.url, "html");
      crawlStats.fetchedPages += 1;
      const scholarship = extractScholarship(candidate, html);

      if (scholarship && !isExcludedScholarship(scholarship, manual)) {
        liveItems.push(scholarship);
      }
    } catch (error) {
      console.warn(`Candidate fetch failed for ${candidate.url}: ${error.message}`);
    }

    await sleep(200);
  }

  const normalizedLiveItems = dedupeBy(
    liveItems,
    (item) => `${normalizeText(item.title)}::${normalizeText(item.institution)}`
  ).sort(sortScholarships);
  const manualItems = normalizeManualItems(manual.include);
  const mergedItems = dedupeBy(
    [...manualItems, ...normalizedLiveItems],
    (item) => item.id
  ).sort(sortScholarships);

  if (!mergedItems.length && previous && Array.isArray(previous.items) && previous.items.length) {
    console.warn("The free crawler found no fresh matches. Keeping the previous dataset.");
    return;
  }

  const payload = buildPayload({
    items: mergedItems,
    liveCount: normalizedLiveItems.length,
    notice: buildNotice({
      liveItems: normalizedLiveItems,
      failedSources: crawlStats.failedSources,
      manualCount: manualItems.length,
    }),
    stats: crawlStats,
  });

  await writeJson(OUTPUT_PATH, payload);
  console.log(`Wrote ${mergedItems.length} scholarships to ${OUTPUT_PATH}`);
}

async function discoverSourceCandidates(source, manual) {
  const discovered = new Set();

  for (const seedUrl of source.seedUrls) {
    try {
      const html = await fetchMarkup(seedUrl, "html");
      extractRelevantLinks(html, seedUrl, source)
        .slice(0, CRAWL_SETTINGS.maxSeedLinksPerPage)
        .forEach((url) => discovered.add(url));
    } catch (error) {
      console.warn(`Seed fetch failed for ${seedUrl}: ${error.message}`);
    }
  }

  const sitemapUrls = await discoverFromSitemaps(source);
  sitemapUrls.forEach((url) => discovered.add(url));

  source.seedUrls
    .filter((url) => isLikelyCandidateUrl(url, source))
    .forEach((url) => discovered.add(normalizeUrl(url)));

  return [...discovered]
    .filter((url) => shouldFetchUrl(url, manual))
    .slice(0, CRAWL_SETTINGS.maxCandidateUrlsPerSource);
}

async function discoverFromSitemaps(source) {
  const candidateUrls = new Set();
  const visitedSitemaps = new Set();
  const sitemapQueue = source.seedUrls
    .map((seedUrl) => {
      try {
        const base = new URL(source.baseUrl);
        return SITEMAP_HINTS.map((hint) => new URL(hint, base).toString());
      } catch (error) {
        return [];
      }
    })
    .flat();

  for (const sitemapUrl of dedupeBy(sitemapQueue, (value) => value)) {
    if (visitedSitemaps.has(sitemapUrl)) {
      continue;
    }

    visitedSitemaps.add(sitemapUrl);

    try {
      const text = await fetchMarkup(sitemapUrl, "xml");

      if (!looksLikeSitemap(text)) {
        continue;
      }

      const { childSitemaps, pageUrls } = parseSitemap(text);

      pageUrls
        .filter((url) => isLikelyCandidateUrl(url, source))
        .slice(0, CRAWL_SETTINGS.maxUrlsPerSitemap)
        .forEach((url) => candidateUrls.add(url));

      for (const childSitemapUrl of childSitemaps
        .filter((url) => isRelevantSitemapUrl(url))
        .slice(0, CRAWL_SETTINGS.maxSitemapFilesPerSource)) {
        if (visitedSitemaps.has(childSitemapUrl)) {
          continue;
        }

        visitedSitemaps.add(childSitemapUrl);

        try {
          const childText = await fetchMarkup(childSitemapUrl, "xml");

          if (!looksLikeSitemap(childText)) {
            continue;
          }

          const childData = parseSitemap(childText);
          childData.pageUrls
            .filter((url) => isLikelyCandidateUrl(url, source))
            .slice(0, CRAWL_SETTINGS.maxUrlsPerSitemap)
            .forEach((url) => candidateUrls.add(url));
        } catch (error) {
          continue;
        }
      }
    } catch (error) {
      continue;
    }
  }

  return [...candidateUrls];
}

function parseSitemap(text) {
  const $ = cheerio.load(text, { xmlMode: true });
  const childSitemaps = $("sitemap > loc")
    .map((_, node) => cleanText($(node).text()))
    .get()
    .filter(Boolean);
  const pageUrls = $("url > loc")
    .map((_, node) => cleanText($(node).text()))
    .get()
    .filter(Boolean);

  return {
    childSitemaps,
    pageUrls,
  };
}

function extractRelevantLinks(html, baseUrl, source) {
  const $ = cheerio.load(html);
  const links = [];

  $("a[href]").each((_, node) => {
    const href = $(node).attr("href");
    const text = cleanText($(node).text());

    if (!href) {
      return;
    }

    try {
      const absoluteUrl = normalizeUrl(new URL(href, baseUrl).toString());
      const fingerprint = `${absoluteUrl} ${text}`.toLowerCase();

      if (!isSameSourceDomain(absoluteUrl, source.baseUrl)) {
        return;
      }

      if (isFileLikeUrl(absoluteUrl)) {
        return;
      }

      if (!hasDiscoverySignal(fingerprint)) {
        return;
      }

      if (containsExcludedDiscoveryKeyword(fingerprint)) {
        return;
      }

      links.push(absoluteUrl);
    } catch (error) {
      return;
    }
  });

  return dedupeBy(links, (url) => url);
}

function extractScholarship(candidate, html) {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg").remove();

  const title = cleanTitle(
    $('meta[property="og:title"]').attr("content") ||
      $("h1").first().text() ||
      $("title").first().text() ||
      candidate.url
  );
  const metaDescription = cleanText(
    $('meta[name="description"]').attr("content") ||
      $('meta[property="og:description"]').attr("content") ||
      ""
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
  const explicitTopics = extractTopics(combinedText);
  const broadFieldEligible =
    matchesAny(combinedText, BROAD_FIELD_PATTERNS) ||
    Boolean(candidate.source.broadFieldFriendly && matchesAny(combinedText, SCHOLARSHIP_PAGE_PATTERNS));
  const topicTags = explicitTopics.length ? explicitTopics : broadFieldEligible ? ["Cross-field scholarship"] : [];
  const region = detectRegion(combinedText, candidate.url) || regionFromHint(candidate.source.regionHint);
  const deadline = extractDeadline(bodyText);
  const eligibility = extractEligibility(bodyText);
  const funding = extractFunding(bodyText, metaDescription);
  const requirements = extractRequirements(bodyText);
  const applyUrl = extractApplyUrl($, candidate.url);
  const sourceType = candidate.source.sourceType || classifySource(candidate.url);
  const institution = inferInstitution(title, siteName, candidate.url, candidate.source.label);
  const scholarshipPage = matchesAny(`${title} ${candidate.url} ${metaDescription}`, SCHOLARSHIP_PAGE_PATTERNS);
  const levelContext = `${title} ${candidate.url}`;

  const signals = {
    scholarshipPage,
    masters: hasMastersSignal(combinedText, levelContext),
    funded: matchesAny(combinedText, FUNDING_PATTERNS),
    stipend: matchesAny(combinedText, STIPEND_PATTERNS),
    iraqEligible: eligibility.isMatch,
    region: Boolean(region),
    topics: topicTags.length > 0,
  };

  const score = scoreSignals(signals, sourceType, Boolean(deadline.iso), broadFieldEligible);

  if (!passesFilters(signals, score)) {
    return null;
  }

  return {
    id: createId(candidate.url, title),
    title,
    institution,
    region: region ? region.label : "Unclear",
    url: candidate.url,
    applyUrl,
    deadline: deadline.label || "Not found",
    deadlineIso: deadline.iso || "",
    funding: funding || "Funding signal found, but a clean stipend summary still needs review.",
    requirements,
    eligibility:
      eligibility.text ||
      "This source suggests broad international eligibility, but Iraq should be checked manually.",
    topics: topicTags,
    summary:
      metaDescription ||
      `Discovered via ${candidate.source.label} and matched against the free crawler rules.`,
    sourceType,
    sourceName: candidate.source.label,
    reviewNeeded:
      !deadline.iso ||
      requirements.length === 0 ||
      sourceType !== "official" ||
      !matchesAny(eligibility.text || "", IRAQ_PATTERNS) ||
      !funding,
    score,
  };
}

function hasMastersSignal(text, levelContext) {
  const strongNonTargetLevel = matchesAny(levelContext, NON_TARGET_LEVEL_PATTERNS);
  const strongMastersLabel = /\bmaster/i.test(levelContext);

  if (strongNonTargetLevel && !strongMastersLabel) {
    return false;
  }

  return matchesAny(text, MASTERS_PATTERNS);
}

function scoreSignals(signals, sourceType, hasDeadline, broadFieldEligible) {
  let score = 0;

  if (signals.scholarshipPage) score += 2;
  if (signals.masters) score += 3;
  if (signals.funded) score += 3;
  if (signals.stipend) score += 3;
  if (signals.iraqEligible) score += 3;
  if (signals.region) score += 2;
  if (signals.topics) score += 2;
  if (broadFieldEligible) score += 1;
  if (sourceType === "official") score += 1;
  if (hasDeadline) score += 1;

  return score;
}

function passesFilters(signals, score) {
  return (
    signals.scholarshipPage &&
    signals.masters &&
    signals.funded &&
    signals.stipend &&
    signals.iraqEligible &&
    signals.region &&
    signals.topics &&
    score >= CRAWL_SETTINGS.minScore
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

function regionFromHint(label) {
  if (!label) {
    return null;
  }

  return REGION_CONFIG.find((region) => region.id === label || region.label === label) || null;
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
      const absoluteUrl = normalizeUrl(new URL(href, baseUrl).toString());

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

function inferInstitution(title, siteName, url, sourceLabel) {
  if (siteName) {
    return siteName;
  }

  const titleSegments = title.split(/\s\|\s|\s-\s/).map((segment) => segment.trim());

  if (titleSegments.length > 1) {
    return titleSegments[titleSegments.length - 1];
  }

  if (sourceLabel) {
    return sourceLabel;
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

function looksLikeSitemap(text) {
  const trimmed = String(text || "").trim();
  return trimmed.includes("<urlset") || trimmed.includes("<sitemapindex");
}

function isRelevantSitemapUrl(url) {
  const lowered = url.toLowerCase();
  return (
    hasDiscoverySignal(lowered) ||
    lowered.includes("post") ||
    lowered.includes("page") ||
    lowered.includes("study") ||
    lowered.includes("admission")
  );
}

function isLikelyCandidateUrl(url, source) {
  try {
    const normalized = normalizeUrl(url);
    const lowered = normalized.toLowerCase();

    if (!isSameSourceDomain(normalized, source.baseUrl)) {
      return false;
    }

    if (isFileLikeUrl(normalized)) {
      return false;
    }

    if (containsExcludedDiscoveryKeyword(lowered)) {
      return false;
    }

    return hasDiscoverySignal(lowered);
  } catch (error) {
    return false;
  }
}

function isSameSourceDomain(url, baseUrl) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    const baseHostname = new URL(baseUrl).hostname.replace(/^www\./, "");

    return hostname === baseHostname || hostname.endsWith(`.${baseHostname}`);
  } catch (error) {
    return false;
  }
}

function hasDiscoverySignal(value) {
  return DISCOVERY_KEYWORDS.some((keyword) => value.includes(keyword));
}

function containsExcludedDiscoveryKeyword(value) {
  return DISCOVERY_EXCLUDE_KEYWORDS.some((keyword) => value.includes(keyword));
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
        sourceName: "Manual",
        reviewNeeded: Boolean(item.reviewNeeded),
        score: Number(item.score || 99),
      }))
    : [];
}

function buildNotice({ liveItems, failedSources, manualCount }) {
  if (!liveItems.length && manualCount) {
    return "Only manual scholarship entries are visible right now. The free crawler did not find fresh matches in this run.";
  }

  if (!liveItems.length) {
    return "The free crawler ran, but it did not find any pages that passed the current filters.";
  }

  if (failedSources > 0) {
    return "Some free sources failed during discovery, so the dashboard may be missing a few opportunities.";
  }

  return "";
}

function buildPayload({ items, liveCount, notice, stats }) {
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      provider: "Free source crawler",
      runMode: "live",
      liveCount,
      notice,
      cadence: "Every 12 hours",
      stats,
    },
    items,
  };
}

function sortScholarships(left, right) {
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

async function fetchMarkup(url, mode) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept:
        mode === "xml"
          ? "application/xml,text/xml,text/plain,*/*"
          : "text/html,application/xhtml+xml",
    },
    redirect: "follow",
    timeout: 10000,
  });

  if (!response.ok) {
    throw new Error(`Request returned ${response.status}`);
  }

  return response.text();
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
