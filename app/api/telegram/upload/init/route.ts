import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST() {
  // Generate a server-side fileId to be used for chunk encryption and grouping
  const fileId = crypto.randomUUID();
  return NextResponse.json({ fileId });
}