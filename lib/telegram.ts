import crypto from 'crypto';

const TELEGRAM_BOT_TOKEN = process.env.NEXT_TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL_ID = process.env.NEXT_TELEGRAM_CHANNEL_ID;
export const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks

export interface TelegramChunk {
  chunkId: string;
  chunkIndex: number;
  messageId: number;
  encryptedHash: string;
  fileId?: string;
}

export interface TelegramFile {
  file_id: string;
  file_unique_id: string;
  file_size: number;
  file_path?: string;
}

export interface TelegramMessage {
  message_id: number;
  document?: {
    file_name: string;
    mime_type: string;
    file_id: string;
    file_unique_id: string;
    file_size: number;
  };
}

export class TelegramStorage {
  private botToken: string;
  private channelId: string;

  constructor() {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHANNEL_ID) {
      throw new Error('Telegram configuration missing');
    }
    this.botToken = TELEGRAM_BOT_TOKEN;
    this.channelId = TELEGRAM_CHANNEL_ID;
  }

  // Abortable sleep to allow immediate cancellation during rate-limit delays
  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      if (signal) {
        const onAbort = () => {
          clearTimeout(t);
          const e = new Error('Aborted');
          e.name = 'AbortError';
          reject(e);
        };
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  // Fetch with retries for transient errors (429/5xx) and timeout support
  private async fetchWithRetry(
    url: string,
    init: RequestInit & { timeoutMs?: number; signal?: AbortSignal } = {},
    retryStatuses: number[] = [429, 500, 502, 503, 504],
    retries = 4,
    baseDelayMs = 1000,
  ): Promise<Response> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      // Per-attempt controller to support timeout and external abort
      const controller = new AbortController();
      const { signal: externalSignal, timeoutMs = 60000, ...rest } = init;
      let timeoutId: any;

      const onAbort = () => controller.abort();
      try {
        if (externalSignal) {
          if (externalSignal.aborted) controller.abort();
          else externalSignal.addEventListener('abort', onAbort, { once: true });
        }

        timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(url, { ...rest, signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) return res;

        // Non-OK: retry only on selected status codes
        if (!retryStatuses.includes(res.status) || attempt === retries) {
          return res; // let caller inspect body and throw a descriptive error
        }

        // Respect Retry-After if present
        const retryAfter = res.headers.get('retry-after');
        let delay = baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
        if (retryAfter) {
          const v = Number(retryAfter);
          if (!Number.isNaN(v)) delay = Math.max(delay, v * 1000);
        }
        await this.sleep(Math.min(delay, 15000), externalSignal);
      } catch (err) {
        clearTimeout(timeoutId);
        // Abort by caller: rethrow immediately
        if (externalSignal?.aborted) throw err;
        // Network error/timeout: backoff and retry
        if (attempt === retries) throw err;
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
        await this.sleep(Math.min(delay, 15000), externalSignal);
      } finally {
        if (externalSignal) externalSignal.removeEventListener?.('abort', onAbort as any);
      }
    }
    throw new Error('Retry attempts exhausted');
  }

  private generateEncryptionKey(fileId: string, chunkIndex: number): string {
    return crypto.createHash('sha256')
      .update(`${fileId}_${chunkIndex}_${process.env.NEXTAUTH_SECRET}`)
      .digest('hex');
  }

  private encryptChunk(chunk: Buffer, key: string): Buffer {
    const cipher = crypto.createCipher('aes-256-cbc', key);
    return Buffer.concat([cipher.update(chunk), cipher.final()]);
  }

  private decryptChunk(encryptedChunk: Buffer, key: string): Buffer {
    const decipher = crypto.createDecipher('aes-256-cbc', key);
    return Buffer.concat([decipher.update(encryptedChunk), decipher.final()]);
  }

  async sendDocument(buffer: Buffer, filename: string, options?: { signal?: AbortSignal }): Promise<TelegramMessage> {
    const { signal } = options ?? {};
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: 'application/octet-stream' });
    formData.append('document', blob, filename);
    formData.append('chat_id', this.channelId);

    const response = await this.fetchWithRetry(
      `https://api.telegram.org/bot${this.botToken}/sendDocument`,
      { method: 'POST', body: formData, signal, timeoutMs: 120000 }, // 120s per attempt
    );

    const text = await response.text();
    let result: any;
    try { result = JSON.parse(text); } catch {
      if (!response.ok) throw new Error(`Telegram API non-JSON error: ${text || response.status}`);
      throw new Error('Telegram API returned malformed JSON');
    }

    if (!response.ok || result?.ok === false) {
      const desc = result?.description || text || response.statusText;
      throw new Error(`Telegram API error: ${desc}`);
    }

    return result.result as TelegramMessage;
  }

  async getFile(fileId: string): Promise<TelegramFile> {
    const response = await this.fetchWithRetry(
      `https://api.telegram.org/bot${this.botToken}/getFile?file_id=${fileId}`,
      { method: 'GET', timeoutMs: 60000 },
    );

    const text = await response.text();
    let result: any;
    try { result = JSON.parse(text); } catch {
      if (!response.ok) throw new Error(`Failed to get file info: ${text || response.status}`);
      throw new Error('Telegram getFile returned malformed JSON');
    }

    if (!response.ok || result?.ok === false) {
      const desc = result?.description || text || response.statusText;
      throw new Error(`Failed to get file info: ${desc}`);
    }

    return result.result as TelegramFile;
  }

  async downloadFile(filePath: string): Promise<Buffer> {
    const response = await this.fetchWithRetry(
      `https://api.telegram.org/file/bot${this.botToken}/${filePath}`,
      { method: 'GET', timeoutMs: 60000 },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Failed to download file from Telegram: ${text || response.statusText}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  async uploadChunk(params: { fileId: string; chunkIndex: number; chunk: Buffer; filename: string; signal?: AbortSignal; }): Promise<TelegramChunk> {
    const { fileId, chunkIndex, chunk, filename, signal } = params;
    const encryptionKey = this.generateEncryptionKey(fileId, chunkIndex);
    const encryptedChunk = this.encryptChunk(chunk, encryptionKey);
    const encryptedHash = crypto.createHash('sha256').update(encryptedChunk).digest('hex');

    const message = await this.sendDocument(encryptedChunk, `${fileId}_${chunkIndex}_${filename}`, { signal });

    return {
      chunkId: `${fileId}_${chunkIndex}`,
      chunkIndex,
      messageId: message.message_id,
      encryptedHash,
      fileId: message.document?.file_id,
    };
  }

  async uploadFile(fileBuffer: Buffer, filename: string, options?: { signal?: AbortSignal }): Promise<{
    telegramStorageId: string;
    chunks: TelegramChunk[];
    totalChunks: number;
  }> {
    const { signal } = options ?? {};
    const fileId = crypto.randomUUID();
    const chunks: TelegramChunk[] = [];

    if (fileBuffer.length <= CHUNK_SIZE) {
      // Single chunk
      const chunkInfo = await this.uploadChunk({ fileId, chunkIndex: 0, chunk: fileBuffer, filename, signal });
      chunks.push(chunkInfo);
    } else {
      // Multiple chunks
      const totalChunks = Math.ceil(fileBuffer.length / CHUNK_SIZE);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, fileBuffer.length);
        const chunk = fileBuffer.slice(start, end);

        const chunkInfo = await this.uploadChunk({ fileId, chunkIndex: i, chunk, filename, signal });
        chunks.push(chunkInfo);

        // Adaptive delay between uploads to avoid rate limiting (increase slightly as we go)
        if (i < totalChunks - 1) {
          const base = 800; // start slightly under a second
          const jitter = Math.floor(Math.random() * 300);
          const stepUp = Math.min(2500, base + i * 50);
          await this.sleep(stepUp + jitter, signal);
        }
      }
    }

    return {
      telegramStorageId: fileId,
      chunks,
      totalChunks: chunks.length,
    };
  }

  async downloadFileByChunks(fileId: string, chunks: TelegramChunk[]): Promise<Buffer> {
    const chunkBuffers: Buffer[] = [];

    for (const chunk of chunks.sort((a, b) => a.chunkIndex - b.chunkIndex)) {
      if (!chunk.fileId) {
        throw new Error(`Missing file ID for chunk ${chunk.chunkIndex}`);
      }

      try {
        const fileInfo = await this.getFile(chunk.fileId);
        if (!fileInfo.file_path) {
          throw new Error(`No file path for chunk ${chunk.chunkIndex}`);
        }

        const encryptedChunk = await this.downloadFile(fileInfo.file_path);
        const encryptionKey = this.generateEncryptionKey(fileId, chunk.chunkIndex);
        const decryptedChunk = this.decryptChunk(encryptedChunk, encryptionKey);

        // Verify chunk integrity
        const actualHash = crypto.createHash('sha256').update(encryptedChunk).digest('hex');
        if (actualHash !== chunk.encryptedHash) {
          throw new Error(`Chunk ${chunk.chunkIndex} integrity check failed`);
        }

        chunkBuffers.push(decryptedChunk);
      } catch (error) {
        throw new Error(`Failed to download chunk ${chunk.chunkIndex}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return Buffer.concat(chunkBuffers);
  }
}

export const telegramStorage = new TelegramStorage();