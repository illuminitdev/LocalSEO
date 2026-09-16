import dotenv from 'dotenv';
dotenv.config({ override: true });
import { query } from '../lib/db';

async function main() {
    console.log('Checking leads in database...');
    const countBefore = await query(`SELECT count(*) as count FROM sales_leads WHERE source = 'excel_import' OR source ILIKE '%excel%'`);
    console.log('Found excel leads count:', countBefore.rows[0].count);

    // Delete activities associated with these leads
    const deleteActivities = await query(`
        DELETE FROM lead_activities 
        WHERE lead_id IN (
            SELECT id::text FROM sales_leads WHERE source = 'excel_import' OR source ILIKE '%excel%'
        )
    `);
    console.log('Deleted related activities count:', deleteActivities.rowCount || 0);

    // Delete tasks associated with these leads
    const deleteTasks = await query(`
        DELETE FROM lead_tasks 
        WHERE lead_id IN (
            SELECT id::text FROM sales_leads WHERE source = 'excel_import' OR source ILIKE '%excel%'
        )
    `);
    console.log('Deleted related tasks count:', deleteTasks.rowCount || 0);

    // Delete the sales leads
    const deleteLeads = await query(`
        DELETE FROM sales_leads 
        WHERE source = 'excel_import' OR source ILIKE '%excel%'
        RETURNING id
    `);
    console.log('Successfully deleted excel leads count:', deleteLeads.rows.length);

    process.exit(0);
}

main().catch((err) => {
    console.error('Failed to delete excel leads:', err);
    process.exit(1);
});
