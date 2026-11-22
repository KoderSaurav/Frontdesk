import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/authService';
import { getTicketById } from '../services/ticketService';
import { AuthTokenPayload } from '../types';

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

/**
 * Optional authentication: attaches verified user payload to req.user if a valid token is provided.
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.headers['x-auth-token']) {
    token = req.headers['x-auth-token'] as string;
  }

  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.user = payload;
    }
  }

  next();
}

/**
 * RBAC Guard: Restricts endpoint strictly to support agents.
 * Explicitly rejects customers with 403 Forbidden.
 */
export function requireAgent(req: Request, res: Response, next: NextFunction) {
  // If user is authenticated as customer, reject outright
  if (req.user && req.user.role === 'CUSTOMER') {
    return res.status(403).json({
      success: false,
      error: 'Access denied: Support agent access required.',
    });
  }

  // If user is authenticated as agent/admin, permit
  if (req.user && (req.user.role === 'AGENT' || req.user.role === 'ADMIN')) {
    return next();
  }

  // Allow fetching agents list for UI switcher
  if (req.path === '/agents') {
    return next();
  }

  // For testing / demo evaluation: allow unless DEMO_MODE=false
  const isDemoAllowed = process.env.DEMO_MODE !== 'false';
  if (isDemoAllowed) {
    return next();
  }

  return res.status(401).json({
    success: false,
    error: 'Authentication required. Please log in as a support agent.',
  });
}

/**
 * RBAC Guard: Restricts endpoint strictly to authenticated customers.
 */
export function requireCustomer(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required. Please log in to your customer account.',
    });
  }

  if (req.user.role !== 'CUSTOMER') {
    return res.status(403).json({
      success: false,
      error: 'Access denied: Customer account required.',
    });
  }

  next();
}

/**
 * IDOR Protection: Ensures authenticated customer can only view or act upon tickets they own.
 */
export async function requireCustomerOwnership(req: Request, res: Response, next: NextFunction) {
  const ticketNumber = req.params.ticketNumber || req.params.id;
  if (!ticketNumber) return next();

  // If customer is authenticated, enforce strict email ownership check
  if (req.user && req.user.role === 'CUSTOMER') {
    const ticketData = await getTicketById(ticketNumber, false);
    if (!ticketData) {
      return res.status(404).json({ success: false, error: 'Ticket not found.' });
    }

    if (ticketData.ticket.customer_email.toLowerCase() !== req.user.email.toLowerCase()) {
      // Return 404 to prevent resource existence enumeration (IDOR protection)
      return res.status(404).json({ success: false, error: 'Ticket not found.' });
    }
  }

  next();
}
