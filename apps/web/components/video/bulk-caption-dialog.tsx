'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Input, Textarea, Label, Select, FieldError } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, queryKeys } from '@/lib/api-client';
import type { CaptionTemplateDto } from '@/lib/types';

interface BulkCaptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoIds: string[];
  onSuccess: () => void;
}

export function BulkCaptionDialog({ open, onOpenChange, videoIds, onSuccess }: BulkCaptionDialogProps) {
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [append, setAppend] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: templates } = useQuery({
    queryKey: queryKeys.captionTemplates,
    queryFn: () => apiFetch<CaptionTemplateDto[]>('/api/caption-templates'),
  });

  useEffect(() => {
    if (open) {
      setCaption('');
      setHashtags('');
      setTemplateId('');
      setAppend(false);
      setError(null);
    }
  }, [open]);

  async function handleSave() {
    if (videoIds.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch<{ updated: number }>('/api/videos/bulk-caption', {
        method: 'POST',
        json: {
          videoIds,
          caption: caption || undefined,
          hashtags: hashtags || undefined,
          captionTemplateId: templateId || undefined,
          append,
        },
      });
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update captions');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Set caption for {videoIds.length} video{videoIds.length !== 1 ? 's' : ''}</DialogTitle>
        <DialogDescription>Apply caption and hashtags to selected videos</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bulk-caption">Caption</Label>
            <Textarea
              id="bulk-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              placeholder="Enter caption..."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-hashtags">Hashtags</Label>
            <Input
              id="bulk-hashtags"
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              placeholder="#fyp #viral"
            />
          </div>
          {templates && templates.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="bulk-template">Caption template (optional)</Label>
              <Select id="bulk-template" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                <option value="">None</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="bulk-append"
              checked={append}
              onChange={(e) => setAppend(e.target.checked)}
              className="size-4 rounded border-border accent-[var(--primary)]"
            />
            <Label htmlFor="bulk-append" className="cursor-pointer">
              Append to existing captions
            </Label>
          </div>
          {error && <FieldError>{error}</FieldError>}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Updating...' : 'Update captions'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
