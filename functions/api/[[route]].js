/**
 * ═══════════════════════════════════════════════════════════
 *  Green & Colours — Cloudflare Pages Function
 *  File: functions/api/[[route]].js
 *
 *  Environment Variables të nevojshme (Cloudflare Dashboard):
 *    SUPABASE_URL    = https://oewfdgiakzhjqrhdcwds.supabase.co
 *    SUPABASE_KEY    = service_role key (nga Supabase → Settings → API)
 *    ADMIN_SECRET    = fjalekalim i forte per admin panel
 * ═══════════════════════════════════════════════════════════
 */

// ── CORS — Domain-i i lejuar ──────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://greenandcolours.com',
  'http://localhost',
  'http://localhost:8788',
  'http://127.0.0.1',
];

function buildCors(request) {
  const origin = (request.headers.get('Origin') || '').trim();
  const allowed = ALLOWED_ORIGINS.some(o => origin === o || origin.startsWith(o + ':'));
  return {
    'Access-Control-Allow-Origin':  allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
    'Access-Control-Max-Age':       '86400',
    'Vary': 'Origin',
  };
}

// ── Rate Limit Store (in-memory, per isolate) ─────────────────────────────────
const rateLimitStore = new Map();
const RL_MAX    = 60;
const RL_WINDOW = 60_000; // 1 minutë

function checkRateLimit(ip) {
  const now = Date.now();
  let rl = rateLimitStore.get(ip);
  if (!rl || now > rl.reset) {
    rl = { count: 0, reset: now + RL_WINDOW };
  }
  rl.count++;
  rateLimitStore.set(ip, rl);
  return rl.count <= RL_MAX;
}

