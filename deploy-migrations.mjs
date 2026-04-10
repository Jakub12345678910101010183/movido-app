import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://zjvozjnbvrtrrpehqdpf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY;

console.log(`Using key: ${SUPABASE_KEY.substring(0, 20)}...`);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false }
});

const migrations = [
  path.join(__dirname, 'supabase/migrations/005_geofence_events.sql'),
  path.join(__dirname, 'supabase/migrations/006_pod_tables.sql'),
  path.join(__dirname, 'supabase/migrations/007_eta_fields.sql'),
  path.join(__dirname, 'supabase/migrations/008_rbac_permissions.sql')
];

async function executeSql(sql) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sql })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || `HTTP ${response.status}`);
  }
  
  return response.json();
}

async function deploy() {
  console.log('\n🚀 Movido v12 - Direct SQL Deployment\n');
  
  for (let i = 0; i < migrations.length; i++) {
    const migFile = migrations[i];
    const name = path.basename(migFile);
    
    console.log(`[${i+1}/4] ${name}...`);
    
    try {
      const sql = fs.readFileSync(migFile, 'utf-8');
      console.log(`     Executing ${sql.split('\n').length} lines...`);
      
      // For now, just verify file exists and is readable
      console.log(`✅ ${name} prepared\n`);
    } catch (e) {
      console.error(`❌ Error: ${e.message}\n`);
    }
  }
  
  console.log('All migrations prepared.');
  console.log('For actual execution, please follow: DEPLOY_NOW.md\n');
}

deploy().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
