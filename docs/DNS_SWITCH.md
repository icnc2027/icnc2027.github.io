# Pointing icnc2027.com at GitHub Pages — one-page instructions

Do this **after** the site is live at `https://icnc2027.github.io/` (README, step 4). Nothing changes for visitors until step 3 is done, so the old WordPress site keeps working in the meantime.

## 1. Verify the domain in GitHub (prevents domain takeover; 5 minutes)

1. GitHub → the `icnc2027` organization → **Settings → Pages → Add a domain** → enter `icnc2027.com`.
2. GitHub shows a TXT record like `_github-pages-challenge-icnc2027` with a value. Keep this tab open.
3. WordPress.com → **Upgrades → Domains → icnc2027.com → DNS records → Add record**: type `TXT`, name `_github-pages-challenge-icnc2027`, value = the string GitHub showed. Save.
4. Back in GitHub, click **Verify** (may take a few minutes to succeed).

## 2. Set the custom domain on the repository

Repository `icnc2027.github.io` → **Settings → Pages → Custom domain** = `icnc2027.com` → Save.
(The repository already contains a `CNAME` file with `icnc2027.com`; GitHub will show a DNS check warning until step 3 is done.)

## 3. Change the DNS records at WordPress.com

WordPress.com → **Upgrades → Domains → icnc2027.com → DNS records**. The default A records show as "Handled by WordPress.com"; adding your own A records replaces them automatically.

Add these records (leave "Name" empty for the apex domain):

| Type | Name | Value |
|---|---|---|
| A | *(empty)* | 185.199.108.153 |
| A | *(empty)* | 185.199.109.153 |
| A | *(empty)* | 185.199.110.153 |
| A | *(empty)* | 185.199.111.153 |
| AAAA | *(empty)* | 2606:50c0:8000::153 |
| AAAA | *(empty)* | 2606:50c0:8001::153 |
| AAAA | *(empty)* | 2606:50c0:8002::153 |
| AAAA | *(empty)* | 2606:50c0:8003::153 |
| CNAME | www | icnc2027.github.io |

If a CNAME record for `www` already exists (pointing to WordPress.com), edit it instead of adding a second one.
Do not change the name servers — the domain stays registered and managed at WordPress.com.

## 4. Turn on HTTPS

After DNS propagates (usually minutes, up to 72 hours), GitHub → repository **Settings → Pages** shows "DNS check successful". Tick **Enforce HTTPS**. GitHub provisions the certificate automatically.

## 5. Tidy up the WordPress site

- WordPress.com → **Settings → General → Privacy** → set the old site to *Private* (or delete its pages) so the outdated copy at `icnc2027.wordpress.com` is not found by search engines.
- Keep the WordPress.com Personal plan until the new site is confirmed working; then let it lapse (it renews 14 May 2027).
- **Keep the domain registration and switch on auto-renew** for `icnc2027.com` (Upgrades → Domains → Manage subscription). It expires 14 May 2027 — two weeks before the conference — and an expired domain costs an extra US$80 to recover.

## Test

Open `https://icnc2027.com`, `https://www.icnc2027.com` and `http://icnc2027.com` — all should show the new site over HTTPS. Then update the address on the Combustion Institute calendar listing and in any flyers.
