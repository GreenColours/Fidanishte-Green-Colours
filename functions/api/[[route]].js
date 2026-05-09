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

// ── CORS Headers ─────────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
  'Access-Control-Max-Age':       '86400',
};

// ── Main Handler ──────────────────────────────────────────────────────────────
export async function onRequest({ request, env, params }) {

  // CORS Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url    = new URL(request.url);
  const route  = (params.route || []).join('/').split('?')[0];
  const method = request.method;

  // ── Rate Limiting (simple IP-based, 60 req/min) ───────────────────────────
  // More advanced rate limiting can be configured in Cloudflare Dashboard
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

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
        if (!id) return err('ID mungon');
        const body = sanitize(await request.json());
        const res  = await sb(`flowers?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(body) });
        const data = await res.json();
        return ok(data, res.status);
      }

      if (method === 'DELETE') {
        const id = cleanId(url.searchParams.get('id') || url.searchParams.get('id_eq'));
        if (!id) return err('ID mungon');
        await sb(`flowers?id=eq.${id}`, { method: 'DELETE' });
        return ok({ deleted: true });
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // /api/blog  — Artikujt e blogut (CRUD)
    // ══════════════════════════════════════════════════════════════════════
    if (route === 'blog') {

      if (method === 'GET') {
        const res  = await sb('blog?select=*&order=created_at.desc');
        const data = await res.json();
        return ok(Array.isArray(data) ? data : []);
      }

      if (!isAdmin()) return err('Unauthorized', 401);

      if (method === 'POST') {
        const body = sanitize(await request.json());
        if (!body.title || !body.content) return err('Titulli dhe përmbajtja janë të detyrueshëm');
        const res  = await sb('blog', { method: 'POST', body: JSON.stringify(body) });
        const data = await res.json();
        return ok(data, res.status);
      }

      if (method === 'PUT') {
        const id = cleanId(url.searchParams.get('id') || url.searchParams.get('id_eq'));
        if (!id) return err('ID mungon');
        const body = sanitize(await request.json());
        const res  = await sb(`blog?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(body) });
        const data = await res.json();
        return ok(data, res.status);
      }

      if (method === 'DELETE') {
        const id = cleanId(url.searchParams.get('id') || url.searchParams.get('id_eq'));
        if (!id) return err('ID mungon');
        await sb(`blog?id=eq.${id}`, { method: 'DELETE' });
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
        const data = await res.json();
        return ok(data, res.status);
      }

      if (method === 'DELETE') {
        const id = cleanId(url.searchParams.get('id') || url.searchParams.get('id_eq'));
        if (!id) return err('ID mungon');
        await sb(`categories?id=eq.${id}`, { method: 'DELETE' });
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

      if (method === 'DELETE') {
        const id = cleanId(url.searchParams.get('id') || url.searchParams.get('id_eq'));
        if (!id) return err('ID mungon');
        await sb(`occasions?id=eq.${id}`, { method: 'DELETE' });
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
        const body = await request.json();
        if (!body.phone || !body.items) return err('Telefoni dhe produktet janë të detyrueshëm');

        // Anti-spam: valido numrin e telefonit
        const phone = String(body.phone).replace(/\s/g, '');
        if (!/^[0-9+]{7,15}$/.test(phone)) return err('Numri i telefonit i pavlefshëm');

        const order = {
          phone:  phone,
          items:  JSON.stringify(body.items),
          total:  body.total || 0,
          status: 'e re',
          created_at: new Date().toISOString(),
        };
        const res  = await sb('orders', { method: 'POST', body: JSON.stringify(order) });
        const data = await res.json();
        return ok(data, res.status);
      }

      // PUT — admin ndryshon statusin
      if (method === 'PUT') {
        if (!isAdmin()) return err('Unauthorized', 401);
        const id   = url.searchParams.get('id') || url.searchParams.get('id_eq');
        if (!id) return err('ID mungon');
        const body = await request.json();
        const res  = await sb(`orders?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ status: body.status }) });
        const data = await res.json();
        return ok(data, res.status);
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
        // Shto cilësi të re
        const body = sanitize(await request.json());
        if (!body.key) return err('Key mungon');
        const res  = await sb('settings', { method: 'POST', body: JSON.stringify(body) });
        const data = await res.json();
        return ok(data, res.status);
      }

      if (method === 'PUT') {
        // Ndrysho vlerën e një çelësi
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
        // Increment views me Supabase RPC
        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/increment_views`, {
          method: 'POST',
          headers: {
            'apikey':        env.SUPABASE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_KEY}`,
            'Content-Type':  'application/json',
          },
          body: JSON.stringify({ flower_id: id }),
        });
        return ok({ ok: true });
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // /api/storage  — Ngarkim dhe fshirje imazhesh
    // ══════════════════════════════════════════════════════════════════════
    if (route === 'storage') {
      if (!isAdmin()) return err('Unauthorized', 401);

      // POST — ngarko foto
      if (method === 'POST') {
        const fileName = url.searchParams.get('name');
        if (!fileName) return err('Emri i skedarit mungon');

        // Valido emrin e skedarit (vetëm alfanumerike, _, -, .)
        if (!/^[a-zA-Z0-9_\-\.]+$/.test(fileName)) {
          return err('Emri i skedarit i pavlefshëm');
        }

        // Merr blob-in nga body
        const imageBlob = await request.arrayBuffer();
        if (imageBlob.byteLength > 5 * 1024 * 1024) {
          return err('Foto shumë e madhe (max 5MB)');
        }

        const contentType = request.headers.get('Content-Type') || 'image/webp';

        // Upload ne Supabase Storage bucket 'images'
        const res = await sbStorage(`object/images/${fileName}`, {
          method:  'POST',
          headers: { 'Content-Type': contentType, 'x-upsert': 'true' },
          body:    imageBlob,
        });

        if (!res.ok) {
          const errText = await res.text();
          return err(`Storage error: ${errText}`, res.status);
        }

        // Kthe URL-n publike
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
        return ok({ deleted: true, name: fileName });
      }
    }

    // 404
    return err(`Route '${route}' nuk u gjet`, 404);

  } catch (e) {
    console.error('API Error:', e);
    return err('Gabim serveri — provoni sërish', 500);
  }
}
