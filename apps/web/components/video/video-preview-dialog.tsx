'use client';

import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogBody } from '@/components/ui/dialog';
import type { VideoDto } from '@/lib/types';

export function VideoPreviewDialog({
  video,
  open,
  onOpenChange,
}: {
  video: VideoDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!video) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{video.title}</DialogTitle>
        <DialogDescription>{video.filename}</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <video
          controls
          src={video.streamUrl}
          poster={video.thumbnailUrl ?? undefined}
          className="w-full rounded-lg bg-black"
        />
      </DialogBody>
    </Dialog>
  );
}
