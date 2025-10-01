import { NextRequest, NextResponse } from 'next/server';
import { telegramStorage, TelegramChunk } from '@/lib/telegram';

export async function POST(request: NextRequest) {
  try {
    const { fileId, chunks } = await request.json() as {
      fileId: string;
      chunks: Array<Pick<TelegramChunk, 'chunkId' | 'chunkIndex' | 'messageId' | 'encryptedHash' | 'fileId'>>;
    };

    if (!fileId || !chunks || !Array.isArray(chunks)) {
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 });
    }

    let completeFile: Buffer;

    if (Array.isArray(chunks) && chunks.length > 0) {
      // Convert chunks to TelegramChunk format
      const telegramChunks: TelegramChunk[] = chunks.map((chunk) => ({
        chunkId: chunk.chunkId,
        chunkIndex: chunk.chunkIndex,
        messageId: chunk.messageId,
        encryptedHash: chunk.encryptedHash,
        fileId: chunk.fileId,
      }));

      // Download the complete file from Telegram (chunked case)
      completeFile = await telegramStorage.downloadFileByChunks(fileId, telegramChunks);
    } else {
      // Direct file case: fileId is a telegram file_id
      const fileInfo = await telegramStorage.getFile(fileId);
      if (!fileInfo.file_path) throw new Error('No file_path from Telegram');
      completeFile = await telegramStorage.downloadFile(fileInfo.file_path);
    }

    // Return the file as a stream
    return new NextResponse(new Uint8Array(completeFile), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': completeFile.length.toString(),
        'Cache-Control': 'private, no-cache',
      },
    });

  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Download failed' },
      { status: 500 }
    );
  }
}