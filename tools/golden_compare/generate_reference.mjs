#!/usr/bin/env node
/**
 * Generate KaTeX reference PNGs for golden test comparison.
 * Reads test_cases.txt, renders each formula with KaTeX in a headless browser,
 * and saves screenshots to the fixtures directory.
 *
 * Usage:
 *   node generate_reference.mjs [test_cases.txt] [fixtures_dir] [--mhchem]
 *
 * --mhchem: use 40px font (for tests/golden/test_case_ce.txt → fixtures_ce).
 * mhchem (\\ce, \\pu, …) is loaded after KaTeX via Puppeteer addScriptTag so file://
 * reference runs always register macros; do not rely on a second <script src="contrib/…"> alone.
 * KaTeX dist is resolved from tools/golden_compare/node_modules or tools/lexer_compare/node_modules.
 *
 * Requires KaTeX ≥ 0.16.42 (e.g. ^0.16.44 in package.json) so mathtools-style \\underbracket / \\overbracket
 * parse; older 0.16.x patch releases omit them and render as undefined control sequence.
 */
import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Read PNG width/height from IHDR (no extra deps). */
function readPngSize(absPath) {
    const buf = readFileSync(absPath);
    if (buf.length < 24) {
        throw new Error(`PNG too small: ${absPath}`);
    }
    if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) {
        throw new Error(`Not a PNG: ${absPath}`);
    }
    return {
        width: buf.readUInt32BE(16),
        height: buf.readUInt32BE(20),
    };
}

function resolveKatexDist() {
    const candidates = [
        join(__dirname, 'node_modules', 'katex', 'dist'),
        join(__dirname, '..', 'lexer_compare', 'node_modules', 'katex', 'dist'),
    ];
    for (const c of candidates) {
        const katexJs = join(c, 'katex.min.js');
        const mhchemJs = join(c, 'contrib', 'mhchem.min.js');
        if (existsSync(katexJs) && existsSync(mhchemJs)) {
            return c;
        }
    }
    throw new Error(
        'KaTeX dist not found or missing contrib/mhchem.min.js (required for \\ce and \\pu). ' +
            'Run: (cd tools/golden_compare && npm install) or npm install under tools/lexer_compare'
    );
}

