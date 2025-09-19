"use client";

import React, { createContext, useContext, useState, useCallback } from 'react';
import { Id } from '@/convex/_generated/dataModel';
import type { TelegramChunk } from '@/lib/telegram';
import { useStore } from '@/lib/store';

export interface UploadFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  progress: number; // 0-100
  status: 'pending' | 'uploading' | 'paused' | 'completed' | 'error' | 'cancelled';
  error?: string;
  folderId?: Id<"folders">;
  userId: Id<"users">;
  telegramStorageId?: string;
  fileId?: string; // server-assigned upload session id
  chunks: TelegramChunk[];
  totalChunks: number;
  currentChunk: number; // 0-based index of next chunk to upload
  uploadSpeed?: number; // bytes/sec (approx)
  abortController?: AbortController;
}

interface UploadManagerContextType {
  uploads: UploadFile[];
  addUploads: (files: File[], folderId?: Id<"folders">, userId?: Id<"users">) => void;
  removeUpload: (id: string) => void;
  pauseUpload: (id: string) => void;
  resumeUpload: (id: string) => void;
  cancelUpload: (id: string) => void;
  clearCompleted: () => void;
  isUploading: boolean;
  totalProgress: number;
}

const UploadManagerContext = createContext<UploadManagerContextType | undefined>(undefined);

