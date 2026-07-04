# 🌿 Green & Colours — Setup Guide

## Struktura e Projektit

```
green-colours/
├── index.html                  ← Kryefaqja
├── blog.html                   ← Blogu
├── rreth-nesh.html             ← Rreth Nesh
├── style.css                   ← Stilet e përbashkëta
├── menaxhim-GC-yzy.html       ← Panel Admin (sekret!)
├── _headers                    ← Security headers
├── _redirects                  ← URL redirects
├── supabase-setup.sql          ← SQL për Supabase (ekzekuto 1 herë)
└── functions/
    └── api/
        └── [[route]].js        ← Backend (Cloudflare Pages Function)
```

---

## Hapi 1 — Supabase Setup

1. Shko tek [supabase.com](https://supabase.com) → New Project
2. Shko tek **SQL Editor** → kopjo + ekzekuto `supabase-setup.sql`
3. Shko tek **Storage** → krijo bucket `images` (Public: YES)
4. Shko tek **Settings → API** → kopjo:
   - `Project URL` → ky është `SUPABASE_URL`
   - `service_role` key → ky është `SUPABASE_KEY` (**SEKRETI, mos e publiko kurrë!**)

---

## Hapi 2 — GitHub

1. Krijo repo të ri: `green-colours` (Private ose Public)
2. Ngarko të gjitha file-t e këtij projekti
3. `git add . && git commit -m "Initial commit" && git push`

---

## Hapi 3 — Cloudflare Pages

1. Shko tek [dash.cloudflare.com](https://dash.cloudflare.com)
2. **Workers & Pages → Create → Pages → Connect to Git**
3. Zgjidh repo-n `green-colours`
4. Build Settings:
   ```
   Framework preset:  None
   Build command:     (lër bosh)
   Build output:      /
   ```
5. Kliko **Save and Deploy**

---

## Hapi 4 — Environment Variables

Shko tek: **Pages → green-colours → Settings → Environment Variables**

Shto këto 3 variabla (Production + Preview):

| Variable         | Vlera                                           |
|------------------|-------------------------------------------------|
| `SUPABASE_URL`   | `https://oewfdgiakzhjqrhdcwds.supabase.co`     |
| `SUPABASE_KEY`   | `service_role_key_nga_supabase`                |
| `ADMIN_SECRET`   | `fjalekalim_shume_i_forte_min_20_karaktere`    |

⚠️ **ADMIN_SECRET** duhet të jetë i gjatë dhe i rastësishëm, p.sh.:
`Gj8#mK2$pL9@nQ5!xR3&wT7*vE1^hU4`

---

## Hapi 5 — Test

Pas deploy:
- Faqja: `https://green-colours.pages.dev`
- Admin: `https://green-colours.pages.dev/menaxhim-GC-yzy.html`
- API test: `https://green-colours.pages.dev/api/flowers`

---

## Siguria

✅ Çelësat janë vetëm në Cloudflare Environment Variables  
✅ Frontend nuk ka asnjë çelës  
✅ Admin panel URL është sekret (nuk është në footer/nav)  
✅ RLS aktiv në Supabase — lexim publik, shkrim vetëm nga Worker  
✅ Imazhet ngarkohen vetëm nga admin  
✅ Input validation në çdo endpoint  
✅ File size limit 5MB për imazhe  

---

## Përditësim i Faqes

```bash
git add .
git commit -m "Ndryshimi"
git push
```
Cloudflare deploy automatikisht brenda 1 minute! 🚀
