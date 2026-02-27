# Competitor Visual Scanner

Automated visual competitive analysis tool for UI/UX designers — extracts colors, fonts, contrast issues (WCAG), logos, and images from competitor websites.

## The Problem

When UI/UX designers analyze competitors' visual identity, they spend hours manually:
- Inspecting dozens of elements per site with DevTools to extract colors and backgrounds
- Using separate browser extensions (WhatFont, color pickers) to identify fonts and palettes
- Running accessibility checkers and manually documenting contrast issues
- Repeating this process for every competitor, then assembling findings into a presentable format

Based on conversations with UI/UX designers and a senior digital marketing consultant, the most common pain points were:

- Having to visit dozens of competitor sites manually for a single analysis
- Information scattered across multiple tools (WhatFont, color pickers, accessibility checkers, DevTools)
- Accessibility reports exist but aren't presented in a designer-friendly way
- Attention to detail in visual audits is valued by clients but time-consuming to deliver

This tool automates the visual extraction part: enter one or more URLs, get a complete visual identity report with colors, fonts, contrast issues, logo, and top images — all in one place.

## What It Does

- **Background colors** — detected by visible area percentage (not just CSS values)
- **Text colors** — ranked by relevance (text length × frequency)
- **Fonts** — unique font families with weight variants
- **WCAG contrast analysis** — AA/AAA checks with visual crop previews
- **Text on image detection** — identifies text overlaying images/videos where contrast can't be computed
- **Non-text element contrast** — WCAG 1.4.11 checks for icons, SVG logos, hamburger menus
- **Sticky header detection** — checks contrast before AND after scroll (navbar color changes)
- **Logo extraction** — detects and captures the site's brand mark
- **Top images** — largest content images by dimensions
- **Cookie banner handling** — dismisses overlays before analysis
- **Light/Dark dashboard** — view reports in either theme

## Demo

Tested on luxury hotel websites with complex layouts (transparent headers over hero images, sticky navbars with color transitions, SVG logos, cookie consent dialogs):

- ✅ The Belnord (thebelnord.com)
- ✅ The Palace (thepalace.com)

## Tech Stack

**Backend:** Node.js, TypeScript, Puppeteer (headless Chrome)
**Frontend:** React, Tailwind CSS
**Image processing:** Jimp
**Contrast calculations:** wcag-contrast

## Project Structure

```
competitor-visual-scanner/
├── src/                              # Backend (Node.js + TypeScript)
│   ├── index.ts                      # Entry point / HTTP server
│   ├── config.ts                     # Configuration
│   ├── types.ts                      # Shared TypeScript interfaces
│   ├── middleware.ts                  # Express middleware
│   │
│   ├── browserManager.ts             # Puppeteer instance management
│   ├── pageSetup.ts                  # Cookie dismissal, page cleanup
│   ├── screenshotUtils.ts            # Screenshot stitching
│   ├── viewportChunkScanner.ts       # DOM scanning per viewport chunk
│   ├── nonTextCapturePipeline.ts     # Non-text element screenshots
│   │
│   ├── analyzer.ts                   # Main visual analysis orchestrator
│   ├── analysisLoopRunner.ts         # Scroll-and-capture loop
│   ├── colorUtils.ts                 # Color parsing and conversion
│   ├── colorRanking.ts               # Text color relevance scoring
│   ├── wcagProcessing.ts             # WCAG contrast analysis
│   ├── brandMarkExtractor.ts         # Logo/brand mark detection
│   └── contentImageExtractor.ts      # Top images extraction
│
├── dashboard/                        # Frontend (React + Tailwind)
│   ├── src/
│   │   ├── App.js                    # Main dashboard component
│   │   ├── index.js                  # React entry point
│   │   └── App.css / index.css       # Styles
│   ├── public/                       # Static files
│   ├── package.json
│   ├── tailwind.config.js
│   └── postcss.config.js
│
├── package.json                      # Backend dependencies
├── tsconfig.json                     # TypeScript config
└── README.md
```

## Setup

### 1. Backend

```bash
cd competitor-visual-scanner
npm install
npx ts-node src/index.ts
# Runs on http://localhost:3001
```

### 2. Frontend

