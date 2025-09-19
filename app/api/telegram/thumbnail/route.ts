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

    if (!fileId || !chunks || !Array.isArray(chunks) || !fileType) {
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 });
    }

    // Only generate thumbnails for images and videos
    const isImage = fileType.startsWith('image/');
    const isVideo = fileType.startsWith('video/');
    
    if (!isImage && !isVideo) {
      return NextResponse.json({ error: 'Thumbnails only supported for images and videos' }, { status: 400 });
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
      // Direct image case: fileId is a telegram file_id
      const fileInfo = await telegramStorage.getFile(fileId);
      if (!fileInfo.file_path) throw new Error('No file_path from Telegram');
      completeFile = await telegramStorage.downloadFile(fileInfo.file_path);
    }

    let thumbnailBuffer: Buffer;

    if (isImage) {
      // Generate image thumbnail using sharp
      thumbnailBuffer = await sharp(completeFile)
        .resize(200, 200, { 
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: 80 })
        .toBuffer();
    } else if (isVideo) {
      // For videos, create a cleaner placeholder with play icon
      const svgPlayIcon = `
        <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#1f2937" />
              <stop offset="100%" stop-color="#111827" />
            </linearGradient>
          </defs>
          <rect width="200" height="200" fill="url(#g)"/>
          <circle cx="100" cy="100" r="28" fill="rgba(0,0,0,0.35)"/>
          <polygon points="92,82 92,118 122,100" fill="#fff"/>
        </svg>
      `;

      thumbnailBuffer = await sharp(Buffer.from(svgPlayIcon)).png().toBuffer();
    } else {
      throw new Error('Unsupported file type for thumbnail generation');
    }

    // Return the thumbnail
    return new NextResponse(new Uint8Array(thumbnailBuffer), {
      headers: {
        'Content-Type': isImage ? 'image/jpeg' : 'image/png',
        'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
      },
    });

  } catch (error) {
    console.error('Thumbnail generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Thumbnail generation failed' },
      { status: 500 }
    );
  }
}