"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from "react";
import { Id } from "@/convex/_generated/dataModel";
import type { TelegramChunk } from "@/lib/telegram";
import { FileItem, useStore } from "@/lib/store";

// Constants
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_CONCURRENT_UPLOADS = 3;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000; // 1 second

// Types
export type UploadStatus =
  | "pending"
  | "uploading"
  | "paused"
  | "completed"
  | "error"
  | "cancelled";

interface NetworkError extends Error {
  code?: string;
}

export interface UploadFile {
  readonly id: string;
  readonly file: File;
  readonly name: string;
  readonly size: number;
  readonly type: string;
  progress: number; // 0-100
  status: UploadStatus;
  error?: string;
  readonly folderId?: Id<"folders">;
  readonly userId: Id<"users">;
  telegramStorageId?: string;
  fileId?: string; // server-assigned upload session id
  chunks: TelegramChunk[];
  readonly totalChunks: number;
  currentChunk: number; // 0-based index of next chunk to upload
  uploadSpeed?: number; // bytes/sec
  estimatedTimeRemaining?: number; // seconds
  retryCount?: number;
  abortController?: AbortController;
  readonly createdAt: number;
}

export interface CreateFileRequest {
  name: string;
  type: string;
  size: number;
  userId: Id<"users">;
  folderId?: Id<"folders">;
  telegramStorageId: string;
  telegramChunks: TelegramChunk[];
  totalChunks: number;
}

export interface UploadManagerContextType {
  uploads: readonly UploadFile[];
  addUploads: (
    files: File[],
    folderId?: Id<"folders">,
    userId?: Id<"users">
  ) => Promise<void>;
  removeUpload: (id: string) => void;
  pauseUpload: (id: string) => void;
  resumeUpload: (id: string) => void;
  cancelUpload: (id: string) => void;
  retryUpload: (id: string) => void;
  clearCompleted: () => void;
  clearAll: () => void;
  isUploading: boolean;
  totalProgress: number;
  activeUploads: number;
  queuedUploads: number;
}

// Custom hooks for better separation of concerns
const useUploadQueue = () => {
  const activeUploadsRef = useRef<Set<string>>(new Set());

  const canStartUpload = useCallback(() => {
    return activeUploadsRef.current.size < MAX_CONCURRENT_UPLOADS;
  }, []);

  const addToActive = useCallback((id: string) => {
    activeUploadsRef.current.add(id);
  }, []);

  const removeFromActive = useCallback((id: string) => {
    activeUploadsRef.current.delete(id);
  }, []);

  return { canStartUpload, addToActive, removeFromActive };
};

const UploadManagerContext = createContext<
  UploadManagerContextType | undefined
>(undefined);

