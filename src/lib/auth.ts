// Auth — simple session-token auth (JWT-like) with role-based access control
import { db } from './db';
import crypto from 'crypto';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'analyst' | 'auditor' | 'citizen';
}

export function hashPassword(s: string): string {
  return 'h' + crypto.createHash('sha256').update(s).digest('hex');
}

export async function login(email: string, password: string): Promise<{ token: string; user: AuthUser } | null> {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return null;
  if (user.password !== hashPassword(password)) return null;
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 8); // 8h
  await db.session.create({
    data: {
      userId: user.id,
      token,
      expiresAt,
    },
  });
  return {
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role as AuthUser['role'] },
  };
}

export async function getUserFromToken(token: string | null | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const session = await db.session.findUnique({ where: { token }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt < new Date()) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role as AuthUser['role'],
  };
}

export async function logout(token: string): Promise<void> {
  await db.session.deleteMany({ where: { token } });
}

// PII Masking — applies by default to all API responses; only admin sees full values
export function maskPAN(pan: string): string {
  if (!pan || pan.length < 8) return pan;
  return pan.substring(0, 3) + 'XXXXX' + pan.substring(8);
}

export function maskBank(acc: string): string {
  if (!acc || acc.length < 6) return acc;
  return 'XXXXXX' + acc.substring(acc.length - 4);
}

export function maskGST(gst: string | null): string | null {
  if (!gst || gst.length < 8) return gst;
  return gst.substring(0, 4) + 'XXXXXX' + gst.substring(gst.length - 3);
}

export function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  if (phone.length < 4) return phone;
  return phone.substring(0, 4) + 'XXXXXX' + phone.substring(phone.length - 2);
}

export function maskVendor<T extends { pan?: string; gst?: string | null; bankAccount?: string; phone?: string | null }>(v: T, isAdmin: boolean): T {
  if (isAdmin) return v;
  return {
    ...v,
    pan: v.pan ? maskPAN(v.pan) : v.pan,
    gst: v.gst ? maskGST(v.gst) : v.gst,
    bankAccount: v.bankAccount ? maskBank(v.bankAccount) : v.bankAccount,
    phone: v.phone ? maskPhone(v.phone) : v.phone,
  };
}

// Role check
export function canAccess(user: AuthUser | null, allowedRoles: AuthUser['role'][]): boolean {
  if (!user) return false;
  return allowedRoles.includes(user.role);
}

// For public endpoints — no auth required
export function isPublicEndpoint(): true {
  return true;
}
