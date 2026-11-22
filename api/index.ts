import app from '../backend/src/server';
import { initDatabase } from '../backend/src/db';

let initialized = false;

export default async function handler(req: any, res: any) {
  if (!initialized) {
    await initDatabase();
    initialized = true;
  }
  return app(req, res);
}
