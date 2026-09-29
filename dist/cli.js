#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { checkText, checkUrl, DEFAULT_OPTIONS } from './schema.js';
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const program = new Command();
program
    .name('schema-validator')
    .description('Extract every JSON-LD block from a page, parse it, and check the properties Google’s rich results require and recommend.')
    .version(version)
    .argument('[url]', 'page URL (omit with --file)')
    .option('-f, --file <path>', 'validate a local HTML file or a bare JSON-LD document instead ("-" for stdin)')
    .option('--timeout <ms>', 'request timeout', String(DEFAULT_OPTIONS.timeoutMs))
    .option('--user-agent <ua>', 'User-Agent header to send')
    .option('--json', 'JSON output', false)
    .option('--fail-on <level>', '"error" (default), "warning", or "none"', 'error')
    .action(async (url, opts) => {
    if (!['error', 'warning', 'none'].includes(opts.failOn)) {
        console.error('--fail-on must be error, warning or none');
        process.exitCode = 2;
        return;
    }
    if (!url && !opts.file) {
        console.error('give a URL, or --file <path>');
        process.exitCode = 2;
        return;
    }
    let report;
    if (opts.file) {
        const text = opts.file === '-' ? readFileSync(0, 'utf8') : readFileSync(opts.file, 'utf8');
        report = checkText(text, opts.file === '-' ? 'stdin' : opts.file);
    }
    else {
        report = await checkUrl(url, {
            timeoutMs: Number(opts.timeout) || DEFAULT_OPTIONS.timeoutMs,
            userAgent: opts.userAgent ?? `crawlcove-schema-validator/${version} (+https://crawlcove.com/tools/schema-markup-generator)`
        });
    }
    if (opts.json)
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    else
        process.stdout.write(render(report));
    const errors = report.findings.filter((x) => x.severity === 'error').length;
    const warnings = report.findings.length - errors;
    console.error(`\n${errors} error(s), ${warnings} warning(s).`);
    if ((opts.failOn === 'error' && errors > 0) || (opts.failOn === 'warning' && report.findings.length > 0))
        process.exitCode = 1;
});
export function render(r) {
    const lines = [r.url, `  ${r.status !== null ? `HTTP ${r.status}` : 'local'}${r.fetchError ? ` (${r.fetchError})` : ''}${r.finalUrl !== r.url ? ` → ${r.finalUrl}` : ''}, ${r.blocks.length} JSON-LD block(s)${r.microdataTypes.length ? `, microdata: ${r.microdataTypes.slice(0, 5).join(', ')}` : ''}`];
    for (const b of r.blocks) {
        lines.push(`  ${b.parsed ? '✓' : '✗'} block ${b.index + 1}: ${b.parsed ? `${b.nodes} node(s) — ${b.types.length ? [...new Set(b.types)].join(', ') : 'no @type'}` : `invalid JSON (${b.parseError})`}`);
    }
    if (r.findings.length > 0)
        lines.push('');
    for (const x of r.findings)
        lines.push(`  ${x.severity === 'error' ? '✗' : '!'} ${x.code}${x.block !== undefined ? ` (block ${x.block + 1})` : ''}: ${x.message}`);
    return lines.join('\n') + '\n';
}
program.parseAsync(process.argv);
