require('dotenv').config({ quiet: true });
const cors = require('cors');
const express = require('express');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zoemonbualktnxhpbebv.supabase.co';
const SUPABASE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'zoemonbualktnxhpbebv';
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Zu2MWJXLGRLh66nmInx3dA_zqeE3nIY';
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY || '';
const SUPABASE_REST_BASE_URL = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1`;
const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY);

const OPS_MODULES = ['inwarding', 'production', 'packing', 'dispatch'];
const MODULE_SET = new Set(OPS_MODULES);
const clients = [];
const fallbackEvents = [];

const fallbackWorkers = new Map(
  [
    {
      id: 'worker-inwarding-1',
      name: 'Inwarding Staff',
      phone: '9876543210',
      pin: '123456',
      role: 'Inwarding_Staff',
      allowedModules: ['inwarding'],
      active: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'worker-production-1',
      name: 'Production Operator',
      phone: '9876543211',
      pin: '223344',
      role: 'Production_Operator',
      allowedModules: ['production'],
      active: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'worker-packing-1',
      name: 'Packing Staff',
      phone: '9876543212',
      pin: '112233',
      role: 'Packing_Staff',
      allowedModules: ['packing'],
      active: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'worker-dispatch-1',
      name: 'Dispatch Staff',
      phone: '9876543213',
      pin: '654321',
      role: 'Dispatch_Staff',
      allowedModules: ['dispatch'],
      active: true,
      createdAt: new Date().toISOString(),
    },
  ].map((worker) => [worker.id, worker]),
);

function safeText(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function safeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toAllowedModules(modules) {
  if (!Array.isArray(modules)) {
    return [];
  }
  const normalized = modules
    .map((module) => (typeof module === 'string' ? module.trim().toLowerCase() : ''))
    .filter((module) => MODULE_SET.has(module));
  return OPS_MODULES.filter((module) => normalized.includes(module));
}

function toPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }

  const entries = Object.entries(payload).map(([key, value]) => {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      return [key, value];
    }
    return [key, String(value)];
  });

  return Object.fromEntries(entries);
}

function mapEventRow(row) {
  return {
    id: String(row.id),
    module: String(row.module),
    workerId: String(row.worker_id),
    workerName: String(row.worker_name),
    workerRole: String(row.worker_role),
    createdAt: String(row.created_at),
    batchCode: String(row.batch_code),
    quantity: safeNumber(row.quantity, 0),
    unit: String(row.unit),
    summary: String(row.summary),
    payload: toPayload(row.payload),
  };
}

function mapWorkerRow(row, modulesByWorkerId) {
  const workerId = String(row.worker_id);
  return {
    id: workerId,
    name: safeText(row.name, 'Unnamed Worker'),
    phone: safeText(row.phone, ''),
    pin: safeText(row.pin, ''),
    role: safeText(row.worker_role, 'Worker'),
    allowedModules: modulesByWorkerId.get(workerId) || [],
    active: Boolean(row.active),
    createdAt: safeText(row.created_at, new Date().toISOString()),
  };
}

function broadcastEvent(event) {
  clients.forEach((client) => {
    client.write('event: ops-event\n');
    client.write(`data: ${JSON.stringify(event)}\n\n`);
  });
}

async function supabaseRequest(path, options = {}) {
  if (!SUPABASE_ENABLED) {
    throw new Error('Supabase credentials are not configured.');
  }

  const response = await fetch(`${SUPABASE_REST_BASE_URL}/${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase request failed (${response.status}): ${raw}`);
  }

  if (!raw) {
    return null;
  }

  return JSON.parse(raw);
}

async function fetchEventsFromSupabase(limit) {
  const rows = await supabaseRequest(
    `ops_events?select=id,module,worker_id,worker_name,worker_role,created_at,batch_code,quantity,unit,summary,payload&order=created_at.desc&limit=${limit}`,
  );
  return rows.map(mapEventRow);
}

async function fetchWorkersFromSupabase() {
  const workers = await supabaseRequest(
    'ops_workers?select=worker_id,name,phone,pin,worker_role,active,created_at&order=created_at.desc&limit=500',
  );
  const accessRows = await supabaseRequest(
    'ops_worker_module_access?select=worker_id,module&limit=2000',
  );

  const modulesByWorkerId = new Map();
  accessRows.forEach((row) => {
    const workerId = String(row.worker_id);
    const module = String(row.module).toLowerCase();
    if (!MODULE_SET.has(module)) {
      return;
    }
    const existing = modulesByWorkerId.get(workerId) || [];
    if (!existing.includes(module)) {
      existing.push(module);
      modulesByWorkerId.set(workerId, existing);
    }
  });

  return workers.map((worker) => mapWorkerRow(worker, modulesByWorkerId));
}

async function fetchWorkerByIdFromSupabase(workerId) {
  const workers = await supabaseRequest(
    `ops_workers?select=worker_id,name,phone,pin,worker_role,active,created_at&worker_id=eq.${encodeURIComponent(workerId)}&limit=1`,
  );
  if (workers.length === 0) {
    return null;
  }

  const accessRows = await supabaseRequest(
    `ops_worker_module_access?select=worker_id,module&worker_id=eq.${encodeURIComponent(workerId)}&limit=20`,
  );

  const modulesByWorkerId = new Map();
  accessRows.forEach((row) => {
    const module = String(row.module).toLowerCase();
    if (!MODULE_SET.has(module)) {
      return;
    }
    const existing = modulesByWorkerId.get(workerId) || [];
    if (!existing.includes(module)) {
      existing.push(module);
      modulesByWorkerId.set(workerId, existing);
    }
  });

  return mapWorkerRow(workers[0], modulesByWorkerId);
}

async function replaceWorkerModulesInSupabase(workerId, allowedModules) {
  await supabaseRequest(`ops_worker_module_access?worker_id=eq.${encodeURIComponent(workerId)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });

  if (allowedModules.length === 0) {
    return;
  }

  await supabaseRequest('ops_worker_module_access?on_conflict=worker_id%2Cmodule', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: allowedModules.map((module) => ({ worker_id: workerId, module })),
  });
}

