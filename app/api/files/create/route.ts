import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      type,
      size,
      userId,
      folderId,
      telegramStorageId,
      telegramChunks,
      totalChunks,
    } = body;

    // Some browsers provide an empty string for unknown MIME types (e.g., .psd).
    const safeType = typeof type === 'string' && type.trim() !== '' ? type : 'application/octet-stream';

    if (!name || !size || !userId || !telegramStorageId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const result = await convex.mutation(api.files.createFile, {
      name,
      type: safeType,
      size,
      userId,
      folderId: folderId || undefined,
      telegramStorageId,
      telegramChunks,
      totalChunks,
    });

    return NextResponse.json({ success: true, fileId: result });
  } catch (error) {
    console.error('Error creating file:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create file' },
      { status: 500 }
    );
  }
}