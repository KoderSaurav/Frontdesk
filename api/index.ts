import app from '../backend/src/server';
import { initDatabase } from '../backend/src/db';

let initialized = false;

export default async function handler(req: any, res: any) {
  if (!initialized) {
    try {
      await initDatabase();
      initialized = true;
    } catch (err: any) {
      console.error('[Vercel Serverless] Database init warning:', err);
    }
  }
  return app(req, res);
}
