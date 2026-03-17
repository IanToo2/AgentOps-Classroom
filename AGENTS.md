# AgentOps-Classroom Agent Guide

## Project Overview

This repository publishes a small GitHub Pages site that links to two generated PDFs:

- `pdf/agentops-classroom-handbook.pdf`
- `pdf/agentops-classroom-runbook.pdf`

The repository is primarily a document publishing project. Most requests should be handled as content updates plus PDF regeneration, not as application or platform work.

## Source Of Truth

Treat these files as the main edit surfaces:

- `src/content/handbook.js`: handbook content
- `src/content/runbook.js`: runbook content
- `scripts/build-pdfs.mjs`: PDF generation logic
- `index.html`: landing page copy, layout, and links

Treat these paths as generated or supporting assets:

- `pdf/*.pdf`: generated build outputs, never hand-edit
- `assets/fonts/*`: bundled font assets used by the PDF builder
- `.github/workflows/deploy-pages.yml`: GitHub Pages deployment workflow

## Working Rules

- Prefer editing `src/content/*.js` when the request is about document text or structure.
- Regenerate `pdf/*.pdf` with the build script after any content or PDF rendering change.
- Only edit `index.html` when the landing page itself needs to change. Do not touch it for content-only document updates unless links or metadata must stay aligned.
- Keep the current public PDF filenames unless the user explicitly asks to change published URLs.
- Do not replace, remove, or rename the bundled fonts unless there is a concrete rendering problem to solve.
- Avoid introducing new frameworks, build tools, or deployment steps for routine content work.
- Keep the repository compatible with GitHub Pages. Deployment is handled by the existing GitHub Actions workflow on `main`.

## Validation Checklist

For content, rendering, or link changes:

1. Run `npm run build`.
2. Confirm both output PDFs exist under `pdf/`.
3. If `index.html` changed, confirm its PDF links still match the published filenames.

## Response Expectations

When finishing work in this repository:

- Summarize which source files changed.
- State whether the PDFs were regenerated.
- Call out any impact on public URLs or GitHub Pages behavior.
