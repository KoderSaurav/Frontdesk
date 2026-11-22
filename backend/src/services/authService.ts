import crypto from 'crypto';
import { getPool, inMemoryStore } from '../db';
import { AuthTokenPayload, User } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'frontdesk-secure-secret-key-2026';
const TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * Generates a salted PBKDF2/scrypt password hash.
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Validates a plaintext password against a stored salt:hash string.
 */
export function verifyPassword(password: string, storedHash?: string): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, key] = storedHash.split(':');
  const keyBuffer = Buffer.from(key, 'hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(keyBuffer, derivedKey);
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Signs an RFC 7519 HMAC-SHA256 JWT without external dependencies.
 */
export function signToken(payload: AuthTokenPayload): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS;
  const fullPayload = { ...payload, exp };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Cryptographically verifies and decodes a JWT.
 */
export function verifyToken(token: string): AuthTokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSignature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  if (signature !== expectedSignature) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired token
    }
    return {
      userId: payload.userId,
      name: payload.name,
      email: payload.email,
      role: payload.role,
      title: payload.title,
    };
  } catch {
    return null;
  }
}

/**
 * Looks up user by email.
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const cleanEmail = email.trim().toLowerCase();
  const pool = getPool();
  if (pool) {
    const res = await pool.query('SELECT * FROM users WHERE LOWER(email) = $1', [cleanEmail]);
    return res.rows[0] || null;
  }
  return inMemoryStore.users.find((u) => u.email.toLowerCase() === cleanEmail) || null;
}

/**
 * Looks up user by ID.
 */
export async function getUserById(id: number): Promise<User | null> {
  const pool = getPool();
  if (pool) {
    const res = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return res.rows[0] || null;
  }
  return inMemoryStore.users.find((u) => u.id === id) || null;
}

/**
 * Strips password hash before returning user object to client.
 */
export function sanitizeUser(user: User): Omit<User, 'password_hash'> {
  const { password_hash, ...sanitized } = user;
  return sanitized;
}

/**
 * Customer Registration with email, password, and name.
 */
export async function registerCustomer({
  name,
  email,
  password,
}: {
  name: string;
  email: string;
  password: string;
}): Promise<{ user: Omit<User, 'password_hash'>; token: string }> {
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    const error: any = new Error('Name is required and must be at least 2 characters.');
    error.status = 400;
    throw error;
  }

  const cleanEmail = email ? email.trim().toLowerCase() : '';
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!cleanEmail || !emailRegex.test(cleanEmail)) {
    const error: any = new Error('A valid email address is required.');
    error.status = 400;
    throw error;
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    const error: any = new Error('Password is required and must be at least 6 characters.');
    error.status = 400;
    throw error;
  }

  // Check if email already registered
  const existing = await getUserByEmail(cleanEmail);
  if (existing) {
    const error: any = new Error('An account with this email address already exists. Please log in.');
    error.status = 409;
    throw error;
  }

  const passwordHash = hashPassword(password);
  const nowIso = new Date().toISOString();
  const pool = getPool();
  let newUser: User;

  if (pool) {
    const res = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, title, created_at)
       VALUES ($1, $2, $3, 'CUSTOMER', 'Customer', $4)
       RETURNING *`,
      [name.trim(), cleanEmail, passwordHash, nowIso]
    );
    newUser = res.rows[0];
  } else {
    newUser = {
      id: inMemoryStore.nextId.users++,
      name: name.trim(),
      email: cleanEmail,
      password_hash: passwordHash,
      role: 'CUSTOMER',
      title: 'Customer',
      created_at: nowIso,
    };
    inMemoryStore.users.push(newUser);
  }

  const tokenPayload: AuthTokenPayload = {
    userId: newUser.id,
    name: newUser.name,
    email: newUser.email,
    role: newUser.role,
    title: newUser.title,
  };

  const token = signToken(tokenPayload);
  return { user: sanitizeUser(newUser), token };
}

/**
 * Customer Login with email and password.
 */
export async function loginCustomer({
  email,
  password,
}: {
  email: string;
  password: string;
}): Promise<{ user: Omit<User, 'password_hash'>; token: string }> {
  if (!email || !password) {
    const error: any = new Error('Email and password are required.');
    error.status = 400;
    throw error;
  }

  const cleanEmail = email.trim().toLowerCase();
  const user = await getUserByEmail(cleanEmail);

  if (!user || user.role !== 'CUSTOMER') {
    const error: any = new Error('Invalid email or password.');
    error.status = 401;
    throw error;
  }

  const isValid = verifyPassword(password, user.password_hash);
  if (!isValid) {
    const error: any = new Error('Invalid email or password.');
    error.status = 401;
    throw error;
  }

  const tokenPayload: AuthTokenPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    title: user.title,
  };

  const token = signToken(tokenPayload);
  return { user: sanitizeUser(user), token };
}

/**
 * Support Agent Login with email and password.
 */
export async function loginAgent({
  email,
  password,
}: {
  email: string;
  password: string;
}): Promise<{ user: Omit<User, 'password_hash'>; token: string }> {
  if (!email || !password) {
    const error: any = new Error('Email and password are required.');
    error.status = 400;
    throw error;
  }

  const cleanEmail = email.trim().toLowerCase();
  const user = await getUserByEmail(cleanEmail);

  if (!user || (user.role !== 'AGENT' && user.role !== 'ADMIN')) {
    const error: any = new Error('Invalid agent credentials.');
    error.status = 401;
    throw error;
  }

  const isValid = verifyPassword(password, user.password_hash);
  if (!isValid) {
    const error: any = new Error('Invalid agent credentials.');
    error.status = 401;
    throw error;
  }

  const tokenPayload: AuthTokenPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    title: user.title,
  };

  const token = signToken(tokenPayload);
  return { user: sanitizeUser(user), token };
}
