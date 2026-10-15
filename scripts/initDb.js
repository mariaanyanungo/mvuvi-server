








require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db/pool');

(async () => {
  if (!db.enabled()) {
    console.error('Set DATABASE_URL in .env first.');
    process.exit(1);
  }
  const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');
  await db.query(sql);
  console.log('Schema ready.');
  await db.close();
})().catch((err) => {
  console.error('Schema setup failed:', err.message);
  process.exit(1);
});
