import { NextRequest, NextResponse } from 'next/server';

// This route stores a video thumbnail into Convex storage and returns the storageId
// It forwards the raw image to Convex HTTP route (convex/http.ts)
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const storageUpload = formData.get('thumbnail'); // Blob
    const fileId = formData.get('fileId') as string; // Convex files doc id

    if (!(storageUpload instanceof Blob) || !fileId) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) throw new Error('Missing Convex URL');

    const res = await fetch(`${convexUrl}/uploadVideoThumbnail`, {
      method: 'POST',
      body: storageUpload,
      headers: {
        'Content-Type': storageUpload.type || 'application/octet-stream',
        'x-file-id': fileId,
      },
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || 'Failed to store thumbnail');
    }

    const data = await res.json();
    return NextResponse.json({ success: true, storageId: data.storageId });
  } catch (error) {
    console.error('Video thumbnail store error:', error);
    return NextResponse.json({ error: 'Failed to store video thumbnail' }, { status: 500 });
  }
}