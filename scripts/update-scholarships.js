const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const fetch = require("node-fetch");
const cheerio = require("cheerio");
const {
  APPLY_LINK_PATTERNS,
  CRAWL_SETTINGS,
  DEADLINE_PATTERNS,
  DISCOVERY_EXCLUDE_KEYWORDS,
  DISCOVERY_KEYWORDS,
  EXCLUDED_DOMAINS,
  EXCLUDED_EXTENSIONS,
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
const NON_APPLICANT_PAGE_PATTERNS = [
  /donate/i,
  /giving/i,
  /fundraising/i,
  /support scholarships/i,
  /support a scholarship/i,
  /supporting scholarships/i,
  /future music fund/i,
  /alumni/i,
  /news/i,
  /press/i,
  /blog/i,
  /event/i,
];
const GENERIC_TITLE_PATTERNS = [
  /^funding$/i,
  /^scholarships?$/i,
  /^university scholarships?$/i,
  /^finding scholarships$/i,
  /^full[- ]time applicants$/i,
  /^stipendium$/i,
  /^study scholarships?$/i,
  /^financial support$/i,
  /^fees?( and| &)funding$/i,
  /^get informed on scholarships$/i,
  /^admissions$/i,
];
const EXTRACTION_NOISE_PATTERNS = [
  /also check/i,
  /read more/i,
  /share this/i,
  /follow us/i,
  /newsletter/i,
  /sign up/i,
  /cookie/i,
  /copyright/i,
];
const NON_CONTENT_BLOCK_PATTERNS = [
  /skip to (main )?content/i,
  /accept all/i,
  /manage preferences/i,
  /save preferences/i,
  /reject all/i,
  /back to main menu/i,
  /search menu/i,
  /open menu/i,
  /close menu/i,
  /cookie/i,
  /privacy/i,
  /all rights reserved/i,
];
const STRONG_SCHOLARSHIP_INTENT_PATTERNS = [
  /scholarship/i,
  /scholarships/i,
  /bursar/i,
  /award/i,
  /awards/i,
  /studentship/i,
  /grant\b/i,
  /fellowship/i,
];
const WEAK_FUNDING_PATTERNS = [
  /financial support/i,
  /fees?(,| and| &)? funding/i,
  /costs? of studying/i,
  /student financial support/i,
];
const BENEFIT_DETAIL_PATTERNS = [
  /tuition/i,
  /course fees?/i,
  /stipend/i,
  /allowance/i,
  /living expenses?/i,
  /maintenance/i,
  /accommodation/i,
  /housing/i,
  /airfare/i,
  /flight/i,
  /travel/i,
  /insurance/i,
  /health insurance/i,
];
const STRONG_GLOBAL_ELIGIBILITY_PATTERNS = [
  /all nationalities/i,
  /any nationality/i,
  /all over the world/i,
  /from around the world/i,
  /open to applicants worldwide/i,
  /worldwide applicants/i,
  /students from any country/i,
  /regardless of nationality/i,
  /no restrictions? on nationality/i,
  /no restriction on nationality/i,
  /international students/i,
  /international applicants/i,
  /countries outside the uk/i,
  /outside the united kingdom/i,
  /outside the uk/i,
  /open to international applicants/i,
  /all countries and territories/i,
  /foreign students/i,
  /foreign nationals/i,
  /non[-\s]?korean citizenship/i,
  /applicants from \d{2,3} countries/i,
  /open to applicants from \d{2,3} countries/i,
  /over \d{2,3} other countries/i,
];
const REVIEW_ONLY_ELIGIBILITY_PATTERNS = [
  /eligible countries/i,
  /citizens of eligible countries/i,
  /participating countries/i,
  /partner countries/i,
];
const APPLICATION_OPEN_PATTERNS = [
  /applications? (?:are|is)?\s*open/i,
  /open now/i,
  /currently open/i,
  /apply now/i,
  /accepting applications/i,
  /call for applications/i,
];
const APPLICATION_CLOSED_PATTERNS = [
  /applications? (?:are|is)?\s*closed/i,
  /call closed/i,
  /currently closed/i,
  /applications? closed/i,
  /deadline has passed/i,
  /closed for .*cycle/i,
];
const APPLICATION_ROLLING_PATTERNS = [
  /rolling basis/i,
  /rolling admissions/i,
  /applications? accepted year-round/i,
  /apply any time/i,
];
const LOCATION_PATTERNS = [
  { label: "China", patterns: [/china/i, /beijing/i, /tsinghua/i, /peking university/i] },
  { label: "Turkey", patterns: [/turkey/i, /turkiye/i, /türkiye/i, /ankara/i, /istanbul/i] },
  { label: "South Korea", patterns: [/south korea/i, /\bkorea\b/i, /kaist/i, /study in korea/i] },
  { label: "Japan", patterns: [/japan/i, /japanese government/i, /mext/i, /jasso/i] },
  { label: "Switzerland", patterns: [/switzerland/i, /swiss/i, /geneva/i, /zurich/i] },
  { label: "Canada", patterns: [/canada/i, /mcgill/i, /montreal/i] },
  { label: "United Kingdom", patterns: [/united kingdom/i, /\buk\b/i, /england/i, /scotland/i] },
  { label: "United States", patterns: [/united states/i, /\busa\b/i, /stanford/i] },
  { label: "Germany", patterns: [/germany/i, /deutscher akademischer austauschdienst/i] },
  { label: "Sweden", patterns: [/sweden/i, /swedish institute/i] },
  { label: "Belgium", patterns: [/belgium/i, /flemish/i] },
  { label: "Hungary", patterns: [/hungary/i, /hungaricum/i] },
  { label: "Ireland", patterns: [/ireland/i, /higher education authority/i] },
  { label: "Australia", patterns: [/australia/i, /sydney/i] },
  { label: "Italy", patterns: [/italy/i, /italian government scholarship/i] },
  { label: "Thailand", patterns: [/thailand/i, /\bsiit\b/i] },
  { label: "Qatar", patterns: [/qatar/i, /doha/i] },
  { label: "United Arab Emirates", patterns: [/united arab emirates/i, /\buae\b/i, /abu dhabi/i] },
  { label: "Saudi Arabia", patterns: [/saudi arabia/i, /kaust/i, /thuwal/i] },
  { label: "Europe", patterns: [/erasmus mundus/i, /europe/i] },
];
const SOURCE_LOCATION_HINTS = {
  commonwealth: "United Kingdom",
  "gates-cambridge": "Cambridge, United Kingdom",
  clarendon: "Oxford, United Kingdom",
  fulbright: "United States",
  "knight-hennessy": "Stanford, California, United States",
  daad: "Germany",
  "erasmus-mundus": "Europe",
  "swedish-institute": "Sweden",
  sydney: "Sydney, Australia",
  hbku: "Doha, Qatar",
  khalifa: "Abu Dhabi, United Arab Emirates",
  kaust: "Saudi Arabia",
  "qatar-university": "Doha, Qatar",
  chevening: "United Kingdom",
  "stipendium-hungaricum": "Hungary",
  "goi-ies": "Ireland",
  "turkiye-scholarships": "Turkey",
  "schwarzman-scholars": "Beijing, China",
  "swiss-government-excellence": "Switzerland",
  gks: "South Korea",
  "mccall-macbain": "Montreal, Canada",
  "yenching-academy": "Beijing, China",
};

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

  const uniqueCandidates = selectCandidateBatch(
    discoveredCandidates,
    CRAWL_SETTINGS.maxScholarshipPages
  );

  crawlStats.discoveredUrls = uniqueCandidates.length;

  const liveItems = [];

  await mapWithConcurrency(
    uniqueCandidates,
    CRAWL_SETTINGS.concurrentCandidateFetches,
    async (candidate) => {
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

      await sleep(50);
    }
  );

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
    maxCandidateUrlsPerSource: 14,
    maxSeedLinksPerPage: 32,
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

      links.push({
        url: absoluteUrl,
        score: scoreCandidateLink(absoluteUrl, text, source),
      });
    } catch (error) {
      return;
    }
  });

  return dedupeBy(
    links
      .sort((left, right) => right.score - left.score || left.url.localeCompare(right.url))
      .map((entry) => entry.url),
    (url) => url
  );
}

