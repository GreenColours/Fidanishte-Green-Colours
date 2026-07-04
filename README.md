# 🌿 Green & Colours — Fidanishte Premium

Website statik i Fidanishte Green & Colours, Durrës — i ndërtuar mbi Cloudflare Pages + Supabase.

## Struktura e Projektit

```
green-colours/
├── index.html                    ← Kryefaqja
├── rreth-nesh.html               ← Rreth Nesh
├── 404.html                      ← Faqja 404
├── menaxhim-GC-yzy.html         ← Panel Admin (sekret!)
├── style.css                     ← Stilet e përbashkëta
├── robots.txt                    ← SEO robots
├── sitemap.xml                   ← Sitemap XML
├── site.webmanifest              ← Web App Manifest
├── _headers                      ← Security + Cache headers
├── _redirects                    ← URL redirects
└── functions/
    └── api/
        └── [[route]].js          ← Backend (Cloudflare Pages Function)
```

## Deploy në Cloudflare Pages

1. Ngarko ZIP-in drejtpërdrejt në Cloudflare Pages
   **ose** lidh me GitHub repo-n tuaj.
2. Build settings: mos vendos asnjë build command (static site).
3. Shto Environment Variables në Cloudflare Dashboard:
   - `SUPABASE_URL` — URL-ja e Supabase projektit tuaj
   - `SUPABASE_KEY` — service_role key nga Supabase → Settings → API
   - `ADMIN_SECRET` — fjalëkalim i fortë për panelin admin

## Supabase — Tabela e nevojshme

Ekzekuto SQL-in e mëposhtëm në Supabase SQL Editor para deploy-it:

```sql
-- Tabela contacts (për formularin e kontaktit)
CREATE TABLE IF NOT EXISTS contacts (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  phone      TEXT,
  subject    TEXT NOT NULL,
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insert_contact" ON contacts FOR INSERT WITH CHECK (true);
```

## Domen Personal (në të ardhmen)

Kur të lidhet domeni personal, ndrysho vetëm URL-në `https://green-colours.pages.dev`
në file-t e mëposhtëm:
- `sitemap.xml`
- `index.html` (canonical + OG + Schema.org)
- `rreth-nesh.html` (canonical + OG)
- `robots.txt` (Sitemap line)

## Stack

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Backend**: Cloudflare Pages Functions
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage (imazhet)
- **Fonts**: Google Fonts (Playfair Display + Outfit)
- **Icons**: Font Awesome 6.5
