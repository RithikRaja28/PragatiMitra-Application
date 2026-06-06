"use strict";
/* READ-ONLY diagnostic — why "No active schema found for this form."
   Run:  node _inspect_schemas.js
   Lists every institution form and whether it has an ACTIVE schema row for the
   institutions that can access it. Delete this file after use. */
require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT) || 5432,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

(async () => {
  try {
    const { rows: forms } = await pool.query(
      `SELECT tl.form_name, tl.share_table,
              COALESCE(tl.institute_access, '{}') AS institute_access
         FROM table_list tl ORDER BY tl.form_name`
    );
    console.log(`\n=== ${forms.length} form(s) in table_list ===\n`);

    for (const f of forms) {
      const access = f.institute_access || [];
      const { rows: sch } = await pool.query(
        `SELECT institution_id, year, is_active
           FROM custom_field_schemas WHERE form_name = $1`,
        [f.form_name]
      );
      const activeByInst = new Set(sch.filter((s) => s.is_active).map((s) => String(s.institution_id)));

      console.log(`• ${f.form_name}${f.share_table ? "  [shared]" : ""}`);
      console.log(`    institute_access: ${access.length} institution(s)`);
      console.log(`    schema rows: ${sch.length} total, ${[...activeByInst].length} institution(s) with an ACTIVE schema`);

      const missing = access.map(String).filter((id) => !activeByInst.has(id));
      if (missing.length) {
        console.log(`    ⚠️  ${missing.length} institution(s) can access this form but have NO active schema → "No active schema found":`);
        missing.forEach((id) => console.log(`         - institution_id ${id}`));
      }
      console.log("");
    }

    // Distinct institution_ids that actually OWN schemas
    const { rows: schemaInsts } = await pool.query(
      `SELECT DISTINCT institution_id FROM custom_field_schemas WHERE is_active = true`
    );
    console.log("=== institution_ids that OWN an active schema ===");
    schemaInsts.forEach((r) => console.log(`   ${r.institution_id}`));

    // Each active user's institution_id — compare against the list above.
    const { rows: users } = await pool.query(
      `SELECT id, full_name, email, institution_id, department_id
         FROM users WHERE account_status = 'ACTIVE'
        ORDER BY institution_id, full_name LIMIT 40`
    ).catch(() => ({ rows: [] }));
    if (users.length) {
      console.log("\n=== active users (does your test login's institution_id appear in the list above?) ===");
      for (const u of users) console.log(`   ${u.full_name} <${u.email}> · inst=${u.institution_id} · dept=${u.department_id}`);
    }
  } catch (e) {
    console.error("inspect failed:", e.message);
  } finally {
    await pool.end();
  }
})();
