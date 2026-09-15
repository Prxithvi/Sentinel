import { NextRequest, NextResponse } from 'next/server';
import { login } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
  }
  const result = await login(email, password);
  if (!result) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }
  const res = NextResponse.json({ token: result.token, user: result.user });
  res.cookies.set('mplad_token', result.token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 8,
    path: '/',
  });
  return res;
}
