// Quick script to run the migration via Supabase's SQL endpoint
const SUPABASE_URL = 'https://hafaxgyaxmypmmpbemos.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhZmF4Z3lheG15cG1tcGJlbW9zIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzczNzg2MSwiZXhwIjoyMDg5MzEzODYxfQ.UgeoC-t_KvjzVMq-wsMfbg-WHqLIzuxO9YLov9o4q6c';

const statements = [
  `ALTER TABLE public.production_batches ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid()`,
  `ALTER TABLE public.production_batches ADD COLUMN IF NOT EXISTS flavor_id text`,
  `ALTER TABLE public.production_batches DROP CONSTRAINT IF EXISTS production_batches_pkey`,
  `ALTER TABLE public.production_batches ADD CONSTRAINT production_batches_pkey PRIMARY KEY (id)`,
  `ALTER TABLE public.production_batches DROP CONSTRAINT IF EXISTS production_batches_batch_flavor_unique`,
  `ALTER TABLE public.production_batches ADD CONSTRAINT production_batches_batch_flavor_unique UNIQUE (batch_code, flavor_id)`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_batches_flavor_id_fkey') THEN ALTER TABLE public.production_batches ADD CONSTRAINT production_batches_flavor_id_fkey FOREIGN KEY (flavor_id) REFERENCES public.flavor_definitions(id); END IF; END $$`,
  `ALTER TABLE public.packing_sessions ADD COLUMN IF NOT EXISTS flavor_id text`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'packing_sessions_flavor_id_fkey') THEN ALTER TABLE public.packing_sessions ADD CONSTRAINT packing_sessions_flavor_id_fkey FOREIGN KEY (flavor_id) REFERENCES public.flavor_definitions(id); END IF; END $$`,
];

async function runSQL(sql) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  return { status: resp.status, body: await resp.text() };
}

// Try using the pg_net or direct SQL approach
async function tryDirectSQL() {
  // Supabase exposes a /pg endpoint for direct SQL in some configurations
  for (let i = 0; i < statements.length; i++) {
    const sql = statements[i];
    console.log(`\n[${i+1}/${statements.length}] Executing: ${sql.substring(0, 80)}...`);
    
    // Try the dashboard API endpoint  
    const resp = await fetch(`${SUPABASE_URL}/pg/query`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    });
    
    if (resp.ok) {
      console.log(`  ✅ Success`);
    } else {
      const text = await resp.text();
      console.log(`  ❌ Status ${resp.status}: ${text.substring(0, 200)}`);
    }
  }
}

tryDirectSQL().then(() => {
  console.log('\nMigration script finished.');
}).catch(err => {
  console.error('Migration failed:', err.message);
});
