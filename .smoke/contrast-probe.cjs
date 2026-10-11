// Diagnostic: measure real rendered contrast ratios in the PO module.
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
});

const PROBES = [
    '.po-step-l', '.po-step.locked .po-step-l', '.po-step-lock', '.po-step-n',
    '.po-head-sub', '.po-head-warn', '.po-chip', '.po-hint', '.po-stat-label',
    '.po-stat-num', '.po-window-l', '.po-window-v', '.po-policy-notice',
    '.po-note-warn', '.po-note-info', '.po-badge-warn', '.po-badge-success',
    '.po-card h3', '.po-block-head h4', '.po-analysis-grid h4', '.po-phases b',
    '.po-phases > div', '.po-step.locked', '.po-stat', '.po-readonly'
];

(async () => {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const SITE = `http://127.0.0.1:${server.address().port}/index.html`;
    const browser = await chromium.launch({ headless: true });
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await page.route('**/api/**', r => r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [], personnel: [], sanctioned: [], deputation: [], auditlogs: [], total: 0 })
    }));
    await page.addInitScript(() => {
        localStorage.setItem('authToken', 'x');
        localStorage.setItem('userRole', 'ADMIN');
        localStorage.setItem('userEmail', 'dlc@krishna.police');
    });
    await page.goto(SITE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.evaluate(() => showPage('presidentialOrder'));
    await page.waitForTimeout(500);

    const out = await page.evaluate((probes) => {
        const lum = ([r, g, b]) => {
            const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
            return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const parse = s => (s.match(/[\d.]+/g) || []).slice(0, 4).map(Number);
        const bgOf = el => {
            let n = el;
            while (n && n !== document.documentElement) {
                const cs = getComputedStyle(n);
                // A gradient / image background has no resolvable flat colour, so
                // the ratio computed against the page colour would be a lie.
                if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
                const p = parse(cs.backgroundColor);
                if (p.length >= 3 && (p[3] === undefined || p[3] > 0.85)) return [p[0], p[1], p[2]];
                n = n.parentElement;
            }
            return [255, 255, 255];
        };
        const ratio = (a, b) => {
            const l1 = lum(a), l2 = lum(b);
            return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        };
        return probes.map(sel => {
            const el = document.querySelector(sel);
            if (!el) return { sel, missing: true };
            const cs = getComputedStyle(el);
            const fg = parse(cs.color);
            const bg = bgOf(el);
            const px = parseFloat(cs.fontSize);
            const bold = parseInt(cs.fontWeight, 10) >= 700;
            const large = px >= 24 || (px >= 18.66 && bold);
            if (!bg) return { sel, gradient: true, px, color: cs.color };
            const r = ratio([fg[0], fg[1], fg[2]], bg);
            return {
                sel, ratio: Math.round(r * 100) / 100,
                color: cs.color, px: Math.round(px * 10) / 10,
                bold, large,
                aa: large ? r >= 3 : r >= 4.5,
                aaLarge: r >= 3
            };
        });
    }, PROBES);

    console.log('\nselector'.padEnd(30) + 'ratio   px    bold  verdict');
    console.log('-'.repeat(66));
    out.forEach(o => {
        if (o.missing) { console.log(o.sel.padEnd(30) + 'not on this screen'); return; }
        if (o.gradient) { console.log(o.sel.padEnd(30) + 'gradient bg - verify visually (' + o.color + ')'); return; }
        const flag = o.aa ? '  ok' : (o.aaLarge ? ' large-only' : '  ** FAIL **');
        console.log(o.sel.padEnd(30) + String(o.ratio).padEnd(7) + String(o.px).padEnd(6) + String(o.bold).padEnd(6) + flag);
    });

    await browser.close();
    server.close();
})();
