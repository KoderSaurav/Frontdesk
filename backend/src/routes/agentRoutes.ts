import { Router, Request, Response } from 'express';
import {
  atomicAssignTicket,
  createTicket,
  getAllAgents,
  getHolidays,
  getTicketById,
  listTickets,
  updateTicketPriority,
  updateTicketStatus,
  addMessage,
  checkAndAutoCloseInactiveTickets,
  reassignTicket,
  releaseTicket,
  exportTicket,
} from '../services/ticketService';
import { getAuditLogsForTicket } from '../services/auditService';
import { requireAgent } from '../middleware/auth';

const router = Router();

// Apply RBAC: Support Agent access only (blocks customers with 403)
router.use(requireAgent);

function getAgentContext(req: Request) {
  const agentIdHeader = req.headers['x-agent-id'];
  if (agentIdHeader) {
    return { agentId: Number(agentIdHeader) };
  }
  if (req.user && (req.user.role === 'AGENT' || req.user.role === 'ADMIN')) {
    return { agentId: req.user.userId };
  }
  return { agentId: 1 };
}

// Get support agent team members
router.get('/agents', async (req: Request, res: Response) => {
  try {
    const agents = await getAllAgents();
    res.json({ success: true, data: agents });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// List tickets with optional status, priority, and assigned filters
router.get('/tickets', async (req: Request, res: Response) => {
  try {
    const { status, priority, assignedTo, search } = req.query;
    const tickets = await listTickets({
      status: status as string,
      priority: priority as string,
      assignedTo: assignedTo ? Number(assignedTo) : undefined,
      search: search as string,
    });
    res.json({ success: true, data: tickets });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get ticket details and conversation thread
router.get('/tickets/:id', async (req: Request, res: Response) => {
  try {
    const result = await getTicketById(req.params.id, true);
    if (!result) {
      return res.status(404).json({ success: false, error: 'Ticket not found.' });
    }
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Atomic ticket assignment
router.post('/tickets/:id/assign', async (req: Request, res: Response) => {
  try {
    const { agentId } = getAgentContext(req);
    const targetAgentId = req.body.agentId ? Number(req.body.agentId) : agentId;
    const ticketId = Number(req.params.id);

    const updated = await atomicAssignTicket(ticketId, targetAgentId);
    res.json({
      success: true,
      message: 'Ticket assigned successfully.',
      data: updated,
    });
  } catch (err: any) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({
      success: false,
      error: err.message,
      code: statusCode === 409 ? 'ASSIGNMENT_CONFLICT' : 'ASSIGN_ERROR',
    });
  }
});

// Reassign ticket to another agent (AS-06)
router.post('/tickets/:id/reassign', async (req: Request, res: Response) => {
  try {
    const { agentId } = getAgentContext(req);
    const { newAgentId } = req.body;
    if (!newAgentId) {
      return res.status(400).json({ success: false, error: 'newAgentId is required.' });
    }

    const updated = await reassignTicket(Number(req.params.id), Number(newAgentId), agentId);
    res.json({
      success: true,
      message: 'Ticket reassigned successfully.',
      data: updated,
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// Release ticket back to unassigned queue (AS-04, AS-05)
router.post('/tickets/:id/release', async (req: Request, res: Response) => {
  try {
    const { agentId } = getAgentContext(req);
    const updated = await releaseTicket(Number(req.params.id), agentId);
    res.json({
      success: true,
      message: 'Ticket released back to unassigned queue.',
      data: updated,
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// Post customer reply or internal team note
router.post('/tickets/:id/messages', async (req: Request, res: Response) => {
  try {
    const { agentId } = getAgentContext(req);
    const agents = await getAllAgents();
    const currentAgent = agents.find((a) => a.id === agentId);
    const agentName = currentAgent ? currentAgent.name : `Agent #${agentId}`;

    const { isInternal, content } = req.body;
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ success: false, error: 'Message content is required.' });
    }

    const message = await addMessage({
      ticketId: Number(req.params.id),
      senderId: agentId,
      senderName: agentName,
      senderRole: 'AGENT',
      isInternal: Boolean(isInternal),
      content: content.trim(),
    });

    res.json({ success: true, data: message });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// Update ticket status
router.patch('/tickets/:id/status', async (req: Request, res: Response) => {
  try {
    const { agentId } = getAgentContext(req);
    const agents = await getAllAgents();
    const currentAgent = agents.find((a) => a.id === agentId);
    const agentName = currentAgent ? currentAgent.name : `Agent #${agentId}`;

    const { status } = req.body;
    if (!['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status.' });
    }

    const updated = await updateTicketStatus({
      ticketId: Number(req.params.id),
      newStatus: status,
      actorId: agentId,
      actorName: agentName,
      actorRole: 'AGENT',
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// Update priority and recalculate SLA deadlines
router.patch('/tickets/:id/priority', async (req: Request, res: Response) => {
  try {
    const { agentId } = getAgentContext(req);
    const agents = await getAllAgents();
    const currentAgent = agents.find((a) => a.id === agentId);
    const agentName = currentAgent ? currentAgent.name : `Agent #${agentId}`;

    const { priority } = req.body;
    if (!['URGENT', 'MEDIUM', 'LOW'].includes(priority)) {
      return res.status(400).json({ success: false, error: 'Invalid priority.' });
    }

    const updated = await updateTicketPriority({
      ticketId: Number(req.params.id),
      newPriority: priority,
      actorId: agentId,
      actorName: agentName,
      actorRole: 'AGENT',
    });

    res.json({
      success: true,
      message: 'Priority updated and SLA deadline recalculated.',
      data: updated,
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// Fetch ticket audit trail
router.get('/tickets/:id/audit-trail', async (req: Request, res: Response) => {
  try {
    const logs = await getAuditLogsForTicket(Number(req.params.id));
    res.json({ success: true, data: logs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Export ticket data for internal agents (MSG-11)
router.get('/tickets/:id/export', async (req: Request, res: Response) => {
  try {
    const exported = await exportTicket(req.params.id, true);
    if (!exported) return res.status(404).json({ success: false, error: 'Ticket not found.' });
    res.json({ success: true, data: exported });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Holiday schedule
router.get('/holidays', async (req: Request, res: Response) => {
  try {
    const holidays = await getHolidays();
    res.json({ success: true, data: holidays });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Scheduled maintenance trigger for inactive customer tickets
router.post('/auto-close-check', async (req: Request, res: Response) => {
  try {
    const count = await checkAndAutoCloseInactiveTickets();
    res.json({
      success: true,
      message: `Checked inactive tickets. Closed ${count} tickets exceeding 1 working week without customer response.`,
      closedCount: count,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
