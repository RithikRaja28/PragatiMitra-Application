const { Pool } = require('pg');
const p = new Pool({
  user: 'postgres', host: 'localhost', database: 'PragatiMitra', password: 'krish@1may', port: 5432
});

p.query("SELECT proname, pg_get_function_arguments(oid) FROM pg_proc WHERE proname = 'stamp_template_to_report'")
  .then(r => console.table(r.rows))
  .catch(e => console.error(e))
  .finally(() => p.end());