export function UploadManagerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [uploads, setUploads] = useState<UploadFile[]>([]);
  const { canStartUpload, addToActive, removeFromActive } = useUploadQueue();
  const processingQueueRef = useRef(false);

  // Store references for cleanup
  const upsertFileLocal = useStore((state) => state.upsertFile);
  const deleteFileLocal = useStore((state) => state.deleteFileLocal);

  // Utility functions
  const generateUploadId = useCallback(() => {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }, []);

  const calculateProgress = useCallback(
    (currentChunk: number, totalChunks: number): number => {
      if (totalChunks === 0) return 0;
      return Math.min(100, (currentChunk / totalChunks) * 100);
    },
    []
  );

  const calculateUploadSpeed = useCallback(
    (bytesUploaded: number, timeElapsed: number): number => {
      return timeElapsed > 0 ? bytesUploaded / (timeElapsed / 1000) : 0;
    },
    []
  );

  const estimateTimeRemaining = useCallback(
    (remainingBytes: number, uploadSpeed: number): number => {
      return uploadSpeed > 0 ? remainingBytes / uploadSpeed : 0;
    },
    []
  );

  // API call helpers with better error handling
  const initializeUploadSession = async (
    file: File
  ): Promise<{ fileId: string }> => {
    try {
      const response = await fetch("/api/telegram/upload/init", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to initialize upload: ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      throw new Error(
        `Upload initialization failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  };

  const uploadImageDirect = async (
    upload: UploadFile
  ): Promise<{
    telegramStorageId: string;
    chunks: TelegramChunk[];
    totalChunks: number;
  }> => {
    console.log(`[Upload] Creating FormData for ${upload.name}`);
    console.log(`[Upload] File size: ${upload.file.size}, type: ${upload.file.type}`);
    
    const formData = new FormData();
    formData.append("file", upload.file);
    formData.append("userId", upload.userId);
    if (upload.folderId) {
      formData.append("folderId", upload.folderId);
    }
    
    console.log(`[Upload] FormData created with ${Array.from(formData.keys()).length} fields`);

    try {
      // Check if the upload was cancelled before making the request
      if (upload.abortController?.signal.aborted) {
        throw new Error("Upload was cancelled");
      }

      const response = await fetch("/api/telegram/image-upload", {
        method: "POST",
        body: formData,
        signal: upload.abortController?.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Image upload failed: ${errorText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error("Image upload was not successful");
      }

      return result;
    } catch (error) {
      // Handle specific network errors
      if (error instanceof Error) {
        console.error(`[Upload] Image upload error for ${upload.name}:`, error);
        
        if (error.name === "AbortError") {
          throw new Error("Upload was cancelled");
        }
        if (error.message.includes("ECONNRESET") || (error as NetworkError).code === "ECONNRESET") {
          throw new Error("Connection was reset. Please check your network and retry.");
        }
        if (error.message.includes("Failed to fetch")) {
          throw new Error("Network error occurred. Please check your connection and retry.");
        }
        if (error.message.includes("aborted")) {
          throw new Error("Upload was cancelled or connection was interrupted");
        }
      }
      throw error;
    }
  };

  const uploadChunk = async (
    upload: UploadFile,
    chunkIndex: number,
    chunkBlob: Blob,
    retryCount = 0
  ): Promise<{ chunk: TelegramChunk }> => {
    const formData = new FormData();
    formData.append("fileId", upload.fileId || "");
    formData.append("chunkIndex", chunkIndex.toString());
    formData.append("totalChunks", upload.totalChunks.toString());
    formData.append("filename", upload.name);
    formData.append("chunk", chunkBlob);

    try {
      const response = await fetch("/api/telegram/upload/chunk", {
        method: "POST",
        body: formData,
        signal: upload.abortController?.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Chunk upload failed: ${errorText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error("Chunk upload was not successful");
      }

      return result;
    } catch (error) {
      if (
        retryCount < RETRY_ATTEMPTS &&
        !upload.abortController?.signal.aborted
      ) {
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAY * (retryCount + 1))
        );
        return uploadChunk(upload, chunkIndex, chunkBlob, retryCount + 1);
      }
      throw error;
    }
  };

  const createFileRecord = async (
    upload: UploadFile,
    telegramStorageId: string,
    chunks: TelegramChunk[]
  ): Promise<{ fileId: string }> => {
    const requestData: CreateFileRequest = {
      name: upload.name,
      type: upload.type,
      size: upload.size,
      userId: upload.userId,
      folderId: upload.folderId,
      telegramStorageId,
      telegramChunks: chunks,
      totalChunks: upload.totalChunks,
    };

    const response = await fetch("/api/files/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create file record: ${errorText}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error("File record creation was not successful");
    }

    return result;
  };

  // Update upload state helper
  const updateUpload = useCallback(
    (id: string, updates: Partial<UploadFile>) => {
      setUploads((prev) =>
        prev.map((upload) =>
          upload.id === id ? { ...upload, ...updates } : upload
        )
      );
    },
    []
  );

  // Forward declaration for processUpload
  const processUploadRef = useRef<
    ((upload: UploadFile) => Promise<void>) | null
  >(null);

  // Queue processing with debounce
  const processQueueTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const processQueue = useCallback(async () => {
    if (processingQueueRef.current || !processUploadRef.current) return;
    processingQueueRef.current = true;

    try {
      // Get current uploads state directly to avoid stale closures
      setUploads((currentUploads) => {
        const pendingUploads = currentUploads.filter((u) => {
          // Only process uploads that are truly pending and haven't exceeded retry limits
          if (u.status !== "pending") return false;

          const retryCount = u.retryCount || 0;
          if (retryCount >= RETRY_ATTEMPTS * 2) {
            // Auto-mark as error if retry limit exceeded
            setTimeout(() => {
              updateUpload(u.id, {
                status: "error",
                error: "Maximum retry attempts exceeded",
              });
            }, 0);
            return false;
          }

          return true;
        });

        console.log(
          `[Queue] Processing ${pendingUploads.length} pending uploads`
        );

        // Process uploads asynchronously to avoid blocking state updates
        if (pendingUploads.length > 0) {
          setTimeout(() => {
            for (const upload of pendingUploads) {
              if (canStartUpload()) {
                console.log(
                  `[Queue] Starting upload: ${upload.name} (${upload.id})`
                );
                processUploadRef.current!(upload);
              } else {
                break; // Queue is full
              }
            }
          }, 0);
        }

        return currentUploads; // Return unchanged state
      });
    } finally {
      processingQueueRef.current = false;
    }
  }, [canStartUpload, updateUpload]);

  // Debounced queue processing to prevent excessive calls
  const debouncedProcessQueue = useCallback(() => {
    if (processQueueTimeoutRef.current) {
      clearTimeout(processQueueTimeoutRef.current);
    }
    processQueueTimeoutRef.current = setTimeout(() => {
      processQueue();
    }, 100); // 100ms debounce
  }, [processQueue]);

  // Main upload processing function
  const processUpload = async (upload: UploadFile): Promise<void> => {
    console.log(
      `[Upload] Processing upload: ${upload.name} (${upload.id}) - Status: ${upload.status}`
    );

    if (!canStartUpload()) {
      console.log(`[Upload] Cannot start upload - queue full`);
      return; // Will be processed later by queue
    }

    // Double-check upload status before processing to prevent duplicate processing
    // Get current upload state to avoid stale closure issues
    let currentUpload: UploadFile | undefined;
    setUploads((currentUploads) => {
      currentUpload = currentUploads.find((u) => u.id === upload.id);
      return currentUploads; // Return unchanged
    });
    
    if (!currentUpload || currentUpload.status !== "pending") {
      console.log(
        `[Upload] Skipping upload - not pending. Current status: ${currentUpload?.status || "not found"}`
      );
      return; // Upload is no longer pending, skip processing
    }
    
    // Use the current upload state instead of the potentially stale one from closure
    upload = currentUpload;

    addToActive(upload.id);

    try {
      console.log(`[Upload] Starting upload: ${upload.name}`);
      updateUpload(upload.id, { status: "uploading", error: undefined });

      const isImage = upload.type.startsWith("image/");
      const startTime = Date.now();

      if (isImage) {
        // Direct image upload
        const result = await uploadImageDirect(upload);
        const uploadTime = Date.now() - startTime;
        const speed = calculateUploadSpeed(upload.size, uploadTime);

        console.log(`[Upload] Image upload completed: ${upload.name}`);
        updateUpload(upload.id, {
          status: "completed",
          progress: 100,
          telegramStorageId: result.telegramStorageId,
          chunks: result.chunks,
          uploadSpeed: speed,
        });

        // Create file record
        const { fileId } = await createFileRecord(
          upload,
          result.telegramStorageId,
          result.chunks
        );

        // Add to local store optimistically
        upsertFileLocal({
          _id: fileId as unknown as Id<"files">,
          name: upload.name,
          type: upload.type || "application/octet-stream",
          size: upload.size,
          userId: upload.userId,
          folderId: upload.folderId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          telegramStorageId: result.telegramStorageId,
          telegramChunks: result.chunks,
          totalChunks: result.totalChunks,
          isOptimistic: true,
        } as FileItem);
      } else {
        // Chunked upload for non-images
        const totalChunks = Math.ceil(upload.size / CHUNK_SIZE);
        updateUpload(upload.id, { totalChunks });

        const chunks: TelegramChunk[] = new Array(totalChunks);
        let uploadedBytes = upload.currentChunk * CHUNK_SIZE;

        for (let i = upload.currentChunk; i < totalChunks; i++) {
          // Check for cancellation
          if (upload.abortController?.signal.aborted) {
            throw new Error("Upload cancelled");
          }

          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, upload.size);
          const chunkBlob = upload.file.slice(start, end);

          const { chunk } = await uploadChunk(upload, i, chunkBlob);
          chunks[i] = chunk;
          uploadedBytes += chunkBlob.size;

          // Calculate progress and speed
          const currentTime = Date.now();
          const timeElapsed = currentTime - startTime;
          const progress = calculateProgress(i + 1, totalChunks);
          const speed = calculateUploadSpeed(uploadedBytes, timeElapsed);
          const remainingBytes = upload.size - uploadedBytes;
          const eta = estimateTimeRemaining(remainingBytes, speed);

          updateUpload(upload.id, {
            currentChunk: i + 1,
            progress,
            uploadSpeed: speed,
            estimatedTimeRemaining: eta,
            chunks: [...chunks],
          });
        }

        const telegramStorageId = upload.fileId!;
        updateUpload(upload.id, {
          status: "completed",
          progress: 100,
          telegramStorageId,
          estimatedTimeRemaining: 0,
        });

        // Create file record
        const { fileId } = await createFileRecord(
          upload,
          telegramStorageId,
          chunks
        );

        // Add to local store optimistically
        upsertFileLocal({
          _id: fileId as unknown as Id<"files">,
          name: upload.name,
          type: upload.type || "application/octet-stream",
          size: upload.size,
          userId: upload.userId,
          folderId: upload.folderId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          telegramStorageId,
          telegramChunks: chunks,
          totalChunks,
          isOptimistic: true,
        } as FileItem);
      }
    } catch (error) {
      console.error(`[Upload] Error processing upload ${upload.name}:`, error);
      
      const isAborted =
        error instanceof Error &&
        (error.name === "AbortError" || 
         /abort|cancel/i.test(error.message) ||
         error.message.includes("Upload was cancelled"));

      if (isAborted) {
        console.log(`[Upload] Upload was aborted: ${upload.name}`);
        const currentUpload = uploads.find((u) => u.id === upload.id);
        if (currentUpload?.status !== "cancelled") {
          console.log(`[Upload] Setting upload to paused: ${upload.name}`);
          updateUpload(upload.id, { status: "paused" });
        }
      } else {
        console.log(`[Upload] Upload failed with non-abort error: ${upload.name}`);
        
        const currentRetryCount = (upload.retryCount || 0) + 1;
        let errorMessage =
          error instanceof Error ? error.message : "Upload failed";

        // Provide more user-friendly error messages for common network issues
        if (
          errorMessage.includes("Failed to fetch") ||
          errorMessage.includes("NetworkError")
        ) {
          errorMessage =
            "Network connection lost. Please check your internet connection and retry.";
        } else if (
          errorMessage.includes("ECONNRESET") ||
          errorMessage.includes("Connection was reset") ||
          errorMessage.includes("aborted")
        ) {
          errorMessage =
            "Connection was interrupted. Please check your network and retry.";
        } else if (
          errorMessage.includes("timeout") ||
          errorMessage.includes("TIMEOUT")
        ) {
          errorMessage =
            "Upload timed out. Please check your connection and retry.";
        } else if (
          errorMessage.includes("500") ||
          errorMessage.includes("Internal Server Error")
        ) {
          errorMessage = "Server error occurred. Please retry in a moment.";
        } else if (
          errorMessage.includes("413") ||
          errorMessage.includes("Payload Too Large")
        ) {
          errorMessage = "File is too large for upload.";
        }

        // Check if this is a permanent error that shouldn't be retried
        const isPermanentError =
          errorMessage.includes("401") ||
          errorMessage.includes("403") ||
          errorMessage.includes("404") ||
          errorMessage.includes("Invalid") ||
          errorMessage.includes("Unauthorized") ||
          errorMessage.includes("too large");

        // Always mark as error - no automatic retries
        // User must manually retry if needed
        updateUpload(upload.id, {
          status: "error",
          error: isPermanentError
            ? `${errorMessage} (Manual retry required)`
            : `${errorMessage} (Click retry to try again)`,
          retryCount: currentRetryCount,
        });
      }

      // Clean up optimistic file on error
      try {
        if (upload.fileId) {
          deleteFileLocal(upload.fileId as unknown as Id<"files">);
        }
      } catch (cleanupError) {
        console.warn("Failed to clean up optimistic file:", cleanupError);
      }
    } finally {
      removeFromActive(upload.id);
      // Only process queue if there are still pending uploads
      const hasPendingUploads = uploads.some(
        (u) => u.status === "pending" && u.id !== upload.id
      );
      if (hasPendingUploads) {
        debouncedProcessQueue();
      }
    }
  };

  // Assign processUpload to ref for queue processing
  processUploadRef.current = processUpload;

  // Effect to process queue when new uploads are added
  const pendingCount = uploads.filter((u) => u.status === "pending").length;
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
  const addUploads = useCallback(
    async (
      files: File[],
      folderId?: Id<"folders">,
      userId?: Id<"users">
    ): Promise<void> => {
      if (!userId) {
        throw new Error("User ID is required for uploads");
      }

      const newUploads: UploadFile[] = [];

      try {
        for (const file of files) {
          // Validate file
          if (file.size === 0) {
            console.warn(`Skipping empty file: ${file.name}`);
            continue;
          }

          const { fileId } = await initializeUploadSession(file);
          const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

          const upload: UploadFile = {
            id: generateUploadId(),
            file,
            name: file.name,
            size: file.size,
            type: file.type,
            progress: 0,
            status: "pending",
            folderId,
            userId,
            fileId,
            chunks: [],
            totalChunks,
            currentChunk: 0,
            retryCount: 0,
            abortController: (() => {
              console.log(`[Upload] Creating new AbortController for ${file.name}`);
              return new AbortController();
            })(),
            createdAt: Date.now(),
          };

          newUploads.push(upload);
        }

        setUploads((prev) => [...prev, ...newUploads]);
      } catch (error) {
        throw new Error(
          `Failed to add uploads: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    },
    [generateUploadId]
  );

  const removeUpload = useCallback(
    (id: string) => {
      setUploads((prev) => {
        const upload = prev.find((u) => u.id === id);
        if (upload?.abortController) {
          upload.abortController.abort();
        }
        removeFromActive(id);
        return prev.filter((u) => u.id !== id);
      });
    },
    [removeFromActive]
  );

  const pauseUpload = useCallback(
    (id: string) => {
      setUploads((prev) =>
        prev.map((upload) => {
          if (upload.id === id && upload.status === "uploading") {
            upload.abortController?.abort();
            removeFromActive(id);
            return {
              ...upload,
              status: "paused",
              abortController: new AbortController(),
            };
          }
          return upload;
        })
      );
    },
    [removeFromActive]
  );

  const resumeUpload = useCallback((id: string) => {
    setUploads((prev) =>
      prev.map((upload) => {
        if (upload.id === id && upload.status === "paused") {
          return {
            ...upload,
            status: "pending",
            error: undefined,
            abortController: new AbortController(),
          };
        }
        return upload;
      })
    );
  }, []);

  const cancelUpload = useCallback(
    (id: string) => {
      setUploads((prev) =>
        prev.map((upload) => {
          if (upload.id === id) {
            console.log(`[Upload] Cancelling upload: ${upload.name} (${id})`);
            upload.abortController?.abort();
            removeFromActive(id);
            return { ...upload, status: "cancelled" };
          }
          return upload;
        })
      );
    },
    [removeFromActive]
  );

  const retryUpload = useCallback((id: string) => {
    setUploads((prev) =>
      prev.map((upload) => {
        if (upload.id === id && upload.status === "error") {
          // Prevent infinite retries by limiting total retry attempts
          const currentRetryCount = upload.retryCount || 0;
          if (currentRetryCount >= RETRY_ATTEMPTS * 2) {
            // Allow double the chunk retry attempts
            console.warn(
              `Upload ${id} has exceeded maximum retry attempts (${currentRetryCount})`
            );
            return upload; // Don't retry
          }

          return {
            ...upload,
            status: "pending",
            error: undefined,
            progress: 0, // Reset progress for retry
            currentChunk: 0, // Reset chunk progress for chunked uploads
            uploadSpeed: undefined,
            estimatedTimeRemaining: undefined,
            retryCount: currentRetryCount, // Keep the retry count to track total attempts
            abortController: new AbortController(),
          };
        }
        return upload;
      })
    );
  }, []);

  const clearCompleted = useCallback(() => {
    setUploads((prev) =>
      prev.filter(
        (u) => !["completed", "cancelled", "error"].includes(u.status)
      )
    );
  }, []);

  const clearAll = useCallback(() => {
    uploads.forEach((upload) => {
      if (upload.abortController) {
        upload.abortController.abort();
      }
    });
    setUploads([]);
  }, [uploads]);

  // Computed values
  const contextValue = useMemo((): UploadManagerContextType => {
    const isUploading = uploads.some((u) =>
      ["uploading", "pending"].includes(u.status)
    );
    const totalProgress =
      uploads.length > 0
        ? uploads.reduce((sum, u) => sum + u.progress, 0) / uploads.length
        : 0;
    const activeUploads = uploads.filter(
      (u) => u.status === "uploading"
    ).length;
    const queuedUploads = uploads.filter((u) => u.status === "pending").length;

    return {
      uploads: uploads as readonly UploadFile[],
      addUploads,
      removeUpload,
      pauseUpload,
      resumeUpload,
      cancelUpload,
      retryUpload,
      clearCompleted,
      clearAll,
      isUploading,
      totalProgress,
      activeUploads,
      queuedUploads,
    };
  }, [
    uploads,
    addUploads,
    removeUpload,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    retryUpload,
    clearCompleted,
    clearAll,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log(`[Upload] Component unmounting, cleaning up uploads`);
      setUploads((currentUploads) => {
        currentUploads.forEach((upload) => {
          if (upload.abortController && !upload.abortController.signal.aborted) {
            console.log(`[Upload] Aborting upload on cleanup: ${upload.name}`);
            upload.abortController.abort();
          }
        });
        return currentUploads;
      });
    };
  }, []); // Only run on unmount

  return (
    <UploadManagerContext.Provider value={contextValue}>
      {children}
    </UploadManagerContext.Provider>
  );
}

export function useUploadManager(): UploadManagerContextType {
  const context = useContext(UploadManagerContext);
  if (!context) {
    throw new Error(
      "useUploadManager must be used within UploadManagerProvider"
    );
  }
  return context;
}

// Additional utility hooks
export function useUploadStats() {
  const { uploads } = useUploadManager();

  return useMemo(() => {
    const stats = uploads.reduce(
      (acc, upload) => {
        acc.total++;
        acc[upload.status] = (acc[upload.status] || 0) + 1;
        acc.totalSize += upload.size;
        if (upload.status === "completed") {
          acc.completedSize += upload.size;
        }
        return acc;
      },
      {
        total: 0,
        pending: 0,
        uploading: 0,
        paused: 0,
        completed: 0,
        error: 0,
        cancelled: 0,
        totalSize: 0,
        completedSize: 0,
      }
    );

    return {
      ...stats,
      completionRate:
        stats.total > 0 ? (stats.completed / stats.total) * 100 : 0,
      errorRate: stats.total > 0 ? (stats.error / stats.total) * 100 : 0,
    };
  }, [uploads]);
}
