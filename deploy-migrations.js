const fs = require('fs');
const path = require('path');

// Read all 4 migration files
const migrations = [
  '005_geofence_events.sql',
  '006_pod_tables.sql',
  '007_eta_fields.sql',
  '008_rbac_permissions.sql'
];

const migrationDir = path.join(__dirname, 'supabase', 'migrations');

console.log('📋 Migration Files to Deploy:\n');

migrations.forEach((file, idx) => {
  const filepath = path.join(migrationDir, file);
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.split('\n').length;
  const size = (fs.statSync(filepath).size / 1024).toFixed(1);
  
  console.log(`${idx + 1}. ${file}`);
  console.log(`   📊 Lines: ${lines}, Size: ${size}KB`);
  console.log(`   Status: ✅ Ready to deploy\n`);
});

console.log('\n🔐 Attempting deployment...\n');

// Try to get Supabase credentials
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const urlMatch = envContent.match(/VITE_SUPABASE_URL=(.+)/);
const anonKeyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY=(.+)/);

if (!urlMatch || !anonKeyMatch) {
  console.error('❌ Missing Supabase credentials in .env');
  process.exit(1);
}

const supabaseUrl = urlMatch[1].trim();
const anonKey = anonKeyMatch[1].trim();

console.log(`✅ Found Supabase URL: ${supabaseUrl}`);
console.log(`✅ Found Anon Key: ${anonKey.substring(0, 20)}...`);

console.log(`\n⚠️  Note: Anon key doesn't have migration permissions.`);
console.log(`💡 Need one of these to proceed:\n`);
console.log(`   Option 1: Service Role Key (hidden in Supabase dashboard)`);
console.log(`   Option 2: Postgres password (for psql CLI)`);
console.log(`   Option 3: Manual deployment via Supabase SQL Editor`);
console.log(`\n📋 SQL files are prepared and ready to copy-paste at:`);
console.log(`   ${migrationDir}/\n`);

