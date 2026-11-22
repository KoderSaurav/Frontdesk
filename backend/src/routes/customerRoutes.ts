import { Router, Request, Response } from 'express';
import {
  addMessage,
  createTicket,
  customerReopenTicket,
  exportTicket,
  getTicketById,
  listTickets,
} from '../services/ticketService';
import { requireCustomer, requireCustomerOwnership } from '../middleware/auth';

const router = Router();

// List tickets submitted by the authenticated customer
router.get('/my-tickets', requireCustomer, async (req: Request, res: Response) => {
  try {
    const customerEmail = req.user!.email;
    const tickets = await listTickets({ customerEmail });
    res.json({
      success: true,
      data: tickets,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Customer ticket submission
router.post('/tickets', async (req: Request, res: Response) => {
  try {
    const { customerName, customerEmail, subject, description, priority, status } = req.body;

    // If customer is authenticated, enforce identity from verified session token
    const effectiveName = req.user?.role === 'CUSTOMER' ? req.user.name : customerName;
    const effectiveEmail = req.user?.role === 'CUSTOMER' ? req.user.email : customerEmail;
    const customerId = req.user?.role === 'CUSTOMER' ? req.user.userId : null;

    const ticket = await createTicket({
      customerId,
      customerName: effectiveName,
      customerEmail: effectiveEmail,
      subject,
      description,
      priority,
      status,
    });

    res.status(201).json({
      success: true,
      message: 'Support ticket submitted.',
      data: {
        ticketNumber: ticket.ticket_number,
        subject: ticket.subject,
        status: ticket.status,
        createdAt: ticket.created_at,
      },
    });
  } catch (err: any) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ success: false, error: err.message });
  }
});

// Customer ticket status view (IDOR protected: only owner can view; internal staff notes are strictly excluded)
router.get('/tickets/:ticketNumber', requireCustomerOwnership, async (req: Request, res: Response) => {
  try {
    const result = await getTicketById(req.params.ticketNumber, false);
    if (!result) {
      return res.status(404).json({ success: false, error: 'Ticket not found.' });
    }

    const { ticket, messages } = result;

    const sanitizedMessages = messages
      .filter((m) => !m.is_internal)
      .map((m) => ({
        id: m.id,
        senderName: m.sender_name,
        senderRole: m.sender_role,
        content: m.content,
        createdAt: m.created_at,
      }));

    const sanitizedTicket = {
      ticketNumber: ticket.ticket_number,
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.created_at,
      updatedAt: ticket.updated_at,
      resolvedAt: ticket.resolved_at,
    };

    res.json({
      success: true,
      data: {
        ticket: sanitizedTicket,
        conversation: sanitizedMessages,
      },
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// Customer export endpoint (MSG-11: IDOR protected, internal notes strictly excluded)
router.get('/tickets/:ticketNumber/export', requireCustomerOwnership, async (req: Request, res: Response) => {
  try {
    const exported = await exportTicket(req.params.ticketNumber, false);
    if (!exported) {
      return res.status(404).json({ success: false, error: 'Ticket not found.' });
    }
    res.json({ success: true, data: exported });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// Customer reply to existing ticket (IDOR protected)
router.post('/tickets/:ticketNumber/reply', requireCustomerOwnership, async (req: Request, res: Response) => {
  try {
    const { content, customerName } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, error: 'Reply content is required.' });
    }

    const result = await getTicketById(req.params.ticketNumber, false);
    if (!result) {
      return res.status(404).json({ success: false, error: 'Ticket not found.' });
    }

    const effectiveSenderName = req.user?.role === 'CUSTOMER' ? req.user.name : (customerName || result.ticket.customer_name);
    const effectiveSenderId = req.user?.role === 'CUSTOMER' ? req.user.userId : result.ticket.customer_id;

    const message = await addMessage({
      ticketId: result.ticket.id,
      senderId: effectiveSenderId,
      senderName: effectiveSenderName,
      senderRole: 'CUSTOMER',
      isInternal: false,
      content: content.trim(),
    });

    res.json({
      success: true,
      message: 'Reply sent successfully.',
      data: {
        id: message.id,
        content: message.content,
        createdAt: message.created_at,
      },
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// Reopen a resolved ticket within allowed window (IDOR protected)
router.post('/tickets/:ticketNumber/reopen', requireCustomerOwnership, async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, error: 'Please provide a reason for reopening.' });
    }

    const updated = await customerReopenTicket({
      ticketNumber: req.params.ticketNumber,
      reason: reason.trim(),
    });

    res.json({
      success: true,
      message: 'Ticket reopened successfully.',
      data: {
        ticketNumber: updated.ticket_number,
        status: updated.status,
      },
    });
  } catch (err: any) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({
      success: false,
      error: err.message,
    });
  }
});

// Explicitly deny agent-only actions on customer route (NEG-13)
router.all('/tickets/:ticketNumber/assign', (req: Request, res: Response) => {
  res.status(403).json({ success: false, error: 'Access denied: Customer cannot assign tickets.' });
});
router.all('/tickets/:ticketNumber/priority', (req: Request, res: Response) => {
  res.status(403).json({ success: false, error: 'Access denied: Customer cannot modify ticket priority.' });
});
router.all('/tickets/:ticketNumber/release', (req: Request, res: Response) => {
  res.status(403).json({ success: false, error: 'Access denied: Customer cannot release tickets.' });
});
router.all('/tickets/:ticketNumber/audit-trail', (req: Request, res: Response) => {
  res.status(403).json({ success: false, error: 'Access denied: Customer cannot view internal audit trail.' });
});

export default router;
