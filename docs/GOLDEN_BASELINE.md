# Authoritative golden baseline

`tools/golden_compare/compare_golden.py` is the only authoritative scorer for
RaTeX visual-golden results. The Rust golden tests are quick smoke checks and
do not define a published mean or CI quality threshold.

## Fixed reference environment

The reference renderer is pinned to KaTeX 0.16.45. Do not upgrade KaTeX while
working toward a higher RaTeX score; a reference upgrade is a separate,
reviewed baseline change.

`tools/golden_compare/package-lock.json` pins KaTeX and Puppeteer exactly.
`.github/workflows/golden.yml` additionally fixes Node, Python, Rust, and the
Ubuntu runner family. Every JSON report records:

- commit SHA and whether the local worktree was dirty;
- raw test-case SHA-256 and canonical suite hash;
- fixture and output manifest SHA-256 values;
- metric version (`ratex-ink-v1`);
- actual KaTeX, Puppeteer, and Chromium versions/revisions;
- Rust, Cargo, Node, Python, Pillow, and NumPy versions;
- OS image metadata;
- reference and output DPR;
- SHA-256 values for every KaTeX/RaTeX font file used.

## Complete indexed manifests

Formula order defines the continuous case range `0001..NNNN`. Reference and
RaTeX generation each write a manifest with one record per formula:

Blank lines and lines whose first non-whitespace character is `#` or `%` are
comments and do not consume an index. Every corpus reader follows this rule.

- `tests/golden/fixtures/reference-manifest.json`
- `tests/golden/output/render-manifest.json`

A failed render therefore occupies an explicit indexed slot even when it has
no PNG. The report enforces:

```text
formula_count == fixture_count == output_count == report_case_count
```

It also reports the actual `fixture_png_count` and `output_png_count`.
Unexpected, non-canonical, duplicate, or out-of-range PNG names are integrity
errors.

Every report case has one of these statuses:

- `scored`
- `missing_fixture`
- `missing_output`
- `parse_error`
- `layout_error`
- `render_error`
- `unsupported`

Known exclusions must be listed in `tests/golden/policy.json`, including the
exact formula and a reason. Policy entries are checked for index/formula drift.
Unscored cases contribute zero to `coverage_adjusted_mean`. `rendered_mean`
only averages scored cases. `coverage` is scored cases divided by eligible
(non-policy) cases; `raw_coverage` includes policy exclusions in the
denominator.

## Generate and gate

Install the locked dependencies once:

```bash
cd tools/golden_compare
npm ci
cd ../..
python3 -m pip install -r tools/golden_compare/requirements.txt
```

Regenerate the committed baseline:

```bash
./scripts/update_golden_baseline.sh
```

Or invoke the comparator directly:

```bash
python3 tools/golden_compare/compare_golden.py \
  --json-out tests/golden/reports/main.json \
  --csv-out tests/golden/reports/main.csv \
  --fail-on-missing \
  --min-coverage 1.0
```

Useful gates:

```text
--json-out PATH
--csv-out PATH
--fail-on-missing
--min-coverage 0..1
--min-mean 0..1
--baseline-report PATH
--max-case-regression 0..1
```

`--min-mean` gates `coverage_adjusted_mean`. With a baseline report,
`--max-case-regression` treats an unscored current case as score zero and
fails when a matched formula drops by more than the allowed amount. Formulas
are matched by exact source text and duplicate occurrence order, so additions,
removals, and reordering are reported without preventing comparisons for
formulas present in both suites. Metric-version mismatches remain integrity
errors, as do attempts to compare different named suites. If two reports claim
the same suite hash but contain different cases, the report is treated as
inconsistent.

## Website source

`website/src/pages/demo/support-table.astro` imports
`tests/golden/reports/main.json`. Formula rows, per-case scores, commit, suite
hash, metric version, coverage, both means, and generation time all come from
that single versioned report. Do not add a separate embedded formula list or
score map to the website.
