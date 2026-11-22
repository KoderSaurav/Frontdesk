import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function runMigration() {
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[Error] POSTGRES_URL or DATABASE_URL environment variable is missing.');
    process.exit(1);
  }

  console.log('[Migration] Applying schema definitions...');
  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
  });

  try {
    const sqlPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await pool.query(sql);
    console.log('[Migration] Database schema applied successfully.');
  } catch (err: any) {
    console.error('[Migration Error]', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
