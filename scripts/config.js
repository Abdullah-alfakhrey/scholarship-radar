const VERIFIED_SOURCE_REGISTRY = require("../data/verified-source-registry.json");

const REGION_CONFIG = [
  {
    id: "UK",
    label: "UK",
    detectionTerms: [
      "united kingdom",
      "england",
      "scotland",
      "wales",
      "northern ireland",
      "ac.uk",
      "uk",
    ],
  },
  {
    id: "EU",
    label: "EU",
    detectionTerms: [
      "europe",
      "european union",
      "germany",
      "netherlands",
      "sweden",
      "denmark",
      "finland",
      "france",
      "italy",
      "spain",
      "belgium",
      "austria",
      "portugal",
      "ireland",
      "norway",
      "tu delft",
      "kth",
      "aalto",
    ],
  },
  {
    id: "US",
    label: "US",
    detectionTerms: [
      "united states",
      "usa",
      ".edu",
      "america",
      "fulbright",
    ],
  },
  {
    id: "Australia",
    label: "Australia",
    detectionTerms: ["australia", "australian", "edu.au", "monash", "melbourne"],
  },
  {
    id: "Gulf",
    label: "Gulf",
    detectionTerms: [
      "qatar",
      "united arab emirates",
      "uae",
      "saudi arabia",
      "kuwait",
      "oman",
      "bahrain",
      "gulf",
      "doha",
      "abu dhabi",
      "riyadh",
    ],
  },
];

const FIELD_PATTERNS = [
  {
    tag: "Architecture",
    patterns: [
      /architecture/i,
      /built environment/i,
      /landscape architecture/i,
      /urban design/i,
      /urban planning/i,
      /architectural/i,
    ],
  },
  {
    tag: "Design",
    patterns: [
      /design for sustainability/i,
      /sustainable design/i,
      /design innovation/i,
      /strategic design/i,
      /environmental design/i,
      /design studies/i,
    ],
  },
  {
    tag: "Sustainability",
    patterns: [
      /sustainability/i,
      /sustainable development/i,
      /sustainable systems/i,
      /environmental management/i,
      /sustainable cities/i,
    ],
  },
  {
    tag: "Circular Economy",
    patterns: [
      /circular economy/i,
      /resource efficiency/i,
      /materials transition/i,
      /zero waste/i,
      /regenerative/i,
    ],
  },
  {
    tag: "Climate Change",
    patterns: [
      /climate change/i,
      /climate adaptation/i,
      /climate mitigation/i,
      /climate action/i,
      /resilience/i,
    ],
  },
  {
    tag: "Climate Policy",
    patterns: [
      /climate policy/i,
      /environmental policy/i,
      /energy policy/i,
      /policy and governance/i,
      /public policy/i,
    ],
  },
  {
    tag: "Urban Resilience",
    patterns: [
      /urban resilience/i,
      /resilient cities/i,
      /city planning/i,
      /urban studies/i,
      /urban sustainability/i,
    ],
  },
];

const MASTERS_PATTERNS = [
  /master'?s/i,
  /\bmasters\b/i,
  /\bmsc\b/i,
  /\bm\.?arch\b/i,
  /postgraduate/i,
  /graduate scholarship/i,
  /master of/i,
  /taught master/i,
];

const NON_TARGET_LEVEL_PATTERNS = [
  /\bphd\b/i,
  /doctoral/i,
  /doctorate/i,
  /postdoctoral/i,
  /undergraduate/i,
  /\bbachelor'?s\b/i,
  /professional fellowship/i,
  /split-site/i,
];

const FUNDING_PATTERNS = [
  /fully funded/i,
  /fully-funded/i,
  /full scholarship/i,
  /full tuition/i,
  /tuition (fees )?(waiver|covered|coverage)/i,
  /covers tuition/i,
  /tuition-free/i,
  /full funding/i,
  /financial support/i,
  /leaving you free to focus/i,
  /covers (course )?fees/i,
  /full cost of tuition/i,
  /grant for living expenses/i,
  /full maintenance/i,
];

const STIPEND_PATTERNS = [
  /stipend/i,
  /monthly stipend/i,
  /living allowance/i,
  /monthly living/i,
  /monthly allowance/i,
  /maintenance allowance/i,
  /living costs/i,
  /monthly funding/i,
  /annual living/i,
  /accommodation allowance/i,
  /living expenses/i,
  /maintenance grant/i,
  /grant for living expenses/i,
  /covers living expenses/i,
];

const BROAD_FIELD_PATTERNS = [
  /all (academic )?fields/i,
  /all disciplines/i,
  /any subject/i,
  /any field of study/i,
  /all courses/i,
  /open to any discipline/i,
  /field of study is unrestricted/i,
];