async function upsertWorkerToSupabase(worker) {
  await supabaseRequest('ops_workers?on_conflict=worker_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: {
      worker_id: worker.id,
      name: worker.name,
      phone: worker.phone || null,
      pin: worker.pin || null,
      worker_role: worker.role,
      active: worker.active,
    },
  });

  await replaceWorkerModulesInSupabase(worker.id, worker.allowedModules);
  const stored = await fetchWorkerByIdFromSupabase(worker.id);
  if (!stored) {
    throw new Error('Worker upsert succeeded but worker fetch failed.');
  }
  return stored;
}

async function upsertWorkerFromEventToSupabase(event) {
  await supabaseRequest('ops_workers?on_conflict=worker_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: {
      worker_id: event.workerId,
      name: event.workerName,
      worker_role: event.workerRole,
      active: true,
    },
  });

  await supabaseRequest('ops_worker_module_access?on_conflict=worker_id%2Cmodule', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: { worker_id: event.workerId, module: event.module },
  });
}

function parseIncomingEvent(body) {
  const moduleRaw = safeText(body?.module, '').toLowerCase();
  if (!MODULE_SET.has(moduleRaw)) {
    throw new Error(`Unsupported module: ${body?.module}`);
  }

  return {
    id: safeText(body?.id, uuidv4()),
    module: moduleRaw,
    workerId: safeText(body?.workerId, 'mobile-worker'),
    workerName: safeText(body?.workerName, 'Mobile Worker'),
    workerRole: safeText(body?.workerRole, 'Worker'),
    createdAt: new Date().toISOString(),
    batchCode: safeText(body?.batchCode, 'N/A'),
    quantity: Math.max(0, safeNumber(body?.quantity, 0)),
    unit: safeText(body?.unit, 'units'),
    summary: safeText(body?.summary, 'Operation event'),
    payload: toPayload(body?.payload),
  };
}

function deriveSourceApp(req) {
  const header = req.header('X-Client-Platform');
  if (typeof header === 'string' && header.trim().length > 0) {
    return header.trim().toLowerCase();
  }
  return 'unknown';
}

async function createEventInSupabase(event, sourceApp) {
  await upsertWorkerFromEventToSupabase(event);

  const rows = await supabaseRequest(
    'ops_events?select=id,module,worker_id,worker_name,worker_role,created_at,batch_code,quantity,unit,summary,payload',
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: {
        id: event.id,
        module: event.module,
        worker_id: event.workerId,
        worker_name: event.workerName,
        worker_role: event.workerRole,
        created_at: event.createdAt,
        batch_code: event.batchCode,
        quantity: event.quantity,
        unit: event.unit,
        summary: event.summary,
        payload: event.payload,
        source_app: sourceApp,
      },
    },
  );

  if (rows.length === 0) {
    throw new Error('Supabase insert returned no event row.');
  }

  return mapEventRow(rows[0]);
}

