"use client";

import React, { 
  createContext, 
  useContext, 
  useState, 
  useCallback, 
  useMemo,
  useRef,
  useEffect 
} from 'react';
import { Id } from '@/convex/_generated/dataModel';
import type { TelegramChunk } from '@/lib/telegram';

// Types
export type DownloadStatus = 'pending' | 'downloading' | 'paused' | 'completed' | 'error' | 'cancelled';

export interface DownloadFile {
  readonly id: string;
  readonly fileId: Id<"files">;
  readonly name: string;
  readonly size: number;
  readonly type: string;
  progress: number; // 0-100
  status: DownloadStatus;
  error?: string;
  readonly telegramStorageId: string;
  readonly telegramChunks: TelegramChunk[];
  readonly totalChunks: number;
  currentChunk: number; // 0-based index of next chunk to download
  downloadSpeed?: number; // bytes/sec
  estimatedTimeRemaining?: number; // seconds
  retryCount?: number;
  abortController?: AbortController;
  readonly createdAt: number;
  downloadedBlob?: Blob; // Store the downloaded blob
}

export interface DownloadManagerContextType {
  downloads: readonly DownloadFile[];
  addDownload: (fileId: Id<"files">, name: string, size: number, type: string, telegramStorageId: string, telegramChunks: TelegramChunk[]) => Promise<void>;
  removeDownload: (id: string) => void;
  pauseDownload: (id: string) => void;
  resumeDownload: (id: string) => void;
  cancelDownload: (id: string) => void;
  retryDownload: (id: string) => void;
  clearCompleted: () => void;
  clearAll: () => void;
  isDownloading: boolean;
  totalProgress: number;
  activeDownloads: number;
  queuedDownloads: number;
}

// Constants
const MAX_CONCURRENT_DOWNLOADS = 3;
const RETRY_ATTEMPTS = 3;
// const RETRY_DELAY = 1000; // 1 second

// Custom hooks for better separation of concerns
const useDownloadQueue = () => {
  const activeDownloadsRef = useRef<Set<string>>(new Set());
  
  const canStartDownload = useCallback(() => {
    return activeDownloadsRef.current.size < MAX_CONCURRENT_DOWNLOADS;
  }, []);

  const addToActive = useCallback((id: string) => {
    activeDownloadsRef.current.add(id);
  }, []);

  const removeFromActive = useCallback((id: string) => {
    activeDownloadsRef.current.delete(id);
  }, []);

  return { canStartDownload, addToActive, removeFromActive };
};

const DownloadManagerContext = createContext<DownloadManagerContextType | undefined>(undefined);

