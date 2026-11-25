# MuleSoft Enterprise Architecture & Interview Hub (2026 Edition)

A high-performance, mobile-optimized static knowledge hub containing **308 real-world scenario-based MuleSoft interview questions**, architectural diagrams, DataWeave 2.0 playground, and technical deep-dives.

**Live Website**: [https://niranjanpotter.github.io/](https://niranjanpotter.github.io/)  
**Author**: Niranjan Potter

---

## 📁 Repository Structure

```text
niranjanpotter.github.io/
├── index.html                 # Main knowledge hub with 45 modules & 308 Q&A cards
├── sitemap.xml                # Canonical XML sitemap for search engine indexing
├── sitemap-hub.xml            # Alternate cache-busting XML sitemap for GSC
├── sitemap.txt                # Plain-text URL list sitemap fallback
├── robots.txt                 # Search engine crawler policies and sitemap pointer
├── 404.html                   # Custom brand-consistent 404 error page
├── assets/
│   ├── css/
│   │   ├── hub.css            # Main application styles (tokens, layout, dark/light themes)
│   │   ├── article.css        # Stylesheet for standalone technical article pages
│   │   ├── fonts.css          # Self-hosted WOFF2 font declarations (font-display: swap)
│   │   └── diagrams.css       # Interactive diagram engine styles & animations
│   ├── js/
│   │   ├── hub.js             # Client-side search index, UI state, drawer, and modals
│   │   └── diagrams.js        # Shared diagram engine (hotspots, step player, zoom)
│   └── img/
│       ├── og-hub.png         # Open Graph card for homepage (1200x630)
│       └── og-article.png     # Open Graph card for article guides (1200x630)
├── fonts/                     # Self-hosted Plus Jakarta Sans & JetBrains Mono .woff2 fonts
├── scripts/
│   └── build.py               # Asset build & cache-busting content hashing script
├── MOBILE_CHANGELOG.md        # Comprehensive changelog of mobile & quality overhaul
└── mulesoft-*.html            # 20 standalone technical deep-dive guides
```

---

## 🚀 Local Development & Preview

Because the site uses modern self-hosted fonts, defer scripts, and CSS preloads, run a local HTTP server:

```bash
# Start a local HTTP server on port 8000
python -m http.server 8000

# Open in your browser:
# http://localhost:8000
```

---

## 🛠️ Production Asset Build & Cache-Busting

To generate sha256 content-hashed CSS/JS files and automatically update asset links in `index.html`:

```bash
python scripts/build.py
```

This generates `hub.<hash>.css` and `hub.<hash>.js` in `assets/`, enabling long-term caching headers on CDNs without stale cache issues.

---

## 📝 How to Add a New Technical Article Page

1. **Copy an Existing Template**:
   Duplicate any article page, e.g., `mulesoft-batch-processing-interview-questions.html` as `mulesoft-your-topic.html`.

2. **Update Metadata in `<head>`**:
   - `<title>`: Topic title with `(2026 Guide)`.
   - `<meta name="description">`: 150-160 character summary.
   - `<link rel="canonical" href="https://niranjanpotter.github.io/mulesoft-your-topic.html">`.
   - Update `BreadcrumbList` and `Article` JSON-LD schemas.

3. **Style Links**:
   Ensure it links to the unified stylesheet:
   ```html
   <link rel="stylesheet" href="assets/css/fonts.css">
   <link rel="stylesheet" href="assets/css/article.css">
   ```

4. **Register in `sitemap.xml`**:
   Add a `<url>` block with `<loc>`, current `<lastmod>`, `<changefreq>weekly</changefreq>`, and `<priority>0.85</priority>`.

---

## 🧪 Architecture & Quality Standards

- **Zero 3rd-Party Runtime Dependencies**: Pure vanilla HTML5, CSS3 variables, and modern JavaScript.
- **Mobile-First Responsive Layout**: Strict zero horizontal overflow on all viewports (`360px`, `390px`, `768px`, and `1440px`).
- **Web Performance**: Self-hosted WOFF2 fonts with `font-display: swap`, deferred scripts, and responsive SVG diagrams with fullscreen pinch-zoom.
- **Accessibility & Semantics**: Complete ARIA attribute coverage, 44px minimum touch targets, visible focus rings, and skip-to-content navigation.