function upsertWorkerToFallback(worker) {
  fallbackWorkers.set(worker.id, worker);
  return worker;
}

function upsertWorkerFromEventToFallback(event) {
  const existing = fallbackWorkers.get(event.workerId);
  if (!existing) {
    fallbackWorkers.set(event.workerId, {
      id: event.workerId,
      name: event.workerName,
      phone: '',
      pin: '',
      role: event.workerRole,
      allowedModules: [event.module],
      active: true,
      createdAt: event.createdAt,
    });
    return;
  }

  if (!existing.allowedModules.includes(event.module)) {
    existing.allowedModules = [...existing.allowedModules, event.module];
  }
  existing.name = event.workerName;
  existing.role = event.workerRole;
  fallbackWorkers.set(event.workerId, existing);
}

function createEventInFallback(event) {
  upsertWorkerFromEventToFallback(event);
  fallbackEvents.unshift(event);
  if (fallbackEvents.length > 500) {
    fallbackEvents.pop();
  }
  return event;
}

app.get('/api/v1/ops/supabase/config', (_req, res) => {
  res.json({
    projectRef: SUPABASE_PROJECT_REF,
    apiUrl: SUPABASE_URL,
    publishableKey: SUPABASE_PUBLISHABLE_KEY,
    restApiUrl: SUPABASE_REST_BASE_URL,
    dbEnabled: SUPABASE_ENABLED,
    usingFallbackStorage: !SUPABASE_ENABLED,
  });
});

app.post('/api/v1/ops/events', async (req, res) => {
  try {
    const parsed = parseIncomingEvent(req.body);
    const sourceApp = deriveSourceApp(req);

    let createdEvent;
    try {
      createdEvent = SUPABASE_ENABLED
        ? await createEventInSupabase(parsed, sourceApp)
        : createEventInFallback(parsed);
    } catch (supabaseError) {
      console.error('Supabase insert failed; using fallback event store.', supabaseError);
      createdEvent = createEventInFallback(parsed);
    }

    broadcastEvent(createdEvent);
    res.status(201).json(createdEvent);
  } catch (error) {
    res.status(400).json({
      error: 'invalid_ops_event',
      message: error instanceof Error ? error.message : 'Invalid operation event payload.',
    });
  }
});

app.get('/api/v1/ops/events', async (req, res) => {
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || '200'), 10) || 200, 1), 500);

  let events;
  try {
    events = SUPABASE_ENABLED ? await fetchEventsFromSupabase(limit) : fallbackEvents.slice(0, limit);
  } catch (supabaseError) {
    console.error('Supabase read failed; serving fallback events.', supabaseError);
    events = fallbackEvents.slice(0, limit);
  }

  res.json({ events });
});

app.get('/api/v1/ops/workers', async (_req, res) => {
  let workers;
  try {
    workers = SUPABASE_ENABLED ? await fetchWorkersFromSupabase() : Array.from(fallbackWorkers.values());
  } catch (supabaseError) {
    console.error('Supabase worker read failed; serving fallback workers.', supabaseError);
    workers = Array.from(fallbackWorkers.values());
  }

  res.json({ workers });
});

app.post('/api/v1/ops/workers', async (req, res) => {
  const now = new Date().toISOString();
  const allowedModules = toAllowedModules(req.body?.allowedModules);
  const worker = {
    id: safeText(req.body?.id, `worker-${uuidv4()}`),
    name: safeText(req.body?.name, 'Unnamed Worker'),
    phone: safeText(req.body?.phone, ''),
    pin: safeText(req.body?.pin, ''),
    role: safeText(req.body?.role, 'Worker'),
    allowedModules: allowedModules.length > 0 ? allowedModules : ['inwarding'],
    active: req.body?.active !== false,
    createdAt: safeText(req.body?.createdAt, now),
  };

  try {
    const stored = SUPABASE_ENABLED ? await upsertWorkerToSupabase(worker) : upsertWorkerToFallback(worker);
    res.status(201).json(stored);
  } catch (error) {
    console.error('Worker upsert failed.', error);
    res.status(500).json({
      error: 'worker_upsert_failed',
      message: error instanceof Error ? error.message : 'Unable to create worker.',
    });
  }
});

