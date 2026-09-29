# Changelog

## 1.0.0 — 2026-09-29

Initial release.

- `schema-validator <url>` / `--file <path|->`: extracts every JSON-LD block,
  reports the parser's own reason when one does not parse, flattens `@graph`
  and arrays, and checks each node against Google's required (error) and
  recommended (warning, top-level nodes only) properties for 30+ types, with
  common subtypes mapped to their parent's rules.
- Shape checks: FAQ questions, breadcrumb positions and items, `a|b` either-of
  requirements (ImageObject `url|contentUrl`, SoftwareApplication
  `aggregateRating|review`).
- Value checks: ISO 8601 dates and durations, absolute URLs, empty strings,
  case-sensitive type names with a "did you mean" suggestion.
- Page-level: `no-structured-data`, `microdata-only`, `duplicate-type`.
- `--fail-on error|warning|none`, `--json`, `--timeout`, `--user-agent`.
