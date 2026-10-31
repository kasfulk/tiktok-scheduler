'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { TIKTOK_CAPTION_MAX_LENGTH } from '@tiktok-scheduler/shared';

import { apiFetch, ApiClientError, queryKeys } from '@/lib/api-client';
import type { CaptionTemplateDto } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Textarea, Label, FieldError } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/toggle';
import { Skeleton } from '@/components/ui/progress';
import { EmptyState } from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface TemplateFormValues {
  name: string;
  content: string;
  isDefault: boolean;
}

export default function TemplatesPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.captionTemplates,
    queryFn: () => apiFetch<{ items: CaptionTemplateDto[] }>('/api/caption-templates'),
  });

  const [editingTemplate, setEditingTemplate] = useState<CaptionTemplateDto | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState<CaptionTemplateDto | null>(null);

  const createMutation = useMutation({
    mutationFn: (values: TemplateFormValues) =>
      apiFetch<CaptionTemplateDto>('/api/caption-templates', { method: 'POST', json: values }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.captionTemplates });
      toast.success('Template created');
      setCreateOpen(false);
    },
    onError: (error: ApiClientError) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Partial<TemplateFormValues> }) =>
      apiFetch<CaptionTemplateDto>(`/api/caption-templates/${id}`, { method: 'PATCH', json: values }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.captionTemplates });
      toast.success('Template updated');
      setEditingTemplate(null);
    },
    onError: (error: ApiClientError) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/caption-templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.captionTemplates });
      toast.success('Template deleted');
      setDeletingTemplate(null);
    },
    onError: (error: ApiClientError) => toast.error(error.message),
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<CaptionTemplateDto>(`/api/caption-templates/${id}`, { method: 'PATCH', json: { isDefault: true } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.captionTemplates });
      toast.success('Default template updated');
    },
    onError: (error: ApiClientError) => toast.error(error.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Caption Templates</h1>
          <p className="text-xs text-muted-foreground">Reusable captions with placeholders.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Caption Templates</h1>
          <p className="text-xs text-muted-foreground">Reusable captions with placeholders.</p>
        </div>
        <Card>
          <CardContent className="py-8 text-center text-xs text-error">Failed to load templates.</CardContent>
        </Card>
      </div>
    );
  }

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Caption Templates</h1>
          <p className="text-xs text-muted-foreground">Reusable captions with placeholders.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>New template</Button>
      </div>

      <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Available placeholders:{' '}
        <code className="rounded bg-muted px-1 font-mono text-[11px]">{'{title}'}</code>{' '}
        <code className="rounded bg-muted px-1 font-mono text-[11px]">{'{description}'}</code>{' '}
        <code className="rounded bg-muted px-1 font-mono text-[11px]">{'{hashtags}'}</code>
      </div>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            title="No templates yet"
            description="Create a caption template to reuse across your scheduled posts. Templates support placeholders for video title, description and hashtags."
            action={<Button onClick={() => setCreateOpen(true)}>Create template</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((template) => (
            <Card key={template.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{template.name}</p>
                    <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{template.content}</p>
                  </div>
                  {template.isDefault ? <Badge variant="info">default</Badge> : null}
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="tabular">
                    {template.content.length}/{TIKTOK_CAPTION_MAX_LENGTH}
                  </span>
                  <div className="flex gap-2">
                    {!template.isDefault ? (
                      <Button variant="ghost" size="sm" onClick={() => setDefaultMutation.mutate(template.id)}>
                        Set default
                      </Button>
                    ) : null}
                    <Button variant="ghost" size="sm" onClick={() => setEditingTemplate(template)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeletingTemplate(template)}
                      className="text-error hover:text-error"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <TemplateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={(values) => createMutation.mutate(values)}
        pending={createMutation.isPending}
        title="New template"
      />

      {editingTemplate ? (
        <TemplateDialog
          open={true}
          onOpenChange={(open) => !open && setEditingTemplate(null)}
          onSubmit={(values) => updateMutation.mutate({ id: editingTemplate.id, values })}
          pending={updateMutation.isPending}
          title="Edit template"
          defaultValues={{
            name: editingTemplate.name,
            content: editingTemplate.content,
            isDefault: editingTemplate.isDefault,
          }}
        />
      ) : null}

      <ConfirmDialog
        open={!!deletingTemplate}
        onOpenChange={(open) => !open && setDeletingTemplate(null)}
        title="Delete template"
        description={`Are you sure you want to delete "${deletingTemplate?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => deletingTemplate && deleteMutation.mutate(deletingTemplate.id)}
        pending={deleteMutation.isPending}
      />
    </div>
  );
}

function TemplateDialog({
  open,
  onOpenChange,
  onSubmit,
  pending,
  title,
  defaultValues,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: TemplateFormValues) => void;
  pending: boolean;
  title: string;
  defaultValues?: TemplateFormValues;
}) {
  const {
    register,
    handleSubmit,
    watch,
    control,
    setError,
    formState: { errors },
  } = useForm<TemplateFormValues>({
    defaultValues: defaultValues ?? { name: '', content: '', isDefault: false },
  });

  const content = watch('content');
  const charCount = content?.length ?? 0;
  const isOverLimit = charCount > TIKTOK_CAPTION_MAX_LENGTH;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <form
        onSubmit={handleSubmit((values) => {
          if (values.content.length > TIKTOK_CAPTION_MAX_LENGTH) {
            setError('content', { message: `Content exceeds ${TIKTOK_CAPTION_MAX_LENGTH} characters` });
            return;
          }
          onSubmit(values);
        })}
        noValidate
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Use placeholders{' '}
            <code className="rounded bg-muted px-1 font-mono text-[11px]">{'{title}'}</code>{' '}
            <code className="rounded bg-muted px-1 font-mono text-[11px]">{'{description}'}</code>{' '}
            <code className="rounded bg-muted px-1 font-mono text-[11px]">{'{hashtags}'}</code>{' '}
            to inject video metadata at publish time.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="template-name">Name</Label>
              <Input id="template-name" {...register('name', { required: 'Name is required' })} />
              <FieldError>{errors.name?.message}</FieldError>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="template-content">Content</Label>
              <Textarea id="template-content" rows={5} {...register('content', { required: 'Content is required' })} />
              <div className="flex items-center justify-between">
                <FieldError>{errors.content?.message}</FieldError>
                <span className={cn('text-xs tabular', isOverLimit ? 'text-error' : 'text-muted-foreground')}>
                  {charCount}/{TIKTOK_CAPTION_MAX_LENGTH}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <Label htmlFor="template-default" className="text-sm font-medium text-foreground">
                Set as default template
              </Label>
              <Controller
                name="isDefault"
                control={control}
                render={({ field }) => (
                  <Switch id="template-default" label="Set as default template" checked={field.value} onCheckedChange={field.onChange} />
                )}
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || isOverLimit}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
