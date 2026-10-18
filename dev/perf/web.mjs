import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { chromium } from '@playwright/test';

// Portable browser-only companion to the Windows rig. Serves a frozen production bundle and
// synthetic fixtures; never connects to a user's profile, library, or remote music service.
const [bundle, output, label = 'run'] = process.argv.slice(2);
if (!bundle || !output) throw new Error('Usage: node dev/perf/web.mjs <bundle-with-perf-song> <output> [label]');
const root = path.resolve(bundle);
fs.mkdirSync(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
    const file = path.resolve(root, `.${decodeURIComponent(new URL(req.url, 'http://localhost').pathname)}`);
    if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const styles = ['cadenza', 'cappella', 'claddagh', 'classic', 'diorama', 'fume', 'lumiere', 'monet', 'partita', 'pendolo', 'sonnet', 'still', 'tempera', 'tilt'];
const backgrounds = ['common', 'latent', 'monet', 'nomand', 'sora', 'url'];
const aligned = process.env.FOLIA_PERF_ALIGN === '1';
const results = { label, source: process.env.FOLIA_PERF_SOURCE || 'unspecified', alignedSampleStartSeconds: aligned ? 40 : null, startedAtUtc: new Date().toISOString(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, loadAtStart: os.loadavg(), viewport: [1180, 820], deviceScaleFactor: 1, browser: '', scenarios: [], smoke: null, limitations: ['Cloud Chromium; not iPad Safari or physical GPU counters.', 'Synthetic audio/lyrics/covers, local fonts only.', 'No FPS claim for a real display; RAF gaps measure browser scheduling.', 'No other tests or builds should run concurrently.'] };
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
results.browser = browser.version();
async function open(style, background) {
    const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1, hasTouch: true, serviceWorkers: 'block' });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(45000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/dev/perf/page.html?scenario=${encodeURIComponent(JSON.stringify({ style, background }))}`);
    await page.waitForFunction(() => window.__perf || document.documentElement.dataset.perfError);
    await page.evaluate(async () => { if (!window.__perf) throw new Error(document.documentElement.dataset.perfError); await window.__perf.ready; });
    return { context, page, errors };
}
const percentile = (values, p) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? null; };
try {
    for (const [style, background] of [['monet', 'common'], ['sonnet', 'common'], ['pendolo', 'common'], ['classic', 'latent']]) {
        if (process.env.FOLIA_PERF_ONLY && style !== process.env.FOLIA_PERF_ONLY) continue;
        const { context, page, errors } = await open(style, background);
        const info = await page.evaluate(() => window.__perf.info());
        await page.evaluate(() => window.__perf.playFrom(36));
        await page.waitForTimeout(3000);
        await page.screenshot({ path: path.join(output, `${label}-${style}-${background}.png`) });
        // An aligned repeat removes the variable duration of screenshot readback from the song clock.
        if (aligned) await page.evaluate(() => window.__perf.playFrom(40));
        const windows = [];
        for (let index = 0; index < 3; index++) {
            const sample = await page.evaluate(async swap => { window.__perf.startWindow(); return window.__perf.endWindowAfter(4, swap ? { swapSongAfterSeconds: 2 } : undefined); }, index === 2);
            if (sample.frameGapsMs.length === 0 || sample.frameGapsMs.some(ms => ms <= 0)) throw new Error('Invalid frame sampling window; no duplicate or empty samples accepted.');
            windows.push({ ...sample, p50Ms: percentile(sample.frameGapsMs, .5), p95Ms: percentile(sample.frameGapsMs, .95), maxMs: Math.max(...sample.frameGapsMs), gapsOver50Ms: sample.frameGapsMs.filter(ms => ms > 50).length });
        }
        await page.screenshot({ path: path.join(output, `${label}-${style}-after-song-change.png`) });
        results.scenarios.push({ style, background, info, errors, windows });
        await context.close();
        fs.writeFileSync(path.join(output, `${label}.json`), JSON.stringify(results, null, 2));
        console.log(`${label}: ${style}/${background} measured, ${errors.length} page errors`);
    }
    if (process.env.FOLIA_PERF_SMOKE === '1') {
        const { context, page, errors } = await open('classic', 'common');
        await page.evaluate(() => window.__perf.playFrom(8));
        const modes = [];
        for (const style of styles) {
            await page.evaluate(value => window.__perf.appearance(value, 'common'), style);
            await page.locator(`[data-visualizer-style="${style}"]`).waitFor();
            await page.waitForFunction(() => document.querySelectorAll('[data-visualizer-style]').length === 1);
            await page.waitForTimeout(1200);
            modes.push({ style, canvasCount: await page.locator('canvas').count(), nodes: await page.locator('[data-perf-stage] *').count() });
        }
        for (const background of backgrounds) {
            await page.evaluate(value => window.__perf.appearance('classic', value), background);
            await page.locator(`[data-visualizer-background="${background}"]`).waitFor();
            await page.waitForFunction(() => document.querySelectorAll('[data-visualizer-background]').length === 1);
            await page.waitForTimeout(1000);
        }
        await page.setViewportSize({ width: 820, height: 1180 });
        await page.screenshot({ path: path.join(output, `${label}-portrait.png`) });
        results.smoke = { modes, backgrounds, errors, settings: await page.evaluate(() => window.__perf.info()) };
        await context.close();
    }
    fs.writeFileSync(path.join(output, `${label}.json`), JSON.stringify(results, null, 2));
    if (results.scenarios.some(scenario => scenario.errors.length) || results.smoke?.errors.length) throw new Error('Browser page errors found; inspect result JSON.');
} finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}
