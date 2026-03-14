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
  UNIVERSITY_DIRECTORY_SOURCES,
  USER_AGENT,
  VERIFIED_SOURCE_REGISTRY,
} = require("./config");

const ROOT_DIR = path.resolve(__dirname, "..");
const OUTPUT_PATH = path.join(ROOT_DIR, "data", "scholarships.json");
const MANUAL_PATH = path.join(ROOT_DIR, "data", "manual-curation.json");
const UNIVERSITY_STATE_PATH = path.join(ROOT_DIR, "data", "university-crawl-state.json");
const EXCLUDED_TITLE_PATTERNS = [
  /frequently asked questions/i,
  /course search/i,
  /funding bid/i,
  /search site/i,
  /why study/i,
  /^postgraduate study/i,
  /student life/i,
  /study here/i,
  /apply from your country/i,
  /pre-arrival/i,
  /visiting student researchers/i,
];

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const runTimestamp = new Date().toISOString();
  const manual = await readJson(MANUAL_PATH, {
    include: [],
    excludeUrls: [],
    excludeDomains: [],
  });
  const previous = await readJson(OUTPUT_PATH, null);
  const universityState = await readJson(UNIVERSITY_STATE_PATH, { directories: {} });
  const nextUniversityState = {
    directories: {
      ...(universityState && universityState.directories ? universityState.directories : {}),
    },
  };
  const crawlStats = {
    totalSources: SOURCE_SITES.length + UNIVERSITY_DIRECTORY_SOURCES.length,
    failedSources: 0,
    discoveredUrls: 0,
    discoveredUniversities: 0,
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

  for (const directorySource of UNIVERSITY_DIRECTORY_SOURCES) {
    console.log(`Discovering university websites from ${directorySource.label}...`);

    try {
      const directoryDiscovery = await discoverDirectoryCandidates(
        directorySource,
        manual,
        universityState
      );

      nextUniversityState.directories[directorySource.id] = directoryDiscovery.state;
      crawlStats.discoveredUniversities += directoryDiscovery.stats.selectedUniversities;
      crawlStats.sources.push({
        id: directorySource.id,
        label: directorySource.label,
        candidateUrls: directoryDiscovery.candidates.length,
        discoveredUniversities: directoryDiscovery.stats.totalUniversities,
        selectedUniversities: directoryDiscovery.stats.selectedUniversities,
        nextOffset: directoryDiscovery.stats.nextOffset,
        directoryPagesFetched: directoryDiscovery.stats.directoryPagesFetched,
      });
      discoveredCandidates.push(...directoryDiscovery.candidates);
    } catch (error) {
      crawlStats.failedSources += 1;
      crawlStats.sources.push({
        id: directorySource.id,
        label: directorySource.label,
        error: error.message,
      });
      console.warn(`Directory discovery failed for ${directorySource.label}: ${error.message}`);
    }

    await sleep(250);
  }

  const uniqueCandidates = dedupeBy(
    discoveredCandidates,
    (item) => normalizeUrl(item.url)
  )
    .sort(sortDiscoveredCandidates)
    .slice(0, CRAWL_SETTINGS.maxScholarshipPages);

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
  const persistedLiveItems = mergeAutomatedItems(
    previous && Array.isArray(previous.items) ? previous.items : [],
    normalizedLiveItems,
    runTimestamp
  );
  const manualItems = normalizeManualItems(manual.include);
  const mergedItems = dedupeBy(
    [...manualItems, ...persistedLiveItems],
    (item) => (item.sourceType === "manual" ? item.id : createScholarshipMergeKey(item))
  ).sort(sortScholarships);

  if (!mergedItems.length && previous && Array.isArray(previous.items) && previous.items.length) {
    await writeJson(UNIVERSITY_STATE_PATH, nextUniversityState);
    console.warn("The free crawler found no fresh matches. Keeping the previous dataset.");
    return;
  }

  const payload = buildPayload({
    items: mergedItems,
    liveCount: normalizedLiveItems.length,
    trackedCount: persistedLiveItems.length,
    notice: buildNotice({
      liveItems: normalizedLiveItems,
      trackedCount: persistedLiveItems.length,
      failedSources: crawlStats.failedSources,
      manualCount: manualItems.length,
    }),
    stats: crawlStats,
  });

  await writeJson(UNIVERSITY_STATE_PATH, nextUniversityState);
  await writeJson(OUTPUT_PATH, payload);
  console.log(`Wrote ${mergedItems.length} scholarships to ${OUTPUT_PATH}`);
}

