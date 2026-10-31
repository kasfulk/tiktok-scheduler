'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Input, Textarea, Label, FieldError } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TIKTOK_CAPTION_MAX_LENGTH } from '@tiktok-scheduler/shared';
import type { VideoDto } from '@/lib/types';
import { apiFetch } from '@/lib/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/api-client';

export function VideoEditDialog({
  video,
  open,
  onOpenChange,
}: {
  video: VideoDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (video && open) {
      setTitle(video.title);
      setCaption(video.caption ?? '');
      setHashtags(video.hashtags ?? '');
      setError(null);
    }
  }, [video, open]);

  if (!video) return null;

  const captionLength = caption.length;
  const isOverLimit = captionLength > TIKTOK_CAPTION_MAX_LENGTH;

  async function handleSave() {
    if (!video || isOverLimit) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch<VideoDto>(`/api/videos/${video.id}`, {
        method: 'PATCH',
        json: { title, caption: caption || null, hashtags: hashtags || null },
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.videos() });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Edit video</DialogTitle>
        <DialogDescription>Update metadata for {video.filename}</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-title">Title</Label>
            <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-caption">Caption</Label>
            <Textarea
              id="edit-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
            />
            <div className="flex justify-end">
              <span className={`text-xs tabular ${isOverLimit ? 'text-error' : 'text-muted-foreground'}`}>
                {captionLength} / {TIKTOK_CAPTION_MAX_LENGTH}
              </span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-hashtags">Hashtags</Label>
            <Input
              id="edit-hashtags"
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              placeholder="#fyp #viral"
            />
          </div>
          {error && <FieldError>{error}</FieldError>}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving || isOverLimit}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