function scoreCandidateLink(url, text, source) {
  const haystack = `${url} ${text}`.toLowerCase();
  let score = 0;

  if (hasStrongScholarshipIntent(haystack)) score += 8;
  if (hasScholarshipPageSignal(haystack)) score += 4;
  if (matchesAny(haystack, MASTERS_PATTERNS)) score += 3;
  if (/apply|application/i.test(haystack)) score += 1;
  if (matchesAny(haystack, NON_APPLICANT_PAGE_PATTERNS)) score -= 8;
  if (/prospectus|international(\/|$)|student-support$/i.test(url)) score -= 2;
  if (source && source.sourceType === "directory") score -= 1;

  return score;
}

function stripNonContentNodes($) {
  $(
    [
      "script",
      "style",
      "noscript",
      "svg",
      "nav",
      "header",
      "footer",
      "aside",
      "form",
      "dialog",
      "button",
      "select",
      "option",
      "input",
      "iframe",
    ].join(", ")
  ).remove();
  $(
    [
      ".breadcrumb",
      ".breadcrumbs",
      ".cookie",
      ".cookies",
      ".site-header",
      ".site-footer",
      ".header",
      ".footer",
      ".navigation",
      ".nav",
      ".menu",
      ".sidebar",
      ".search",
      ".social-share",
      ".share",
      ".skip-links",
      '[role="navigation"]',
      '[aria-label*="breadcrumb"]',
    ].join(", ")
  ).remove();
}

