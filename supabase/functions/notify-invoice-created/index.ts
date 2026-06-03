// Supabase Edge Function: notify-invoice-created
//
// Called by the web app right after an invoice is inserted. It:
//   1. Looks up FCM tokens for active Dispatch_Staff workers.
//   2. Mints a short-lived FCM v1 OAuth access token from the service-account JSON.
//   3. Sends a `data + notification` push to each token (sequential — small list).
//
// Required Supabase secrets:
//   - SUPABASE_URL              (auto-provided)
//   - SUPABASE_SERVICE_ROLE_KEY (auto-provided)
//   - FCM_SERVICE_ACCOUNT       (paste the Firebase service-account JSON as a string)
//
// Deploy: `supabase functions deploy notify-invoice-created --no-verify-jwt`
//         (verify-jwt off because the web app may call it from the client; if you
//          prefer server-only invocation, leave verify-jwt on and pass the user JWT.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface InvoicePayload {
  invoice_id: string;
  invoice_number: string;
  customer_name: string;
  total_boxes?: number;
}

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let payload: InvoicePayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400 });
  }
  if (!payload.invoice_id || !payload.customer_name) {
    return new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400 });
  }

  const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const FCM_SERVICE_ACCOUNT_JSON  = Deno.env.get('FCM_SERVICE_ACCOUNT');

  if (!FCM_SERVICE_ACCOUNT_JSON) {
    return new Response(JSON.stringify({ error: 'fcm_not_configured' }), { status: 500 });
  }

  // 1. Look up active Dispatch_Staff workers' device tokens.
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: workers, error: wErr } = await supabase
    .from('ops_workers')
    .select('worker_id')
    .eq('worker_role', 'Dispatch_Staff')
    .eq('active', true);
  if (wErr) {
    return new Response(JSON.stringify({ error: 'workers_lookup_failed', detail: wErr.message }), { status: 500 });
  }
  const workerIds = (workers ?? []).map((w: { worker_id: string }) => w.worker_id);
  if (workerIds.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: 'no_dispatch_workers' }), { status: 200 });
  }

  const { data: devices, error: dErr } = await supabase
    .from('worker_devices')
    .select('fcm_token, worker_id')
    .in('worker_id', workerIds);
  if (dErr) {
    return new Response(JSON.stringify({ error: 'devices_lookup_failed', detail: dErr.message }), { status: 500 });
  }
  const tokens = (devices ?? []).map((d: { fcm_token: string }) => d.fcm_token);
  if (tokens.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: 'no_registered_devices' }), { status: 200 });
  }

  // 2. Mint an FCM v1 OAuth access token from the service-account.
  let serviceAccount: ServiceAccount;
  try {
    serviceAccount = JSON.parse(FCM_SERVICE_ACCOUNT_JSON);
  } catch {
    return new Response(JSON.stringify({ error: 'fcm_service_account_invalid_json' }), { status: 500 });
  }
  const accessToken = await getFcmAccessToken(serviceAccount);

  // 3. Build and send each push. FCM v1 sends one message at a time.
  const bodyText = payload.total_boxes
    ? `New invoice — ${payload.customer_name} (${payload.total_boxes} boxes)`
    : `New invoice — ${payload.customer_name}`;

  const results = await Promise.allSettled(
    tokens.map((token) =>
      fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            notification: {
              title: `Invoice ${payload.invoice_number}`,
              body: bodyText,
            },
            data: {
              type: 'invoice_created',
              invoice_id: payload.invoice_id,
              invoice_number: payload.invoice_number,
              route: 'dispatch',
            },
            android: {
              priority: 'HIGH',
              notification: {
                channel_id: 'invoices',
                click_action: 'OPEN_DISPATCH',
              },
            },
          },
        }),
      }).then((r) => r.ok || r.status === 200),
    ),
  );

  const sent   = results.filter((r) => r.status === 'fulfilled' && r.value).length;
  const failed = results.length - sent;
  return new Response(JSON.stringify({ sent, failed, total: tokens.length }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
});

// ───────────────────── Google service-account OAuth2 (JWT bearer flow) ──────

async function getFcmAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim  = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const jwt = await signJwtRs256(header, claim, sa.private_key);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`oauth_failed: ${res.status} ${await res.text()}`);
  const { access_token } = await res.json();
  return access_token as string;
}

function b64url(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let str = btoa(String.fromCharCode(...bytes));
  return str.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function signJwtRs256(
  header: Record<string, unknown>,
  claim: Record<string, unknown>,
  pem: string,
): Promise<string> {
  const enc = (o: object) => b64url(JSON.stringify(o));
  const payload = `${enc(header)}.${enc(claim)}`;

  // Import the PEM private key into Web Crypto.
  const der = pemToDer(pem);
  const key = await crypto.subtle.importKey(
    'pkcs8', der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(payload));
  return `${payload}.${b64url(new Uint8Array(sig))}`;
}

function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const raw = atob(body);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf;
}
