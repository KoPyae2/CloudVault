import { NextRequest, NextResponse } from 'next/server';
import { telegramStorage, TelegramChunk } from '@/lib/telegram';
import sharp from 'sharp';

export async function POST(request: NextRequest) {
  try {
    const { fileId, chunks, fileType } = await request.json() as {
      fileId: string;
      chunks: Array<Pick<TelegramChunk, 'chunkId' | 'chunkIndex' | 'messageId' | 'encryptedHash' | 'fileId'>>;
      fileType: string;
    };

    if (!fileId || !Array.isArray(chunks) || !fileType) {
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 });
    }

    const isImage = fileType.startsWith('image/');
    const isVideo = fileType.startsWith('video/');

    if (!isImage && !isVideo) {
      return NextResponse.json({ error: 'Preview only for images/videos' }, { status: 400 });
    }

    // Normalize chunks type
    const telegramChunks: TelegramChunk[] = chunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      chunkIndex: chunk.chunkIndex,
      messageId: chunk.messageId,
      encryptedHash: chunk.encryptedHash,
      fileId: chunk.fileId,
    }));

    const completeFile = await telegramStorage.downloadFileByChunks(fileId, telegramChunks);

    let previewBuffer: Buffer;

    if (isImage) {
      // Medium/preview size, keep aspect ratio, limit longest side to 800
      previewBuffer = await sharp(completeFile)
        .rotate() // auto-orient
        .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer();
    } else {
      // Video: generate nicer placeholder (no ffmpeg available here)
      const svg = `
        <svg width="800" height="450" viewBox="0 0 800 450" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#1f2937" />
              <stop offset="100%" stop-color="#111827" />
            </linearGradient>
          </defs>
          <rect width="800" height="450" fill="url(#g)"/>
          <circle cx="400" cy="225" r="50" fill="rgba(0,0,0,0.4)"/>
          <polygon points="385,195 385,255 445,225" fill="#fff"/>
        </svg>
      `;
      previewBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    }

    return new NextResponse(new Uint8Array(previewBuffer), {
      headers: {
        'Content-Type': isImage ? 'image/jpeg' : 'image/png',
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  } catch (error) {
    console.error('Preview generation error:', error);
    return NextResponse.json({ error: 'Preview generation failed' }, { status: 500 });
  }
}