function extractPageContent($) {
  const root = findPrimaryContentRoot($);
  const blocks = extractTextBlocks(root, $);
  const scoredBlocks = blocks
    .map((text) => ({
      text,
      score: scoreContentBlock(text),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.text.length - right.text.length);
  const relevantBlocks = scoredBlocks.slice(0, 40).map((entry) => entry.text);
  const evidenceBlocks = scoredBlocks
    .filter((entry) => entry.score >= 5)
    .slice(0, 20)
    .map((entry) => entry.text);

  return {
    bodyText: blocks.join(" ").slice(0, 50000),
    relevantText: (relevantBlocks.length ? relevantBlocks : blocks.slice(0, 40)).join(" "),
    evidenceText: (evidenceBlocks.length ? evidenceBlocks : relevantBlocks).join(" "),
  };
}

function findPrimaryContentRoot($) {
  const selectors = [
    "main",
    "article",
    '[role="main"]',
    "#main-content",
    "#main",
    ".main-content",
    ".page-content",
    ".content-main",
    ".content",
    "body",
  ];

  for (const selector of selectors) {
    const node = $(selector).first();

    if (!node.length) {
      continue;
    }

    const text = cleanText(node.text());

    if (text.length >= 600) {
      return node;
    }
  }

  return $("body");
}

function extractTextBlocks(root, $) {
  const blocks = [];

  root.find("h1, h2, h3, h4, p, li, td, dd").each((_, node) => {
    const text = cleanText($(node).text());

    if (!isLikelyContentBlock(text)) {
      return;
    }

    blocks.push(text);
  });

  return dedupeBy(blocks, (value) => normalizeText(value));
}

function isLikelyContentBlock(text) {
  if (!text || text.length < 30 || text.length > 500) {
    return false;
  }

  if (matchesAny(text, NON_CONTENT_BLOCK_PATTERNS)) {
    return false;
  }

  if (text.split(" ").length > 35 && !/[.!?:;]/.test(text)) {
    return false;
  }

  if (/^(home|menu|search|contact|about|news|apply)$/i.test(text)) {
    return false;
  }

  return true;
}

function scoreContentBlock(text) {
  let score = 0;

  if (hasStrongScholarshipIntent(text)) score += 6;
  if (hasScholarshipPageSignal(text)) score += 3;
  if (matchesAny(text, FUNDING_PATTERNS)) score += 3;
  if (matchesAny(text, STIPEND_PATTERNS)) score += 3;
  if (matchesAny(text, OPEN_INTERNATIONAL_PATTERNS) || matchesAny(text, IRAQ_PATTERNS)) score += 3;
  if (matchesAny(text, MASTERS_PATTERNS)) score += 2;
  if (matchesAny(text, DEADLINE_PATTERNS)) score += 1;
  if (matchesAny(text, NON_APPLICANT_PAGE_PATTERNS)) score -= 6;

  return score;
}

function hasStrongScholarshipIntent(text) {
  return matchesAny(text, STRONG_SCHOLARSHIP_INTENT_PATTERNS);
}

function hasScholarshipPageSignal(text) {
  return matchesAny(text, SCHOLARSHIP_PAGE_PATTERNS);
}

function hasStrongFundingSignal(text) {
  return (
    matchesAny(text, FUNDING_PATTERNS) &&
    (!matchesAny(text, WEAK_FUNDING_PATTERNS) || hasStrongScholarshipIntent(text))
  );
}

function hasStipendSignal(text) {
  return matchesAny(text, STIPEND_PATTERNS);
}

function hasComprehensiveBenefitSignal(text) {
  const normalized = cleanText(text);
  const hasTuitionSignal = /tuition|course fees?|tuition fee/i.test(normalized);
  const detailCount = BENEFIT_DETAIL_PATTERNS.filter((pattern) => pattern.test(normalized)).length;
  return hasTuitionSignal && detailCount >= 2;
}

function extractScholarship(candidate, html) {
  const $ = cheerio.load(html);
  stripNonContentNodes($);

  const title = extractPreferredTitle($, candidate);
  const metaDescription = cleanText(
    $('meta[name="description"]').attr("content") ||
      $('meta[property="og:description"]').attr("content") ||
      ""
  );
  const siteName = cleanText(
    $('meta[property="og:site_name"]').attr("content") ||
      $('meta[name="application-name"]').attr("content")
  );
  const content = extractPageContent($);
  const bodyText = content.bodyText;
  const relevantText = content.relevantText || bodyText;
  const evidenceText = content.evidenceText || relevantText;

  if (!bodyText || bodyText.length < 300) {
    return null;
  }

  if (
    matchesAny(title, EXCLUDED_TITLE_PATTERNS) ||
    matchesAny(`${title} ${candidate.url} ${metaDescription}`, NON_APPLICANT_PAGE_PATTERNS) ||
    isGenericDirectoryLandingPage(candidate, title) ||
    isGenericScholarshipHubPage(candidate, title) ||
    failsSourceSpecificPageRules(candidate, title)
  ) {
    return null;
  }

  const scholarshipIntent = hasStrongScholarshipIntent(
    `${title} ${candidate.url} ${metaDescription} ${evidenceText.slice(0, 1200)}`
  );
  const scholarshipPage = hasScholarshipPageSignal(
    `${title} ${candidate.url} ${metaDescription} ${relevantText.slice(0, 1600)}`
  );
  const combinedText = [title, metaDescription, evidenceText].join(" ");
  const primaryRegion = detectRegion(`${title} ${metaDescription}`, candidate.url);
  const region =
    primaryRegion ||
    (candidate.source.sourceType === "directory" ? null : detectRegion(evidenceText, candidate.url)) ||
    regionFromHint(candidate.source.regionHint);
  const deadline = extractDeadline(relevantText);
  const applicationStatus = extractApplicationStatus(relevantText, deadline.iso);
  const eligibility = extractEligibility(`${relevantText} ${bodyText.slice(0, 20000)}`);
  const benefits = extractBenefits(relevantText, metaDescription);
  const requirements = extractRequirements(relevantText);
  const criteria = buildCriteria(eligibility, requirements);
  const applyUrl = extractApplyUrl($, candidate.url);
  const sourceType = candidate.source.sourceType || classifySource(candidate.url);
  const institution = inferInstitution(title, siteName, candidate.url, candidate.source.label);
  const location = inferLocation(candidate, institution, region, combinedText);

  const signals = {
    scholarshipIntent,
    scholarshipPage,
    funded: hasStrongFundingSignal(combinedText) || hasComprehensiveBenefitSignal(combinedText),
    stipend: hasStipendSignal(combinedText),
    iraqEligible: eligibility.isMatch,
    region: Boolean(region || location),
    statusKnown: applicationStatus.code !== "needs-review",
    official: sourceType === "official" || sourceType === "manual",
  };

  const score = scoreSignals(signals, sourceType, Boolean(deadline.iso), applicationStatus.code);
  const matchTier = determineMatchTier(signals, sourceType, score);

  if (!matchTier) {
    return null;
  }

  if (hasExplicitNegativeEligibility(relevantText)) {
    return null;
  }

  if (
    candidate.source &&
    candidate.source.discoveredVia &&
    isGenericTitle(title) &&
    !deadline.iso &&
    !signals.iraqEligible &&
    !applicationStatus.isOpen
  ) {
    return null;
  }

  const missingChecks = collectMissingChecks(signals);

  return {
    id: createId(candidate.url, title),
    title,
    institution,
    location,
    region: region ? region.label : "Unclear",
    url: candidate.url,
    applyUrl,
    deadline: deadline.label || "Not found",
    deadlineIso: deadline.iso || "",
    applicationStatus: applicationStatus.label,
    applicationStatusCode: applicationStatus.code,
    benefits: benefits || "Benefits found, but the exact tuition and stipend package still needs review.",
    funding: benefits || "Benefits found, but the exact tuition and stipend package still needs review.",
    requirements,
    criteria,
    eligibility:
      eligibility.text ||
      "Iraq eligibility still needs manual confirmation on the source page.",
    topics: [],
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
      criteria.length === 0 ||
      sourceType !== "official" ||
      !eligibility.isMatch ||
      !benefits ||
      applicationStatus.code === "needs-review",
    score,
  };
}

function scoreSignals(signals, sourceType, hasDeadline, applicationStatusCode) {
  let score = 0;

  if (signals.scholarshipIntent) score += 3;
  if (!signals.scholarshipIntent && signals.scholarshipPage) score += 1;
  if (signals.funded) score += 4;
  if (signals.stipend) score += 3;
  if (signals.iraqEligible) score += 4;
  if (signals.region) score += 2;
  if (signals.statusKnown) score += 1;
  if (applicationStatusCode === "open" || applicationStatusCode === "rolling") score += 1;
  if (sourceType === "official") score += 2;
  if (hasDeadline) score += 1;

  return score;
}

function passesStrictFilters(signals, score) {
  return (
    signals.scholarshipIntent &&
    signals.funded &&
    signals.stipend &&
    signals.iraqEligible &&
    signals.region &&
    score >= CRAWL_SETTINGS.minScore
  );
}

function determineMatchTier(signals, sourceType, score) {
  if (passesStrictFilters(signals, score) && (sourceType === "official" || sourceType === "manual")) {
    return "best-fit";
  }

  if (
    signals.scholarshipIntent &&
    signals.region &&
    (signals.funded || signals.stipend) &&
    signals.iraqEligible &&
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

  if (!signals.statusKnown) {
    missingChecks.push("the application status still needs manual review");
  }

  return missingChecks;
}

function buildMatchNote(matchTier, missingChecks) {
  if (matchTier === "best-fit") {
    return "Best fit: this page matched the funding, stipend, location, and Iraq eligibility checks.";
  }

  if (missingChecks.length) {
    return `Possible fit: ${missingChecks[0]}.`;
  }

  return "Possible fit: this is a strong official lead, but one strict criterion still needs manual confirmation.";
}

function detectRegion(text, url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();

    if (hostname.endsWith(".ac.kr") || hostname.includes(".ac.kr") || hostname.endsWith(".go.kr")) {
      return regionFromHint("South Korea");
    }

    if (hostname.endsWith(".edu.cn") || hostname.includes(".edu.cn")) {
      return regionFromHint("China");
    }

    if (hostname.endsWith(".ac.jp") || hostname.includes(".go.jp")) {
      return regionFromHint("Japan");
    }

    if (hostname.endsWith(".edu.tr") || hostname.includes(".gov.tr")) {
      return regionFromHint("Turkey");
    }

    if (hostname.endsWith(".edu.au") || hostname.includes(".edu.au")) {
      return regionFromHint("Australia");
    }

    if (hostname.endsWith(".ac.uk") || hostname.includes(".ac.uk")) {
      return regionFromHint("UK");
    }

    if (hostname.endsWith(".edu")) {
      return regionFromHint("US");
    }
  } catch (error) {
    // Fall through to text-based detection.
  }

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

function extractApplicationStatus(text, deadlineIso) {
  const normalized = cleanText(text);

  if (matchesAny(normalized, APPLICATION_CLOSED_PATTERNS)) {
    return { code: "closed", label: "Closed", isOpen: false };
  }

  if (matchesAny(normalized, APPLICATION_ROLLING_PATTERNS)) {
    return { code: "rolling", label: "Rolling", isOpen: true };
  }

  if (matchesAny(normalized, APPLICATION_OPEN_PATTERNS)) {
    return { code: "open", label: "Open", isOpen: true };
  }

  if (deadlineIso) {
    const deadline = new Date(`${deadlineIso}T23:59:59Z`);
    const now = new Date();

    if (!Number.isNaN(deadline.getTime())) {
      if (deadline.getTime() < now.getTime()) {
        return { code: "closed", label: "Closed", isOpen: false };
      }

      return { code: "open", label: "Open", isOpen: true };
    }
  }

  return { code: "needs-review", label: "Check source", isOpen: false };
}

function extractEligibility(text) {
  const normalized = cleanText(text);
  const sentences = splitIntoSentences(text);
  const iraqWindowMatch = normalized.match(
    /((eligible|eligibility|country|countries|nationalit|citizen|citizens|applicant|applicants)[^.]{0,220}iraq|iraq[^.]{0,220}(eligible|eligibility|country|countries|nationalit|citizen|citizens|applicant|applicants))/i
  );

  if (iraqWindowMatch && iraqWindowMatch[0]) {
    return { isMatch: true, text: cleanText(iraqWindowMatch[0]), type: "iraq-explicit" };
  }

  const iraqSentence = sentences.find(
    (sentence) =>
      !isNoisyExtractedSentence(sentence) &&
      sentence.length <= 320 &&
      matchesAny(sentence, IRAQ_PATTERNS) &&
      /(eligible|nationalit|country|citizen|applicant|student|scholarship|award)/i.test(sentence)
  );

  if (iraqSentence) {
    return { isMatch: true, text: iraqSentence, type: "iraq-explicit" };
  }

  const internationalSentence = sentences.find((sentence) =>
    !isNoisyExtractedSentence(sentence) &&
    sentence.length <= 320 &&
    matchesAny(sentence, STRONG_GLOBAL_ELIGIBILITY_PATTERNS) &&
    /(eligible|eligibility|nationalit|country|citizen|applicant|open|world|worldwide|global|outside the uk|regardless|foreign|international)/i.test(
      sentence
    )
  );

  if (internationalSentence) {
    return { isMatch: true, text: internationalSentence, type: "broad-international" };
  }

  const reviewSentence = sentences.find(
    (sentence) =>
      !isNoisyExtractedSentence(sentence) &&
      sentence.length <= 320 &&
      matchesAny(sentence, REVIEW_ONLY_ELIGIBILITY_PATTERNS)
  );

  if (reviewSentence && matchesAny(normalized, IRAQ_PATTERNS)) {
    return { isMatch: true, text: reviewSentence, type: "iraq-listed" };
  }

  return { isMatch: false, text: "", type: "unknown" };
}

function extractBenefits(text, fallback) {
  const sentences = splitIntoSentences(`${fallback}. ${text}`);
  const primaryIndex = sentences.findIndex(
    (entry) =>
      !isNoisyExtractedSentence(entry) &&
      entry.length <= 320 &&
      matchesAny(entry, FUNDING_PATTERNS) &&
      matchesAny(entry, STIPEND_PATTERNS) &&
      (hasStrongScholarshipIntent(entry) || /tuition|fees|living|maintenance|stipend|travel/i.test(entry))
  );

  if (primaryIndex >= 0) {
    const current = sentences[primaryIndex];
    const next = sentences[primaryIndex + 1] || "";
    const combined =
      /includes?$/i.test(current) || /includes?$/i.test(current.replace(/[:;]$/, ""))
        ? cleanText(`${current} ${next}`)
        : current;

    return combined;
  }

  const fallbackSentence = sentences.find(
    (entry) =>
      !isNoisyExtractedSentence(entry) &&
      entry.length <= 280 &&
      matchesAny(entry, FUNDING_PATTERNS) &&
      (hasStrongScholarshipIntent(entry) || !matchesAny(entry, WEAK_FUNDING_PATTERNS))
  );

  if (fallbackSentence) {
    return fallbackSentence;
  }

  const packageSentence = sentences.find(
    (entry) =>
      !isNoisyExtractedSentence(entry) &&
      entry.length <= 320 &&
      hasComprehensiveBenefitSignal(entry)
  );

  return packageSentence || "";
}

function buildCriteria(eligibility, requirements) {
  return dedupeBy(
    [eligibility.text, ...(Array.isArray(requirements) ? requirements : [])].filter(Boolean),
    (entry) => normalizeText(entry)
  ).slice(0, 4);
}

function extractRequirements(text) {
  const sentences = splitIntoSentences(text);
  return dedupeBy(
    sentences.filter((sentence) => {
      if (sentence.length < 35 || sentence.length > 240) {
        return false;
      }

      if (isNoisyExtractedSentence(sentence)) {
        return false;
      }

      return matchesAny(sentence, REQUIREMENT_PATTERNS);
    }),
    (sentence) => normalizeText(sentence)
  ).slice(0, 3);
}

function inferLocation(candidate, institution, region, text) {
  const sourceId = candidate && candidate.source ? candidate.source.id : "";

  if (SOURCE_LOCATION_HINTS[sourceId]) {
    return SOURCE_LOCATION_HINTS[sourceId];
  }

  if (candidate && candidate.source && candidate.source.discoveredVia) {
    return region ? `${institution}, ${region.label}` : institution;
  }

  const detected = LOCATION_PATTERNS.find((entry) => matchesAny(text, entry.patterns));

  if (detected) {
    return detected.label;
  }

  if (region) {
    return region.label;
  }

  return institution || "Location needs review";
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
    "scholarships-and-funding",
    "bursary",
    "award",
    "financial-aid",
    "financial-support",
    "tuition-fees",
    "student-finance",
    "graduate-school",
    "postgraduate/fees",
  ].some((keyword) => value.includes(keyword));
}

function isGenericDirectoryLandingPage(candidate, title) {
  if (!candidate.source || candidate.source.sourceType !== "directory") {
    return false;
  }

  try {
    const pathname = new URL(candidate.url).pathname;

    if (pathname === "/" || pathname === "") {
      return true;
    }
  } catch (error) {
    return false;
  }

  return /international scholarships for international students/i.test(title);
}

function isGenericScholarshipHubPage(candidate, title) {
  if (!candidate || !candidate.source) {
    return false;
  }

  let pathname = "";

  try {
    pathname = new URL(candidate.url).pathname.toLowerCase().replace(/\/+$/, "") || "/";
  } catch (error) {
    pathname = "";
  }

  const genericPath = [
    "/",
    "/scholarships",
    "/scholarship",
    "/funding",
    "/fees-and-funding",
    "/financial-support",
    "/student-finance",
    "/en/apply/scholarships",
  ].includes(pathname);
  const sourceLabel = candidate.source.label || "";
  const sourceLooksLikeUniversity =
    Boolean(candidate.source.discoveredVia) || /university|college|admissions/i.test(sourceLabel);

  if (candidate.source.discoveredVia && (isGenericTitle(title) || genericPath)) {
    return true;
  }

  if (sourceLooksLikeUniversity && isGenericTitle(title) && genericPath) {
    return true;
  }

  return /scholarship database/i.test(title) && !/[?&]detail=/i.test(candidate.url);
}

function hasExplicitNegativeEligibility(text) {
  if (!text) {
    return false;
  }

  return /international students? (?:are not|aren't|not) eligible|not available to international students|domestic students only|home students only|uk students only|us citizens only/i.test(
    text
  );
}

function failsSourceSpecificPageRules(candidate, title = "") {
  if (!candidate || !candidate.source) {
    return false;
  }

  const url = candidate.url || "";
  const sourceId = candidate.source.id || "";

  if (sourceId === "clarendon" && /offer-holders\/|section_highlight\/clarendon-information-/i.test(url)) {
    return true;
  }

  if (sourceId === "swedish-institute" && !/\/apply\/scholarships\//i.test(url)) {
    return true;
  }

  if (
    sourceId === "swedish-institute" &&
    /\/en\/apply\/scholarships\/?$/i.test(url)
  ) {
    return true;
  }

  if (sourceId === "erasmus-mundus" && /erasmus-mundus-catalogue/i.test(url)) {
    return true;
  }

  if (sourceId === "sydney" && /\/scholarships\/?$/i.test(url)) {
    return true;
  }

  if (sourceId === "daad" && isGenericTitle(title) && !/[?&]detail=/i.test(url)) {
    return true;
  }

  if (
    sourceId === "fulbright" &&
    (/\/flta\//i.test(url) || /\/host-institutions\//i.test(url))
  ) {
    return true;
  }

  if (sourceId === "goi-ies" && !/\/policy\/internationalisation\/goi-ies\/?$/i.test(url)) {
    return true;
  }

  if (
    sourceId === "stipendium-hungaricum" &&
    (/\/faq\//i.test(url) || /\/scholarship-holders\/?$/i.test(url) || /\/study-finder\/?$/i.test(url))
  ) {
    return true;
  }

  if (
    sourceId === "turkiye-scholarships" &&
    (/\/about\/?$/i.test(url) || /history of türkiye scholarships/i.test(title))
  ) {
    return true;
  }

  if (
    sourceId === "swiss-government-excellence" &&
    !/\/en\/swiss-government-excellence-scholarships\/?$/i.test(url)
  ) {
    return true;
  }

  if (sourceId === "gks" && !/\/cmm\/plan\/scholarship\.do/i.test(url)) {
    return true;
  }

  if (
    sourceId === "schwarzman-scholars" &&
    !(/\/$/i.test(url) || /\/admissions\/?$/i.test(url))
  ) {
    return true;
  }

  if (
    sourceId === "mccall-macbain" &&
    !(/\/$/i.test(url) || /\/apply\/?$/i.test(url))
  ) {
    return true;
  }

  if (
    sourceId === "yenching-academy" &&
    !(/\/$/i.test(url) || /\/ADMISSIONS\.htm$/i.test(url))
  ) {
    return true;
  }

  return false;
}

function extractPreferredTitle($, candidate) {
  const rawTitleTag = cleanText($("title").first().text());
  const rawOgTitle = cleanText($('meta[property="og:title"]').attr("content"));
  const rawHeading = cleanText($("h1").first().text());
  const titleCandidates = dedupeBy(
    [
      rawTitleTag,
      rawOgTitle,
      rawHeading,
      ...splitTitleCandidates(rawTitleTag),
      ...splitTitleCandidates(rawOgTitle),
    ].filter(Boolean),
    (value) => normalizeText(value)
  );

  const bestCandidate =
    titleCandidates.sort(
      (left, right) =>
        scoreTitleCandidate(right, candidate) - scoreTitleCandidate(left, candidate) ||
        right.length - left.length
    )[0] || candidate.url;

  return normalizeDisplayTitle(bestCandidate, candidate);
}

function splitTitleCandidates(value) {
  const text = cleanText(value);

  if (!text) {
    return [];
  }

  return text
    .split(/\s+\|\s+|\s+-\s+/)
    .map((segment) => cleanText(segment))
    .filter(Boolean);
}

function scoreTitleCandidate(title, candidate) {
  if (!title) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;
  const normalizedTitle = cleanText(title);

  if (normalizedTitle.length >= 12) score += 1;
  if (normalizedTitle.length >= 24) score += 1;
  if (hasStrongScholarshipIntent(normalizedTitle) || hasScholarshipPageSignal(normalizedTitle)) {
    score += 3;
  }
  if (matchesAny(normalizedTitle, MASTERS_PATTERNS)) score += 3;
  if (matchesAny(normalizedTitle, FUNDING_PATTERNS) || matchesAny(normalizedTitle, STIPEND_PATTERNS)) {
    score += 1;
  }
  if (titleIncludesSourceLabel(normalizedTitle, candidate.source && candidate.source.label)) {
    score += 2;
  }
  if (isGenericTitle(normalizedTitle)) {
    score -= 6;
  }

  return score;
}

function titleIncludesSourceLabel(title, label) {
  const normalizedLabel = normalizeText(label || "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(
      (token) =>
        token.length > 4 &&
        !["scholarship", "scholarships", "university", "students", "graduate"].includes(token)
    );

  if (!normalizedLabel.length) {
    return false;
  }

  const normalizedTitle = normalizeText(title || "").replace(/[^a-z0-9]+/g, " ");
  return normalizedLabel.some((token) => normalizedTitle.includes(token));
}

function normalizeDisplayTitle(title, candidate) {
  const normalizedTitle = cleanText(title);

  if (!normalizedTitle) {
    return candidate.url;
  }

  if (/\s+\|\s+/i.test(normalizedTitle)) {
    const parts = normalizedTitle.split(/\s+\|\s+/).map((part) => cleanText(part));
    const first = parts[0];
    const second = parts[1] || "";

    if (isGenericTitle(first) && titleIncludesSourceLabel(second, candidate.source && candidate.source.label)) {
      if (/funding/i.test(first) && candidate.source && candidate.source.label) {
        return `${candidate.source.label} Funding`;
      }

      return second || first;
    }
  }

  if (/\s+-\s+/i.test(normalizedTitle)) {
    const parts = normalizedTitle.split(/\s+-\s+/).map((part) => cleanText(part));
    const last = parts[parts.length - 1] || "";

    if (parts.length >= 3 && titleIncludesSourceLabel(last, candidate.source && candidate.source.label)) {
      return parts.slice(0, -1).join(" - ");
    }
  }

  if (isGenericTitle(normalizedTitle) && candidate.source && candidate.source.label) {
    if (/funding/i.test(normalizedTitle)) {
      return `${candidate.source.label} Funding`;
    }

    return candidate.source.label;
  }

  return normalizedTitle;
}

function isGenericTitle(title) {
  return matchesAny(title, GENERIC_TITLE_PATTERNS);
}

function isNoisyExtractedSentence(sentence) {
  return matchesAny(sentence, EXTRACTION_NOISE_PATTERNS);
}

function selectCandidateBatch(candidates, maxCandidates) {
  const uniqueCandidates = dedupeBy(candidates, (item) => normalizeUrl(item.url));
  const bandOrder = ["curated-official", "university-official", "external-directory"];
  const bandBuckets = {
    "curated-official": [],
    "university-official": [],
    "external-directory": [],
  };

  uniqueCandidates.forEach((candidate) => {
    bandBuckets[getCandidateBand(candidate)].push(candidate);
  });

  const stagedSelection = [];
  const quotas = {
    "curated-official": Math.ceil(maxCandidates * 0.6),
    "university-official": Math.ceil(maxCandidates * 0.3),
    "external-directory": Math.ceil(maxCandidates * 0.1),
  };

  bandOrder.forEach((band) => {
    stagedSelection.push(...interleaveCandidates(bandBuckets[band], quotas[band]));
  });

  if (stagedSelection.length < maxCandidates) {
    const usedUrls = new Set(stagedSelection.map((item) => normalizeUrl(item.url)));
    const leftovers = uniqueCandidates.filter((candidate) => !usedUrls.has(normalizeUrl(candidate.url)));

    stagedSelection.push(...interleaveCandidates(leftovers, maxCandidates - stagedSelection.length));
  }

  return stagedSelection.slice(0, maxCandidates);
}

function interleaveCandidates(candidates, maxItems) {
  if (maxItems <= 0 || !candidates.length) {
    return [];
  }

  const grouped = new Map();

  candidates.forEach((candidate) => {
    const key = candidate.source && candidate.source.id ? candidate.source.id : candidate.url;

    if (!grouped.has(key)) {
      grouped.set(key, []);
    }

    grouped.get(key).push(candidate);
  });

  const groups = [...grouped.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([, items]) => items);
  const selection = [];

  while (selection.length < maxItems && groups.some((items) => items.length)) {
    for (const items of groups) {
      if (!items.length || selection.length >= maxItems) {
        continue;
      }

      selection.push(items.shift());
    }
  }

  return selection;
}

function getCandidateBand(candidate) {
  if (candidate.source && candidate.source.discoveredVia) {
    return "university-official";
  }

  if (candidate.source && candidate.source.sourceType === "directory") {
    return "external-directory";
  }

  return "curated-official";
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
        location: item.location || item.region || "Location needs review",
        region: item.region || "Unclear",
        url: item.url || item.applyUrl || "#",
        applyUrl: item.applyUrl || item.url || "#",
        deadline: item.deadline || "Manual entry",
        deadlineIso: item.deadlineIso || "",
        applicationStatus: item.applicationStatus || "Check source",
        applicationStatusCode: item.applicationStatusCode || "needs-review",
        benefits: item.benefits || item.funding || "Added manually",
        funding: item.funding || item.benefits || "Added manually",
        requirements: Array.isArray(item.requirements) ? item.requirements : [],
        criteria: Array.isArray(item.criteria)
          ? item.criteria
          : Array.isArray(item.requirements)
            ? item.requirements
            : [],
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
    isGenericTitle(item.title || "") ||
    /erasmus-mundus-catalogue/i.test(item.url || "") ||
    /\/en\/apply\/scholarships\/?$/i.test(item.url || "") ||
    /sydney\.edu\.au\/scholarships\/?$/i.test(item.url || "") ||
    /frankfurt-university\.de\/scholarships\/?$/i.test(item.url || "")
  ) {
    return false;
  }

  if (
    matchesAny(`${item.title || ""} ${item.url || ""}`, NON_APPLICANT_PAGE_PATTERNS) ||
    /\/clarendon\/offer-holders\//i.test(item.url || "") ||
    (/si\.se/i.test(item.url || "") && !/\/apply\/scholarships\//i.test(item.url || ""))
  ) {
    return false;
  }

  if (
    !matchesAny(`${item.title || ""} ${item.url || ""}`, SCHOLARSHIP_PAGE_PATTERNS) &&
    item.matchTier !== "best-fit"
  ) {
    return false;
  }

  if (
    isNoisyExtractedSentence(item.funding || item.benefits || "") ||
    isNoisyExtractedSentence(item.eligibility || "")
  ) {
    return false;
  }

  if (!item.applicationStatusCode || item.applicationStatusCode === "needs-review") {
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
    return "Only manual scholarship entries are visible right now. The crawler did not confirm fresh scholarship facts in this run.";
  }

  if (!liveItems.length && trackedCount > 0) {
    return "No fresh scholarship pages were confirmed in this run, so the dashboard is keeping recently verified entries from earlier crawls.";
  }

  if (!liveItems.length) {
    return "The crawler ran, but it did not find any pages that passed the current fully funded and Iraq-eligibility checks.";
  }

  if (failedSources > 0) {
    return "Some free sources failed during discovery, so the dashboard may be missing a few opportunities.";
  }

  return "";
}

function buildPayload({ items, liveCount, trackedCount, notice, stats }) {
  const automatedItems = items.filter((item) => item.sourceType !== "manual");
  const openCount = automatedItems.filter((item) => item.applicationStatusCode === "open").length;
  const closedCount = automatedItems.filter((item) => item.applicationStatusCode === "closed").length;
  const rollingCount = automatedItems.filter((item) => item.applicationStatusCode === "rolling").length;
  const reviewCount = automatedItems.filter((item) => item.reviewNeeded).length;

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      provider: "Free verified-source crawler",
      runMode: "live",
      liveCount,
      trackedCount,
      openCount,
      closedCount,
      rollingCount,
      reviewCount,
      notice,
      cadence: "Every 12 hours",
      verifiedSourceCount: VERIFIED_SOURCE_REGISTRY.length,
      stats,
    },
    items,
  };
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

function splitIntoSentences(text) {
  return cleanText(text)
    .split(/(?<=[.!?;:])\s+/)
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

async function mapWithConcurrency(items, limit, worker) {
  const queue = Array.isArray(items) ? [...items] : [];
  const concurrency = Math.max(1, Number(limit) || 1);
  const workers = Array.from({ length: Math.min(concurrency, queue.length || 1) }, async () => {
    while (queue.length) {
      const item = queue.shift();

      if (!item) {
        continue;
      }

      await worker(item);
    }
  });

  await Promise.all(workers);
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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          mode === "xml"
            ? "application/xml,text/xml,text/plain,*/*"
            : "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Request returned ${response.status}`);
    }

    return response.text();
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error("Request timed out");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
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