async function discoverSourceCandidates(source, manual) {
  const discovered = new Set();
  const maxSeedLinksPerPage = getSourceSetting(source, "maxSeedLinksPerPage", "maxSeedLinksPerPage");
  const maxCandidateUrlsPerSource = getSourceSetting(
    source,
    "maxCandidateUrlsPerSource",
    "maxCandidateUrlsPerSource"
  );

  [source.verificationUrl, ...(source.seedUrls || [])]
    .filter(Boolean)
    .forEach((url) => {
      try {
        if (source.discoveredVia && !isLikelyCandidateUrl(url, source)) {
          return;
        }

        discovered.add(normalizeUrl(url));
      } catch (error) {
        return;
      }
    });

  for (const seedUrl of source.seedUrls) {
    try {
      const html = await fetchMarkup(seedUrl, "html");
      extractRelevantLinks(html, seedUrl, source)
        .slice(0, maxSeedLinksPerPage)
        .forEach((url) => discovered.add(url));
    } catch (error) {
      if (!source.suppressSeedErrors) {
        console.warn(`Seed fetch failed for ${seedUrl}: ${error.message}`);
      }
    }
  }

  const sitemapUrls = await discoverFromSitemaps(source);
  sitemapUrls.forEach((url) => discovered.add(url));

  return [...discovered]
    .filter((url) => shouldFetchUrl(url, manual))
    .slice(0, maxCandidateUrlsPerSource);
}

async function discoverDirectoryCandidates(directorySource, manual, universityState) {
  const directoryDiscovery =
    directorySource.directoryStrategy === "ucas-provider-pages"
      ? await discoverUcasDirectorySelection(directorySource, universityState)
      : directorySource.directoryStrategy === "eua-member-directory"
        ? await discoverEuaDirectorySelection(directorySource, universityState)
        : await discoverUniversitiesAustraliaSelection(directorySource, universityState);

  const candidates = [];

  for (const universityEntry of directoryDiscovery.selectedEntries) {
    const universitySource = createUniversityCrawlerSource(directorySource, universityEntry);
    const candidateUrls = await discoverSourceCandidates(universitySource, manual);

    candidates.push(
      ...candidateUrls.map((url) => ({
        url,
        source: universitySource,
      }))
    );

    await sleep(125);
  }

  return {
    candidates,
    stats: {
      directoryPagesFetched: directoryDiscovery.directoryPagesFetched,
      totalUniversities: directoryDiscovery.totalUniversities,
      selectedUniversities: directoryDiscovery.selectedEntries.length,
      nextOffset: directoryDiscovery.nextOffset,
    },
    state: {
      offset: directoryDiscovery.nextOffset,
      totalUniversities: directoryDiscovery.totalUniversities,
      updatedAt: new Date().toISOString(),
    },
  };
}

async function discoverUcasDirectorySelection(directorySource, universityState) {
  const providerPages = [];
  const maxDirectoryPages = getSourceSetting(
    directorySource,
    "maxDirectoryPages",
    "maxUniversityDirectoryPages"
  );
  let stalledPages = 0;
  let directoryPagesFetched = 0;

  for (let pageNumber = 1; pageNumber <= maxDirectoryPages; pageNumber += 1) {
    const pageUrl = new URL(
      `/explore/search/providers?page=${pageNumber}`,
      directorySource.baseUrl
    ).toString();
    const html = await fetchMarkup(pageUrl, "html");
    directoryPagesFetched += 1;
    const pageLinks = extractUcasProviderLinks(html, pageUrl);
    const beforeCount = providerPages.length;

    pageLinks.forEach((providerUrl) => {
      if (!providerPages.includes(providerUrl)) {
        providerPages.push(providerUrl);
      }
    });

    stalledPages = providerPages.length === beforeCount ? stalledPages + 1 : 0;

    if (stalledPages >= 2) {
      break;
    }

    await sleep(100);
  }

  const orderedProviderPages = [...providerPages].sort();
  const selection = selectRollingWindow(
    orderedProviderPages.map((providerUrl) => ({ providerUrl })),
    universityState.directories && universityState.directories[directorySource.id],
    directorySource.maxUniversitiesPerRun || CRAWL_SETTINGS.maxUniversitiesPerDirectory
  );
  const selectedEntries = [];

  for (const entry of selection.items) {
    try {
      const html = await fetchMarkup(entry.providerUrl, "html");
      const universityEntry = extractUcasUniversityEntry(html, entry.providerUrl);

      if (universityEntry && universityEntry.websiteUrl) {
        selectedEntries.push(universityEntry);
      }
    } catch (error) {
      console.warn(`UCAS profile fetch failed for ${entry.providerUrl}: ${error.message}`);
    }

    await sleep(100);
  }

  return {
    directoryPagesFetched,
    totalUniversities: orderedProviderPages.length,
    selectedEntries,
    nextOffset: selection.nextOffset,
  };
}