async function main() {
    const rawArgs = process.argv.slice(2);
    const withMhchem = rawArgs.includes('--mhchem');
    const args = rawArgs.filter((a) => a !== '--mhchem');
    const testCasesPath =
        args[0] || join(__dirname, '..', '..', 'tests', 'golden', 'test_cases.txt');
    const outputDir =
        args[1] || join(__dirname, '..', '..', 'tests', 'golden', 'fixtures');
    // When set, numbered-env fixtures use the same total canvas width as RaTeX PNGs
    // (tests/golden/output/NNNN.png) so golden ink comparison is not stretched by a
    // 700px-wide KaTeX container. Generate output first: scripts/update_golden_output.sh
    const alignOutputDir = join(__dirname, '..', '..', 'tests', 'golden', 'output');

    const KATEX_DIST = resolveKatexDist();
    const fontPx = withMhchem ? 40 : 20;

    if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
    }

    const lines = readFileSync(testCasesPath, 'utf8')
        .split('\n')
        .filter(l => l.trim() && !l.trim().startsWith('#'));

    console.log(
        `Generating ${lines.length} reference PNGs (KaTeX + mhchem, ${fontPx}px)...`
    );

    // Write temp HTML in KaTeX dist dir so relative font paths resolve correctly.
    //
    // Default rendering keeps the historical inline-block + 10px-padding layout
    // so screenshots of fixtures without numbered environments are byte-for-byte
    // identical to what the suite produced before the tag-overlap fix landed.
    //
    // For \\begin{align} / \\begin{gather} / \\tag{} we detect the .tag element
    // afterwards and re-render the same expression in a wide block container
    // (set on #formula via inline style) so the absolutely-positioned tag has
    // room at the right and doesn't overlap the equation. The screenshot for
    // those cases clips to the union of .base + .tag bounds.
    const STAGE_WIDTH = 720;
    const VIEWPORT_DPR = 2;
    const tempHtml = join(KATEX_DIST, '_golden_render.html');
    const html = `<!DOCTYPE html>
<html>
<head>
<link rel="stylesheet" href="katex.min.css">
<style>
body { margin: 0; padding: 0; background: white; }
#formula {
    display: inline-block;
    padding: 10px;
    font-size: ${fontPx}px;
}
#formula.tagged {
    display: block;
    width: ${STAGE_WIDTH - 20}px;
    padding: 10px;
    position: relative;
}
/* KaTeX 0.16.x with fleqn:true puts padding-left:2em on
 * .katex-display.fleqn > .katex. Zero it so the equation .base sits at x=0
 * while the absolutely-positioned .tag still anchors to right:0. Margin reset
 * keeps vertical bounds tight. */
#formula.tagged .katex-display { margin: 0; }
#formula.tagged .katex-display.fleqn > .katex { padding-left: 0; padding-right: 0; }
</style>
<script src="katex.min.js"></script>
</head>
<body>
<div id="formula"></div>
</body>
</html>`;
    writeFileSync(tempHtml, html);

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files'],
    });

    const page = await browser.newPage();
    await page.setViewport({
        width: STAGE_WIDTH + 80,
        height: 1024,
        deviceScaleFactor: VIEWPORT_DPR,
    });

    // Navigate to file URL — CSS relative paths (fonts/...) resolve from KaTeX dist dir
    await page.goto(pathToFileURL(tempHtml).href, { waitUntil: 'networkidle0' });

    // Load mhchem after KaTeX (defines \\ce, \\pu, …). Using addScriptTag avoids file:// edge
    // cases where a relative contrib/ script may not run before the first render.
    await page.addScriptTag({
        path: join(KATEX_DIST, 'contrib', 'mhchem.min.js'),
    });

    let ok = 0;
    let errors = 0;
    let fontsChecked = false;
    for (let i = 0; i < lines.length; i++) {
        const expr = lines[i].trim();
        const idx = String(i + 1).padStart(4, '0');

        try {
            // Pass 1: render in the default inline-block container.
            const hasTag = await page.evaluate(async (expr) => {
                const el = document.getElementById('formula');
                el.className = '';
                el.style.width = '';
                el.innerHTML = '';
                let toRender = expr;
                const outer = toRender.match(/^\$(.*)\$$/s);
                if (outer) toRender = outer[1];
                katex.render(toRender, el, {
                    displayMode: true,
                    throwOnError: false,
                    trust: true,
                });
                await document.fonts.ready;
                return el.querySelector('.tag') !== null;
            }, expr);

            await page.waitForSelector('#formula .katex', { timeout: 2000 });

            // Verify fonts loaded after first render
            if (!fontsChecked) {
                const fontsLoaded = await page.evaluate(async () => {
                    await document.fonts.ready;
                    const loaded = [];
                    for (const font of document.fonts) {
                        if (font.status === 'loaded') loaded.push(font.family);
                    }
                    return [...new Set(loaded)];
                });
                console.log(`KaTeX fonts loaded: ${fontsLoaded.length} families`);
                if (fontsLoaded.length > 0) {
                    console.log(`  ${fontsLoaded.join(', ')}`);
                } else {
                    console.error('WARNING: No KaTeX fonts loaded! References use system fallback fonts.');
                }
                fontsChecked = true;
            }

            if (!hasTag) {
                // Original behavior: screenshot the inline-block #formula box.
                // This preserves the historical fixture geometry for every
                // formula that does not produce a KaTeX `.tag` element.
                const element = await page.$('#formula');
                const box = await element.boundingBox();
                if (box && box.width > 0 && box.height > 0) {
                    await element.screenshot({
                        path: join(outputDir, `${idx}.png`),
                        omitBackground: false,
                    });
                    ok++;
                } else {
                    console.error(`SKIP ${idx}: empty bounding box for "${expr}"`);
                    errors++;
                }
            } else {
                // Pass 2: block container, equation left-aligned (fleqn:true) so the
                // absolutely-positioned `.tag` (right:0) sits in the right margin
                // instead of overlapping a centered equation body in narrow widths.
                //
                // Width target = RaTeX canvas width when tests/golden/output/<idx>.png
                // exists, but we expand if the natural equation+tag is wider than that.

                // Pre-measure natural width of equation + tag at fleqn (need a roomy parent).
                const naturalNeed = await page.evaluate((expr) => {
                    const el = document.getElementById('formula');
                    el.className = 'tagged';
                    el.style.width = '2000px';
                    el.innerHTML = '';
                    let toRender = expr;
                    const outer = toRender.match(/^\$(.*)\$$/s);
                    if (outer) toRender = outer[1];
                    katex.render(toRender, el, {
                        displayMode: true,
                        throwOnError: false,
                        trust: true,
                        fleqn: true,
                    });
                    let maxBaseR = 0;
                    let maxTagW = 0;
                    const elRect = el.getBoundingClientRect();
                    for (const b of el.querySelectorAll('.base')) {
                        const r = b.getBoundingClientRect();
                        if (r.right - elRect.left > maxBaseR) {
                            maxBaseR = r.right - elRect.left;
                        }
                    }
                    for (const t of el.querySelectorAll('.tag')) {
                        const r = t.getBoundingClientRect();
                        if (r.width > maxTagW) maxTagW = r.width;
                    }
                    // 16 CSS px ≈ 1em-ish min gap so .tag doesn't sit on the equation.
                    return Math.ceil(maxBaseR + 16 + maxTagW);
                }, expr);

                let contentWidthCss = STAGE_WIDTH - 20;
                const alignPng = join(alignOutputDir, `${idx}.png`);
                if (existsSync(alignPng)) {
                    try {
                        const { width: wOut } = readPngSize(alignPng);
                        contentWidthCss = wOut / VIEWPORT_DPR - 20;
                    } catch (e) {
                        console.error(`WARN ${idx}: could not read align PNG: ${e.message}`);
                    }
                }
                contentWidthCss = Math.max(48, contentWidthCss, naturalNeed);

                await page.evaluate(
                    async (expr, contentW) => {
                        const el = document.getElementById('formula');
                        el.className = 'tagged';
                        el.style.width = `${contentW}px`;
                        el.innerHTML = '';
                        let toRender = expr;
                        const outer = toRender.match(/^\$(.*)\$$/s);
                        if (outer) toRender = outer[1];
                        katex.render(toRender, el, {
                            displayMode: true,
                            throwOnError: false,
                            trust: true,
                            fleqn: true,
                        });
                        await document.fonts.ready;
                    },
                    expr,
                    contentWidthCss
                );

                const element = await page.$('#formula');
                const box = await element.boundingBox();
                if (box && box.width > 0 && box.height > 0) {
                    await element.screenshot({
                        path: join(outputDir, `${idx}.png`),
                        omitBackground: false,
                    });
                    ok++;
                } else {
                    console.error(`SKIP ${idx}: empty bounding box for "${expr}"`);
                    errors++;
                }
            }

            if ((i + 1) % 50 === 0) {
                console.log(`  ${i + 1}/${lines.length} done...`);
            }
        } catch (err) {
            console.error(`ERR  ${idx}: ${expr} — ${err.message}`);
            errors++;
        }
    }

    await browser.close();

    // Clean up temp file
    try { unlinkSync(tempHtml); } catch (_) {}

    console.log(`\nDone: ${ok} OK, ${errors} errors out of ${lines.length} formulas`);
    console.log(`Reference PNGs saved to ${outputDir}/`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
