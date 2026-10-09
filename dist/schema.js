/**
 * Schema.org / JSON-LD validator — the core, pure where it can be.
 *
 * Extracts every <script type="application/ld+json"> block from a page,
 * parses it (reporting the parser's own reason when it fails, because the
 * usual cause is a raw newline inside a string that nobody can see), flattens
 * @graph/arrays to nodes, and checks each node's type against the properties
 * Google's rich-result documentation requires and recommends. The same
 * required-property idea as the `schema-validity` check in the Crawl Cove
 * desktop crawler, extended with recommended properties and nested shapes
 * (FAQ questions, breadcrumb items, offers, ratings).
 *
 * Deliberately does NOT reject a type it has never heard of: schema.org has
 * ~800 types and a rare one is more likely real than wrong. It does catch the
 * mistakes that are provably mistakes — wrong casing of a known type, a
 * missing @context, a relative URL, a date that is not ISO 8601.
 */
export const DEFAULT_OPTIONS = {
    timeoutMs: 10_000,
    userAgent: 'crawlcove-schema-validator/1.0 (+https://crawlcove.com/tools/schema-markup-generator)',
    fetch: globalThis.fetch
};
const MAX_BODY_BYTES = 3_000_000;
/**
 * Properties Google's rich-result docs list as required / recommended, per
 * type. "Required" here means Google will not show the rich result without
 * it; schema.org itself requires nothing. Subtypes inherit via PARENT below.
 * `a|b` means either property satisfies the requirement.
 */
