import { Router, Request, Response } from 'express';
import {
  loginAgent,
  loginCustomer,
  registerCustomer,
  getUserById,
  sanitizeUser,
} from '../services/authService';

const router = Router();

// Customer Registration
router.post('/customer/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;
    const result = await registerCustomer({ name, email, password });
    res.status(201).json({
      success: true,
      message: 'Customer account created successfully.',
      data: result,
    });
  } catch (err: any) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ success: false, error: err.message });
  }
});

// Customer Login
router.post('/customer/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const result = await loginCustomer({ email, password });
    res.json({
      success: true,
      message: 'Customer logged in successfully.',
      data: result,
    });
  } catch (err: any) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ success: false, error: err.message });
  }
});

// Support Agent Login
router.post('/agent/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const result = await loginAgent({ email, password });
    res.json({
      success: true,
      message: 'Agent logged in successfully.',
      data: result,
    });
  } catch (err: any) {
    const statusCode = err.status || 500;
    res.status(statusCode).json({ success: false, error: err.message });
  }
});

// Current Authenticated User Session
router.get('/me', async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Not authenticated.',
    });
  }

  const user = await getUserById(req.user.userId);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found.' });
  }

  res.json({
    success: true,
    data: {
      user: sanitizeUser(user),
    },
  });
});

export default router;