```bash
cd dashboard
npm install
npm start
# Runs on http://localhost:3002
```

### 3. Use

Open `http://localhost:3002`, enter one or more URLs (comma-separated), click "Generează Raport".

## How It Works

1. **Navigate** — Puppeteer loads the page, waits for network idle
2. **Clean up** — Dismisses cookie banners and overlays
3. **Scroll & capture** — Scrolls through the page in viewport-sized chunks, taking screenshots at each step
4. **Scan DOM** — At each scroll position, extracts all visible text nodes with their computed colors, fonts, backgrounds
5. **Detect backgrounds** — Classifies each text node's background as solid color or image (checks for CSS backgrounds, overlapping images, gradients)
6. **WCAG analysis** — Computes contrast ratios, checks AA/AAA compliance, crops visual previews from screenshots
7. **Non-text elements** — Finds icons, SVG logos, hamburger menus and checks their contrast against backgrounds
8. **Sticky detection** — Scrolls to trigger sticky headers, re-captures to check if contrast changes
9. **Brand mark** — Detects the site logo from header/navbar area
10. **Aggregate** — Deduplicates, ranks by relevance, assembles final report

## Known Limitations

- **Works best on content-heavy sites** with standard HTML rendering (hotel sites, portfolios, restaurant pages, corporate sites)
- **Analysis takes ~2–3 minutes per site** — the scanner loads the full page, scrolls through it, and captures every viewport chunk, which is thorough but not instant
- **Single page only** — the scanner analyzes the URL you provide, not the entire website (it won't crawl subpages)
- **Transparent headers over hero images** — navbar text may be classified as IMAGE_STACKED instead of solid-background text, since the scanner sees text overlapping a background image
- **CSS `currentColor` and CSS variables** — colors defined through `currentColor` or complex CSS custom properties may not resolve correctly (e.g. Linear.app)
- **Cookie banners from less common providers** may not be automatically dismissed (the scanner handles CookieBot, OneTrust, Complianz, and other major providers, but regional or custom banners may persist)
- **Aggressive lazy loading** — sites that only load images on scroll may return fewer images than expected
- **Sites with heavy JS frameworks** (SPA with aggressive lazy loading, e.g. Notion, Linear) may produce incomplete results
- **Anti-bot protection** (Cloudflare, reCAPTCHA) will block the scanner entirely
- **Auth-walled sites** (LinkedIn, Instagram) and sites with TrustedHTML policies (YouTube) are not supported
- **WebGL/Canvas-rendered content** is not detected
- **Logo detection** uses common CSS selectors (`.logo`, `.navbar-brand img`, etc.) — sites using non-standard structures (e.g. Elementor widgets) may not have their logo identified
- **Gradient backgrounds** — text on CSS gradients may report the wrong background color or fall back to IMAGE_STACKED
- **Font count** reflects unique font-family + weight combinations found in the DOM (web fonts that fail to load will show the fallback font instead)
- **Image background contrast** is flagged as WARNING (manual review needed) since exact contrast can't be computed against complex images
- **No export** — results are displayed in the dashboard only; there is no PDF/CSV export yet

## Background

The idea for this tool came from personal experience. While building a website replica as a learning project in mid-2025, I found myself spending hours copy-pasting colors, fonts, and design details from the original site — constantly switching between DevTools, color pickers, and font inspectors. I realized I wanted all of that information extracted automatically into one place.

To validate whether this was a broader pain point, I conducted user interviews (September 2026) with UI/UX designers and a digital marketing consultant. The consistent feedback was:

- The process of analyzing competitors visually is manual and repetitive
- Information is scattered across multiple tools (DevTools, WhatFont, color pickers, accessibility checkers)
- Accessibility analysis exists but isn't presented in a designer-friendly way
- Attention to visual detail is valued by clients but time-consuming to deliver

Existing tools like MOAT (Oracle), Google's Deep Research, or manual combinations of WhatFont + color pickers + accessibility checkers each cover a piece of the puzzle, but none provide a unified visual identity report from a single URL.

This tool is a proof of concept addressing that gap.

## License

© 2026 Bot Cristian Andrei. All rights reserved.

This project is shared publicly for portfolio and demonstration purposes. The source code may not be copied, modified, or distributed without written permission.