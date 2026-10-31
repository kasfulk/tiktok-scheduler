'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Upload as UploadIcon, X, CheckCircle2, AlertCircle, Loader2, Film } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/table';
import { useUpload, type UploadItem } from '@/components/video/use-upload';
import { formatBytes, formatDuration, cn } from '@/lib/utils';

const ALLOWED_EXTENSIONS = ['.mp4', '.mov', '.webm'];
const ALLOWED_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
const MAX_UPLOAD_SIZE_MB = 287;
const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

interface ValidationError {
  file: File;
  error: string;
}

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const { items, startUpload, retryItem, clearAll } = useUpload();

  const validateFiles = useCallback((files: File[]): { valid: File[]; errors: ValidationError[] } => {
    const valid: File[] = [];
    const errors: ValidationError[] = [];

    for (const file of files) {
      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        errors.push({ file, error: 'Invalid file type. Only MP4, MOV, and WebM are allowed.' });
        continue;
      }
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        errors.push({ file, error: 'Invalid MIME type.' });
        continue;
      }
      if (file.size === 0) {
        errors.push({ file, error: 'File is empty.' });
        continue;
      }
      if (file.size > MAX_UPLOAD_SIZE_BYTES) {
        errors.push({
          file,
          error: `File exceeds maximum size of ${MAX_UPLOAD_SIZE_MB} MB.`,
        });
        continue;
      }
      valid.push(file);
    }

    return { valid, errors };
  }, []);

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const { valid, errors } = validateFiles(fileArray);
      setValidationErrors(errors);
      if (valid.length > 0) {
        setPendingFiles((prev) => [...prev, ...valid]);
      }
    },
    [validateFiles],
  );

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
      }
    },
    [handleFiles],
  );

  const removePendingFile = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleStartUpload = useCallback(() => {
    if (!navigator.onLine) {
      setValidationErrors([
        {
          file: new File([], 'offline'),
          error: 'You are offline. Please check your internet connection.',
        },
      ]);
      return;
    }
    if (pendingFiles.length > 0) {
      startUpload(pendingFiles);
      setPendingFiles([]);
    }
  }, [pendingFiles, startUpload]);

  const totalBytes = pendingFiles.reduce((sum, f) => sum + f.size, 0);
  const uploadedCount = items.filter((i) => i.status === 'done').length;
  const failedCount = items.filter((i) => i.status === 'error').length;
  const isUploading = items.some((i) => i.status === 'uploading' || i.status === 'processing');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Upload Videos</h1>
        <p className="text-sm text-muted-foreground">
          Upload videos to your content library. They will be processed and ready for scheduling.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select files</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={cn(
              'flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-8 transition-colors',
              dragActive && 'border-primary bg-primary/5',
            )}
          >
            <UploadIcon className="mb-3 size-10 text-muted-foreground" />
            <p className="mb-1 text-sm font-medium">Drag and drop videos here</p>
            <p className="mb-4 text-xs text-muted-foreground">
              MP4, MOV, or WebM · Max {MAX_UPLOAD_SIZE_MB} MB per file
            </p>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                Choose files
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm"
                multiple
                onChange={handleFileInput}
                className="hidden"
                disabled={isUploading}
              />
            </div>
          </div>

          {validationErrors.length > 0 && (
            <div className="space-y-2 rounded-lg border border-error/30 bg-error/5 p-3">
              {validationErrors.map((err, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-error">
                  <AlertCircle className="mt-0.5 size-3 shrink-0" />
                  <span>
                    <strong>{err.file.name}</strong>: {err.error}
                  </span>
                </div>
              ))}
            </div>
          )}

          {pendingFiles.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  {pendingFiles.length} file{pendingFiles.length !== 1 ? 's' : ''} selected ·{' '}
                  <span className="tabular text-muted-foreground">{formatBytes(totalBytes)}</span>
                </p>
                <Button variant="ghost" size="sm" onClick={() => setPendingFiles([])}>
                  Clear all
                </Button>
              </div>
              <div className="space-y-1">
                {pendingFiles.map((file, i) => (
                  <div
                    key={`${file.name}-${i}`}
                    className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Film className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm">{file.name}</span>
                      <span className="shrink-0 text-xs tabular text-muted-foreground">
                        {formatBytes(file.size)}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={() => removePendingFile(i)}
                      aria-label={`Remove ${file.name}`}
                    >
                      <X className="size-3" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button onClick={handleStartUpload} disabled={!navigator.onLine}>
                {navigator.onLine ? (
                  <>Start upload ({pendingFiles.length})</>
                ) : (
                  <>Offline — cannot upload</>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {items.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Upload progress</CardTitle>
              <div className="flex items-center gap-3 text-xs">
                <Badge variant="success">{uploadedCount} uploaded</Badge>
                {failedCount > 0 && <Badge variant="error">{failedCount} failed</Badge>}
                {isUploading && (
                  <Badge variant="info" className="gap-1">
                    <Loader2 className="size-3 animate-spin" />
                    Processing
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {items.map((item) => (
                <UploadItemRow
                  key={item.id}
                  item={item}
                  onRetry={() => retryItem(item.id)}
                  onViewInLibrary={() => router.push('/content')}
                />
              ))}
            </div>
            {!isUploading && items.length > 0 && (
              <div className="mt-4 flex justify-end">
                <Button variant="outline" size="sm" onClick={clearAll}>
                  Clear completed
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {items.length === 0 && pendingFiles.length === 0 && (
        <Card>
          <EmptyState
            icon={<UploadIcon className="size-6" />}
            title="No uploads yet"
            description="Select files above to start uploading videos to your library"
          />
        </Card>
      )}
    </div>
  );
}

function UploadItemRow({
  item,
  onRetry,
  onViewInLibrary,
}: {
  item: UploadItem;
  onRetry: () => void;
  onViewInLibrary: () => void;
}) {
  const { file, progress, status, video, error } = item;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-3">
      <div className="aspect-video w-16 shrink-0 overflow-hidden rounded bg-muted">
        {video?.thumbnailUrl ? (
          <img src={video.thumbnailUrl} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center">
            <Film className="size-4 text-muted-foreground" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{file.name}</p>
          {status === 'done' && <CheckCircle2 className="size-4 shrink-0 text-success" />}
          {status === 'error' && <AlertCircle className="size-4 shrink-0 text-error" />}
          {(status === 'uploading' || status === 'processing') && (
            <Loader2 className="size-4 shrink-0 animate-spin text-chart-1" />
          )}
        </div>

        {status === 'uploading' && (
          <div className="mt-1.5 flex items-center gap-2">
            <Progress value={progress} className="h-1.5 flex-1" />
            <span className="text-xs tabular text-muted-foreground">{progress}%</span>
          </div>
        )}

        {status === 'processing' && (
          <p className="mt-1 text-xs text-muted-foreground">
            Processing video metadata and generating thumbnail...
          </p>
        )}

        {status === 'error' && error && (
          <p className="mt-1 text-xs text-error">{error}</p>
        )}

        {status === 'done' && video && (
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            {video.duration > 0 && <span className="tabular">{formatDuration(video.duration)}</span>}
            {video.width && video.height && (
              <span className="tabular">
                {video.width}×{video.height}
              </span>
            )}
            <span className="tabular">{formatBytes(video.fileSize)}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {status === 'error' && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        )}
        {status === 'done' && (
          <Button variant="outline" size="sm" onClick={onViewInLibrary}>
            View in library
          </Button>
        )}
      </div>
    </div>
  );
}
