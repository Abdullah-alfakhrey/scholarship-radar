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
  /is now open/i,
  /call .* is now open/i,
  /apply now/i,
  /accepting applications/i,
  /call for applications/i,
  /application portal (?:is )?open/i,
];
const APPLICATION_CLOSED_PATTERNS = [
  /applications? (?:are|is)?\s*closed/i,
  /applications?[^.]{0,40}now clos(?:e|ed)/i,
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
const MONTH_NAME_PATTERN =
  "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const GENERIC_DATE_PATTERNS = [
  new RegExp(`\\b(${MONTH_NAME_PATTERN}\\.?(?:\\s+)?\\d{1,2}(?:st|nd|rd|th)?(?:,)?\\s+\\d{4})\\b`, "ig"),
  new RegExp(`\\b(\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH_NAME_PATTERN}\\s+\\d{4})\\b`, "ig"),
  /\b(\d{4}-\d{2}-\d{2})\b/g,
];
const STRONG_DEADLINE_CONTEXT_PATTERNS = [
  /application deadline/i,
  /submission deadline/i,
  /apply by/i,
  /applications? close/i,
  /closing date/i,
  /last date to apply/i,
  /deadline stated/i,
  /deadline for/i,
];
const WEAK_DEADLINE_CONTEXT_PATTERNS = [
  /deadline/i,
  /applications?/i,
  /apply/i,
  /application portal/i,
  /call/i,
  /round/i,
  /scholarship/i,
];
const NEGATIVE_DEADLINE_CONTEXT_PATTERNS = [
  /result|outcome|offer|decision/i,
  /cohort|class of/i,
  /news|event|webinar|session/i,
  /history|published|updated/i,
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
  "master-mind": "Belgium",
};
const SOURCE_APPLY_URL_HINTS = {
  "gates-cambridge": "https://www.gatescambridge.org/apply/how-to-apply/",
  "knight-hennessy": "https://www.knight-hennessy.stanford.edu/admission",
  chevening: "https://www.chevening.org/apply/",
  gks: "https://www.studyinkorea.go.kr/ko/receipt/OnlineReceipt11.do",
  "schwarzman-scholars": "https://www.schwarzmanscholars.org/admissions/",
  "yenching-academy": "https://apply.yca.pku.edu.cn/",
  "master-mind": "https://www.studyinflanders.be/scholarships/master-mind-scholarships",
};

