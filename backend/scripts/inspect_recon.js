const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function run() {
    const sl = await pool.query("SELECT id, name, phone, email, status, notes FROM sales_leads WHERE name ILIKE '%recon%'");
    console.log('=== SALES_LEADS ===\n', JSON.stringify(sl.rows, null, 2));

    const sub = await pool.query("SELECT id, payload->>'businessName' as bname, payload->>'phone' as phone, payload->>'email' as email FROM submissions WHERE payload->>'businessName' ILIKE '%recon%'");
    console.log('=== SUBMISSIONS ===\n', JSON.stringify(sub.rows, null, 2));

    const tasks = await pool.query("SELECT id, lead_id, title, status, notes FROM lead_tasks WHERE title ILIKE '%recon%' OR notes ILIKE '%recon%'");
    console.log('=== LEAD_TASKS ===\n', JSON.stringify(tasks.rows, null, 2));

    const acts = await pool.query("SELECT id, lead_id, author_name, activity_type, disposition, note, created_at FROM lead_activities ORDER BY created_at DESC LIMIT 20");
    console.log('=== LEAD_ACTIVITIES (latest 20) ===\n', JSON.stringify(acts.rows, null, 2));

    await pool.end();
}

run().catch(console.error);
