#!/usr/bin/env python3
"""
Generate dedicated static SEO topic pages under topics/<slug>.html
for every <section class="blog-article"> module in assets/data/modules.html,
update sitemap.xml, and inject a crawlable Topic Directory into index.html.
"""

import html
import json
import re
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
MODULES_HTML = ROOT / "assets" / "data" / "modules.html"
TOPICS_DIR = ROOT / "topics"
INDEX_HTML = ROOT / "index.html"
SITEMAP_XML = ROOT / "sitemap.xml"
BASE_URL = "https://niranjanpotter.github.io"
TODAY = "2026-11-28"


def slugify(text: str, mod_id: str) -> str:
    # Remove emojis and punctuation, keep clean SEO slug
    clean = re.sub(r"[^\w\s-]", " ", text, flags=re.UNICODE)
    clean = re.sub(r"\s+", "-", clean.strip().lower())
    clean = re.sub(r"-+", "-", clean).strip("-")
    if not clean:
        clean = mod_id
    if "mulesoft" not in clean and "dataweave" not in clean and "cloudhub" not in clean and "anypoint" not in clean:
        clean = f"mulesoft-{clean}"
    return f"{clean[:72].rstrip('-')}.html"


def clean_title(raw: str) -> str:
    # Strip leading emojis/symbols
    return re.sub(r"^[^\w\(]+", "", raw, flags=re.UNICODE).strip()


def main() -> None:
    TOPICS_DIR.mkdir(parents=True, exist_ok=True)
    soup = BeautifulSoup(MODULES_HTML.read_text(encoding="utf-8"), "html.parser")
    sections = soup.find_all("section", class_="blog-article")

    topics = []
    used_slugs: set[str] = set()
    for sec in sections:
        mod_id = sec.get("id", "mod")
        cat = sec.get("data-category", "MuleSoft")
        role = sec.get("data-role", "Developer")
        h2 = sec.find("h2", class_="article-title") or sec.find("h2")
        raw_title = h2.get_text(" ", strip=True) if h2 else mod_id
        title = clean_title(raw_title)
        excerpt_el = sec.find("p", class_="article-excerpt")
        excerpt = excerpt_el.get_text(" ", strip=True) if excerpt_el else f"Scenario-based MuleSoft interview questions and architecture deep dive for {title}."

        slug = slugify(title, mod_id)
        if slug in used_slugs:
            slug = f"{slug[:-5]}-{mod_id}.html"
        used_slugs.add(slug)

        # Extract Q&As for FAQPage JSON-LD & ensure answers are open for crawlers
        qa_pairs = []
        for card in sec.find_all("div", class_="faq-card"):
            q_el = card.find(class_="q-title")
            a_el = card.find(class_="faq-answer")
            if a_el:
                classes = a_el.get("class", [])
                if "open" not in classes:
                    a_el["class"] = classes + ["open"]
            if q_el and a_el:
                q_text = q_el.get_text(" ", strip=True)
                a_text = a_el.get_text(" ", strip=True)
                if q_text and a_text:
                    qa_pairs.append((q_text, a_text[:900]))

        topics.append({
            "mod_id": mod_id,
            "cat": cat,
            "role": role,
            "title": title,
            "raw_title": raw_title,
            "excerpt": excerpt,
            "slug": slug,
            "url": f"{BASE_URL}/topics/{slug}",
            "sec": sec,
            "qa_pairs": qa_pairs,
        })

    for i, t in enumerate(topics):
        prev_t = topics[i - 1] if i > 0 else None
        next_t = topics[i + 1] if i + 1 < len(topics) else None
        related = [x for j, x in enumerate(topics) if j != i and x["cat"] == t["cat"]][:4]
        if len(related) < 4:
            related += [x for j, x in enumerate(topics) if j != i and x not in related][: 4 - len(related)]

        page_title = f"{t['title']} | MuleSoft Interview Q&A (2026)"
        if len(page_title) > 68:
            page_title = f"{t['title'][:50].rstrip()} | MuleSoft Q&A"

        faq_schema = {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
                {
                    "@type": "Question",
                    "name": q,
                    "acceptedAnswer": {"@type": "Answer", "text": a},
                }
                for q, a in t["qa_pairs"][:10]
            ],
        }
        breadcrumb_schema = {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{BASE_URL}/"},
                {"@type": "ListItem", "position": 2, "name": t["title"], "item": t["url"]},
            ],
        }
        article_schema = {
            "@context": "https://schema.org",
            "@type": "Article",
            "headline": f"{t['title']} — MuleSoft Interview Questions & Scenarios (2026)",
            "description": t["excerpt"],
            "author": {"@type": "Person", "name": "Niranjan Potter", "url": f"{BASE_URL}/"},
            "publisher": {"@type": "Organization", "name": "MuleSoft Hub", "url": f"{BASE_URL}/"},
            "datePublished": "2026-11-28T00:00:00+00:00",
            "dateModified": "2026-11-28T00:00:00+00:00",
            "mainEntityOfPage": t["url"],
            "image": f"{BASE_URL}/assets/img/og-article.png",
        }

        nav_links = []
        if prev_t:
            nav_links.append(f'<a class="btn btn-outline" href="{prev_t["slug"]}">← {html.escape(prev_t["title"][:42])}</a>')
        if next_t:
            nav_links.append(f'<a class="btn btn-outline" href="{next_t["slug"]}">{html.escape(next_t["title"][:42])} →</a>')
        prev_next_html = f'<div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;margin-top:32px;">{"".join(nav_links)}</div>' if nav_links else ""

        rel_items = "".join(
            f'<li><a href="{r["slug"]}">{html.escape(r["title"])}</a></li>'
            for r in related
        )

        # Remove duplicate h2/excerpt inside section if we render a clean h1 hero
        sec_html = str(t["sec"])

        out_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#090D16" media="(prefers-color-scheme: dark)">
  <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
  <meta name="color-scheme" content="dark light">
  <title>{html.escape(page_title)}</title>
  <meta name="description" content="{html.escape(t['excerpt'][:158])}">
  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">
  <link rel="canonical" href="{t['url']}">
  <meta property="og:title" content="{html.escape(t['title'])} — MuleSoft Interview Q&amp;A (2026)">
  <meta property="og:description" content="{html.escape(t['excerpt'][:158])}">
  <meta property="og:url" content="{t['url']}">
  <meta property="og:type" content="article">
  <meta property="og:image" content="{BASE_URL}/assets/img/og-article.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="{BASE_URL}/assets/img/og-article.png">
  <link rel="stylesheet" href="../assets/css/article.css">
  <link rel="stylesheet" href="../assets/css/diagrams.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <script type="application/ld+json">{json.dumps(faq_schema, ensure_ascii=False)}</script>
  <script type="application/ld+json">{json.dumps(breadcrumb_schema, ensure_ascii=False)}</script>
  <script type="application/ld+json">{json.dumps(article_schema, ensure_ascii=False)}</script>
