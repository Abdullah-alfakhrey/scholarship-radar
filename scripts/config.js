const REGION_CONFIG = [
  {
    id: "UK",
    label: "UK",
    searchTerms: ["United Kingdom", "UK", "Britain"],
    detectionTerms: [
      "united kingdom",
      "england",
      "scotland",
      "wales",
      "northern ireland",
      "ac.uk",
    ],
  },
  {
    id: "EU",
    label: "EU",
    searchTerms: ["Europe", "European Union", "EU"],
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
    ],
  },
  {
    id: "US",
    label: "US",
    searchTerms: ["United States", "USA", "US"],
    detectionTerms: [
      "united states",
      "usa",
      ".edu",
      "america",
    ],
  },
  {
    id: "Australia",
    label: "Australia",
    searchTerms: ["Australia"],
    detectionTerms: ["australia", "australian", "edu.au"],
  },
  {
    id: "Gulf",
    label: "Gulf",
    searchTerms: [
      "Qatar",
      "United Arab Emirates",
      "UAE",
      "Saudi Arabia",
      "Kuwait",
      "Oman",
      "Bahrain",
    ],
    detectionTerms: [
      "qatar",
      "united arab emirates",
      "uae",
      "saudi arabia",
      "kuwait",
      "oman",
      "bahrain",
      "gulf",
    ],
  },
];

const TOPIC_GROUPS = [
  {
    id: "architecture-sustainability",
    label: "Architecture + Sustainable Design",
    searchTerms: ["architecture", "built environment", "urban design", "sustainable design"],
  },
  {
    id: "climate-policy",
    label: "Climate + Policy",
    searchTerms: ["climate change", "climate policy", "environmental policy", "sustainability"],
  },
  {
    id: "circular-economy",
    label: "Circular Economy + Regenerative Systems",
    searchTerms: ["circular economy", "regenerative design", "resource efficiency", "sustainable development"],
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
    ],
  },
  {
    tag: "Sustainability",
    patterns: [
      /sustainability/i,
      /sustainable development/i,
      /sustainable systems/i,
      /environmental management/i,
    ],
  },
  {
    tag: "Circular Economy",
    patterns: [
      /circular economy/i,
      /resource efficiency/i,
      /materials transition/i,
      /zero waste/i,
    ],
  },
  {
    tag: "Climate Change",
    patterns: [
      /climate change/i,
      /climate adaptation/i,
      /climate mitigation/i,
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
    ],
  },
  {
    tag: "Urban Resilience",
    patterns: [
      /urban resilience/i,
      /resilient cities/i,
      /sustainable cities/i,
      /city planning/i,
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
];

const LEVEL_REJECTION_PATTERNS = [
  /\bphd\b/i,
  /doctoral/i,
  /doctorate/i,
  /undergraduate/i,
  /\bbachelor'?s\b/i,
];

const FUNDING_PATTERNS = [
  /fully funded/i,
  /full scholarship/i,
  /full tuition/i,
  /tuition (fees )?(waiver|covered|coverage)/i,
  /covers tuition/i,
  /tuition-free/i,
];

const STIPEND_PATTERNS = [
  /stipend/i,
  /living allowance/i,
  /monthly allowance/i,
  /maintenance allowance/i,
  /living costs/i,
  /monthly funding/i,
  /annual living/i,
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
];

const APPLY_LINK_PATTERNS = [
  /apply/i,
  /application portal/i,
  /how to apply/i,
  /start application/i,
  /apply now/i,
];

const DEADLINE_PATTERNS = [
  /(?:application deadline|deadline|apply by|applications close|closing date|last date to apply)[^A-Za-z0-9]{0,16}([A-Z][a-z]+ \d{1,2},? \d{4})/i,
  /(?:application deadline|deadline|apply by|applications close|closing date|last date to apply)[^A-Za-z0-9]{0,16}(\d{1,2} [A-Z][a-z]+ \d{4})/i,
  /(?:application deadline|deadline|apply by|applications close|closing date|last date to apply)[^A-Za-z0-9]{0,16}(\d{4}-\d{2}-\d{2})/i,
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

const SEARCH_SETTINGS = {
  resultCount: Number(process.env.SEARCH_RESULT_COUNT || 8),
  maxPages: Number(process.env.MAX_SOURCE_PAGES || 60),
  minScore: Number(process.env.MIN_SCHOLARSHIP_SCORE || 13),
};

const USER_AGENT =
  "ScholarshipRadarBot/1.0 (+https://github.com/Abdullah-alfakhrey/scholarship-radar)";

module.exports = {
  APPLY_LINK_PATTERNS,
  DEADLINE_PATTERNS,
  EXCLUDED_DOMAINS,
  EXCLUDED_EXTENSIONS,
  FIELD_PATTERNS,
  FUNDING_PATTERNS,
  IRAQ_PATTERNS,
  LEVEL_REJECTION_PATTERNS,
  MASTERS_PATTERNS,
  OPEN_INTERNATIONAL_PATTERNS,
  REGION_CONFIG,
  REQUIREMENT_PATTERNS,
  SEARCH_SETTINGS,
  STIPEND_PATTERNS,
  TOPIC_GROUPS,
  USER_AGENT,
};