export const RULES = {
    Article: { required: ['headline'], recommended: ['image', 'author', 'datePublished', 'dateModified'] },
    Product: { required: ['name'], recommended: ['image', 'description', 'offers', 'aggregateRating', 'review', 'brand', 'sku'] },
    Offer: { required: ['price', 'priceCurrency'], recommended: ['availability', 'url', 'priceValidUntil'] },
    AggregateOffer: { required: ['lowPrice', 'priceCurrency'], recommended: ['highPrice', 'offerCount'] },
    AggregateRating: { required: ['ratingValue'], recommended: ['ratingCount', 'reviewCount', 'bestRating'] },
    Review: { required: ['author', 'reviewRating'], recommended: ['itemReviewed', 'datePublished', 'reviewBody'] },
    Rating: { required: ['ratingValue'], recommended: ['bestRating', 'worstRating'] },
    BreadcrumbList: { required: ['itemListElement'], recommended: [] },
    ListItem: { required: ['position'], recommended: ['name', 'item'] },
    FAQPage: { required: ['mainEntity'], recommended: [] },
    Question: { required: ['name', 'acceptedAnswer'], recommended: [] },
    Answer: { required: ['text'], recommended: [] },
    HowTo: { required: ['name', 'step'], recommended: ['image', 'totalTime', 'estimatedCost', 'supply', 'tool'] },
    HowToStep: { required: ['text'], recommended: ['name', 'image', 'url'] },
    Organization: { required: ['name'], recommended: ['url', 'logo', 'sameAs', 'contactPoint'] },
    LocalBusiness: { required: ['name', 'address'], recommended: ['telephone', 'openingHoursSpecification', 'geo', 'url', 'image', 'priceRange'] },
    // Google marks no PostalAddress sub-property required for LocalBusiness or
    // Event ("include as many properties as possible"); JobPosting is the one
    // type whose address must carry addressCountry. Both are shape checks in
    // validateNode, keyed on the top-level type that owns the address.
    PostalAddress: { required: [], recommended: ['streetAddress', 'addressLocality', 'postalCode', 'addressRegion', 'addressCountry'] },
    Person: { required: ['name'], recommended: ['url', 'sameAs', 'jobTitle'] },
    // No recommended properties: the only one Google ever asked for on WebSite
    // was potentialAction (SearchAction) for the sitelinks search box, and Google
    // retired that feature in November 2024 and removed its documentation. The
    // markup is harmless but earns nothing, so we no longer suggest adding it.
    WebSite: { required: ['name', 'url'], recommended: [] },
    WebPage: { required: [], recommended: ['name', 'url'] },
    Event: { required: ['name', 'startDate', 'location'], recommended: ['endDate', 'image', 'description', 'offers', 'performer', 'organizer', 'eventStatus', 'eventAttendanceMode'] },
    Recipe: { required: ['name', 'image'], recommended: ['author', 'datePublished', 'description', 'prepTime', 'cookTime', 'totalTime', 'recipeYield', 'recipeIngredient', 'recipeInstructions', 'nutrition', 'aggregateRating'] },
    // jobLocation is required unless the job is fully remote (jobLocationType
    // TELECOMMUTE + applicantLocationRequirements): a shape check in validateNode.
    JobPosting: { required: ['title', 'description', 'datePosted', 'hiringOrganization'], recommended: ['validThrough', 'baseSalary', 'employmentType', 'identifier'] },
    VideoObject: { required: ['name', 'thumbnailUrl', 'uploadDate'], recommended: ['description', 'duration', 'contentUrl', 'embedUrl'] },
    SoftwareApplication: { required: ['name', 'offers', 'aggregateRating|review'], recommended: ['applicationCategory', 'operatingSystem', 'image'] },
    Course: { required: ['name', 'description', 'provider'], recommended: [] },
    Dataset: { required: ['name', 'description'], recommended: ['url', 'license', 'creator'] },
    // contentUrl is only required for the image-metadata rich result; a nested logo/image needs only url.
    ImageObject: { required: ['url|contentUrl'], recommended: ['license', 'creator', 'creditText'] },
    ItemList: { required: ['itemListElement'], recommended: [] },
    Book: { required: ['name', 'author'], recommended: ['isbn', 'image'] },
    Movie: { required: ['name', 'image'], recommended: ['dateCreated', 'director', 'review', 'aggregateRating'] }
};
/** Subtype → the type whose rules apply. Only the common cases are listed; an unlisted subtype is not checked. */
export const PARENT = {
    BlogPosting: 'Article', NewsArticle: 'Article', TechArticle: 'Article', ScholarlyArticle: 'Article', Report: 'Article',
    Corporation: 'Organization', NGO: 'Organization', EducationalOrganization: 'Organization', GovernmentOrganization: 'Organization', SportsOrganization: 'Organization',
    Restaurant: 'LocalBusiness', Store: 'LocalBusiness', Dentist: 'LocalBusiness', Hotel: 'LocalBusiness', LodgingBusiness: 'LocalBusiness', MedicalBusiness: 'LocalBusiness', LegalService: 'LocalBusiness', ProfessionalService: 'LocalBusiness', Plumber: 'LocalBusiness', Electrician: 'LocalBusiness', HomeAndConstructionBusiness: 'LocalBusiness', AutoRepair: 'LocalBusiness', BeautySalon: 'LocalBusiness', HairSalon: 'LocalBusiness', RealEstateAgent: 'LocalBusiness', TravelAgency: 'LocalBusiness', FoodEstablishment: 'LocalBusiness', CafeOrCoffeeShop: 'LocalBusiness', Bakery: 'LocalBusiness', BarOrPub: 'LocalBusiness', Physician: 'LocalBusiness', HealthAndBeautyBusiness: 'LocalBusiness', FinancialService: 'LocalBusiness', AccountingService: 'LocalBusiness', InsuranceAgency: 'LocalBusiness', Attorney: 'LocalBusiness', Notary: 'LocalBusiness', SportsActivityLocation: 'LocalBusiness', ExerciseGym: 'LocalBusiness', ChildCare: 'LocalBusiness', DryCleaningOrLaundry: 'LocalBusiness', Florist: 'LocalBusiness', PetStore: 'LocalBusiness', Pharmacy: 'LocalBusiness', ShoppingCenter: 'LocalBusiness', TouristInformationCenter: 'LocalBusiness',
    MusicEvent: 'Event', SportsEvent: 'Event', BusinessEvent: 'Event', EducationEvent: 'Event', Festival: 'Event', TheaterEvent: 'Event', ExhibitionEvent: 'Event', SocialEvent: 'Event', ComedyEvent: 'Event', DanceEvent: 'Event', ScreeningEvent: 'Event', SaleEvent: 'Event', LiteraryEvent: 'Event', ChildrensEvent: 'Event', FoodEvent: 'Event', PublicationEvent: 'Event',
    MobileApplication: 'SoftwareApplication', WebApplication: 'SoftwareApplication', VideoGame: 'SoftwareApplication',
    AboutPage: 'WebPage', ContactPage: 'WebPage', CollectionPage: 'WebPage', ProfilePage: 'WebPage', SearchResultsPage: 'WebPage', ItemPage: 'WebPage', CheckoutPage: 'WebPage', QAPage: 'WebPage', MedicalWebPage: 'WebPage',
    IndividualProduct: 'Product', ProductModel: 'Product', ProductGroup: 'Product', Vehicle: 'Product', Car: 'Product',
    HowToSection: 'HowToStep', HowToDirection: 'HowToStep',
    Clip: 'VideoObject',
    Service: 'Organization'
};
/** Every type this tool knows by name — used only to catch wrong casing, never to reject the unknown. */
const KNOWN_TYPES = new Set([
    ...Object.keys(RULES), ...Object.keys(PARENT),
    'Thing', 'CreativeWork', 'Place', 'ContactPoint', 'GeoCoordinates', 'OpeningHoursSpecification', 'SearchAction', 'EntryPoint',
    'PropertyValue', 'Brand', 'MonetaryAmount', 'QuantitativeValue', 'NutritionInformation', 'Comment', 'Audience', 'Country', 'City',
    'DefinedTerm', 'MediaObject', 'AudioObject', 'PodcastEpisode', 'MusicRecording', 'MusicAlbum', 'MusicGroup', 'Photograph', 'Painting',
    'CollectionPage', 'SiteNavigationElement', 'WPHeader', 'WPFooter', 'WPSideBar', 'Table', 'Duration', 'Language', 'Occupation',
    'ReadAction', 'ViewAction', 'BuyAction', 'OrderAction', 'ReserveAction', 'VirtualLocation', 'EventStatusType', 'ItemAvailability',
    'Speakable', 'SpeakableSpecification', 'ClaimReview', 'Claim', 'MedicalCondition', 'Drug', 'Hospital', 'Airline', 'Flight'
]);
const KNOWN_LOWER = new Map([...KNOWN_TYPES].map((t) => [t.toLowerCase(), t]));
/** Properties whose string values must be ISO 8601 dates or date-times. */
const DATE_PROPS = new Set(['datePublished', 'dateModified', 'dateCreated', 'startDate', 'endDate', 'uploadDate', 'datePosted', 'validThrough', 'priceValidUntil', 'expires', 'foundingDate', 'birthDate']);
/** Properties whose string values should be absolute URLs. */
const URL_PROPS = new Set(['url', 'image', 'logo', 'contentUrl', 'thumbnailUrl', 'embedUrl', 'sameAs', 'item', '@id', 'mainEntityOfPage', 'target']);
/** Properties whose string values should be ISO 8601 durations. */
const DURATION_PROPS = new Set(['duration', 'prepTime', 'cookTime', 'totalTime', 'performTime']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const ISO_DURATION = /^P(?!$)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/;
export function isNode(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function hasValue(node, key) {
    if (!(key in node))
        return false;
    const v = node[key];
    if (v === null || v === undefined)
        return false;
    if (typeof v === 'string')
        return v.trim() !== '';
    if (Array.isArray(v))
        return v.length > 0;
    return true;
}
export function typesOf(node) {
    const raw = node['@type'];
    if (typeof raw === 'string')
        return [raw];
    if (Array.isArray(raw))
        return raw.filter((t) => typeof t === 'string');
    return [];
}
/** The `<script type="application/ld+json">` bodies in document order. Pure. */
export function extractJsonLdBlocks(html) {
    const out = [];
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const attrs = m[1];
        const type = /\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(attrs);
        const t = (type?.[1] ?? type?.[2] ?? type?.[3] ?? '').trim().toLowerCase();
        if (t !== 'application/ld+json')
            continue;
        out.push(m[2].trim());
    }
    return out;
}
/** Distinct microdata itemtype values, so "no JSON-LD" is not mistaken for "no structured data". Pure. */
export function extractMicrodataTypes(html) {
    const out = new Set();
    for (const tag of html.match(/<[a-z][^>]*\bitemscope\b[^>]*>/gi) ?? []) {
        const m = /\bitemtype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(tag);
        const v = (m?.[1] ?? m?.[2] ?? m?.[3] ?? '').trim();
        if (v)
            for (const t of v.split(/\s+/))
                out.add(t.replace(/^https?:\/\/schema\.org\//i, ''));
    }
    return [...out];
}
function parseFailureReason(err) {
    const raw = err instanceof Error ? err.message : '';
    const one = raw.replace(/\s+/g, ' ').trim();
    if (one === '')
        return 'not valid JSON';
    return one.length > 160 ? `${one.slice(0, 160)}…` : one;
}
function contextOf(parsed) {
    const top = Array.isArray(parsed) ? parsed.find(isNode) : parsed;
    if (!isNode(top))
        return null;
    const c = top['@context'];
    if (typeof c === 'string')
        return c;
    if (Array.isArray(c)) {
        const s = c.find((x) => typeof x === 'string');
        return typeof s === 'string' ? s : c.length > 0 ? '(object)' : null;
    }
    if (isNode(c))
        return typeof c['@vocab'] === 'string' ? c['@vocab'] : '(object)';
    return null;
}
/** Flatten a parsed block to its content nodes (through arrays and @graph). Pure. */
export function nodesOf(parsed) {
    const nodes = [];
    const collect = (value) => {
        if (Array.isArray(value)) {
            for (const item of value)
                collect(item);
            return;
        }
        if (!isNode(value))
            return;
        if (Array.isArray(value['@graph'])) {
            for (const item of value['@graph'])
                collect(item);
            return;
        }
        nodes.push(value);
    };
    collect(parsed);
    return nodes;
}
function ruleFor(type) {
    if (RULES[type])
        return { rule: RULES[type], via: type };
    const parent = PARENT[type];
    if (parent && RULES[parent])
        return { rule: RULES[parent], via: parent };
    return null;
}
/** Validate one node and, recursively, the nodes nested in its properties. Pure. */
function validateNode(node, block, path, into, depth = 0, ownerIn = null) {
    if (depth > 8)
        return;
    const types = typesOf(node);
    const label = path || '(top level)';
    // The rule type of the top-level node this one sits inside (JobPosting,
    // LocalBusiness, Event…): nested shapes such as PostalAddress are judged by
    // what Google asks of the entity they belong to, not in isolation.
    const owner = depth === 0 ? (types.map((t) => ruleFor(t)?.via).find((v) => typeof v === 'string') ?? null) : ownerIn;
    // A bare reference {"@id": "..."} is a pointer, not a node — nothing to validate.
    if (types.length === 0) {
        if (!(Object.keys(node).length === 1 && '@id' in node)) {
            into.push({ code: 'missing-type', severity: 'error', block, message: `${label}: node has no @type, so search engines cannot tell what it describes.` });
        }
    }
    for (const t of types) {
        if (!/^[A-Za-z][A-Za-z0-9]*$/.test(t)) {
            into.push({ code: 'malformed-type', severity: 'error', block, type: t, message: `${label}: @type "${t}" is not a bare schema.org type name (no URL, spaces or punctuation).` });
            continue;
        }
        if (!KNOWN_TYPES.has(t)) {
            const proper = KNOWN_LOWER.get(t.toLowerCase());
            if (proper)
                into.push({ code: 'type-case', severity: 'error', block, type: t, message: `${label}: @type "${t}" is not a schema.org type; types are case-sensitive and you probably mean "${proper}".` });
            else if (/^[a-z]/.test(t))
                into.push({ code: 'type-case', severity: 'error', block, type: t, message: `${label}: @type "${t}" starts with a lower-case letter; schema.org types are CapitalCase.` });
            continue;
        }
        const r = ruleFor(t);
        if (r === null)
            continue;
        for (const p of r.rule.required) {
            const alts = p.split('|');
            if (!alts.some((a) => hasValue(node, a))) {
                // Ratings and reviews can only come from real users: an invented
                // aggregateRating is a policy violation, not a fix, so say so rather
                // than let CI pressure someone into fabricating one.
                const tail = alts.includes('aggregateRating') ? ' Only add one built from genuine ratings or reviews you actually hold; until then this error simply means the page is not eligible for that rich result.' : '';
                into.push({ code: 'missing-required', severity: 'error', block, type: t, message: `${label}: ${t} is missing ${alts.map((a) => `"${a}"`).join(' or ')}, which Google requires${r.via !== t ? ` (rule for ${r.via})` : ''} before it shows a rich result.${tail}` });
            }
        }
        // Recommended properties are only judged on top-level nodes: an author's
        // Person or a breadcrumb's last ListItem is not the entity Google is
        // building a rich result for, and warning about its sameAs is noise.
        if (depth === 0)
            for (const p of r.rule.recommended) {
                if (!hasValue(node, p))
                    into.push({ code: 'missing-recommended', severity: 'warning', block, type: t, message: `${label}: ${t} has no "${p}" (recommended by Google; more properties, more rich-result features).` });
            }
    }
    for (const [key, value] of Object.entries(node)) {
        if (key.startsWith('@')) {
            if (key === '@id' && typeof value === 'string' && value !== '' && !/^(https?:\/\/|#|_:)/i.test(value) && !value.startsWith('/')) {
                into.push({ code: 'relative-url', severity: 'warning', block, message: `${label}: @id "${value}" is not an absolute IRI; use the page URL plus a fragment (https://…/#organization).` });
            }
            continue;
        }
        const childPath = path ? `${path}.${key}` : key;
        const values = Array.isArray(value) ? value : [value];
        for (const v of values) {
            if (isNode(v)) {
                validateNode(v, block, childPath, into, depth + 1, owner);
                continue;
            }
            if (typeof v !== 'string')
                continue;
            if (v.trim() === '')
                into.push({ code: 'empty-value', severity: 'warning', block, message: `${childPath}: is an empty string; drop the property or fill it in.` });
            else if (DATE_PROPS.has(key) && !ISO_DATE.test(v.trim()))
                into.push({ code: 'invalid-date', severity: 'error', block, message: `${childPath}: "${v}" is not an ISO 8601 date (2026-09-29 or 2026-09-29T14:30:00+01:00).` });
            else if (DURATION_PROPS.has(key) && !ISO_DURATION.test(v.trim()))
                into.push({ code: 'invalid-duration', severity: 'error', block, message: `${childPath}: "${v}" is not an ISO 8601 duration (PT30M, PT1H15M).` });
            else if (URL_PROPS.has(key) && !/^https?:\/\//i.test(v.trim()) && !/^(mailto:|tel:)/i.test(v.trim())) {
                if (key === 'item' && isNode(node) && typesOf(node).includes('ListItem') && v.trim().startsWith('/'))
                    into.push({ code: 'relative-url', severity: 'error', block, message: `${childPath}: "${v}" is relative; breadcrumb items must be absolute URLs.` });
                else if (/^\//.test(v.trim()) || /^(www\.|[a-z0-9-]+\.[a-z]{2,})/i.test(v.trim()))
                    into.push({ code: 'relative-url', severity: 'error', block, message: `${childPath}: "${v}" is not an absolute URL; include the scheme and host.` });
            }
        }
    }
    // Shape checks that need the parent: an FAQ with no Question children, a breadcrumb with no positions.
    if (types.includes('JobPosting')) {
        // Google: "The jobLocation property isn't required if applicantLocationRequirements
        // is present", and a fully remote job "must use jobLocationType" (TELECOMMUTE).
        const hasLocation = hasValue(node, 'jobLocation');
        const hasApplicantLocation = hasValue(node, 'applicantLocationRequirements');
        const locationType = typeof node.jobLocationType === 'string' ? node.jobLocationType.trim() : '';
        if (!hasLocation && !hasApplicantLocation)
            into.push({ code: 'missing-required', severity: 'error', block, type: 'JobPosting', message: `${label}: JobPosting is missing "jobLocation", which Google requires before it shows a rich result, unless the job is fully remote (then set "jobLocationType": "TELECOMMUTE" and "applicantLocationRequirements" instead).` });
        else if (!hasLocation && locationType !== 'TELECOMMUTE')
            into.push({ code: 'missing-required', severity: 'error', block, type: 'JobPosting', message: `${label}: JobPosting has "applicantLocationRequirements" but no "jobLocation", so it is a remote job and Google requires "jobLocationType": "TELECOMMUTE".` });
    }
    if (types.includes('PostalAddress') && depth > 0) {
        if (owner === 'JobPosting') {
            if (!hasValue(node, 'addressCountry'))
                into.push({ code: 'missing-required', severity: 'error', block, type: 'PostalAddress', message: `${label}: a JobPosting address must include "addressCountry" (Google requires it; street, locality, region and postcode are recommended).` });
        }
        else if (!hasValue(node, 'streetAddress') && !hasValue(node, 'addressLocality')) {
            into.push({ code: 'thin-address', severity: 'warning', block, type: 'PostalAddress', message: `${label}: address has neither "streetAddress" nor "addressLocality"; Google asks for as full an address as possible.` });
        }
    }
    if (types.includes('FAQPage')) {
        const qs = (Array.isArray(node.mainEntity) ? node.mainEntity : [node.mainEntity]).filter(isNode);
        if (hasValue(node, 'mainEntity') && qs.some((q) => !typesOf(q).includes('Question')))
            into.push({ code: 'wrong-nested-type', severity: 'error', block, type: 'FAQPage', message: `${label}: every mainEntity of an FAQPage must be a Question with an acceptedAnswer.` });
    }
    if (types.includes('BreadcrumbList')) {
        const items = (Array.isArray(node.itemListElement) ? node.itemListElement : [node.itemListElement]).filter(isNode);
        const positions = items.map((i) => Number(i.position)).filter((n) => Number.isFinite(n));
        if (items.length > 0 && positions.length === items.length) {
            const sorted = [...positions].sort((a, b) => a - b);
            if (sorted.some((p, i) => p !== i + 1))
                into.push({ code: 'breadcrumb-positions', severity: 'error', block, type: 'BreadcrumbList', message: `${label}: ListItem positions must be 1, 2, 3… with no gaps (found ${positions.join(', ')}).` });
        }
        items.forEach((i, idx) => {
            const last = idx === items.length - 1;
            const named = hasValue(i, 'name') || (isNode(i.item) && hasValue(i.item, 'name'));
            if (!named)
                into.push({ code: 'missing-required', severity: 'error', block, type: 'ListItem', message: `${label}.itemListElement[${idx}]: breadcrumb item has no name (set "name", or "item" as an object with a "name").` });
            if (!last && !hasValue(i, 'item'))
                into.push({ code: 'missing-required', severity: 'error', block, type: 'ListItem', message: `${label}.itemListElement[${idx}]: every breadcrumb item except the last needs an "item" URL.` });
        });
    }
}
/** Validate one raw JSON-LD block. Pure. */
export function validateBlock(text, index) {
    const findings = [];
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch (e) {
        const reason = parseFailureReason(e);
        findings.push({ code: 'invalid-json', severity: 'error', block: index, message: `Block ${index + 1} is not valid JSON: ${reason}.${/control character/i.test(reason) ? ' Usually a raw line break inside a string value.' : ''}` });
        return { report: { index, parsed: false, parseError: reason, context: null, types: [], nodes: 0 }, findings };
    }
    const context = contextOf(parsed);
    if (context === null)
        findings.push({ code: 'missing-context', severity: 'error', block: index, message: `Block ${index + 1} has no @context; add "@context": "https://schema.org".` });
    else if (context !== '(object)' && !/^https?:\/\/schema\.org\/?$/i.test(context))
        findings.push({ code: 'wrong-context', severity: 'warning', block: index, message: `Block ${index + 1} @context is "${context}", not https://schema.org.` });
    const nodes = nodesOf(parsed);
    if (nodes.length === 0)
        findings.push({ code: 'empty-block', severity: 'warning', block: index, message: `Block ${index + 1} parses but contains no nodes.` });
    const types = [];
    nodes.forEach((n) => {
        types.push(...typesOf(n));
        validateNode(n, index, '', findings);
    });
    return { report: { index, parsed: true, context, types, nodes: nodes.length }, findings };
}
/** Validate a whole HTML document's structured data. Pure. */
export function validateHtml(html) {
    const raw = extractJsonLdBlocks(html);
    const microdataTypes = extractMicrodataTypes(html);
    const blocks = [];
    const findings = [];
    raw.forEach((text, i) => {
        const r = validateBlock(text, i);
        blocks.push(r.report);
        findings.push(...r.findings);
    });
    if (raw.length === 0) {
        if (microdataTypes.length > 0)
            findings.push({ code: 'microdata-only', severity: 'warning', message: `No JSON-LD; structured data is microdata only (${microdataTypes.slice(0, 5).join(', ')}). Google prefers JSON-LD and this tool validates only JSON-LD.` });
        else
            findings.push({ code: 'no-structured-data', severity: 'warning', message: 'No JSON-LD blocks and no microdata found on this page.' });
    }
    const all = blocks.flatMap((b) => b.types);
    for (const t of ['BreadcrumbList', 'FAQPage', 'WebSite', 'Organization']) {
        if (all.filter((x) => x === t).length > 1)
            findings.push({ code: 'duplicate-type', severity: 'warning', type: t, message: `${t} is declared ${all.filter((x) => x === t).length} times on one page; search engines may pick either.` });
    }
    return { blocks, microdataTypes, findings };
}
function ensureScheme(input) {
    const s = input.trim();
    return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}
/** Fetch a page (following redirects) and validate its structured data. */
export async function checkUrl(input, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const url = ensureScheme(input);
    const base = { url, finalUrl: url, status: null, blocks: [], microdataTypes: [], findings: [] };
    let res;
    try {
        res = await opts.fetch(url, {
            redirect: 'follow',
            headers: { 'user-agent': opts.userAgent, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' },
            signal: AbortSignal.timeout(opts.timeoutMs)
        });
    }
    catch (e) {
        base.fetchError = e instanceof Error ? e.message : String(e);
        base.findings.push({ code: 'fetch-error', severity: 'error', message: `Could not read the page: ${base.fetchError}.` });
        return base;
    }
    base.status = res.status;
    base.finalUrl = res.url || url;
    if (res.status >= 400) {
        base.fetchError = `HTTP ${res.status}`;
        base.findings.push({ code: 'fetch-error', severity: 'error', message: `Could not read the page: HTTP ${res.status}.` });
        return base;
    }
    const html = Buffer.from(await res.arrayBuffer()).subarray(0, MAX_BODY_BYTES).toString('utf8');
    return { ...base, ...validateHtml(html) };
}
/** Validate an HTML file or a bare JSON-LD document from disk/stdin. */
export function checkText(text, name) {
    const looksJson = /^\s*[[{]/.test(text);
    const html = looksJson ? `<script type="application/ld+json">${text}</script>` : text;
    return { url: name, finalUrl: name, status: null, ...validateHtml(html) };
}
