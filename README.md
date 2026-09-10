# icnc2027.com — website source

Static site for the 21st International Conference on Numerical Combustion (Banff, 1–4 June 2027).
Plain HTML/CSS/JS — nothing to install, nothing to build on GitHub. GitHub Pages serves the files in this
repository as-is (the empty `.nojekyll` file tells GitHub not to run Jekyll; `CNAME` holds the custom domain).

## Editing pages

Every page is generated from a shared frame plus one content file:

| What you want to change | Where |
|---|---|
| Text of a page | `_src/content/<page>.html` (an HTML fragment) — then run the build (below) |
| Header, navigation, footer | `_src/template.html` and the `NAV` list in `_src/build.py` |
| Page titles / descriptions / adding a page | the `PAGES` dictionary in `_src/build.py` (add a content file with the same slug) |
| Colours, fonts, layout | `assets/css/style.css` (palette and type at the top) |
| Sponsor / partner logos | drop files into `assets/img/logos/` — see the README there |
| Important dates | `_src/content/important-dates.html` **and** the dates strip in `_src/content/index.html` |

Rebuild after editing anything in `_src/`:

```bash
python3 _src/build.py      # any Python 3, no packages needed
```

Open `index.html` in a browser to preview, then commit and push: GitHub Pages updates within a minute or two.

If you prefer, you can also edit the generated `*.html` files in the root directly (for example in the GitHub
web editor) — just remember that the next `build.py` run will overwrite them from `_src/`.

## Marking things as tentative

Use `<span class="tag tag-tentative">tentative</span>` after a date or item that is not yet confirmed, and
`<span class="tag tag-tba">to be announced</span>` for items that are simply missing. Remove the tags as things
are confirmed. `docs/CONTENT_TODO.md` lists everything currently marked.

## Deploying to GitHub Pages (first time)

1. Create a GitHub **organization** (e.g. `icnc2027`) so ownership is not tied to one person's account; invite Leo and Luc as owners.
2. In the organization, create a repository named **`icnc2027.github.io`** (public).
3. Upload the contents of this folder to the repository root (drag-and-drop in the GitHub web UI works, or `git push`).
4. Repository **Settings → Pages**: Source = *Deploy from a branch*, branch `main`, folder `/ (root)`. The site is now live at `https://icnc2027.github.io/`.
5. Follow `docs/DNS_SWITCH.md` to point icnc2027.com at it and turn on HTTPS.

## Checks before announcing

- Replace all `tentative` / `to be announced` items (see `docs/CONTENT_TODO.md`).
- Add logos to `assets/img/logos/`.
- Add the abstract-submission and registration links when the systems are live (`abstract-submission.html`, `registration.html`, hero button on `index.html`).
- Optionally replace the drawn hero landscape with a photo: edit the `<section class="hero">` in `_src/content/index.html`.