async function discoverEuaDirectorySelection(directorySource, universityState) {
  const html = await fetchMarkup(directorySource.seedUrls[0], "html");
  const allEntries = extractEuaUniversityEntries(html, directorySource.seedUrls[0]);
  const selection = selectRollingWindow(
    allEntries,
    universityState.directories && universityState.directories[directorySource.id],
    directorySource.maxUniversitiesPerRun || CRAWL_SETTINGS.maxUniversitiesPerDirectory
  );

  return {
    directoryPagesFetched: 1,
    totalUniversities: allEntries.length,
    selectedEntries: selection.items,
    nextOffset: selection.nextOffset,
  };
}

async function discoverUniversitiesAustraliaSelection(directorySource, universityState) {
  const html = await fetchMarkup(directorySource.seedUrls[0], "html");
  const profileUrls = extractUniversitiesAustraliaProfileLinks(
    html,
    directorySource.seedUrls[0]
  );
  const selection = selectRollingWindow(
    profileUrls.map((profileUrl) => ({ profileUrl })),
    universityState.directories && universityState.directories[directorySource.id],
    directorySource.maxUniversitiesPerRun || CRAWL_SETTINGS.maxUniversitiesPerDirectory
  );
  const selectedEntries = [];

  for (const entry of selection.items) {
    try {
      const profileHtml = await fetchMarkup(entry.profileUrl, "html");
      const universityEntry = extractUniversitiesAustraliaUniversityEntry(
        profileHtml,
        entry.profileUrl
      );

      if (universityEntry && universityEntry.websiteUrl) {
        selectedEntries.push(universityEntry);
      }
    } catch (error) {
      console.warn(
        `Universities Australia profile fetch failed for ${entry.profileUrl}: ${error.message}`
      );
    }

    await sleep(100);
  }

  return {
    directoryPagesFetched: 1,
    totalUniversities: profileUrls.length,
    selectedEntries,
    nextOffset: selection.nextOffset,
  };
}

function selectRollingWindow(items, stateEntry, batchSize) {
  if (!items.length) {
    return {
      items: [],
      nextOffset: 0,
    };
  }

  const normalizedBatchSize = Math.max(1, Math.min(batchSize, items.length));
  const startOffset = Number(stateEntry && stateEntry.offset ? stateEntry.offset : 0) % items.length;
  const windowItems = [];

  for (let index = 0; index < normalizedBatchSize; index += 1) {
    windowItems.push(items[(startOffset + index) % items.length]);
  }

  return {
    items: windowItems,
    nextOffset: (startOffset + normalizedBatchSize) % items.length,
  };
}

