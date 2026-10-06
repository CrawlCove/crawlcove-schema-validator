import { afterEach, describe, expect, it } from 'vitest'
import { checkText, checkUrl, DEFAULT_OPTIONS, extractJsonLdBlocks, extractMicrodataTypes, nodesOf, validateBlock, validateHtml } from '../src/schema.js'
import { FixtureServer } from './fixtureServer.js'

const codes = (r: { findings: Array<{ code: string }> }) => r.findings.map((x) => x.code).sort()
const ld = (obj: unknown) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`
const ctx = { '@context': 'https://schema.org' }

describe('extraction (pure)', () => {
  it('finds ld+json scripts regardless of attribute order, case and quoting, and ignores other scripts', () => {
    const html = `<script>var x=1</script><SCRIPT id="a" TYPE='application/ld+json'>{"a":1}</SCRIPT><script type="application/ld+json" data-x>{"b":2}</script ><script type="text/javascript">{}</script>`
    expect(extractJsonLdBlocks(html)).toEqual(['{"a":1}', '{"b":2}'])
  })
  it('reads microdata itemtypes', () => {
    expect(extractMicrodataTypes('<div itemscope itemtype="https://schema.org/Product"><span itemprop="name">x</span></div><p itemscope itemtype="http://schema.org/Offer">')).toEqual(['Product', 'Offer'])
  })
  it('flattens @graph and arrays', () => {
    expect(nodesOf({ ...ctx, '@graph': [{ '@type': 'A' }, [{ '@type': 'B' }]] }).map((n) => n['@type'])).toEqual(['A', 'B'])
    expect(nodesOf([{ '@type': 'A' }, 'junk', null]).length).toBe(1)
  })
})

describe('validateBlock (pure)', () => {
  it('passes a complete Article and reports its types', () => {
    const r = validateBlock(JSON.stringify({ ...ctx, '@type': 'BlogPosting', headline: 'Hi', image: 'https://a.test/i.jpg', author: { '@type': 'Person', name: 'A', url: 'https://a.test/a' }, datePublished: '2026-09-29', dateModified: '2026-09-29T10:00:00+01:00' }), 0)
    expect(r.findings).toEqual([])
    expect(r.report).toMatchObject({ parsed: true, context: 'https://schema.org', types: ['BlogPosting'], nodes: 1 })
  })
  it('names the parser reason for invalid JSON and hints at raw newlines', () => {
    const r = validateBlock('{"@context":"https://schema.org","@type":"Article","headline":"line one\nline two"}', 2)
    expect(r.report.parsed).toBe(false)
    expect(r.findings[0]).toMatchObject({ code: 'invalid-json', block: 2 })
    expect(r.findings[0].message).toMatch(/raw line break/)
  })
  it('flags missing @context, wrong casing, missing @type, missing required and recommended, bad dates and relative URLs', () => {
    const r = validateBlock(JSON.stringify({ '@type': 'product', offers: { '@type': 'Offer', price: '10', priceCurrency: 'GBP', url: '/buy' }, review: { author: 'x' }, datePublished: '29/09/2026' }), 0)
    expect(codes(r)).toEqual(['invalid-date', 'missing-context', 'missing-type', 'relative-url', 'type-case'])
    expect(r.findings.find((f) => f.code === 'type-case')?.message).toContain('"Product"')
  })
  it('applies parent rules to subtypes and does not reject unknown types', () => {
    const r = validateBlock(JSON.stringify({ ...ctx, '@type': 'Restaurant', name: 'X', address: { '@type': 'PostalAddress', streetAddress: '1 St', addressLocality: 'Bristol', postalCode: 'BS1', addressCountry: 'GB' }, telephone: '1', openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification' }], geo: { '@type': 'GeoCoordinates' }, url: 'https://a.test', image: 'https://a.test/i.jpg', priceRange: '££', servesCuisine: 'x', amenityFeature: { '@type': 'LocationFeatureSpecification', name: 'wifi' } }), 0)
    expect(r.findings).toEqual([])
    const missing = validateBlock(JSON.stringify({ ...ctx, '@type': 'MusicEvent', name: 'Gig' }), 0)
    expect(missing.findings.filter((f) => f.code === 'missing-required').map((f) => f.message)).toEqual([expect.stringContaining('"startDate"'), expect.stringContaining('"location"')])
  })
  it('checks FAQ and breadcrumb shapes', () => {
    const faq = validateBlock(JSON.stringify({ ...ctx, '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'Q?', acceptedAnswer: { '@type': 'Answer', text: 'A' } }, { '@type': 'Thing', name: 'nope' }] }), 0)
    expect(codes(faq)).toEqual(['wrong-nested-type'])
    const crumbs = validateBlock(JSON.stringify({ ...ctx, '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: 'https://a.test/' }, { '@type': 'ListItem', position: 3, name: 'Here' }] }), 0)
    expect(codes(crumbs)).toEqual(['breadcrumb-positions'])
    const noItem = validateBlock(JSON.stringify({ ...ctx, '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home' }, { '@type': 'ListItem', position: 2, item: { '@id': 'https://a.test/x' } }] }), 0)
    expect(codes(noItem)).toEqual(['missing-required', 'missing-required'])
  })
  it('does not nag nested nodes about recommended properties', () => {
    const r = validateBlock(JSON.stringify({ ...ctx, '@type': 'Article', headline: 'H', image: 'https://a.test/i.jpg', datePublished: '2026-01-01', dateModified: '2026-01-02', author: { '@type': 'Person', name: 'A' } }), 0)
    expect(r.findings).toEqual([])
  })
  it('does not recommend potentialAction on WebSite (sitelinks search box retired by Google, Nov 2024)', () => {
    const r = validateBlock(JSON.stringify({ ...ctx, '@type': 'WebSite', name: 'Crawl Cove', url: 'https://crawlcove.com/' }), 0)
    expect(r.findings).toEqual([])
    const sw = validateBlock(JSON.stringify({ ...ctx, '@type': 'SoftwareApplication', name: 'x', offers: { '@type': 'Offer', price: '1.00', priceCurrency: 'GBP' }, applicationCategory: 'BusinessApplication', operatingSystem: 'Windows', image: 'https://a.test/i.png' }), 0)
    expect(codes(sw)).toEqual(['missing-required'])
    expect(sw.findings[0].message).toContain('genuine ratings')
  })
  it('accepts either alternative of an a|b requirement', () => {
    const logo = validateBlock(JSON.stringify({ ...ctx, '@type': 'Organization', name: 'X', url: 'https://a.test', logo: { '@type': 'ImageObject', url: 'https://a.test/l.png' }, sameAs: ['https://x.test/a'], contactPoint: { '@type': 'ContactPoint', contactType: 'sales' } }), 0)
    expect(logo.findings).toEqual([])
    const app = validateBlock(JSON.stringify({ ...ctx, '@type': 'SoftwareApplication', name: 'X', offers: { '@type': 'Offer', price: '1', priceCurrency: 'GBP' }, review: { '@type': 'Review', author: { '@type': 'Person', name: 'A' }, reviewRating: { '@type': 'Rating', ratingValue: 5 } }, applicationCategory: 'x', operatingSystem: 'y', image: 'https://a.test/i.png' }), 0)
    expect(app.findings).toEqual([])
    const none = validateBlock(JSON.stringify({ ...ctx, '@type': 'SoftwareApplication', name: 'X', offers: { '@type': 'Offer', price: '1', priceCurrency: 'GBP' }, applicationCategory: 'x', operatingSystem: 'y', image: 'https://a.test/i.png' }), 0)
    expect(none.findings.map((f) => f.message)).toEqual([expect.stringContaining('"aggregateRating" or "review"')])
  })
  it('treats {"@id"} references as pointers and accepts durations', () => {
    const r = validateBlock(JSON.stringify({ ...ctx, '@graph': [{ '@type': 'Recipe', name: 'Pie', image: 'https://a.test/p.jpg', author: { '@id': 'https://a.test/#me' }, cookTime: 'PT45M', totalTime: '45 minutes', datePublished: '2026-01-01', description: 'd', prepTime: 'PT10M', recipeYield: '4', recipeIngredient: ['x'], recipeInstructions: 'y', nutrition: { '@type': 'NutritionInformation' }, aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.5', ratingCount: 3, reviewCount: 3, bestRating: 5 } }] }), 0)
    expect(codes(r)).toEqual(['invalid-duration'])
  })
})

describe('validateHtml (pure)', () => {
  it('reports no structured data, microdata-only, and duplicate page-level types', () => {
    expect(codes(validateHtml('<html><body>hi</body></html>'))).toEqual(['no-structured-data'])
    expect(codes(validateHtml('<div itemscope itemtype="https://schema.org/Organization"></div>'))).toEqual(['microdata-only'])
    const dup = validateHtml(ld({ ...ctx, '@type': 'WebSite', name: 'a', url: 'https://a.test', potentialAction: { '@type': 'SearchAction', target: 'https://a.test/?q={q}', 'query-input': 'required name=q' } }) + ld({ ...ctx, '@type': 'WebSite', name: 'b', url: 'https://b.test', potentialAction: { '@type': 'SearchAction', target: 'https://b.test/?q={q}', 'query-input': 'required name=q' } }))
    expect(codes(dup)).toEqual(['duplicate-type'])
  })
  it('checkText accepts a bare JSON-LD document', () => {
    const r = checkText(JSON.stringify({ ...ctx, '@type': 'Organization', name: 'Crawl Cove', url: 'https://crawlcove.com', logo: 'https://crawlcove.com/l.png', sameAs: [], contactPoint: { '@type': 'ContactPoint' } }), 'x.json')
    expect(r.blocks).toHaveLength(1)
    expect(codes(r)).toEqual(['missing-recommended'])
  })
})

describe('over HTTP', () => {
  let server: FixtureServer
  afterEach(async () => server.close())
  const opts = { ...DEFAULT_OPTIONS, timeoutMs: 3000 }
  it('fetches, follows redirects, and validates', async () => {
    server = new FixtureServer({})
    const base = await server.listen()
    server.set({
      '/old': { status: 301, headers: { location: `${base}/page` }, body: '' },
      '/page': { body: `<html><head>${ld({ ...ctx, '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'Q', acceptedAnswer: { '@type': 'Answer', text: 'A' } }] })}</head></html>` }
    })
    const r = await checkUrl(`${base}/old`, opts)
    expect(r).toMatchObject({ status: 200, finalUrl: `${base}/page` })
    expect(r.findings).toEqual([])
    expect(r.blocks[0].types).toEqual(['FAQPage'])
  })
  it('reports fetch errors', async () => {
    server = new FixtureServer({})
    const base = await server.listen()
    expect(codes(await checkUrl(`${base}/missing`, opts))).toEqual(['fetch-error'])
    expect(codes(await checkUrl('http://127.0.0.1:9/', { ...opts, timeoutMs: 500 }))).toEqual(['fetch-error'])
  })
})
