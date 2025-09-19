import { NextRequest, NextResponse } from 'next/server';
import { telegramStorage, TelegramChunk } from '@/lib/telegram';

export async function POST(request: NextRequest) {
  try {
    const { fileId, userId, chunks } = await request.json();

    if (!fileId || !chunks || !Array.isArray(chunks)) {
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 });
    }

    // Convert chunks to TelegramChunk format
    const telegramChunks: TelegramChunk[] = chunks.map((chunk: any) => ({
      chunkId: chunk.chunkId,
      chunkIndex: chunk.chunkIndex,
      messageId: chunk.messageId,
      encryptedHash: chunk.encryptedHash,
      fileId: chunk.fileId,
    }));

    const completeFile = await telegramStorage.downloadFileByChunks(fileId, telegramChunks);

    // Return the file as a blob
    return new NextResponse(new Uint8Array(completeFile), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment',
      },
    });

  } catch (error) {
    console.error('Telegram download error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Download failed' },
      { status: 500 }
    );
  }
}