async function discoverFromSitemaps(source) {
  const candidateUrls = new Set();
  const visitedSitemaps = new Set();
  const maxUrlsPerSitemap = getSourceSetting(source, "maxUrlsPerSitemap", "maxUrlsPerSitemap");
  const maxSitemapFilesPerSource = getSourceSetting(
    source,
    "maxSitemapFilesPerSource",
    "maxSitemapFilesPerSource"
  );
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
        .slice(0, maxUrlsPerSitemap)
        .forEach((url) => candidateUrls.add(url));

      for (const childSitemapUrl of childSitemaps
        .filter((url) => isRelevantSitemapUrl(url))
        .slice(0, maxSitemapFilesPerSource)) {
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
            .slice(0, maxUrlsPerSitemap)
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

function extractUcasProviderLinks(html, baseUrl) {
  const $ = cheerio.load(html);
  const links = [];

  $('a[href*="/explore/unis/"]').each((_, node) => {
    const href = $(node).attr("href");

    if (!href) {
      return;
    }

    try {
      links.push(normalizeUrl(new URL(href, baseUrl).toString()));
    } catch (error) {
      return;
    }
  });

  return dedupeBy(links, (url) => url);
}

function extractUcasUniversityEntry(html, profileUrl) {
  const $ = cheerio.load(html);
  const institution =
    cleanText($("h1").first().text()) ||
    cleanTitle($("title").first().text()) ||
    profileUrl;
  let websiteUrl = "";

  $("a[href]").each((_, node) => {
    if (websiteUrl) {
      return;
    }

    const href = $(node).attr("href");
    const text = cleanText($(node).text());

    if (!href || !/visit our website/i.test(text)) {
      return;
    }

    try {
      const absoluteUrl = normalizeUrl(new URL(href, profileUrl).toString());

      if (absoluteUrl.includes("ucas.com")) {
        return;
      }

      websiteUrl = absoluteUrl;
    } catch (error) {
      return;
    }
  });

  return websiteUrl
    ? {
        institution,
        websiteUrl,
        directoryUrl: profileUrl,
      }
    : null;
}

function extractEuaUniversityEntries(html, directoryUrl) {
  const $ = cheerio.load(html);
  const entries = [];

  $(".member3item").each((_, node) => {
    const className = $(node).attr("class") || "";

    if (!className.includes("individual_")) {
      return;
    }

    const institution = cleanText($(node).find(".memberitem-name").first().text());
    let websiteUrl = "";

    $(node)
      .find("a[href]")
      .each((__, linkNode) => {
        if (websiteUrl) {
          return;
        }

        const href = $(linkNode).attr("href");
        const text = cleanText($(linkNode).text());

        if (!href || !/visit website/i.test(text)) {
          return;
        }

        try {
          websiteUrl = normalizeUrl(new URL(href, directoryUrl).toString());
        } catch (error) {
          return;
        }
      });

    if (institution && websiteUrl) {
      entries.push({
        institution,
        websiteUrl,
        directoryUrl,
      });
    }
  });

  return dedupeBy(
    entries.sort((left, right) => left.institution.localeCompare(right.institution)),
    (entry) => normalizeUrl(entry.websiteUrl)
  );
}

function extractUniversitiesAustraliaProfileLinks(html, baseUrl) {
  const $ = cheerio.load(html);
  const links = [];

  $('a[href*="/university/"]').each((_, node) => {
    const href = $(node).attr("href");

    if (!href) {
      return;
    }

    try {
      const absoluteUrl = normalizeUrl(new URL(href, baseUrl).toString());
      const pathname = new URL(absoluteUrl).pathname.toLowerCase();

      if (!/^\/university\/[^/]+\/?$/.test(pathname)) {
        return;
      }

      links.push(absoluteUrl);
    } catch (error) {
      return;
    }
  });

  return dedupeBy(links.sort(), (url) => url);
}

function extractUniversitiesAustraliaUniversityEntry(html, profileUrl) {
  const $ = cheerio.load(html);
  const institution =
    cleanText($("h1").first().text()) ||
    cleanTitle($("title").first().text()) ||
    profileUrl;
  let websiteUrl = "";

  $("a[href]").each((_, node) => {
    if (websiteUrl) {
      return;
    }

    const href = $(node).attr("href");
    const text = cleanText($(node).text());

    if (!href) {
      return;
    }

    try {
      const absoluteUrl = normalizeUrl(new URL(href, profileUrl).toString());

      if (!looksLikeUniversityWebsiteUrl(absoluteUrl)) {
        return;
      }

      if (!text || /facebook|instagram|linkedin|twitter|youtube/i.test(text)) {
        return;
      }

      websiteUrl = absoluteUrl;
    } catch (error) {
      return;
    }
  });

  return websiteUrl
    ? {
        institution,
        websiteUrl,
        directoryUrl: profileUrl,
      }
    : null;
}

function createUniversityCrawlerSource(directorySource, universityEntry) {
  const baseUrl = normalizeBaseUrl(universityEntry.websiteUrl);
  const seedUrls = buildUniversitySeedUrls(
    baseUrl,
    directorySource.universitySeedPaths || ["/", "/scholarships", "/funding"]
  );

  return {
    id: `${directorySource.id}-${createId(baseUrl, universityEntry.institution)}`,
    label: universityEntry.institution,
    baseUrl,
    seedUrls,
    sourceType: "official",
    regionHint: directorySource.regionHint,
    allowGeneralScholarships: Boolean(directorySource.allowGeneralScholarships),
    broadFieldFriendly: false,
    suppressSeedErrors: true,
    maxCandidateUrlsPerSource: 12,
    maxSeedLinksPerPage: 24,
    maxSitemapFilesPerSource: 3,
    maxUrlsPerSitemap: 30,
    discoveredVia: directorySource.label,
    directoryUrl: universityEntry.directoryUrl || "",
  };
}

function buildUniversitySeedUrls(baseUrl, seedPaths) {
  const urls = [];

  for (const seedPath of seedPaths) {
    try {
      urls.push(normalizeUrl(new URL(seedPath, baseUrl).toString()));
    } catch (error) {
      continue;
    }
  }

  return dedupeBy(urls, (url) => url);
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

  if (matchesAny(title, EXCLUDED_TITLE_PATTERNS)) {
    return null;
  }

  const combinedText = [title, metaDescription, bodyText].join(" ");
  const scholarshipIntent = matchesAny(
    `${title} ${candidate.url} ${metaDescription}`,
    SCHOLARSHIP_PAGE_PATTERNS
  );
  const scholarshipPage = matchesAny(
    `${title} ${candidate.url} ${metaDescription} ${bodyText.slice(0, 1200)}`,
    SCHOLARSHIP_PAGE_PATTERNS
  );
  const explicitTopics = extractTopics(combinedText);
  const broadFieldEligible =
    matchesAny(combinedText, BROAD_FIELD_PATTERNS) ||
    Boolean(candidate.source.broadFieldFriendly && scholarshipPage);
  const generalUniversityEligible = Boolean(candidate.source.allowGeneralScholarships && scholarshipPage);
  const topicTags = explicitTopics.length
    ? explicitTopics
    : broadFieldEligible
      ? ["Cross-field scholarship"]
      : generalUniversityEligible
        ? ["University-wide scholarship"]
        : [];
  const region = detectRegion(combinedText, candidate.url) || regionFromHint(candidate.source.regionHint);
  const deadline = extractDeadline(bodyText);
  const eligibility = extractEligibility(bodyText);
  const funding = extractFunding(bodyText, metaDescription);
  const requirements = extractRequirements(bodyText);
  const applyUrl = extractApplyUrl($, candidate.url);
  const sourceType = candidate.source.sourceType || classifySource(candidate.url);
  const institution = inferInstitution(title, siteName, candidate.url, candidate.source.label);
  const levelContext = `${title} ${candidate.url}`;

  const signals = {
    scholarshipIntent,
    scholarshipPage,
    masters: hasMastersSignal(combinedText, levelContext),
    funded: matchesAny(combinedText, FUNDING_PATTERNS),
    stipend: matchesAny(combinedText, STIPEND_PATTERNS),
    iraqEligible: eligibility.isMatch,
    region: Boolean(region),
    fieldMatch: topicTags.length > 0,
    explicitTopics: explicitTopics.length > 0,
  };

  const score = scoreSignals(signals, sourceType, Boolean(deadline.iso));
  const matchTier = determineMatchTier(signals, sourceType, score);

  if (!matchTier) {
    return null;
  }

  const missingChecks = collectMissingChecks(signals);

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
      `Discovered via ${candidate.source.label}${
        candidate.source.discoveredVia ? ` through ${candidate.source.discoveredVia}` : ""
      } and matched against the free crawler rules.`,
    sourceType,
    sourceName: candidate.source.discoveredVia
      ? `${candidate.source.label} via ${candidate.source.discoveredVia}`
      : candidate.source.label,
    matchTier,
    matchNote: buildMatchNote(matchTier, missingChecks),
    reviewNeeded:
      matchTier !== "best-fit" ||
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

function scoreSignals(signals, sourceType, hasDeadline) {
  let score = 0;

  if (signals.scholarshipIntent) score += 2;
  if (!signals.scholarshipIntent && signals.scholarshipPage) score += 1;
  if (signals.masters) score += 3;
  if (signals.funded) score += 3;
  if (signals.stipend) score += 3;
  if (signals.iraqEligible) score += 3;
  if (signals.region) score += 2;
  if (signals.explicitTopics) score += 2;
  if (!signals.explicitTopics && signals.fieldMatch) score += 1;
  if (sourceType === "official") score += 1;
  if (hasDeadline) score += 1;

  return score;
}

function passesStrictFilters(signals, score) {
  return (
    signals.scholarshipIntent &&
    signals.masters &&
    signals.funded &&
    signals.stipend &&
    signals.iraqEligible &&
    signals.region &&
    signals.fieldMatch &&
    score >= CRAWL_SETTINGS.minScore
  );
}

function determineMatchTier(signals, sourceType, score) {
  if (passesStrictFilters(signals, score)) {
    return "best-fit";
  }

  const reliableSource = sourceType === "official" || sourceType === "manual";

  if (
    signals.scholarshipIntent &&
    signals.masters &&
    signals.region &&
    signals.fieldMatch &&
    (signals.funded || signals.stipend) &&
    (signals.iraqEligible || reliableSource) &&
    score >= CRAWL_SETTINGS.minPossibleScore
  ) {
    return "possible-fit";
  }

  return "";
}

function collectMissingChecks(signals) {
  const missingChecks = [];

  if (!signals.funded) {
    missingChecks.push("full funding is not explicit on this page");
  }

  if (!signals.stipend) {
    missingChecks.push("a stipend or living allowance is not explicit on this page");
  }

  if (!signals.iraqEligible) {
    missingChecks.push("Iraq eligibility is not explicit on this page");
  }

  if (!signals.fieldMatch) {
    missingChecks.push("the field match still needs manual review");
  }

  return missingChecks;
}

function buildMatchNote(matchTier, missingChecks) {
  if (matchTier === "best-fit") {
    return "Best fit: this page matched the master's, funding, stipend, region, and eligibility checks.";
  }

  if (missingChecks.length) {
    return `Possible fit: ${missingChecks[0]}.`;
  }

  return "Possible fit: this is a strong official lead, but one strict criterion still needs manual confirmation.";
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
    return { isMatch: true, text: iraqSentence, type: "iraq-explicit" };
  }

  const internationalSentence = sentences.find((sentence) =>
    matchesAny(sentence, OPEN_INTERNATIONAL_PATTERNS)
  );

  if (internationalSentence) {
    return { isMatch: true, text: internationalSentence, type: "broad-international" };
  }

  return { isMatch: false, text: "", type: "unknown" };
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

    return source && source.discoveredVia
      ? hasUniversityCandidateSignal(lowered)
      : hasDiscoverySignal(lowered);
  } catch (error) {
    return false;
  }
}

function hasUniversityCandidateSignal(value) {
  return [
    "scholarship",
    "scholarships",
    "funding",
    "fees-and-funding",
    "bursary",
    "award",
    "financial-aid",
    "financial-support",
  ].some((keyword) => value.includes(keyword));
}

function sortDiscoveredCandidates(left, right) {
  const leftPriority = candidatePriority(left);
  const rightPriority = candidatePriority(right);

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  return left.url.localeCompare(right.url);
}

function candidatePriority(candidate) {
  if (candidate.source && candidate.source.sourceType === "official") {
    return 0;
  }

  return 1;
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

function looksLikeUniversityWebsiteUrl(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "").toLowerCase();

    if (
      EXCLUDED_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
    ) {
      return false;
    }

    return (
      hostname.includes(".edu") ||
      hostname.includes(".ac.") ||
      hostname.includes("edu.au") ||
      hostname.includes("university") ||
      hostname.includes("college") ||
      hostname.includes("institute")
    );
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
        matchTier: item.matchTier || "best-fit",
        matchNote:
          item.matchNote ||
          "Best fit: this scholarship was pinned manually because it matches the target profile.",
        reviewNeeded: Boolean(item.reviewNeeded),
        score: Number(item.score || 99),
      }))
    : [];
}