const IRAQ_PATTERNS = [/iraq/i, /iraqi/i];

const OPEN_INTERNATIONAL_PATTERNS = [
  /all nationalities/i,
  /all countries/i,
  /international students/i,
  /international applicants/i,
  /students from any country/i,
  /open to applicants worldwide/i,
  /worldwide applicants/i,
  /overseas applicants/i,
  /eligible countries/i,
  /citizens of eligible countries/i,
  /participating countries/i,
  /partner countries/i,
  /foreign students/i,
  /no restrictions on nationality/i,
  /regardless of nationality/i,
];

const REQUIREMENT_PATTERNS = [
  /requirements?/i,
  /eligib/i,
  /english/i,
  /degree/i,
  /portfolio/i,
  /transcript/i,
  /statement of purpose/i,
  /recommendation/i,
  /admission/i,
  /work experience/i,
];

const APPLY_LINK_PATTERNS = [
  /apply/i,
  /application portal/i,
  /how to apply/i,
  /start application/i,
  /apply now/i,
  /admissions/i,
];

const DEADLINE_PATTERNS = [
  /(?:application deadline|deadline|apply by|applications close|closing date|last date to apply)[^A-Za-z0-9]{0,16}([A-Z][a-z]+ \d{1,2},? \d{4})/i,
  /(?:application deadline|deadline|apply by|applications close|closing date|last date to apply)[^A-Za-z0-9]{0,16}(\d{1,2} [A-Z][a-z]+ \d{4})/i,
  /(?:application deadline|deadline|apply by|applications close|closing date|last date to apply)[^A-Za-z0-9]{0,16}(\d{4}-\d{2}-\d{2})/i,
];

const SCHOLARSHIP_PAGE_PATTERNS = [
  /scholarship/i,
  /scholarships/i,
  /fellowship/i,
  /funding/i,
  /financial support/i,
  /award/i,
  /studentship/i,
  /bursary/i,
  /financial aid/i,
];

const DISCOVERY_KEYWORDS = [
  "scholarship",
  "scholarships",
  "funding",
  "award",
  "fellowship",
  "grant",
  "bursary",
  "masters",
  "master",
  "graduate",
  "postgraduate",
  "admissions",
  "admission",
  "study",
  "program",
  "tuition",
  "fees",
  "financial aid",
  "architecture",
  "design",
  "sustainability",
  "climate",
  "circular",
  "environment",
  "urban",
  "policy",
];

const DISCOVERY_EXCLUDE_KEYWORDS = [
  "news",
  "event",
  "events",
  "press",
  "privacy",
  "cookie",
  "contact",
  "login",
  "register",
  "donate",
  "alumni",
  "about-us",
];

const EXCLUDED_EXTENSIONS = [
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".svg",
  ".zip",
  ".doc",
  ".docx",
];

const EXCLUDED_DOMAINS = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
];

const SITEMAP_HINTS = ["/wp-sitemap.xml", "/sitemap.xml", "/sitemap_index.xml"];

const SOURCE_SITES = VERIFIED_SOURCE_REGISTRY.filter(
  (source) => source.crawlerEnabled && source.crawlStrategy === "site"
);

const UNIVERSITY_DIRECTORY_SOURCES = VERIFIED_SOURCE_REGISTRY.filter(
  (source) => source.crawlerEnabled && source.crawlStrategy === "university-directory"
);

const CRAWL_SETTINGS = {
  maxCandidateUrlsPerSource: Number(process.env.MAX_CANDIDATE_URLS_PER_SOURCE || 18),
  maxSeedLinksPerPage: Number(process.env.MAX_SEED_LINKS_PER_PAGE || 30),
  maxSitemapFilesPerSource: Number(process.env.MAX_SITEMAP_FILES_PER_SOURCE || 4),
  maxUrlsPerSitemap: Number(process.env.MAX_URLS_PER_SITEMAP || 60),
  maxScholarshipPages: Number(process.env.MAX_SCHOLARSHIP_PAGES || 80),
  maxUniversitiesPerDirectory: Number(process.env.MAX_UNIVERSITIES_PER_DIRECTORY || 18),
  maxUniversityDirectoryPages: Number(process.env.MAX_UNIVERSITY_DIRECTORY_PAGES || 20),
  minScore: Number(process.env.MIN_SCHOLARSHIP_SCORE || 13),
};

const USER_AGENT =
  "ScholarshipRadarBot/1.0 (+https://github.com/Abdullah-alfakhrey/scholarship-radar)";

module.exports = {
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
};