export function DownloadManagerProvider({ children }: { children: React.ReactNode }) {
  const [downloads, setDownloads] = useState<DownloadFile[]>([]);
  const { canStartDownload, addToActive, removeFromActive } = useDownloadQueue();
  const processingQueueRef = useRef(false);
  const processDownloadRef = useRef<((download: DownloadFile) => Promise<void>) | null>(null);

  // Utility functions
  const generateDownloadId = useCallback(() => {
    return `download-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }, []);

  // const calculateProgress = useCallback((currentChunk: number, totalChunks: number): number => {
  //   if (totalChunks === 0) return 0;
  //   return Math.min(100, (currentChunk / totalChunks) * 100);
  // }, []);

  const calculateDownloadSpeed = useCallback((bytesDownloaded: number, timeElapsed: number): number => {
    return timeElapsed > 0 ? bytesDownloaded / (timeElapsed / 1000) : 0;
  }, []);

  const estimateTimeRemaining = useCallback((
    remainingBytes: number, 
    downloadSpeed: number
  ): number => {
    return downloadSpeed > 0 ? remainingBytes / downloadSpeed : 0;
  }, []);

  // Auto-save utility function
  const autoSaveFile = useCallback((blob: Blob, filename: string) => {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log(`[Download] Auto-saved file: ${filename}`);
    } catch (error) {
      console.error(`[Download] Auto-save failed for ${filename}:`, error);
    }
  }, []);

  // API call helpers - Enhanced with chunk-by-chunk progress
  const downloadFileChunks = useCallback(async (
    telegramStorageId: string,
    chunks: TelegramChunk[],
    onProgress?: (progress: number, speed: number, eta: number, currentChunk: number) => void,
    abortSignal?: AbortSignal
  ): Promise<Blob> => {
    const totalChunks = chunks.length;
    const downloadedChunks: Uint8Array[] = new Array(totalChunks);
    let totalDownloadedBytes = 0;
    const startTime = Date.now();
    
    // Calculate estimated total size based on chunks (rough estimate)
    // const estimatedTotalSize = chunks.reduce((sum, chunk) => sum + (chunk.size || 0), 0) || 0;

    console.log(`[Download] Starting chunk-by-chunk download: ${totalChunks} chunks`);

    // Download chunks sequentially for better progress tracking
    for (let i = 0; i < totalChunks; i++) {
      if (abortSignal?.aborted) {
        throw new Error('Download cancelled');
      }

      try {
        // Download individual chunk
        const response = await fetch('/api/telegram/download', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fileId: telegramStorageId,
            chunks: [chunks[i]], // Download one chunk at a time
          }),
          signal: abortSignal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Chunk ${i + 1} download failed: ${errorText}`);
        }

        if (!response.body) {
          throw new Error(`No response body for chunk ${i + 1}`);
        }

        // Read the chunk data
        const chunkData = await response.arrayBuffer();
        downloadedChunks[i] = new Uint8Array(chunkData);
        totalDownloadedBytes += chunkData.byteLength;

        // Calculate progress based on chunks completed
        const progress = ((i + 1) / totalChunks) * 100;
        const timeElapsed = Date.now() - startTime;
        const speed = calculateDownloadSpeed(totalDownloadedBytes, timeElapsed);
        
        // Estimate remaining time based on remaining chunks and current speed
        const remainingChunks = totalChunks - (i + 1);
        const avgChunkSize = totalDownloadedBytes / (i + 1);
        const remainingBytes = remainingChunks * avgChunkSize;
        const eta = estimateTimeRemaining(remainingBytes, speed);

        console.log(`[Download] Chunk ${i + 1}/${totalChunks} completed (${progress.toFixed(1)}%)`);

        if (onProgress) {
          onProgress(progress, speed, eta, i + 1);
        }

      } catch (error) {
        console.error(`[Download] Failed to download chunk ${i + 1}:`, error);
        throw new Error(`Failed to download chunk ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    console.log(`[Download] All chunks downloaded successfully`);

    // Combine all chunks into a single blob
    // Convert Uint8Array to proper BlobPart format
    return new Blob(downloadedChunks as BlobPart[]);
  }, [calculateDownloadSpeed, estimateTimeRemaining]);

  // Update download state helper
  const updateDownload = useCallback((id: string, updates: Partial<DownloadFile>) => {
    setDownloads(prev => prev.map(download => 
      download.id === id ? { ...download, ...updates } : download
    ));
  }, []);

  // Queue processing with debounce
  const processQueueTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  
  const processQueue = useCallback(async () => {
    if (processingQueueRef.current) return;
    processingQueueRef.current = true;

    try {
      // Get current downloads state directly to avoid stale closures
      setDownloads(currentDownloads => {
        const pendingDownloads = currentDownloads.filter(d => {
          // Only process downloads that are truly pending and haven't exceeded retry limits
          if (d.status !== 'pending') return false;
          
          const retryCount = d.retryCount || 0;
          if (retryCount >= RETRY_ATTEMPTS * 2) {
            // Auto-mark as error if retry limit exceeded
            setTimeout(() => {
              updateDownload(d.id, {
                status: 'error',
                error: 'Maximum retry attempts exceeded',
              });
            }, 0);
            return false;
          }
          
          return true;
        });
        
        // Process downloads asynchronously to avoid blocking state updates
        if (pendingDownloads.length > 0) {
          setTimeout(() => {
            for (const download of pendingDownloads) {
              if (canStartDownload()) {
                processDownloadRef.current?.(download);
              } else {
                break; // Queue is full
              }
            }
          }, 0);
        }
        
        return currentDownloads; // Return unchanged state
      });
    } finally {
      processingQueueRef.current = false;
    }
  }, [canStartDownload, updateDownload]);

  // Debounced queue processing to prevent excessive calls
  const debouncedProcessQueue = useCallback(() => {
    if (processQueueTimeoutRef.current) {
      clearTimeout(processQueueTimeoutRef.current);
    }
    processQueueTimeoutRef.current = setTimeout(() => {
      processQueue();
    }, 100); // 100ms debounce
  }, [processQueue]);

  // Main download processing function
  const processDownload = useCallback(async (download: DownloadFile): Promise<void> => {
    console.log(`[Download] Processing download: ${download.name} (${download.id}) - Status: ${download.status}`);
    
    if (!canStartDownload()) {
      console.log(`[Download] Cannot start download - queue full`);
      return; // Will be processed later by queue
    }

    // Double-check download status before processing to prevent duplicate processing
    const currentDownload = downloads.find(d => d.id === download.id);
    if (!currentDownload || currentDownload.status !== 'pending') {
      console.log(`[Download] Skipping download - not pending. Current status: ${currentDownload?.status || 'not found'}`);
      return; // Download is no longer pending, skip processing
    }

    addToActive(download.id);
    
    try {
      console.log(`[Download] Starting download: ${download.name}`);
      updateDownload(download.id, { 
        status: 'downloading', 
        error: undefined,
        currentChunk: 0,
        progress: 0 
      });

      // const startTime = Date.now();

      // Download the file with enhanced chunk-by-chunk progress
      const blob = await downloadFileChunks(
        download.telegramStorageId,
        download.telegramChunks,
        (progress, speed, eta, currentChunk) => {
          updateDownload(download.id, {
            progress,
            downloadSpeed: speed,
            estimatedTimeRemaining: eta,
            currentChunk,
          });
        },
        download.abortController?.signal
      );

      console.log(`[Download] Download completed: ${download.name}`);
      updateDownload(download.id, {
        status: 'completed',
        progress: 100,
        downloadedBlob: blob,
        estimatedTimeRemaining: 0,
        currentChunk: download.totalChunks,
      });

      // Auto-save the file immediately after completion
      console.log(`[Download] Auto-saving file: ${download.name}`);
      autoSaveFile(blob, download.name);

    } catch (error) {
      const isAborted = error instanceof Error && (
        error.name === 'AbortError' || 
        /abort|cancel/i.test(error.message)
      );

      if (isAborted) {
        const currentDownload = downloads.find(d => d.id === download.id);
        if (currentDownload?.status !== 'cancelled') {
          updateDownload(download.id, { status: 'paused' });
        }
      } else {
        const currentRetryCount = (download.retryCount || 0) + 1;
        const errorMessage = error instanceof Error ? error.message : 'Download failed';
        
        // Check if this is a permanent error that shouldn't be retried
        const isPermanentError = errorMessage.includes('401') || 
                                errorMessage.includes('403') || 
                                errorMessage.includes('404') ||
                                errorMessage.includes('Invalid') ||
                                errorMessage.includes('Unauthorized');
        
        // Always mark as error - no automatic retries
        // User must manually retry if needed
        updateDownload(download.id, {
          status: 'error',
          error: isPermanentError ? `${errorMessage} (Permanent error - manual retry required)` : errorMessage,
          retryCount: currentRetryCount,
        });
      }
    } finally {
      removeFromActive(download.id);
      // Only process queue if there are still pending downloads
      const hasPendingDownloads = downloads.some(d => d.status === 'pending' && d.id !== download.id);
      if (hasPendingDownloads) {
        debouncedProcessQueue();
      }
    }
  }, [canStartDownload, addToActive, removeFromActive, updateDownload, downloads, downloadFileChunks, autoSaveFile,debouncedProcessQueue]);

  // Assign processDownload to ref to avoid circular dependency
  useEffect(() => {
    processDownloadRef.current = processDownload;
  }, [processDownload]);

  // Effect to process queue when new downloads are added
  const pendingCount = downloads.filter(d => d.status === 'pending').length;
  useEffect(() => {
    if (pendingCount > 0) {
      debouncedProcessQueue();
    }
    
    // Cleanup timeout on unmount
    return () => {
      if (processQueueTimeoutRef.current) {
        clearTimeout(processQueueTimeoutRef.current);
      }
    };
  }, [pendingCount, debouncedProcessQueue]);

  // Public API methods
  const addDownload = useCallback(async (
    fileId: Id<"files">,
    name: string,
    size: number,
    type: string,
    telegramStorageId: string,
    telegramChunks: TelegramChunk[]
  ): Promise<void> => {
    const downloadId = generateDownloadId();
    
    const newDownload: DownloadFile = {
      id: downloadId,
      fileId,
      name,
      size,
      type,
      progress: 0,
      status: 'pending',
      telegramStorageId,
      telegramChunks,
      totalChunks: telegramChunks.length,
      currentChunk: 0,
      createdAt: Date.now(),
      abortController: new AbortController(),
    };

    setDownloads(prev => [...prev, newDownload]);
  }, [generateDownloadId]);

  const removeDownload = useCallback((id: string) => {
    setDownloads(prev => {
      const download = prev.find(d => d.id === id);
      if (download?.abortController) {
        download.abortController.abort();
      }
      removeFromActive(id);
      return prev.filter(d => d.id !== id);
    });
  }, [removeFromActive]);

  const pauseDownload = useCallback((id: string) => {
    setDownloads(prev => prev.map(download => {
      if (download.id === id && download.status === 'downloading') {
        download.abortController?.abort();
        removeFromActive(id);
        return { 
          ...download, 
          status: 'paused' as const,
          abortController: new AbortController() 
        };
      }
      return download;
    }));
  }, [removeFromActive]);

  const resumeDownload = useCallback((id: string) => {
    setDownloads(prev => prev.map(download => {
      if (download.id === id && download.status === 'paused') {
        return {
          ...download,
          status: 'pending',
          error: undefined,
          abortController: new AbortController(),
        };
      }
      return download;
    }));
  }, []);

  const cancelDownload = useCallback((id: string) => {
    setDownloads(prev => prev.map(download => {
      if (download.id === id) {
        download.abortController?.abort();
        removeFromActive(id);
        return { ...download, status: 'cancelled' };
      }
      return download;
    }));
  }, [removeFromActive]);

  const retryDownload = useCallback((id: string) => {
    setDownloads(prev => prev.map(download => {
      if (download.id === id && download.status === 'error') {
        // Prevent infinite retries by limiting total retry attempts
        const currentRetryCount = download.retryCount || 0;
        if (currentRetryCount >= RETRY_ATTEMPTS * 2) { // Allow double the retry attempts
          console.warn(`Download ${id} has exceeded maximum retry attempts (${currentRetryCount})`);
          return download; // Don't retry
        }
        
        return {
          ...download,
          status: 'pending',
          error: undefined,
          retryCount: currentRetryCount, // Keep the retry count to track total attempts
          abortController: new AbortController(),
        };
      }
      return download;
    }));
  }, []);

  const clearCompleted = useCallback(() => {
    setDownloads(prev => prev.filter(d => 
      !['completed', 'cancelled', 'error'].includes(d.status)
    ));
  }, []);

  const clearAll = useCallback(() => {
    downloads.forEach(download => {
      if (download.abortController) {
        download.abortController.abort();
      }
    });
    setDownloads([]);
  }, [downloads]);

  // Computed values
  const contextValue = useMemo((): DownloadManagerContextType => {
    const isDownloading = downloads.some(d => ['downloading', 'pending'].includes(d.status));
    const totalProgress = downloads.length > 0 
      ? downloads.reduce((sum, d) => sum + d.progress, 0) / downloads.length 
      : 0;
    const activeDownloads = downloads.filter(d => ['downloading', 'pending', 'paused'].includes(d.status)).length;
    const queuedDownloads = downloads.filter(d => d.status === 'pending').length;

    return {
      downloads,
      addDownload,
      removeDownload,
      pauseDownload,
      resumeDownload,
      cancelDownload,
      retryDownload,
      clearCompleted,
      clearAll,
      isDownloading,
      totalProgress,
      activeDownloads,
      queuedDownloads,
    };
  }, [
    downloads,
    addDownload,
    removeDownload,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    retryDownload,
    clearCompleted,
    clearAll,
  ]);

  return (
    <DownloadManagerContext.Provider value={contextValue}>
      {children}
    </DownloadManagerContext.Provider>
  );
}

export function useDownloadManager(): DownloadManagerContextType {
  const context = useContext(DownloadManagerContext);
  if (context === undefined) {
    throw new Error('useDownloadManager must be used within a DownloadManagerProvider');
  }
  return context;
}