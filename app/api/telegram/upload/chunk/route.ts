import { NextRequest, NextResponse } from 'next/server';
import { telegramStorage, CHUNK_SIZE } from '@/lib/telegram';

// interface ChunkPayload {
//   fileId: string;
//   chunkIndex: number;
//   totalChunks: number;
//   filename: string;
// }

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const fileId = formData.get('fileId');
    const chunkIndex = formData.get('chunkIndex');
    const totalChunks = formData.get('totalChunks');
    const filename = formData.get('filename');
    const blob = formData.get('chunk');

    if (
      typeof fileId !== 'string' ||
      typeof chunkIndex !== 'string' ||
      typeof totalChunks !== 'string' ||
      typeof filename !== 'string' ||
      !(blob instanceof Blob)
    ) {
      return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
    }

    const chunkBuffer = Buffer.from(await blob.arrayBuffer());

    if (chunkBuffer.byteLength > CHUNK_SIZE) {
      return NextResponse.json({ error: 'Chunk too large' }, { status: 400 });
    }

    const chunkInfo = await telegramStorage.uploadChunk({
      fileId,
      chunkIndex: Number(chunkIndex),
      chunk: chunkBuffer,
      filename,
    });

    return NextResponse.json({ success: true, chunk: chunkInfo });
  } catch (error) {
    console.error('Telegram chunk upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Chunk upload failed' },
      { status: 500 }
    );
  }
}