function mergeAutomatedItems(previousItems, currentItems, runTimestamp) {
  const previousAutomatedItems = Array.isArray(previousItems)
    ? previousItems.filter((item) => item.sourceType !== "manual")
    : [];
  const previousByKey = new Map(
    previousAutomatedItems.map((item) => [createScholarshipMergeKey(item), item])
  );
  const currentKeys = new Set();
  const mergedItems = [];

  currentItems.forEach((item) => {
    const key = createScholarshipMergeKey(item);
    const previousItem = previousByKey.get(key);

    currentKeys.add(key);
    mergedItems.push({
      ...previousItem,
      ...item,
      firstSeenAt: previousItem && previousItem.firstSeenAt ? previousItem.firstSeenAt : runTimestamp,
      lastSeenAt: runTimestamp,
    });
  });

  previousAutomatedItems.forEach((item) => {
    const key = createScholarshipMergeKey(item);

    if (currentKeys.has(key) || !shouldRetainScholarship(item, runTimestamp)) {
      return;
    }

    mergedItems.push({
      ...item,
      matchTier: item.matchTier || "best-fit",
      matchNote:
        item.matchNote ||
        "Possible fit: this scholarship was found in an earlier crawl and is being kept while the university rotation continues.",
    });
  });

  return dedupeBy(mergedItems, (item) => createScholarshipMergeKey(item)).sort(sortScholarships);
}

