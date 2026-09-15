import { NextResponse } from 'next/server';
import { logout, getUserFromToken } from '@/lib/auth';
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  const token = req.cookies.get('mplad_token')?.value || req.headers.get('authorization')?.replace('Bearer ', '');
  if (token) await logout(token);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete('mplad_token');
  return res;
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get('mplad_token')?.value || req.headers.get('authorization')?.replace('Bearer ', '');
  const user = await getUserFromToken(token || null);
  return NextResponse.json({ user });
}
