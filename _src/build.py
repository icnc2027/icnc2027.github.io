#!/usr/bin/env python3
"""
ICNC 2027 website builder.
  python3 _src/build.py      -> writes every page to the repository root.
Edit page text in _src/content/<slug>.html (HTML fragments), the shared
frame in _src/template.html, and the page list / navigation below.
No third-party packages are needed.
"""
import os, re, datetime, html, hashlib
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC  = os.path.join(ROOT, "_src")
SITE_URL = "https://icnc2027.com"

# --------------------------------------------------------------------
# Navigation: (label, slug) or (label, [ (label, slug), ... ])
# --------------------------------------------------------------------
NAV = [
  ("Program", [("Program", "program"), ("Book of Abstracts", "book-of-abstracts"),
               ("Invited Speakers", "invited-speakers"), ("Topics", "topics"),
               ("Mini-Symposia", "mini-symposia")]),
  ("Abstracts & Registration", [("Important Dates", "important-dates"),
               ("Abstract Submission", "abstract-submission"), ("Registration", "registration")]),
  ("Organizers", "organizers"),
  ("Information", [("Venue", "venue"), ("Information for Presenters", "information-for-presenters"),
               ("Social Events", "social-events"), ("Accommodation", "accommodation"),
               ("Local Transportation", "local-transportation"), ("Restaurants Nearby", "restaurants-nearby"),
               ("Tourist Information", "tourist-information"), ("Visa", "visa")]),
  ("Sponsors & Supporters", [("Sponsors", "sponsors"), ("Supporters", "supporters")]),
  ("Contacts", "contacts"),
]

# slug -> (page title, one-line description for search engines, breadcrumb group)
PAGES = {
  "index": ("ICNC 2027 — International Conference on Numerical Combustion, Banff, 1–4 June 2027",
            "The 21st International Conference on Numerical Combustion, Banff Centre for Arts and Creativity, Banff National Park, Alberta, Canada, 1–4 June 2027.", None),
  "program": ("Program", "Scientific program of ICNC 2027: plenary lectures, parallel sessions and social events, 1–4 June 2027 in Banff.", "Program"),
  "book-of-abstracts": ("Book of Abstracts", "The ICNC 2027 book of abstracts will be published here before the conference.", "Program"),
  "invited-speakers": ("Invited Speakers", "Plenary lecturers at ICNC 2027.", "Program"),
  "topics": ("Topics", "Topics covered by ICNC 2027 contributed talks and mini-symposia.", "Program"),
  "mini-symposia": ("Mini-Symposia", "Call for mini-symposium proposals for ICNC 2027.", "Program"),
  "important-dates": ("Important Dates", "ICNC 2027 key dates: abstracts open 1 November 2026, deadline 31 January 2027, early-bird registration until 1 March 2027, conference 1–4 June 2027 in Banff.", "Abstracts & Registration"),
  "abstract-submission": ("Abstract Submission", "How to submit an abstract to ICNC 2027.", "Abstracts & Registration"),
  "registration": ("Registration", "ICNC 2027 registration: fees in USD (early-bird until 1 March 2027), what is included, and refund policy.", "Abstracts & Registration"),
  "organizers": ("Organizers", "Organizing committee and scientific team of ICNC 2027.", None),
  "venue": ("Venue", "Banff Centre for Arts and Creativity, Banff, Alberta, Canada.", "Information"),
  "information-for-presenters": ("Information for Presenters", "Guidance for oral presenters at ICNC 2027.", "Information"),
  "social-events": ("Social Events", "Reception, early-career mixer, excursion and banquet at ICNC 2027.", "Information"),
  "accommodation": ("Accommodation", "Conference rooms at Banff Centre for ICNC 2027: room types, rates and the booking link.", "Information"),
  "local-transportation": ("Local Transportation", "Getting from Calgary International Airport to Banff and around town.", "Information"),
  "restaurants-nearby": ("Restaurants Nearby", "Dining on the Banff Centre campus and in downtown Banff.", "Information"),
  "tourist-information": ("Tourist Information", "Things to see and do in Banff National Park around ICNC 2027.", "Information"),
  "visa": ("Visa", "Entry requirements for Canada and invitation letters for ICNC 2027.", "Information"),
  "sponsors": ("Sponsors", "Sponsors of ICNC 2027 and how to become one.", "Sponsors & Supporters"),
  "supporters": ("Supporters", "Institutions supporting ICNC 2027.", "Sponsors & Supporters"),
  "contacts": ("Contacts", "How to reach the ICNC 2027 organizers.", None),
  "404": ("Page not found", "The page you were looking for is not here.", None),
}

def nav_html(current):
  out = []
  for label, target in NAV:
    if isinstance(target, str):
      cur = ' aria-current="page"' if target == current else ""
      out.append(f'<li><a href="{target}.html"{cur}>{label}</a></li>')
    else:
      subs = "".join(
        f'<li><a href="{s}.html"{" aria-current=\"page\"" if s == current else ""}>{l}</a></li>'
        for l, s in target)
      out.append(f'<li class="has-sub"><button type="button" aria-expanded="false">{label}</button><ul class="sub">{subs}</ul></li>')
  return "\n        ".join(out)

def vhash(rel):
  try:
    return hashlib.md5(open(os.path.join(ROOT, rel), "rb").read()).hexdigest()[:8]
  except OSError:
    return "0"

def build():
  tpl = open(os.path.join(SRC, "template.html"), encoding="utf-8").read()
  for rel in ("assets/css/style.css", "assets/js/main.js", "assets/js/hero-scene.js"):
    tpl = tpl.replace(rel + '"', rel + "?v=" + vhash(rel) + '"')
  year = datetime.date.today().year
  for slug, (title, desc, group) in PAGES.items():
    body = open(os.path.join(SRC, "content", slug + ".html"), encoding="utf-8").read()
    is_home = slug == "index"
    full_title = title if is_home else f"{title} — ICNC 2027"
    crumbs = ""
    if not is_home and slug != "404":
      crumbs = '<p class="crumbs"><a href="index.html">ICNC 2027</a>' + (f' / {html.escape(group)}' if group else "") + "</p>"
    head = "" if is_home else f'<div class="page-head"><div class="container">{crumbs}<h1>{html.escape(title)}</h1></div></div>'
    page = (tpl.replace("{{TITLE}}", html.escape(full_title))
               .replace("{{DESCRIPTION}}", html.escape(desc))
               .replace("{{CANONICAL}}", SITE_URL + ("/" if is_home else f"/{slug}.html"))
               .replace("{{NAV}}", nav_html(slug))
               .replace("{{PAGE_HEAD}}", head)
               .replace("{{BODY}}", body)
               .replace("{{YEAR}}", str(year)))
    with open(os.path.join(ROOT, slug + ".html"), "w", encoding="utf-8") as f:
      f.write(page)
    print("wrote", slug + ".html")
  # sitemap
  urls = "".join(f"<url><loc>{SITE_URL}/{'' if s=='index' else s+'.html'}</loc></url>" for s in PAGES if s != "404")
  open(os.path.join(ROOT, "sitemap.xml"), "w").write(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + urls + "</urlset>\n")
  print("wrote sitemap.xml")

if __name__ == "__main__":
  build()