function shouldRetainScholarship(item, runTimestamp) {
  if (!item || item.sourceType === "manual") {
    return false;
  }

  if (matchesAny(item.title || "", EXCLUDED_TITLE_PATTERNS)) {
    return false;
  }

  if (
    !matchesAny(`${item.title || ""} ${item.url || ""}`, SCHOLARSHIP_PAGE_PATTERNS) &&
    item.matchTier !== "best-fit"
  ) {
    return false;
  }

  if (isExpiredDeadline(item.deadlineIso, runTimestamp)) {
    return false;
  }

  const referenceTimestamp = item.lastSeenAt || item.firstSeenAt;

  if (!referenceTimestamp) {
    return false;
  }

  const ageInDays =
    (new Date(runTimestamp).getTime() - new Date(referenceTimestamp).getTime()) /
    (1000 * 60 * 60 * 24);

  return ageInDays <= CRAWL_SETTINGS.autoItemRetentionDays;
}

function createScholarshipMergeKey(item) {
  const normalizedUrl = normalizeUrl(item.url || item.applyUrl || "");

  if (normalizedUrl) {
    return normalizedUrl;
  }

  return `${normalizeText(item.title)}::${normalizeText(item.institution)}`;
}

function isExpiredDeadline(deadlineIso, runTimestamp) {
  if (!deadlineIso) {
    return false;
  }

  const deadline = new Date(`${deadlineIso}T23:59:59Z`);
  const now = new Date(runTimestamp);

  if (Number.isNaN(deadline.getTime()) || Number.isNaN(now.getTime())) {
    return false;
  }

  return deadline.getTime() < now.getTime();
}

