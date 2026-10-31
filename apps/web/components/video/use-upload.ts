'use client';

import { useState, useCallback, useRef } from 'react';
import type { VideoDto } from '@/lib/types';
import { apiFetch } from '@/lib/api-client';

export type UploadStatus = 'queued' | 'uploading' | 'processing' | 'done' | 'error';

export interface UploadItem {
  id: string;
  file: File;
  progress: number;
  status: UploadStatus;
  video: VideoDto | null;
  error: string | null;
}

const MAX_CONCURRENT = 3;
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 60;

function uploadFile(
  file: File,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
): Promise<VideoDto> {
  const { promise, resolve, reject } = Promise.withResolvers<VideoDto>();
  const xhr = new XMLHttpRequest();
  const formData = new FormData();
  formData.append('file', file);
  formData.append('title', file.name.replace(/\.[^.]+$/, ''));

  xhr.open('POST', '/api/videos/upload');
  xhr.withCredentials = true;

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      onProgress(Math.round((e.loaded / e.total) * 100));
    }
  };

  xhr.onload = () => {
    try {
      const parsed = JSON.parse(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300 && parsed?.data) {
        resolve(parsed.data.video as VideoDto);
      } else if (parsed?.error) {
        reject(new Error(parsed.error.message || 'Upload failed'));
      } else {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    } catch {
      reject(new Error('Invalid server response'));
    }
  };

  xhr.onerror = () => reject(new Error('Network error during upload'));
  xhr.onabort = () => reject(new Error('Upload cancelled'));

  signal.addEventListener('abort', () => xhr.abort());
  xhr.send(formData);
  return promise;
}

async function pollVideoStatus(
  id: string,
  signal: AbortSignal,
): Promise<VideoDto> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    if (signal.aborted) throw new Error('Cancelled');
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, POLL_INTERVAL_MS);
    await promise;
    if (signal.aborted) throw new Error('Cancelled');
    const video = await apiFetch<VideoDto>(`/api/videos/${id}`);
    if (video.status === 'READY' || video.status === 'FAILED') {
      return video;
    }
  }
  throw new Error('Processing timed out');
}

export function useUpload() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const activeCountRef = useRef(0);
  const queueRef = useRef<UploadItem[]>([]);

  const processItem = useCallback(async (item: UploadItem) => {
    const controller = new AbortController();
    activeCountRef.current++;

    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: 'uploading' as const, progress: 0 } : i)),
    );

    try {
      const video = await uploadFile(
        item.file,
        (progress) => {
          setItems((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, progress } : i)),
          );
        },
        controller.signal,
      );

      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: 'processing' as const, progress: 100, video: video } : i)),
      );

      const finalVideo = await pollVideoStatus(video.id, controller.signal);

      if (finalVideo.status === 'FAILED') {
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, status: 'error' as const, video: finalVideo, error: finalVideo.processingError ?? 'Processing failed' }
              : i,
          ),
        );
      } else {
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: 'done' as const, video: finalVideo } : i)),
        );
      }
    } catch (err) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, status: 'error' as const, error: err instanceof Error ? err.message : 'Upload failed' }
            : i,
        ),
      );
    } finally {
      activeCountRef.current--;
      drainQueue();
    }
  }, []);

  const drainQueue = useCallback(() => {
    while (activeCountRef.current < MAX_CONCURRENT && queueRef.current.length > 0) {
      const next = queueRef.current.shift()!;
      processItem(next);
    }
  }, [processItem]);

  const startUpload = useCallback(
    (files: File[]) => {
      if (!navigator.onLine) return;

      abortRef.current = new AbortController();

      const newItems: UploadItem[] = files.map((file, idx) => ({
        id: `${Date.now()}-${idx}-${file.name}`,
        file,
        progress: 0,
        status: 'queued',
        video: null,
        error: null,
      }));

      setItems((prev) => [...prev, ...newItems]);
      queueRef.current.push(...newItems);
      drainQueue();
    },
    [drainQueue],
  );

  const retryItem = useCallback(
    (itemId: string) => {
      setItems((prev) => {
        const item = prev.find((i) => i.id === itemId);
        if (!item) return prev;
        const resetItem: UploadItem = { ...item, status: 'queued', progress: 0, error: null, video: null };
        queueRef.current.push(resetItem);
        drainQueue();
        return prev.map((i) => (i.id === itemId ? resetItem : i));
      });
    },
    [drainQueue],
  );

  const clearCompleted = useCallback(() => {
    setItems((prev) => prev.filter((i) => i.status !== 'done'));
  }, []);

  const clearAll = useCallback(() => {
    abortRef.current?.abort();
    setItems([]);
    queueRef.current = [];
    activeCountRef.current = 0;
  }, []);

  return { items, startUpload, retryItem, clearCompleted, clearAll };
}
