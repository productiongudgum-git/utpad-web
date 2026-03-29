const SUPABASE_URL = 'https://hafaxgyaxmypmmpbemos.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhZmF4Z3lheG15cG1tcGJlbW9zIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzczNzg2MSwiZXhwIjoyMDg5MzEzODYxfQ.UgeoC-t_KvjzVMq-wsMfbg-WHqLIzuxO9YLov9o4q6c';

const tablesToCheck = [
  'gg_flavors', 'gg_recipes', 'gg_ingredients', 'gg_inventory', 'gg_inwarding', 'gg_users',
  'gg_production', 'gg_packing', 'gg_dispatch', 'gg_batches', 'gg_vendors', 'gg_vendor_ingredients',
  'production_batches', 'packing_sessions', 'dispatch_events', 'flavor_definitions', 'recipe_definitions'
];

async function checkTable(table) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  });
  const exists = resp.status !== 404;
  const count = exists ? (await resp.json()).length : 0;
  return { table, exists, status: resp.status, rows: count };
}

(async () => {
  console.log('Checking actual tables...\n');
  for (const t of tablesToCheck) {
    const r = await checkTable(t);
    const icon = r.exists ? '✅' : '❌';
    console.log(`${icon} ${t.padEnd(25)} status=${r.status}${r.exists ? ` (${r.rows} rows)` : ''}`);
  }
})();
