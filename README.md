# crawlcove-schema-validator

A Schema.org / JSON-LD validator for the command line: extract every `<script type="application/ld+json">` block from a page (or a file, or stdin), parse it and say exactly why it doesn't parse when it doesn't, flatten `@graph`, and check each node against the properties Google's rich-result documentation **requires** and **recommends** for Article, Product, Offer, FAQPage, BreadcrumbList, Organization, LocalBusiness, Event, Recipe, HowTo, JobPosting, VideoObject, SoftwareApplication and more. Also catches the mistakes that are provably mistakes: wrong casing of a type, a missing `@context`, a relative URL, a date that isn't ISO 8601, a breadcrumb with gaps in its positions. Non-zero exit code for CI.

Need to write the markup instead? [crawlcove.com/tools/schema-markup-generator](https://crawlcove.com/tools/schema-markup-generator?utm_source=github&utm_medium=crawlcove-schema-validator) builds it; paste the result back through this tool to check it.

## Install

```sh
# one-off, nothing installed (Node 18+):
npx github:CrawlCove/crawlcove-schema-validator https://www.example.com/product/widget

# global command, from the release tarball:
npm install -g https://github.com/CrawlCove/crawlcove-schema-validator/archive/refs/tags/v1.0.0.tar.gz
schema-validator --version
```

(The tarball form is deliberate: a global `github:` install on npm 10 leaves a dangling symlink. The npm package is coming.)

## Usage

```sh
schema-validator <url> [options]
schema-validator --file page.html
cat markup.json | schema-validator --file -

  -f, --file <path>       validate a local HTML file or a bare JSON-LD document ("-" for stdin)
  --timeout <ms>          request timeout (default 10000)
  --user-agent <ua>       User-Agent header to send
  --json                  JSON output
  --fail-on <level>       error (default), warning, none
```

Example — a product page whose offer forgot the currency and whose type was typed in lower case:

```
$ schema-validator https://www.example.com/product/widget
https://www.example.com/product/widget
  HTTP 200, 2 JSON-LD block(s)
  ✓ block 1: 1 node(s) — BreadcrumbList
  ✓ block 2: 1 node(s) — product

  ✗ type-case (block 2): (top level): @type "product" is not a schema.org type; types are case-sensitive and you probably mean "Product".
  ✗ missing-required (block 2): offers: Offer is missing "priceCurrency", which Google requires before it shows a rich result.

2 error(s), 0 warning(s).
```

Exit codes: `0` clean (or only warnings with the default `--fail-on error`), `1` a failing finding, `2` usage error. `--json` prints the full report (every block with its parse state, `@context`, node count and types, plus the microdata types seen) for scripting.

Recommended-property warnings are raised only for top-level nodes, the entities Google would build a rich result for. An author's nested `Person` is not nagged about its `jobTitle`. Types the tool has never heard of are left alone: schema.org has about 800 and a rare one is more likely real than wrong.

## What each finding means, and the fix

| Finding | Severity | Why it matters | Fix |
|---|---|---|---|
| `fetch-error` | error | The page could not be read (DNS, TLS, timeout, 4xx/5xx). | Make the URL reachable. |
| `no-structured-data` | warning | No JSON-LD and no microdata on the page: no rich results, and less for AI answer engines to cite. | Add the JSON-LD your page type calls for. |
| `microdata-only` | warning | Only microdata found. Google accepts it but recommends JSON-LD, and this tool validates only JSON-LD. | Migrate to a JSON-LD block. |
| `invalid-json` | error | The block does not parse, so search engines ignore all of it. The message is the parser's own reason. The usual cause is a raw line break inside a string, which is invisible in the source. | Fix the character the message points at; escape newlines as `\n`. |
| `missing-context` | error | Without `"@context": "https://schema.org"` the vocabulary is undefined. | Add it at the top level. |
| `wrong-context` | warning | The context is not schema.org. | Use `https://schema.org`. |
| `missing-type` | error | A node with no `@type` describes nothing. | Add the `@type`. |
| `type-case` | error | `product`, `FAQpage`, `Localbusiness`: types are case-sensitive and a wrong case is a different, non-existent type. | Use the exact schema.org spelling the message suggests. |
| `malformed-type` | error | `@type` should be a bare type name, not a URL or a phrase. | `"@type": "Product"` |
| `missing-required` | error | A property Google's docs list as required for that type's rich result (`a or b` means either satisfies it). | Add it. Subtypes such as `BlogPosting` or `Restaurant` are checked against their parent's rules. |
| `missing-recommended` | warning | A property Google lists as recommended; without it the rich result has fewer features or may not be eligible for some placements. | Add it when you have the data. |
| `wrong-nested-type` | error | An FAQPage's `mainEntity` items must be `Question`s with an `acceptedAnswer`. | Fix the nested type. |
| `breadcrumb-positions` | error | ListItem positions must run 1, 2, 3 with no gaps. | Renumber. |
| `invalid-date` | error | Dates must be ISO 8601 (`2026-09-29` or `2026-09-29T14:30:00+01:00`). `29/09/2026` is ignored. | Reformat. |
| `invalid-duration` | error | Durations must be ISO 8601 (`PT30M`, `PT1H15M`), not "45 minutes". | Reformat. |
| `relative-url` | error / warning | URLs in `url`, `image`, `logo`, breadcrumb `item`, `sameAs` and friends must be absolute; a relative `@id` is a warning. | Include scheme and host. |
| `empty-value` | warning | An empty string is worse than an absent property. | Drop it or fill it. |
| `empty-block` | warning | The block parses but contains no nodes. | Remove it. |
| `duplicate-type` | warning | `BreadcrumbList`, `FAQPage`, `WebSite` or `Organization` declared more than once on one page; search engines may pick either. | Keep one. |

## Works with CrawlCove

This validates one page. [Crawl Cove](https://crawlcove.com/?utm_source=github&utm_medium=crawlcove-schema-validator), the desktop SEO crawler for Windows and Mac, runs the same schema-validity check across a whole-site crawl, reports every page that should carry structured data and doesn't, and tracks both over time.

## Related tools

- [crawlcove-sf-import](https://github.com/CrawlCove/crawlcove-sf-import) — convert a Screaming Frog export into the Crawl Cove export format, with a report of what carried over.
- [crawlcove-hreflang-checker](https://github.com/CrawlCove/crawlcove-hreflang-checker) — check a page's or a sitemap's hreflang tags: codes, self-reference, x-default and return tags.
- [crawlcove-sitemap-validator](https://github.com/CrawlCove/crawlcove-sitemap-validator) — validate an XML sitemap or sitemap index against the protocol and search-engine limits.
- [crawlcove-robots-txt-tester](https://github.com/CrawlCove/crawlcove-robots-txt-tester) — lint a robots.txt and test which URLs each crawler may fetch.
- [crawlcove-redirect-chain-checker](https://github.com/CrawlCove/crawlcove-redirect-chain-checker) — follow every hop of a URL's redirects; flags chains, loops, HTTPS downgrades and meta refreshes.
- [crawlcove-cli](https://github.com/CrawlCove/crawlcove-cli) — headless whole-site crawl with redirect-chain, broken-link, title and noindex checks.
- [crawlcove-action](https://github.com/CrawlCove/crawlcove-action) — the same checks as a GitHub Action on every PR.
- [crawlcove-mcp](https://github.com/CrawlCove/crawlcove-mcp) — crawl data for Claude, Cursor and other AI assistants.
- [crawlcove-export-spec](https://github.com/CrawlCove/crawlcove-export-spec) — the JSON Schema for Crawl Cove's crawl export.

## License

MIT — see [LICENSE](LICENSE).
