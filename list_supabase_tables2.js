const SUPABASE_URL = 'https://hafaxgyaxmypmmpbemos.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhZmF4Z3lheG15cG1tcGJlbW9zIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzczNzg2MSwiZXhwIjoyMDg5MzEzODYxfQ.UgeoC-t_KvjzVMq-wsMfbg-WHqLIzuxO9YLov9o4q6c';

async function getOpenAPI() {
  console.log('Fetching OpenAPI definitions from', SUPABASE_URL);
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  });
  if (!resp.ok) {
    console.log('Error:', resp.status, await resp.text());
    return;
  }
  const data = await resp.json();
  const tables = Object.keys(data.paths || {})
    .filter(p => p.startsWith('/') && !p.includes('{'))
    .map(p => p.substring(1));
  console.log('Available paths:', tables);
}

getOpenAPI();