</head>
<body class="dark-theme">
  <header class="navbar">
    <div class="nav-container">
      <a href="../index.html" class="brand">
        <span class="brand-logo">⚡</span>
        <span class="brand-text">MuleSoft Hub</span>
        <span class="badge-edition">2026 EDITION</span>
      </a>
      <div class="nav-controls" style="display:flex;gap:10px;flex-wrap:wrap;">
        <a href="../index.html" class="btn btn-outline">← All 46 Modules</a>
        <a href="https://mulesoft.niranjanpotter.dpdns.org/" class="btn btn-outline" target="_blank" rel="noopener">📝 38 Setup Guides ↗</a>
      </div>
    </div>
  </header>

  <div class="container main-content-layout" style="max-width: 1050px; margin: 30px auto; padding: 0 20px;">
    <nav class="breadcrumb-trail" style="margin-bottom: 20px; color: var(--text-dim); font-size: 0.85rem;">
      <a href="../index.html" style="color: var(--accent-cyan); text-decoration: none;">Home</a> &gt;
      <span>{html.escape(t['cat'])}</span> &gt;
      <span style="color: var(--text-main);">{html.escape(t['title'])}</span>
    </nav>

    <header class="page-hero-header" style="margin-bottom: 32px; border-bottom: 1px solid var(--border-color); padding-bottom: 24px;">
      <span class="module-badge" style="background: rgba(6, 182, 212, 0.15); color: #06b6d4; padding: 4px 12px; border-radius: 6px; font-weight: 600; font-size: 0.8rem; text-transform: uppercase;">{html.escape(t['cat'])} · {html.escape(t['role'])}</span>
      <h1 style="font-size: 2.1rem; font-weight: 800; color: #fff; margin: 14px 0 10px 0; line-height: 1.25;">{html.escape(t['title'])} — Interview Questions &amp; Scenarios (2026)</h1>
      <p style="color: var(--text-dim); font-size: 1.05rem; max-width: 850px; line-height: 1.6;">{html.escape(t['excerpt'])}</p>
    </header>

    <main>
      {sec_html}
      {prev_next_html}
    </main>

    <section class="related-topics-section" style="margin-top: 44px; padding: 28px; background: rgba(19, 27, 46, 0.7); border: 1px solid var(--border-color); border-radius: 12px;">
      <h3 style="color: #fff; margin-bottom: 15px;">📚 Related MuleSoft Interview Topics</h3>
      <ul style="list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px;">
        {rel_items}
      </ul>
    </section>

    <footer style="margin-top: 50px; padding-top: 20px; border-top: 1px solid var(--border-color); text-align: center; color: var(--text-dim); font-size: 0.85rem;">
      <p>© 2026 Niranjan Kumar Potter · <a href="../index.html">MuleSoft Interview Hub</a> · <a href="https://mulesoft.niranjanpotter.dpdns.org/" target="_blank" rel="noopener">MuleSoft Engineering Blog</a></p>
    </footer>
  </div>
