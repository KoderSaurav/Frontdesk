import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDatabase } from './db';
import authRoutes from './routes/authRoutes';
import agentRoutes from './routes/agentRoutes';
import customerRoutes from './routes/customerRoutes';
import { authenticate } from './middleware/auth';
import { checkAndAutoCloseInactiveTickets } from './services/ticketService';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(authenticate);

// Root redirect for browser visitors to Frontend UI
app.get('/', (req: Request, res: Response) => {
  if (req.accepts('html')) {
    return res.redirect('http://localhost:5173');
  }
  res.json({
    service: 'Frontdesk Support API',
    company: 'Arvo Systems',
    status: 'healthy',
    documentation: {
      health: '/api/health',
      agent: '/api/v1/agent/*',
      customer: '/api/v1/customer/*',
      auth: '/api/v1/auth/*',
    },
    frontend: 'http://localhost:5173',
  });
});

// Healthcheck & System Status
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'Frontdesk Support API',
    company: 'Arvo Systems',
    timestamp: new Date().toISOString(),
  });
});

// Mounted Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/agent', agentRoutes);
app.use('/api/v1/customer', customerRoutes);

// Global Error & Malformed Payload Handling (NEG-01, NEG-02)
app.use((err: any, req: Request, res: Response, next: any) => {
  if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400 && 'body' in err) {
    return res.status(400).json({ success: false, error: 'Malformed JSON payload.' });
  }
  const statusCode = err.status || 500;
  return res.status(statusCode).json({
    success: false,
    error: err.message || 'An unexpected internal error occurred.',
  });
});

// Periodic Worker: Evaluates tickets waiting on customer > 1 working week
const AUTO_CLOSE_INTERVAL_MS = 15 * 60 * 1000; // Every 15 minutes
setInterval(async () => {
  try {
    const closed = await checkAndAutoCloseInactiveTickets();
    if (closed > 0) {
      console.log(`[AutoClose Worker] Automatically closed ${closed} inactive customer tickets.`);
    }
  } catch (err: any) {
    console.error('[AutoClose Worker] Error running auto-close check:', err.message);
  }
}, AUTO_CLOSE_INTERVAL_MS);

async function startServer() {
  const { isPostgres } = await initDatabase();
  app.listen(PORT, () => {
    console.log(`[Server] Frontdesk service listening on port ${PORT}`);
    console.log(`[Server] Database mode: ${isPostgres ? 'PostgreSQL' : 'In-Memory (Development)'}`);
    console.log(`[Server] Operating hours: Mon-Fri 09:30 - 18:30`);
  });
}

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  startServer().catch((err) => {
    console.error('Fatal server startup error:', err);
  });
}

export { app, startServer };
export default app;