// ── Main Handler ──────────────────────────────────────────────────────────────
export async function onRequest({ request, env, params }) {

  const CORS = buildCors(request);

  // CORS Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url    = new URL(request.url);
  const route  = (params.route || []).join('/').split('?')[0];
  const method = request.method;

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

  // ── Rate Limiting — 60 req/min per IP ────────────────────────────────────
  if (!checkRateLimit(ip)) {
    return new Response(
      JSON.stringify({ error: 'Shumë kërkesa — provoni sërish pas 1 minute' }),
      {
        status: 429,
        headers: {
          ...CORS,
          'Content-Type': 'application/json',
          'Retry-After':  '60',
        },
      }
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const isAdmin = () => {
    const token = request.headers.get('X-Admin-Token') ||
                  request.headers.get('x-admin-token') || '';
    return token.length > 0 && token === env.ADMIN_SECRET;
  };

  // Supabase REST API call
  const sb = async (path, init = {}) => {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      headers: {
        'apikey':        env.SUPABASE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_KEY}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=representation',
        ...(init.headers || {}),
      },
    });
    return res;
  };

  // Supabase Storage API call
  const sbStorage = async (path, init = {}) => {
    return fetch(`${env.SUPABASE_URL}/storage/v1/${path}`, {
      ...init,
      headers: {
        'apikey':        env.SUPABASE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_KEY}`,
        ...(init.headers || {}),
      },
    });
  };

  // Clean ID — strip 'eq.' prefix if present (admin sends ?id=eq.5)
  const cleanId = (raw) => raw ? String(raw).replace(/^eq\./, '') : null;

  // Response helpers
  const ok  = (data, status = 200) => new Response(
    JSON.stringify(data),
    { status, headers: { ...CORS, 'Content-Type': 'application/json' } }
  );
  const err = (msg, status = 400) => ok({ error: msg }, status);

  // Input sanitization
  const sanitize = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;
    const clean = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string') {
        clean[k] = v.replace(/<script[\s\S]*?<\/script>/gi, '')
                    .replace(/javascript:/gi, '')
                    .trim();
      } else {
        clean[k] = v;
      }
    }
    return clean;
  };

  try {

    // ══════════════════════════════════════════════════════════════════════
    // /api/flowers  — Produktet (CRUD)
    // ══════════════════════════════════════════════════════════════════════
    if (route === 'flowers') {

      if (method === 'GET') {
        const cat    = url.searchParams.get('category') || '';
        const search = url.searchParams.get('search') || '';
        let query = 'flowers?select=*&order=created_at.desc';
        if (cat)    query += `&category=eq.${encodeURIComponent(cat)}`;
        if (search) query += `&name=ilike.*${encodeURIComponent(search)}*`;

        // Faqosje opsionale LIMIT/OFFSET (për katalogë shumë të mëdhenj) — pa parametra,
        // sjellja mbetet e pandryshuar
        const limit  = parseInt(url.searchParams.get('limit')  || '', 10);
        const offset = parseInt(url.searchParams.get('offset') || '', 10);
        if (Number.isInteger(limit)  && limit  > 0)  query += `&limit=${Math.min(limit, 200)}`;
        if (Number.isInteger(offset) && offset >= 0) query += `&offset=${offset}`;

        const res  = await sb(query);
        const data = await res.json();
        return ok(Array.isArray(data) ? data : []);
      }

      if (!isAdmin()) return err('Unauthorized — token i gabuar', 401);

      if (method === 'POST') {
        const body = sanitize(await request.json());
        if (!body.name || !body.price) return err('Emri dhe çmimi janë të detyrueshëm');
        const res  = await sb('flowers', { method: 'POST', body: JSON.stringify(body) });
        const data = await res.json();
        return ok(data, res.status);
      }

      if (method === 'PUT') {
        const id = cleanId(url.searchParams.get('id') || url.searchParams.get('id_eq'));
        if (!id) return err('ID mungon (PUT)');
        const body = sanitize(await request.json());
        const res  = await sb(`flowers?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(body) });
        if (!res.ok) {
          const errText = await res.text();
          return err(`Supabase PUT/PATCH error: ${errText}`, res.status);
        }
        const data = await res.json();
        return ok(data);
      }

      if (method === 'DELETE') {
        const id = cleanId(url.searchParams.get('id') || url.searchParams.get('id_eq'));
        if (!id) return err('ID mungon (DELETE)');
        const res = await sb(`flowers?id=eq.${id}`, { method: 'DELETE' });
        if (!res.ok) {
          const errText = await res.text();
          return err(`Supabase DELETE error: ${errText}`, res.status);
        }
        return ok({ deleted: true });
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // /api/categories  — Kategoritë (CRUD)
    // ══════════════════════════════════════════════════════════════════════
    if (route === 'categories') {

      if (method === 'GET') {
        const res  = await sb('categories?select=*&order=name.asc');
        const data = await res.json();
        return ok(Array.isArray(data) ? data : []);
      }

      if (!isAdmin()) return err('Unauthorized', 401);

      if (method === 'POST') {
        const body = sanitize(await request.json());
        if (!body.name) return err('Emri i kategorisë është i detyrueshëm');
        const res  = await sb('categories', { method: 'POST', body: JSON.stringify(body) });
        const data = await res.json();
        return ok(data, res.status);
      }

      if (method === 'PUT') {
        const id = cleanId(url.searchParams.get('id') || url.searchParams.get('id_eq'));
        if (!id) return err('ID mungon');
        const body = sanitize(await request.json());
        const res  = await sb(`categories?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(body) });
        if (!res.ok) {
          const errText = await res.text();
          return err(`Supabase error: ${errText}`, res.status);
        }
        const data = await res.json();
        return ok(data);
      }

      if (method === 'DELETE') {
        const id = cleanId(url.searchParams.get('id') || url.searchParams.get('id_eq'));
        if (!id) return err('ID mungon');
        const res = await sb(`categories?id=eq.${id}`, { method: 'DELETE' });
        if (!res.ok) {
          const errText = await res.text();
          return err(`Supabase error: ${errText}`, res.status);
        }
        return ok({ deleted: true });
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // /api/occasions  — Rastet (p.sh. Ditëlindje, Dasëm...)
    // ══════════════════════════════════════════════════════════════════════
    if (route === 'occasions') {

      if (method === 'GET') {
        const res  = await sb('occasions?select=*&order=name.asc');
        const data = await res.json();
        return ok(Array.isArray(data) ? data : []);
      }

      if (!isAdmin()) return err('Unauthorized', 401);

      if (method === 'POST') {
        const body = sanitize(await request.json());
        if (!body.name) return err('Emri i rastit është i detyrueshëm');
        const res  = await sb('occasions', { method: 'POST', body: JSON.stringify(body) });
        const data = await res.json();
        return ok(data, res.status);
      }

      if (method === 'PUT') {
        const id = cleanId(url.searchParams.get('id') || url.searchParams.get('id_eq'));
        if (!id) return err('ID mungon');
        const body = sanitize(await request.json());
        if (!body.name) return err('Emri i rastit është i detyrueshëm');
        const res  = await sb(`occasions?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(body) });
        if (!res.ok) {
          const errText = await res.text();
          return err(`Supabase error: ${errText}`, res.status);
        }
        const data = await res.json();
        return ok(data);
      }

      if (method === 'DELETE') {
        const id = cleanId(url.searchParams.get('id') || url.searchParams.get('id_eq'));
        if (!id) return err('ID mungon');
        const res = await sb(`occasions?id=eq.${id}`, { method: 'DELETE' });
        if (!res.ok) {
          const errText = await res.text();
          return err(`Supabase error: ${errText}`, res.status);
        }
        return ok({ deleted: true });
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // /api/orders  — Porositë & Klientët
    // ══════════════════════════════════════════════════════════════════════
    if (route === 'orders') {

      if (method === 'GET') {
        if (!isAdmin()) return err('Unauthorized', 401);
        const res  = await sb('orders?select=*&order=created_at.desc&limit=200');
        const data = await res.json();
        return ok(Array.isArray(data) ? data : []);
      }

      // POST — klienti dërgon porosi (pa token)
      if (method === 'POST') {
        const raw  = await request.json();
        const body = sanitize(raw);
        if (!body.phone || !raw.items) return err('Telefoni dhe produktet janë të detyrueshëm');

        // Anti-spam: valido numrin e telefonit
        const phone = String(body.phone).replace(/\s/g, '');
        if (!/^[0-9+]{7,15}$/.test(phone)) return err('Numri i telefonit i pavlefshëm');

        const order = {
          phone:        phone,
          items:        JSON.stringify(raw.items),
          total_amount: raw.total || raw.total_amount || 0,
          name:         body.name    || '',
          email:        body.email   || '',
          address:      body.address || '',
          notes:        body.notes   || '',
          status:       'e re',
          created_at:   new Date().toISOString(),
        };
        const res  = await sb('orders', { method: 'POST', body: JSON.stringify(order) });
        const data = await res.json();
        return ok(data, res.status);
      }

      // PUT — admin ndryshon statusin
      if (method === 'PUT') {
        if (!isAdmin()) return err('Unauthorized', 401);
        const id   = cleanId(url.searchParams.get('id') || url.searchParams.get('id_eq'));
        if (!id) return err('ID mungon');
        const body = sanitize(await request.json());
        const res  = await sb(`orders?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ status: body.status }) });
        if (!res.ok) {
          const errText = await res.text();
          return err(`Supabase error: ${errText}`, res.status);
        }
        const data = await res.json();
        return ok(data, res.status);
      }

      // DELETE — admin fshin një porosi (me konfirmim në UI)
      if (method === 'DELETE') {
        if (!isAdmin()) return err('Unauthorized', 401);
        const id = cleanId(url.searchParams.get('id') || url.searchParams.get('id_eq'));
        if (!id) return err('ID mungon');
        const res = await sb(`orders?id=eq.${id}`, { method: 'DELETE' });
        if (!res.ok) {
          const errText = await res.text();
          return err(`Supabase error: ${errText}`, res.status);
        }
        return ok({ ok: true });
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // /api/settings  — Cilësimet e faqes (hero_img, about_img etj.)
    // ══════════════════════════════════════════════════════════════════════
    if (route === 'settings') {

      if (method === 'GET') {
        const res  = await sb('settings?select=key,value');
        const data = await res.json();
        return ok(Array.isArray(data) ? data : []);
      }

      if (!isAdmin()) return err('Unauthorized', 401);

      if (method === 'POST') {
        const body = sanitize(await request.json());
        if (!body.key) return err('Key mungon');
        const res  = await sb('settings', { method: 'POST', body: JSON.stringify(body) });
        const data = await res.json();
        return ok(data, res.status);
      }

      if (method === 'PUT') {
        const key  = url.searchParams.get('key');
        if (!key) return err('Key mungon');
        const body = sanitize(await request.json());
        const res  = await sb(
          `settings?key=eq.${encodeURIComponent(key)}`,
          { method: 'PATCH', body: JSON.stringify({ value: body.value }) }
        );
        const data = await res.json();
        return ok(data, res.status);
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // /api/views  — Rrit numrin e shikimeve të një produkti
    // ══════════════════════════════════════════════════════════════════════
    if (route === 'views') {
      if (method === 'POST') {
        const id = url.searchParams.get('id');
        if (!id) return err('ID mungon');
        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/increment_views`, {
          method: 'POST',
          headers: {
            'apikey':        env.SUPABASE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_KEY}`,
            'Content-Type':  'application/json',
          },
          body: JSON.stringify({ flower_id: id }),
        });
        if (!res.ok) {
          const errText = await res.text();
          return err(`RPC error: ${errText}`, res.status);
        }
        return ok({ ok: true });
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // /api/storage  — Ngarkim dhe fshirje imazhesh
    // ══════════════════════════════════════════════════════════════════════
    if (route === 'storage') {
      if (!isAdmin()) return err('Unauthorized', 401);

      const ALLOWED_TYPES = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'image/svg+xml',
      ];

      // POST — ngarko foto
      if (method === 'POST') {
        const fileName = url.searchParams.get('name');
        if (!fileName) return err('Emri i skedarit mungon');

        if (!/^[a-zA-Z0-9_\-\.]+$/.test(fileName)) {
          return err('Emri i skedarit i pavlefshëm');
        }

        const contentType = (request.headers.get('Content-Type') || '').split(';')[0].trim();
        if (!ALLOWED_TYPES.includes(contentType)) {
          return err('Lloji i skedarit nuk lejohet. Lejo vetëm: JPEG, PNG, WebP, GIF, SVG', 400);
        }

        const imageBlob = await request.arrayBuffer();
        if (imageBlob.byteLength > 5 * 1024 * 1024) {
          return err('Foto shumë e madhe (max 5MB)');
        }

        const res = await sbStorage(`object/images/${fileName}`, {
          method:  'POST',
          headers: { 'Content-Type': contentType, 'x-upsert': 'true' },
          body:    imageBlob,
        });

        if (!res.ok) {
          const errText = await res.text();
          return err(`Storage error: ${errText}`, res.status);
        }

        const publicUrl = `${env.SUPABASE_URL}/storage/v1/object/public/images/${fileName}`;
        return ok({ url: publicUrl, name: fileName });
      }

      // DELETE — fshi foto
      if (method === 'DELETE') {
        const fileName = url.searchParams.get('name');
        if (!fileName) return err('Emri i skedarit mungon');
        if (!/^[a-zA-Z0-9_\-\.]+$/.test(fileName)) {
          return err('Emri i skedarit i pavlefshëm');
        }

        const res = await sbStorage(`object/images/${fileName}`, { method: 'DELETE' });
        if (!res.ok) {
          const errText = await res.text();
          return err(`Storage delete error: ${errText}`, res.status);
        }
        return ok({ deleted: true, name: fileName });
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // /api/contact  — Formulari i kontaktit (pa auth)
    // ══════════════════════════════════════════════════════════════════════
    if (route === 'contact') {
      if (method !== 'POST') return err('Metoda nuk lejohet', 405);

      const raw  = await request.json();

      // Honeypot — nëse plotësohet, është bot; kthe sukses pa vepruar
      if (raw.website) return ok({ ok: true });

      const body = sanitize(raw);

      // Validimet
      if (!body.name    || body.name.length    < 2)  return err('Emri duhet të ketë të paktën 2 karaktere');
      if (!body.email                               )  return err('Email-i është i detyrueshëm');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return err('Email-i nuk është i vlefshëm');
      if (!body.subject || body.subject.length  < 2)  return err('Subjekti është i detyrueshëm');
      if (!body.message || body.message.length  < 10) return err('Mesazhi duhet të ketë të paktën 10 karaktere');

      const contact = {
        name:       body.name.substring(0, 120),
        email:      body.email.substring(0, 254),
        phone:      (body.phone || '').substring(0, 30),
        subject:    body.subject.substring(0, 200),
        message:    body.message.substring(0, 2000),
        created_at: new Date().toISOString(),
      };

      const res = await sb('contacts', { method: 'POST', body: JSON.stringify(contact) });
      if (!res.ok) {
        const errText = await res.text();
        console.error('Contact save error:', errText);
        return err('Dërgimi dështoi. Ju lutemi provoni sërish ose na kontaktoni direkt.', 500);
      }
      return ok({ ok: true });
    }

    // 404
    return err(`Route '${route}' nuk u gjet`, 404);

  } catch (e) {
    console.error('API Error:', e);
    return err('Gabim serveri — provoni sërish', 500);
  }
}
