import { NextRequest, NextResponse } from 'next/server';
import { telegramStorage } from '@/lib/telegram';

// Direct image upload to Telegram, single request
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const userId = formData.get('userId');
    const folderId = formData.get('folderId');

    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Send to Telegram directly (no chunk split on client), but still chunked server-side if needed
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    const filename = (file as File).name || 'image.jpg';

    const { telegramStorageId, chunks, totalChunks } = await telegramStorage.uploadFile(fileBuffer, filename, { signal: request.signal });

    return NextResponse.json({
      success: true,
      telegramStorageId,
      chunks,
      totalChunks,
    });
  } catch (error) {
    console.error('Image upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}