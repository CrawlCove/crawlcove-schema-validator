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
export type Severity = 'error' | 'warning';
export interface Finding {
    code: string;
    severity: Severity;
    message: string;
    /** 0-based block index the finding is about (absent for page-level findings). */
    block?: number;
    /** The node's @type the finding is about, when there is one. */
    type?: string;
}
export interface BlockReport {
    index: number;
    parsed: boolean;
    parseError?: string;
    context: string | null;
    /** Every node's declared @type(s), flattened through @graph and arrays. */
    types: string[];
    nodes: number;
}
export interface Report {
    url: string;
    finalUrl: string;
    status: number | null;
    fetchError?: string;
    blocks: BlockReport[];
    microdataTypes: string[];
    findings: Finding[];
}
export interface Options {
    timeoutMs: number;
    userAgent: string;
    fetch: typeof fetch;
}
export declare const DEFAULT_OPTIONS: Options;
interface TypeRule {
    required: string[];
    recommended: string[];
}
/**
 * Properties Google's rich-result docs list as required / recommended, per
 * type. "Required" here means Google will not show the rich result without
 * it; schema.org itself requires nothing. Subtypes inherit via PARENT below.
 * `a|b` means either property satisfies the requirement.
 */
export declare const RULES: Record<string, TypeRule>;
/** Subtype → the type whose rules apply. Only the common cases are listed; an unlisted subtype is not checked. */
export declare const PARENT: Record<string, string>;
export declare function isNode(value: unknown): value is Record<string, unknown>;
export declare function typesOf(node: Record<string, unknown>): string[];
/** The `<script type="application/ld+json">` bodies in document order. Pure. */
export declare function extractJsonLdBlocks(html: string): string[];
/** Distinct microdata itemtype values, so "no JSON-LD" is not mistaken for "no structured data". Pure. */
export declare function extractMicrodataTypes(html: string): string[];
/** Flatten a parsed block to its content nodes (through arrays and @graph). Pure. */
export declare function nodesOf(parsed: unknown): Record<string, unknown>[];
/** Validate one raw JSON-LD block. Pure. */
export declare function validateBlock(text: string, index: number): {
    report: BlockReport;
    findings: Finding[];
};
/** Validate a whole HTML document's structured data. Pure. */
export declare function validateHtml(html: string): {
    blocks: BlockReport[];
    microdataTypes: string[];
    findings: Finding[];
};
/** Fetch a page (following redirects) and validate its structured data. */
export declare function checkUrl(input: string, options?: Partial<Options>): Promise<Report>;
/** Validate an HTML file or a bare JSON-LD document from disk/stdin. */
export declare function checkText(text: string, name: string): Report;
export {};