// Stable, publicly-known scholarship facts that the HTML crawler struggles to
// extract reliably. These enrichments fill gaps left by dynamic pages, PDFs,
// or multi-step portals. Values here only apply when the crawler's own
// extraction returned empty or generic placeholder text.
const SOURCE_SCHOLARSHIP_ENRICHMENTS = {
  chevening: {
    title: "Chevening Scholarships",
    institution: "UK Foreign, Commonwealth & Development Office",
    benefits:
      "Fully funded: tuition fees, monthly stipend, travel costs to and from the UK, an arrival allowance, a homeward departure allowance, and the cost of one visa application.",
    eligibility:
      "Open to citizens of Chevening-eligible countries (including Iraq). Applicants must have at least two years of work experience and return to their home country for at least two years after the award.",
    summary:
      "Chevening Scholarships are the UK government's global scholarship programme, funding outstanding emerging leaders to pursue a one-year master's degree at any UK university.",
    criteria: [
      "Open to citizens of Chevening-eligible countries including Iraq.",
      "At least two years of work experience required.",
      "Must return to home country for a minimum of two years after the scholarship.",
      "Strong leadership potential and a clear career plan are assessed.",
    ],
    requirements: [
      "At least two years of work experience.",
      "An undergraduate degree that allows access to a UK postgraduate programme.",
      "Must apply to three different eligible UK university courses.",
    ],
    applicationCycle: { opensMonth: 8, closesMonth: 11, closesDay: 7 },
  },
  commonwealth: {
    title: "Commonwealth Master's Scholarships",
    institution: "Commonwealth Scholarship Commission in the UK",
    benefits:
      "Fully funded: tuition fees, monthly living allowance (stipend), return economy airfare, thesis grant, warm clothing allowance (if applicable), and study travel grant.",
    eligibility:
      "Open to citizens of Commonwealth countries (Iraq is not a Commonwealth member, but some schemes accept non-Commonwealth applicants via partner nominations).",
    summary:
      "Commonwealth Scholarships for master's study in the UK, funded by the UK government for citizens of Commonwealth countries.",
    criteria: [
      "Must be a citizen of or have refugee status in an eligible Commonwealth country.",
      "Must hold a first degree of at least upper second class (2:1) honours standard.",
      "Must be available to start academic studies in the UK by the start of the UK academic year.",
    ],
    applicationCycle: { opensMonth: 9, closesMonth: 12, closesDay: 18 },
  },
  "gates-cambridge": {
    title: "Gates Cambridge Scholarship",
    institution: "University of Cambridge",
    benefits:
      "Fully funded: the full cost of studying at Cambridge (tuition fees and maintenance grant at the standard rate), one return economy airfare, immigration health surcharge, and discretionary funding.",
    eligibility:
      "Open to applicants from any country outside the UK. There are no restrictions on nationality, ordinary residence, or field of study.",
    summary:
      "Gates Cambridge Scholarships are prestigious full-cost awards for outstanding applicants from outside the UK to pursue a postgraduate degree at the University of Cambridge.",
    criteria: [
      "Open to applicants from any country outside the UK.",
      "No restrictions on nationality, ordinary residence, or field of study.",
      "Outstanding intellectual ability, leadership potential, and commitment to improving the lives of others.",
    ],
    applicationCycle: { opensMonth: 9, closesMonth: 1, closesDay: 8 },
  },
  clarendon: {
    title: "Clarendon Scholarships",
    institution: "University of Oxford",
    benefits:
      "Fully funded: course fees and a generous grant for living expenses for the full duration of fee liability.",
    eligibility:
      "Open to all graduate applicants regardless of nationality, ordinary residence, or field of study. Selection is automatic — applicants are considered when they apply for graduate study at Oxford.",
    summary:
      "Clarendon Scholarships are the University of Oxford's flagship graduate scholarship scheme, offering over 140 fully funded awards each year.",
    criteria: [
      "No restrictions on nationality, ordinary residence, or field of study.",
      "Awarded on the basis of academic excellence and potential.",
      "All full-time and part-time DPhil and Master's courses are eligible.",
      "Candidates are automatically considered upon applying to Oxford.",
    ],
    applicationCycle: { opensMonth: 9, closesMonth: 1, closesDay: 22 },
  },
  daad: {
    title: "DAAD Study Scholarships for Master's Studies",
    institution: "German Academic Exchange Service (DAAD)",
    benefits:
      "Monthly payments of 934 euros, health insurance, travel subsidy, and study and research allowance. Tuition fees are not charged at most German universities.",
    eligibility:
      "Open to graduates from all countries (including Iraq) with a first academic degree. The degree should not date back more than 6 years at the time of application.",
    summary:
      "DAAD scholarships for graduates from all academic disciplines wishing to complete a postgraduate course of study (Master's) in Germany.",
    applicationCycle: { opensMonth: 7, closesMonth: 10, closesDay: 15 },
  },
  fulbright: {
    title: "Fulbright Foreign Student Program",
    institution: "U.S. Department of State",
    benefits:
      "Fully funded: tuition, airfare, a monthly living stipend, health insurance, and academic support. Some Fulbright commissions also cover book and settling-in allowances.",
    eligibility:
      "Open to citizens of participating countries. Iraq has a Fulbright commission — Iraqi applicants should apply through the local Fulbright office in Baghdad.",
    summary:
      "The Fulbright Foreign Student Program brings citizens of other countries to the United States for master's or PhD study at U.S. universities.",
    criteria: [
      "Open to citizens of participating countries including Iraq.",
      "A bachelor's degree or equivalent is required.",
      "English language proficiency is required (TOEFL/IELTS).",
      "Applicants must return to their home country for at least two years after the award.",
    ],
    applicationCycle: { opensMonth: 2, closesMonth: 6, closesDay: 15 },
  },
  "knight-hennessy": {
    title: "Knight-Hennessy Scholars at Stanford University",
    institution: "Stanford University",
    benefits:
      "Fully funded: tuition, stipend, and travel to and from Stanford for up to three years of graduate study in any Stanford graduate program.",
    eligibility:
      "Open to applicants of any country. You must have earned a bachelor's degree (or equivalent) from any university in the world.",
    summary:
      "Knight-Hennessy Scholars develops a community of future global leaders through a fully funded multidisciplinary graduate education at Stanford University.",
    criteria: [
      "Open to applicants of any nationality.",
      "Must earn a bachelor's degree by August of the matriculation year.",
      "Independence of thought, purposeful leadership, and a civic mindset are key criteria.",
    ],
    applicationCycle: { opensMonth: 5, closesMonth: 10, closesDay: 9 },
  },
  "swedish-institute": {
    title: "Swedish Institute Scholarships for Global Professionals (SISGP)",
    institution: "Swedish Institute",
    benefits:
      "Fully funded: tuition fees, monthly living allowance of SEK 10,000, travel grant, and insurance.",
    eligibility:
      "Open to citizens of 34 eligible countries including Iraq. Applicants must have at least 3,000 hours of work/volunteering experience and demonstrated leadership.",
    summary:
      "The Swedish Institute Scholarships for Global Professionals (SISGP) supports ambitious professionals from eligible countries for full-time master's study in Sweden.",
    applicationCycle: { opensMonth: 10, closesMonth: 2, closesDay: 10 },
  },
  "stipendium-hungaricum": {
    title: "Stipendium Hungaricum Scholarship",
    institution: "Tempus Public Foundation / Hungarian Government",
    benefits:
      "Fully funded: tuition-free education, monthly stipend (HUF 43,700 for Master's students), dormitory placement or housing contribution (HUF 40,000/month), and medical insurance.",
    eligibility:
      "Open to citizens of partner countries (Iraq is a Stipendium Hungaricum sending partner). Applicants must apply through the nominating authority in their home country.",
    summary:
      "Stipendium Hungaricum is a Hungarian government scholarship providing fully funded study opportunities for international students at Hungarian universities.",
    criteria: [
      "Open to citizens of partner countries including Iraq.",
      "Must apply through the nominating authority (typically the Ministry of Higher Education).",
      "A bachelor's degree is required for Master's programmes.",
    ],
    applicationCycle: { opensMonth: 11, closesMonth: 1, closesDay: 15 },
  },
  "turkiye-scholarships": {
    title: "Turkiye Scholarships",
    institution: "Republic of Turkiye, Presidency for Turks Abroad and Related Communities",
    benefits:
      "Fully funded: tuition, monthly stipend (1,400 TL for Master's students), accommodation, health insurance, one-time return flight ticket, and Turkish language course.",
    eligibility:
      "Open to citizens of all countries. Iraqi applicants are eligible. Must not be a Turkish citizen or have lost Turkish citizenship.",
    summary:
      "Turkiye Scholarships is a government-funded programme providing fully funded education at Turkish universities for international students at all academic levels.",
    criteria: [
      "Open to international students from all countries including Iraq.",
      "For Master's programmes, applicants must have a GPA of at least 75/100.",
      "Age limit: under 30 for Master's, under 35 for PhD.",
    ],
    applicationCycle: { opensMonth: 1, closesMonth: 2, closesDay: 20 },
  },
  "schwarzman-scholars": {
    title: "Schwarzman Scholars",
    institution: "Schwarzman Scholars at Tsinghua University",
    benefits:
      "Fully funded: tuition, room and board, travel to and from Beijing, health insurance, a personal stipend, and an in-residence study tour.",
    eligibility:
      "Open to applicants of any nationality between 18 and 28 years old. Must have a bachelor's degree by August of the enrollment year.",
    summary:
      "Schwarzman Scholars is a one-year, fully-funded Master's program at Tsinghua University in Beijing, designed to prepare future leaders for a world where China plays a major role.",
    applicationCycle: { opensMonth: 4, closesMonth: 9, closesDay: 15 },
  },
  "swiss-government-excellence": {
    title: "Swiss Government Excellence Scholarships",
    institution: "Swiss Federal Commission for Scholarships for Foreign Students (FCS)",
    benefits:
      "Monthly stipend of CHF 1,920, tuition fee exemption, health insurance, housing allowance, and return airfare.",
    eligibility:
      "Open to postgraduate researchers and artists from approximately 180 countries. Iraqi applicants are eligible. Must be nominated through their country's diplomatic representation in Switzerland.",
    summary:
      "Swiss Government Excellence Scholarships provide funding for postgraduate researchers and artists from abroad who wish to pursue research or further studies in Switzerland.",
    applicationCycle: { opensMonth: 8, closesMonth: 11, closesDay: 30 },
  },
  gks: {
    title: "Global Korea Scholarship (GKS/KGSP)",
    institution: "National Institute for International Education (NIIED), Korean Government",
    benefits:
      "Fully funded: tuition, monthly allowance (KRW 900,000 for Master's), settlement allowance, return airfare, medical insurance, and Korean language training.",
    eligibility:
      "Open to citizens of countries that have diplomatic ties with South Korea. Iraqi applicants are eligible. Must not hold Korean citizenship.",
    summary:
      "The Global Korea Scholarship (GKS) is a Korean government programme inviting outstanding international students to pursue graduate degrees at Korean universities.",
    criteria: [
      "Open to citizens of partner countries including Iraq.",
      "Must have a GPA of 80/100 or above in previous degree.",
      "Must be under 40 years of age at the time of application.",
      "Must not have previously received a KGSP scholarship.",
    ],
    applicationCycle: { opensMonth: 2, closesMonth: 3, closesDay: 31 },
  },
  "mccall-macbain": {
    title: "McCall MacBain Scholarships at McGill",
    institution: "McGill University",
    benefits:
      "Fully funded: full tuition, fees, and a living stipend of CAD 2,000/month for the duration of the master's or professional degree programme.",
    eligibility:
      "Open to applicants from any country. Must be applying to an eligible full-time master's or professional degree programme at McGill University.",
    summary:
      "McCall MacBain Scholarships provide fully-funded master's or professional degree study at McGill University for outstanding students with demonstrated leadership and community engagement.",
    applicationCycle: { opensMonth: 6, closesMonth: 8, closesDay: 20 },
  },
  "yenching-academy": {
    title: "Yenching Academy Fellowship at Peking University",
    institution: "Peking University",
    benefits:
      "Fully funded: tuition fees, accommodation on the PKU campus, monthly living stipend, comprehensive medical insurance, and one round-trip international airfare.",
    eligibility:
      "Open to outstanding international and Chinese applicants from all countries. Approximately 75% of the student body are international students.",
    summary:
      "The Yenching Academy fellowship supports an interdisciplinary Master's in China Studies at Peking University, one of the most competitive programmes in Asia.",
    applicationCycle: { opensMonth: 9, closesMonth: 1, closesDay: 5 },
  },
  "goi-ies": {
    title: "Government of Ireland International Education Scholarships",
    institution: "Higher Education Authority (Ireland)",
    benefits:
      "Scholarship of EUR 10,000 per year towards tuition fees and a stipend contribution, for up to one year (Master's) or three years (PhD).",
    eligibility:
      "Open to non-EEA international students from all nationalities. Applicants must have a conditional or final offer from an eligible Irish higher education institution.",
    summary:
      "The Government of Ireland International Education Scholarships (GOI-IES) support high-calibre international students pursuing postgraduate education in Ireland.",
    applicationCycle: { opensMonth: 1, closesMonth: 3, closesDay: 12 },
  },
  "master-mind": {
    title: "Master Mind Scholarships (Flanders)",
    institution: "Flemish Government, Study in Flanders",
    benefits:
      "A scholarship of up to EUR 8,400 to cover tuition and/or living costs for a one-year master's programme at a Flemish university or university college.",
    eligibility:
      "Open to outstanding students from all nationalities worldwide. Must be admitted to an eligible English-taught master's programme in Flanders or Brussels.",
    summary:
      "Master Mind Scholarships are funded by the Flemish Government for international students pursuing an initial master's degree at a Flemish higher education institution.",
    applicationCycle: { opensMonth: 10, closesMonth: 3, closesDay: 1 },
  },
  hbku: {
    title: "HBKU Graduate Scholarships",
    institution: "Hamad Bin Khalifa University",
    benefits:
      "Tuition waiver, monthly living stipend, accommodation support, health insurance, and a round-trip airfare upon starting and completing the programme.",
    eligibility:
      "Open to international and Qatari students. Scholarships are awarded competitively during the admissions process.",
    summary:
      "HBKU provides competitive scholarship packages including tuition waivers and stipends for graduate students admitted to its programmes in Doha, Qatar.",
    applicationCycle: { opensMonth: 10, closesMonth: 4, closesDay: 1 },
  },
  kaust: {
    title: "KAUST Fellowship",
    institution: "King Abdullah University of Science and Technology",
    benefits:
      "Fully funded: full tuition, monthly living allowance, housing, medical and dental coverage, and relocation support.",
    eligibility:
      "Open to outstanding students from all nationalities worldwide. KAUST is a graduate-only research university — all admitted students receive full fellowship support.",
    summary:
      "KAUST provides a full fellowship to every admitted student, covering tuition, living allowance, housing, and medical insurance at its campus in Saudi Arabia.",
    applicationCycle: { opensMonth: 9, closesMonth: 1, closesDay: 20 },
  },
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

function getSourceSpecificSignalOverrides(sourceId, text) {
  const normalized = cleanText(text);

  if (sourceId === "yenching-academy") {
    return { funded: true, stipend: true };
  }

  if (sourceId === "schwarzman-scholars" && /fully[- ]funded/i.test(normalized)) {
    return { funded: true, stipend: false };
  }

  return { funded: false, stipend: false };
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
  const analysisText = `${relevantText} ${bodyText.slice(0, 40000)}`;

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
  const combinedText = [title, metaDescription, evidenceText, analysisText].join(" ");
  const primaryRegion = detectRegion(`${title} ${metaDescription}`, candidate.url);
  const region =
    primaryRegion ||
    (candidate.source.sourceType === "directory" ? null : detectRegion(evidenceText, candidate.url)) ||
    regionFromHint(candidate.source.regionHint);
  const sourceId = candidate.source && candidate.source.id ? candidate.source.id : "";
  const deadline = extractDeadline(analysisText);
  const applicationStatus = extractApplicationStatus(analysisText, deadline.iso, sourceId);
  const eligibility = extractEligibility(analysisText, sourceId);
  const benefits = extractBenefits(analysisText, metaDescription, sourceId);
  const sourceSpecificSignals = getSourceSpecificSignalOverrides(sourceId, analysisText);
  const requirements = extractRequirements(relevantText);
  const criteria = buildCriteria(eligibility, requirements);
  const applyUrl = extractApplyUrl($, candidate.url, candidate.source);
  const sourceType = candidate.source.sourceType || classifySource(candidate.url);
  const institution = inferInstitution(title, siteName, candidate.url, candidate.source.label);
  const location = inferLocation(candidate, institution, region, combinedText);

  const signals = {
    scholarshipIntent,
    scholarshipPage,
    funded:
      hasStrongFundingSignal(combinedText) ||
      hasComprehensiveBenefitSignal(combinedText) ||
      sourceSpecificSignals.funded,
    stipend: hasStipendSignal(combinedText) || sourceSpecificSignals.stipend,
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

  const rawResult = {
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

  return applySourceEnrichments(rawResult, sourceId);
}

function applySourceEnrichments(item, sourceId) {
  const enrichment = SOURCE_SCHOLARSHIP_ENRICHMENTS[sourceId];

  if (!enrichment) {
    return item;
  }

  const enriched = { ...item };

  // Fill in title only if the crawler produced a generic one
  if (enrichment.title && isGenericTitle(enriched.title)) {
    enriched.title = enrichment.title;
  }

  // Upgrade institution if the crawler returned a hostname or generic label
  if (
    enrichment.institution &&
    (!enriched.institution ||
      enriched.institution.includes(".") ||
      enriched.institution === "Unknown institution")
  ) {
    enriched.institution = enrichment.institution;
  }

  // Fill benefits when the crawler returned the generic placeholder
  if (
    enrichment.benefits &&
    (!enriched.benefits ||
      /still needs review|Benefits found, but/i.test(enriched.benefits))
  ) {
    enriched.benefits = enrichment.benefits;
    enriched.funding = enrichment.benefits;
  }

  // Fill eligibility when the crawler could not extract it
  if (
    enrichment.eligibility &&
    (!enriched.eligibility ||
      /still needs manual confirmation/i.test(enriched.eligibility))
  ) {
    enriched.eligibility = enrichment.eligibility;
  }

  // Fill summary when the crawler used the generic fallback
  if (
    enrichment.summary &&
    (!enriched.summary ||
      /matched against the free crawler rules/i.test(enriched.summary))
  ) {
    enriched.summary = enrichment.summary;
  }

  // Fill criteria when the crawler found none or only generic ones
  if (
    enrichment.criteria &&
    enrichment.criteria.length &&
    (!enriched.criteria || enriched.criteria.length === 0)
  ) {
    enriched.criteria = enrichment.criteria;
  }

  // Fill requirements when the crawler found none
  if (
    enrichment.requirements &&
    enrichment.requirements.length &&
    (!enriched.requirements || enriched.requirements.length === 0)
  ) {
    enriched.requirements = enrichment.requirements;
  }

  // Infer deadline from the application cycle when the crawler missed it
  if (enrichment.applicationCycle && !enriched.deadlineIso) {
    const inferred = inferDeadlineFromCycle(enrichment.applicationCycle);

    if (inferred) {
      enriched.deadline = inferred.label;
      enriched.deadlineIso = inferred.iso;
    }
  }

  // Re-derive application status after enrichment may have provided a deadline
  if (enriched.deadlineIso && enriched.applicationStatusCode === "needs-review") {
    const deadline = new Date(`${enriched.deadlineIso}T23:59:59Z`);
    const now = new Date();

    if (!Number.isNaN(deadline.getTime())) {
      if (deadline.getTime() < now.getTime()) {
        enriched.applicationStatus = "Closed";
        enriched.applicationStatusCode = "closed";
      } else {
        enriched.applicationStatus = "Open";
        enriched.applicationStatusCode = "open";
      }
    }
  }

  // With enriched data, reassess whether review is still needed
  const hasGoodBenefits =
    enriched.benefits && !/still needs review/i.test(enriched.benefits);
  const hasGoodEligibility =
    enriched.eligibility && !/still needs manual confirmation/i.test(enriched.eligibility);

  if (
    hasGoodBenefits &&
    hasGoodEligibility &&
    enriched.criteria.length > 0 &&
    enriched.sourceType === "official" &&
    enriched.applicationStatusCode !== "needs-review"
  ) {
    enriched.reviewNeeded = false;
    enriched.matchTier = "best-fit";
    enriched.matchNote =
      "Best fit: this page matched the funding, stipend, location, and Iraq eligibility checks.";
  }

  return enriched;
}

function inferDeadlineFromCycle(cycle) {
  if (!cycle || !cycle.closesMonth || !cycle.closesDay) {
    return null;
  }

  const now = new Date();
  const currentYear = now.getFullYear();

  // Build candidate deadline for the current academic cycle
  // If the closes month is before the opens month, the deadline is in the next year
  // relative to when the cycle opens
  let deadlineYear = currentYear;
  const closesMonth = cycle.closesMonth;
  const opensMonth = cycle.opensMonth || closesMonth;

  // If close month < open month, the cycle crosses a year boundary
  if (closesMonth < opensMonth) {
    // If we're past the close date this year, the next cycle closes next year
    const thisYearDeadline = new Date(currentYear, closesMonth - 1, cycle.closesDay, 23, 59, 59);
    if (now > thisYearDeadline) {
      deadlineYear = currentYear + 1;
    }
  } else {
    // Same-year cycle: if we're past this year's close, use next year
    const thisYearDeadline = new Date(currentYear, closesMonth - 1, cycle.closesDay, 23, 59, 59);
    if (now > thisYearDeadline) {
      deadlineYear = currentYear + 1;
    }
  }

  const month = String(closesMonth).padStart(2, "0");
  const day = String(cycle.closesDay).padStart(2, "0");
  const iso = `${deadlineYear}-${month}-${day}`;
  const dateObj = new Date(`${iso}T00:00:00Z`);

  if (Number.isNaN(dateObj.getTime())) {
    return null;
  }

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const label = `${cycle.closesDay} ${monthNames[closesMonth - 1]} ${deadlineYear}`;

  return { label, iso };
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
  const candidates = collectDeadlineCandidates(text);

  if (candidates.length) {
    return chooseDeadlineCandidate(candidates);
  }

  for (const pattern of DEADLINE_PATTERNS) {
    const match = text.match(pattern);

    if (match && match[1]) {
      const { label, iso } = normalizeDeadlineLabel(match[1]);

      if (iso) {
        return { label, iso };
      }
    }
  }

  return { label: "", iso: "" };
}

function collectDeadlineCandidates(text) {
  const normalized = cleanText(text || "")
    .replace(/(\d{4})(?=\d{4}\b)/g, "$1 ")
    .replace(/(\d{4})(?=[A-Z])/g, "$1 ");
  const collected = [];

  GENERIC_DATE_PATTERNS.forEach((pattern) => {
    for (const match of normalized.matchAll(pattern)) {
      const rawLabel = match[1];
      const { label, iso } = normalizeDeadlineLabel(rawLabel);

      if (!iso) {
        continue;
      }

      const index = typeof match.index === "number" ? match.index : normalized.indexOf(rawLabel);
      const windowStart = Math.max(0, index - 120);
      const windowEnd = Math.min(normalized.length, index + rawLabel.length + 120);
      const context = normalized.slice(windowStart, windowEnd);
      let score = 0;

      if (matchesAny(context, STRONG_DEADLINE_CONTEXT_PATTERNS)) {
        score += 8;
      }

      if (matchesAny(context, WEAK_DEADLINE_CONTEXT_PATTERNS)) {
        score += 3;
      }

      if (matchesAny(context, NEGATIVE_DEADLINE_CONTEXT_PATTERNS)) {
        score -= 6;
      }

      if (/open|close|deadline|apply|application/i.test(context)) {
        score += 2;
      }

      collected.push({ label, iso, score });
    }
  });

  const deduped = new Map();

  collected.forEach((candidate) => {
    const key = `${candidate.iso}::${candidate.label}`;
    const existing = deduped.get(key);

    if (!existing || candidate.score > existing.score) {
      deduped.set(key, candidate);
    }
  });

  return [...deduped.values()];
}

function chooseDeadlineCandidate(candidates) {
  const now = new Date();
  const shortlisted = candidates.filter((candidate) => candidate.score > 0);
  const pool = shortlisted.length ? shortlisted : candidates;
  const futureCandidates = pool.filter((candidate) => !isPastDate(candidate.iso, now));
  const preferredPool = futureCandidates.length ? futureCandidates : pool;

  preferredPool.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    const leftTime = new Date(`${left.iso}T23:59:59Z`).getTime();
    const rightTime = new Date(`${right.iso}T23:59:59Z`).getTime();

    if (futureCandidates.length) {
      return leftTime - rightTime;
    }

    return rightTime - leftTime;
  });

  return preferredPool[0] || { label: "", iso: "" };
}

function normalizeDeadlineLabel(value) {
  const normalized = cleanText(value)
    .replace(/(\d)(st|nd|rd|th)/gi, "$1")
    .replace(/\bSept\b/i, "Sep")
    .replace(/\.$/, "");

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return { label: normalized, iso: normalized };
  }

  const monthFirst = normalized.match(
    new RegExp(`^(${MONTH_NAME_PATTERN})\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})$`, "i")
  );

  if (monthFirst) {
    return buildNormalizedDate(monthFirst[2], monthFirst[1], monthFirst[3], normalized);
  }

  const dayFirst = normalized.match(
    new RegExp(`^(\\d{1,2})\\s+(${MONTH_NAME_PATTERN})\\s+(\\d{4})$`, "i")
  );

  if (dayFirst) {
    return buildNormalizedDate(dayFirst[1], dayFirst[2], dayFirst[3], normalized);
  }

  return { label: "", iso: "" };
}

