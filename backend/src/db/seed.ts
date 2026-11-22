import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function runSeed() {
  const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[Error] POSTGRES_URL or DATABASE_URL environment variable is missing.');
    process.exit(1);
  }

  console.log('[Seed] Seeding database...');
  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
  });

  try {
    const sqlPath = path.join(__dirname, 'seed.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await pool.query(sql);
    console.log('[Seed] Initial data populated successfully.');
  } catch (err: any) {
    console.error('[Seed Error]', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runSeed();