</body>
</html>
"""
        (TOPICS_DIR / t["slug"]).write_text(out_html, encoding="utf-8")

    # Update sitemap.xml (preserve existing URLs, append/update topics)
    sm_text = SITEMAP_XML.read_text(encoding="utf-8")
    existing_locs = set(re.findall(r"<loc>(.*?)</loc>", sm_text))
    new_entries = []
    for t in topics:
        if t["url"] not in existing_locs:
            new_entries.append(
                f"  <url>\n    <loc>{t['url']}</loc>\n    <lastmod>{TODAY}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.85</priority>\n  </url>"
            )
    if new_entries:
        sm_text = sm_text.replace("</urlset>", "\n".join(new_entries) + "\n</urlset>")
        SITEMAP_XML.write_text(sm_text, encoding="utf-8")

    # Inject/update crawlable Topic Directory in index.html
    idx_text = INDEX_HTML.read_text(encoding="utf-8")
    dir_start = "<!-- TOPIC_DIRECTORY_START -->"
    dir_end = "<!-- TOPIC_DIRECTORY_END -->"
    links_html = "\n".join(
        f'      <a href="topics/{t["slug"]}" style="padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.02);text-decoration:none;font-size:0.85rem;">{html.escape(t["title"])}</a>'
        for t in topics
    )
    dir_block = f"""{dir_start}
<section id="topic-directory" aria-label="Dedicated MuleSoft Interview Topic Pages" style="max-width:1200px;margin:28px auto;padding:22px;border-radius:14px;border:1px solid rgba(255,255,255,0.1);background:rgba(15,23,42,0.55);">
  <h2 style="font-size:1.25rem;margin:0 0 8px 0;">📚 Browse All {len(topics)} Interview Topics (Dedicated Guides &amp; URLs)</h2>
  <p style="margin:0 0 14px 0;opacity:0.8;font-size:0.9rem;">Each MuleSoft interview module has its own dedicated page with scenario Q&amp;As, architecture diagrams, and DataWeave examples.</p>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px;">
{links_html}
  </div>
</section>
{dir_end}"""

    if dir_start in idx_text and dir_end in idx_text:
        idx_text = re.sub(
            re.escape(dir_start) + r".*?" + re.escape(dir_end),
            dir_block,
            idx_text,
            flags=re.DOTALL,
        )
    else:
        idx_text = idx_text.replace("<!-- Floating Action Buttons", dir_block + "\n\n<!-- Floating Action Buttons")

    INDEX_HTML.write_text(idx_text, encoding="utf-8")
    print(f"Generated {len(topics)} topic pages in {TOPICS_DIR}")
    print(f"Added {len(new_entries)} new URLs to sitemap.xml")
    print("Updated index.html with crawlable topic directory")


if __name__ == "__main__":
    main()