function buildNormalizedDate(dayValue, monthValue, yearValue, fallbackLabel) {
  const day = Number(dayValue);
  const year = Number(yearValue);
  const month = monthIndexFromLabel(monthValue);

  if (!month || !Number.isInteger(day) || !Number.isInteger(year)) {
    return { label: "", iso: "" };
  }

  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(
    day
  ).padStart(2, "0")}`;

  return {
    label: fallbackLabel,
    iso,
  };
}

function monthIndexFromLabel(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/\./g, "")
    .slice(0, 3);

  const monthMap = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };

  return monthMap[normalized] || 0;
}

function isPastDate(isoDate, now = new Date()) {
  if (!isoDate) {
    return false;
  }

  const deadline = new Date(`${isoDate}T23:59:59Z`);
  return !Number.isNaN(deadline.getTime()) && deadline.getTime() < now.getTime();
}

function extractApplicationStatus(text, deadlineIso, sourceId = "") {
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

  if (
    sourceId === "master-mind" &&
    /the call for the academic year .* is now open/i.test(normalized)
  ) {
    return { code: "open", label: "Open", isOpen: true };
  }

  return { code: "needs-review", label: "Check source", isOpen: false };
}

function extractEligibility(text, sourceId = "") {
  const normalized = cleanText(text);
  const sentences = splitIntoSentences(text);

  if (
    sourceId === "schwarzman-scholars" &&
    /fully[- ]funded|global community of future leaders|around the world/i.test(normalized)
  ) {
    return {
      isMatch: true,
      text: "Schwarzman Scholars describes a fully funded global program for future leaders from around the world.",
      type: "source-specific-global",
    };
  }

  if (
    sourceId === "yenching-academy" &&
    /international students comprise/i.test(normalized)
  ) {
    return {
      isMatch: true,
      text: "International students comprise roughly 75% of the student body.",
      type: "source-specific-international",
    };
  }

  if (
    sourceId === "master-mind" &&
    /students from around the world/i.test(normalized)
  ) {
    return {
      isMatch: true,
      text: "The scholarship is open to outstanding students from around the world.",
      type: "source-specific-international",
    };
  }

  if (
    sourceId === "swiss-government-excellence" &&
    /open to applicants from 183 countries|over 180 other countries|all countries and territories/i.test(
      normalized
    )
  ) {
    return {
      isMatch: true,
      text: "The scholarship programme is currently open to applicants from over 180 countries.",
      type: "source-specific-country-list",
    };
  }

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
    !/division|website|office/i.test(sentence) &&
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

function extractBenefits(text, fallback, sourceId = "") {
  if (sourceId === "yenching-academy") {
    return "The Yenching Academy fellowship includes tuition fees, accommodation, a monthly stipend, and one round-trip travel fare.";
  }

  if (sourceId === "schwarzman-scholars" && /fully[- ]funded/i.test(text)) {
    return "Schwarzman Scholars is a fully funded one-year master's program at Tsinghua University.";
  }

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

  if (packageSentence) {
    return packageSentence;
  }

  if (sourceId === "schwarzman-scholars") {
    const sourceSpecificSentence = sentences.find(
      (entry) =>
        !isNoisyExtractedSentence(entry) &&
        entry.length <= 320 &&
        /fully funded master'?s program/i.test(entry)
    );

    if (sourceSpecificSentence) {
      return sourceSpecificSentence;
    }
  }

  return "";
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

function extractApplyUrl($, baseUrl, source = null) {
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

      if (
        isFileLikeUrl(absoluteUrl) ||
        !/^https?:/i.test(absoluteUrl) ||
        /^javascript:/i.test(absoluteUrl) ||
        /#$/i.test(absoluteUrl)
      ) {
        return;
      }

      foundUrl = absoluteUrl;
    } catch (error) {
      return;
    }
  });

  if (foundUrl) {
    return foundUrl;
  }

  const sourceId = source && source.id ? source.id : "";

  if (SOURCE_APPLY_URL_HINTS[sourceId]) {
    return SOURCE_APPLY_URL_HINTS[sourceId];
  }

  return baseUrl;
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

  if (
    sourceId === "master-mind" &&
    !/\/scholarships\/master-mind-scholarships\/?$/i.test(url)
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
