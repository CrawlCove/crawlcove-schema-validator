# Changelog

## 1.0.3 — 2026-10-09

- `Review`: the nested `itemReviewed` node now needs only a `name`, as Google's
  review-snippet rules say. A review of a `LocalBusiness` no longer fails for a
  missing address, nor a `Book` for a missing author. Found by running every
  type crawlcove.com/tools/schema-markup-generator builds through the validator.

## 1.0.2 — 2026-10-09

- `JobPosting` no longer requires `jobLocation` when the job is fully remote.
  Google: "The jobLocation property isn't required if applicantLocationRequirements
  is present", so a posting with `jobLocationType: TELECOMMUTE` plus
  `applicantLocationRequirements` now passes. A posting with neither still errors,
  and one with `applicantLocationRequirements` but no `TELECOMMUTE` is told Google
  requires the type for a remote job.
- `PostalAddress` rules now depend on the type that owns the address. Inside a
  `JobPosting`, only `addressCountry` is required (Google's one stated must);
  a city-only office address passes. Elsewhere (LocalBusiness, Event) Google marks
  no sub-property required, so a street-and-locality-free address is a
  `thin-address` warning instead of a `missing-required` error.
- Both were false positives reported against the JSON-LD that
  crawlcove.com/tools/schema-markup-generator builds for its JobPosting type.

## 1.0.1 — 2026-10-06

- `WebSite` no longer gets a `missing-recommended` warning for `potentialAction`.
  The sitelinks search box it fed was retired by Google in November 2024, so the
  markup earns nothing; sites without a search page were being nudged to add
  a SearchAction they could not honour.
- The `missing-required` message for `aggregateRating|review` now says the rating
  must come from genuine reviews you hold, and that until then the error only
  means the page is not eligible for that rich result.

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
