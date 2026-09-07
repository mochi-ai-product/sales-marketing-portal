import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({ status: 'ok', portal: 'sales-marketing', time: new Date().toISOString() });
}