app.patch('/api/v1/ops/workers/:workerId/access', async (req, res) => {
  const workerId = safeText(req.params.workerId, '');
  if (!workerId) {
    res.status(400).json({ error: 'invalid_worker_id', message: 'workerId path parameter is required.' });
    return;
  }

  const allowedModules = toAllowedModules(req.body?.allowedModules);
  try {
    if (SUPABASE_ENABLED) {
      const existing = await fetchWorkerByIdFromSupabase(workerId);
      if (!existing) {
        res.status(404).json({ error: 'worker_not_found', message: `Worker ${workerId} does not exist.` });
        return;
      }

      await replaceWorkerModulesInSupabase(workerId, allowedModules);
      const stored = await fetchWorkerByIdFromSupabase(workerId);
      res.json(stored);
      return;
    }

    const existing = fallbackWorkers.get(workerId);
    if (!existing) {
      res.status(404).json({ error: 'worker_not_found', message: `Worker ${workerId} does not exist.` });
      return;
    }

    existing.allowedModules = allowedModules;
    fallbackWorkers.set(workerId, existing);
    res.json(existing);
  } catch (error) {
    console.error('Worker access update failed.', error);
    res.status(500).json({
      error: 'worker_access_update_failed',
      message: error instanceof Error ? error.message : 'Unable to update worker access.',
    });
  }
});

app.patch('/api/v1/ops/workers/:workerId/active', async (req, res) => {
  const workerId = safeText(req.params.workerId, '');
  if (!workerId) {
    res.status(400).json({ error: 'invalid_worker_id', message: 'workerId path parameter is required.' });
    return;
  }
  const active = Boolean(req.body?.active);

  try {
    if (SUPABASE_ENABLED) {
      const rows = await supabaseRequest(
        `ops_workers?worker_id=eq.${encodeURIComponent(workerId)}&select=worker_id,name,phone,pin,worker_role,active,created_at`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: { active },
        },
      );

      if (rows.length === 0) {
        res.status(404).json({ error: 'worker_not_found', message: `Worker ${workerId} does not exist.` });
        return;
      }

      const stored = await fetchWorkerByIdFromSupabase(workerId);
      res.json(stored);
      return;
    }

    const existing = fallbackWorkers.get(workerId);
    if (!existing) {
      res.status(404).json({ error: 'worker_not_found', message: `Worker ${workerId} does not exist.` });
      return;
    }

    existing.active = active;
    fallbackWorkers.set(workerId, existing);
    res.json(existing);
  } catch (error) {
    console.error('Worker active status update failed.', error);
    res.status(500).json({
      error: 'worker_active_update_failed',
      message: error instanceof Error ? error.message : 'Unable to update worker active status.',
    });
  }
});

app.get('/api/v1/ops/events/stream', (_req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  clients.push(res);
  res.write('event: ready\n');
  res.write(`data: ${JSON.stringify({ connected: true })}\n\n`);

  res.on('close', () => {
    const index = clients.indexOf(res);
    if (index !== -1) {
      clients.splice(index, 1);
    }
  });
});

const MOCK_USER = {
  userId: 'admin-1',
  tenantId: 'tenant-1',
  name: 'Admin User',
  role: 'Platform_Admin',
  factoryIds: ['factory-1'],
  phone: '9999999999',
};

const MOCK_TOKENS = {
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  expiresIn: 3600,
};

app.post('/api/v1/auth/login/phone', (_req, res) => {
  res.json({ ...MOCK_TOKENS, user: MOCK_USER });
});

app.post('/api/v1/auth/refresh', (_req, res) => {
  res.json({ ...MOCK_TOKENS });
});

app.post('/api/v1/auth/logout', (_req, res) => {
  res.status(200).send();
});

app.get('/api/v1/auth/me', (_req, res) => {
  res.json(MOCK_USER);
});

app.get('/api/v1/auth/permissions', (_req, res) => {
  res.json([
    { module: 'dashboard', action: 'read', resourceScope: 'tenant' },
    { module: 'inwarding', action: 'create', resourceScope: 'factory' },
    { module: 'production', action: 'create', resourceScope: 'factory' },
    { module: 'packing', action: 'create', resourceScope: 'factory' },
    { module: 'dispatch', action: 'create', resourceScope: 'factory' },
  ]);
});

app.post('/api/v1/auth/sync/events', (req, res) => {
  res.json({ syncedCount: req.body.events?.length || 0, conflicts: [] });
});

module.exports = app;