export function UploadManagerProvider({ children }: { children: React.ReactNode }) {
  const [uploads, setUploads] = useState<UploadFile[]>([]);

  const addUploads = useCallback(async (files: File[], folderId?: Id<"folders">, userId?: Id<"users">) => {
    if (!userId) return;

    const sessions: { id: string; fileId: string; upload: UploadFile }[] = [];

    for (const file of files) {
      const initRes = await fetch('/api/telegram/upload/init', { method: 'POST' });
      const { fileId } = await initRes.json() as { fileId: string };

      const totalChunks = Math.ceil(file.size / (5 * 1024 * 1024));

      const upload: UploadFile = {
        id: Math.random().toString(36).slice(2) + Date.now().toString(36),
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        progress: 0,
        status: 'pending',
        folderId,
        userId,
        fileId,
        chunks: [],
        totalChunks,
        currentChunk: 0,
        abortController: new AbortController(),
      };

      sessions.push({ id: upload.id, fileId, upload });
    }

    setUploads(prev => [...prev, ...sessions.map(s => s.upload)]);

    // Start each upload sequentially per file (keeps per-chunk progress accurate)
    for (const session of sessions) {
      startChunkedUpload(session.upload);
    }
  }, []);

  const upsertFileLocal = useStore(s => s.upsertFile);
  const deleteFileLocal = useStore(s => s.deleteFileLocal);
  const replaceFilesInFolderLocal = useStore(s => s.replaceFilesInFolder);
  const listFilesInLocal = useStore(s => s.listFilesIn);
  const startChunkedUpload = async (upload: UploadFile) => {
    // Mark uploading without resetting currentChunk; preserve progress on resume
    setUploads(prev => prev.map(u => {
      if (u.id !== upload.id) return u;
      const safeTotal = Math.max(1, u.totalChunks || Math.ceil(u.size / (5 * 1024 * 1024)));
      const preservedProgress = Math.min(100, (u.currentChunk / safeTotal) * 100);
      return { ...u, status: 'uploading', progress: preservedProgress };
    }));

    try {
      const isImage = upload.type.startsWith('image/');

      if (isImage) {
        // Direct image upload path (single request); server handles chunking internally
        const form = new FormData();
        form.append('file', upload.file);
        form.append('userId', upload.userId);
        if (upload.folderId) form.append('folderId', upload.folderId);

        const t0 = Date.now();
        const res = await fetch('/api/telegram/image-upload', {
          method: 'POST',
          body: form,
          signal: upload.abortController?.signal,
        });
        if (!res.ok) throw new Error(await res.text());
        const result = await res.json() as {
          success: boolean;
          telegramStorageId: string;
          chunks: TelegramChunk[];
          totalChunks: number;
        };

        const dt = Math.max(1, Date.now() - t0);
        const speed = upload.size / (dt / 1000); // bytes/sec

        // Mark as completed and persist
        setUploads(prev => prev.map(u => u.id === upload.id ? { ...u, status: 'completed', progress: 100, telegramStorageId: result.telegramStorageId, chunks: result.chunks, totalChunks: result.totalChunks, uploadSpeed: speed } : u));

        const createFileResponse = await fetch('/api/files/create', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: upload.name, type: upload.type, size: upload.size, userId: upload.userId, folderId: upload.folderId,
            telegramStorageId: result.telegramStorageId, telegramChunks: result.chunks, totalChunks: result.totalChunks,
          }),
        });
        if (!createFileResponse.ok) throw new Error(await createFileResponse.text() || 'Failed to create file record');
        const { fileId } = await createFileResponse.json() as { success: boolean; fileId: string };
        // Optimistically add to local store so it appears instantly
        upsertFileLocal({
          _id: fileId as unknown as Id<'files'>,
          name: upload.name,
          type: upload.type || 'application/octet-stream',
          size: upload.size,
          userId: upload.userId,
          folderId: upload.folderId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          telegramStorageId: result.telegramStorageId,
          telegramChunks: result.chunks,
          totalChunks: result.totalChunks,
          // mark as optimistic until server snapshot confirms it
          ...( { isOptimistic: true } as any ),
        } as any);
        return;
      }

      // Non-image path: client-side chunked upload for accurate per-chunk progress
      const chunkSize = 5 * 1024 * 1024; // 5MB chunks (must match server CHUNK_SIZE)
      const totalChunks = Math.ceil(upload.size / chunkSize);

      // Update totalChunks in state in case it wasn't set precisely
      setUploads(prev => prev.map(u => u.id === upload.id ? { ...u, totalChunks } : u));

      let sentBytes = upload.currentChunk * chunkSize;
      const startedAt = Date.now();
      const collectedChunks: TelegramChunk[] = (upload.chunks && upload.chunks.length)
        ? [...upload.chunks]
        : new Array(totalChunks);

      for (let i = upload.currentChunk; i < totalChunks; i++) {
        // Handle pause/cancel mid-loop via abort signal
        const signal = upload.abortController?.signal;
        if (signal?.aborted) throw new Error('Aborted');

        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, upload.size);
        const chunkBlob = upload.file.slice(start, end);

        const form = new FormData();
        form.append('fileId', upload.fileId || '');
        form.append('chunkIndex', String(i));
        form.append('totalChunks', String(totalChunks));
        form.append('filename', upload.name);
        form.append('chunk', chunkBlob);

        const res = await fetch('/api/telegram/upload/chunk', {
          method: 'POST',
          body: form,
          signal,
        });
        if (!res.ok) throw new Error(await res.text());
        const json = await res.json() as { success: boolean; chunk: TelegramChunk };

        // Append chunk meta
        sentBytes += chunkBlob.size;
        const completedChunks = i + 1;
        const baseProgress = (completedChunks / totalChunks) * 100; // exact per-chunk progress

        const dt = Math.max(1, Date.now() - startedAt);
        const speed = sentBytes / (dt / 1000); // bytes/sec

        collectedChunks[i] = json.chunk;

        setUploads(prev => prev.map(u => {
          if (u.id !== upload.id) return u;
          const newChunks = [...u.chunks];
          newChunks[i] = json.chunk;
          return {
            ...u,
            chunks: newChunks,
            currentChunk: completedChunks,
            progress: Math.min(100, baseProgress),
            uploadSpeed: speed,
            status: 'uploading',
          };
        }));

        // Optional: small delay to avoid hitting Telegram rate limits (server also delays internally)
        // await new Promise(r => setTimeout(r, 200));
      }

      // After all chunks uploaded, finalize: create file record with all chunks
      // telegramStorageId is the fileId used for encryption/grouping
      const telegramStorageId = upload.fileId!;

      setUploads(prev => prev.map(u => u.id === upload.id ? { ...u, status: 'completed', progress: 100, telegramStorageId, chunks: collectedChunks, totalChunks } : u));

      const createFileResponse = await fetch('/api/files/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: upload.name, type: upload.type, size: upload.size, userId: upload.userId, folderId: upload.folderId,
          telegramStorageId, telegramChunks: collectedChunks, totalChunks,
        }),
      });
      if (!createFileResponse.ok) throw new Error(await createFileResponse.text() || 'Failed to create file record');
      const { fileId } = await createFileResponse.json() as { success: boolean; fileId: string };
      // Optimistically add to local store so it appears instantly
      upsertFileLocal({
        _id: fileId as unknown as Id<'files'>,
        name: upload.name,
        type: upload.type || 'application/octet-stream',
        size: upload.size,
        userId: upload.userId,
        folderId: upload.folderId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        telegramStorageId,
        telegramChunks: collectedChunks,
        totalChunks,
        // mark as optimistic until server snapshot confirms it
        ...( { isOptimistic: true } as any ),
      } as any);
    } catch (error) {
      // Remove any optimistic file on failure to avoid ghost entries
      try {
        const failedId = upload.fileId as unknown as Id<'files'> | undefined;
        if (failedId) deleteFileLocal(failedId);
      } catch {}
      setUploads(prev => prev.map(u => {
        if (u.id !== upload.id) return u;
        const isAbort = error instanceof Error && (error.name === 'AbortError' || /aborted/i.test(error.message));
        if (isAbort) {
          // Keep cancelled if already cancelled; otherwise mark as paused
          return u.status === 'cancelled' ? u : { ...u, status: 'paused' };
        }
        return { ...u, status: 'error', error: error instanceof Error ? error.message : 'Upload failed' };
      }));
    }
  };

  const removeUpload = useCallback((id: string) => {
    setUploads(prev => {
      const upload = prev.find(u => u.id === id);
      if (upload?.abortController) {
        upload.abortController.abort();
      }
      return prev.filter(u => u.id !== id);
    });
  }, []);

  const pauseUpload = useCallback((id: string) => {
    setUploads(prev => prev.map(u => {
      if (u.id === id && u.status === 'uploading') {
        u.abortController?.abort();
        return { ...u, status: 'paused', abortController: new AbortController() };
      }
      return u;
    }));
  }, []);

  const resumeUpload = useCallback((id: string) => {
    const upload = uploads.find(u => u.id === id);
    if (upload && upload.status === 'paused') {
      // Reset the upload with a new abort controller
      const updatedUpload: UploadFile = {
        ...upload,
        status: 'pending' as const,
        abortController: new AbortController(),
      };
      
      setUploads(prev => prev.map(u => 
        u.id === id ? updatedUpload : u
      ));
      
      startChunkedUpload(updatedUpload);
    }
  }, [uploads]);

  const cancelUpload = useCallback((id: string) => {
    setUploads(prev => prev.map(u => {
      if (u.id === id) {
        u.abortController?.abort();
        return { ...u, status: 'cancelled' };
      }
      return u;
    }));
  }, []);

  const clearCompleted = useCallback(() => {
    setUploads(prev => prev.filter(u => 
      u.status !== 'completed' && u.status !== 'cancelled' && u.status !== 'error'
    ));
  }, []);

  const isUploading = uploads.some(u => u.status === 'uploading' || u.status === 'pending');
  const totalProgress = uploads.length > 0 
    ? uploads.reduce((sum, u) => sum + u.progress, 0) / uploads.length 
    : 0;

  return (
    <UploadManagerContext.Provider value={{
      uploads,
      addUploads,
      removeUpload,
      pauseUpload,
      resumeUpload,
      cancelUpload,
      clearCompleted,
      isUploading,
      totalProgress,
    }}>
      {children}
    </UploadManagerContext.Provider>
  );
}

export function useUploadManager() {
  const context = useContext(UploadManagerContext);
  if (!context) {
    throw new Error('useUploadManager must be used within UploadManagerProvider');
  }
  return context;
}