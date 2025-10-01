import { NextRequest, NextResponse } from 'next/server';
import { telegramStorage } from '@/lib/telegram';

// Backward-compatible: accepts full file upload but will process in chunks server-side
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const filename = typeof formData.get('filename') === 'string' ? String(formData.get('filename')) : undefined;

    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    const name = filename || (file instanceof File ? file.name : 'upload.bin');

    // Will perform chunked upload server-side (still returns all chunks at once)
    const result = await telegramStorage.uploadFile(fileBuffer, name, { signal: request.signal });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Telegram upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}