function buildNotice({ liveItems, trackedCount, failedSources, manualCount }) {
  if (!liveItems.length && manualCount) {
    return "Only manual scholarship entries are visible right now. The free crawler did not find fresh matches in this run.";
  }

  if (!liveItems.length && trackedCount > 0) {
    return "No fresh matches were confirmed in this run, so the dashboard is keeping recently verified scholarships from earlier crawls.";
  }

  if (!liveItems.length) {
    return "The free crawler ran, but it did not find any pages that passed the current filters.";
  }

  if (failedSources > 0) {
    return "Some free sources failed during discovery, so the dashboard may be missing a few opportunities.";
  }

  return "";
}

function buildPayload({ items, liveCount, trackedCount, notice, stats }) {
  const automatedItems = items.filter((item) => item.sourceType !== "manual");
  const bestFitCount = automatedItems.filter((item) => item.matchTier === "best-fit").length;
  const possibleFitCount = automatedItems.filter((item) => item.matchTier === "possible-fit").length;

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      provider: "Free verified-source crawler",
      runMode: "live",
      liveCount,
      trackedCount,
      bestFitCount,
      possibleFitCount,
      notice,
      cadence: "Every 12 hours",
      verifiedSourceCount: VERIFIED_SOURCE_REGISTRY.length,
      stats,
    },
    items,
  };
}

function sortScholarships(left, right) {
  const leftTier = matchTierPriority(left.matchTier);
  const rightTier = matchTierPriority(right.matchTier);

  if (leftTier !== rightTier) {
    return leftTier - rightTier;
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

function matchTierPriority(value) {
  if (value === "best-fit") {
    return 0;
  }

  if (value === "possible-fit") {
    return 1;
  }

  return 2;
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

function getSourceSetting(source, sourceKey, crawlSettingKey) {
  const sourceValue = Number(source && source[sourceKey]);

  if (!Number.isNaN(sourceValue) && sourceValue > 0) {
    return sourceValue;
  }

  return CRAWL_SETTINGS[crawlSettingKey];
}

function normalizeBaseUrl(url) {
  try {
    const parsedUrl = new URL(url);
    parsedUrl.pathname = "/";
    parsedUrl.search = "";
    parsedUrl.hash = "";
    return parsedUrl.toString();
  } catch (error) {
    return url;
  }
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
    timeout: 15000,
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
