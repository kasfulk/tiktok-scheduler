'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Search,
  Plus,
  Trash2,
  Edit3,
  Eye,
  Calendar,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Video as VideoIcon,
  MessageSquare,
} from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';
import { apiFetch, queryKeys } from '@/lib/api-client';
import type { VideoDto } from '@/lib/types';
import type { Paginated } from '@tiktok-scheduler/shared';
import { VIDEO_STATUSES, formatLocalDate, formatLocalTime } from '@tiktok-scheduler/shared';
import { formatBytes, formatDuration } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  EmptyState,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/toggle';
import { Tabs } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/progress';
import { ConfirmDialog } from '@/components/ui/dialog';
import { VideoPreviewDialog } from '@/components/video/video-preview-dialog';
import { VideoEditDialog } from '@/components/video/video-edit-dialog';
import { BulkCaptionDialog } from '@/components/video/bulk-caption-dialog';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  ...VIDEO_STATUSES.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() })),
];

const SORT_OPTIONS = [
  { value: 'createdAt', label: 'Date uploaded' },
  { value: 'title', label: 'Title' },
  { value: 'duration', label: 'Duration' },
  { value: 'fileSize', label: 'File size' },
];

export default function ContentPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('createdAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [previewVideo, setPreviewVideo] = useState<VideoDto | null>(null);
  const [editVideo, setEditVideo] = useState<VideoDto | null>(null);
  const [deleteVideo, setDeleteVideo] = useState<VideoDto | null>(null);
  const [bulkCaptionOpen, setBulkCaptionOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const debouncedSearch = useDebounce(search, 300);

  const queryParams = useMemo(
    () => ({
      status: statusFilter === 'all' ? '' : statusFilter,
      q: debouncedSearch,
      page: page.toString(),
      pageSize: '20',
      sort,
      order,
    }),
    [statusFilter, debouncedSearch, page, sort, order],
  );

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.videos(queryParams),
    queryFn: () => apiFetch<Paginated<VideoDto>>('/api/videos', { json: undefined }),
    placeholderData: (prev) => prev,
  });

  const videos = data?.items ?? [];
  const hasProcessing = videos.some((v) => v.status === 'PROCESSING' || v.status === 'UPLOADING');



  useEffect(() => {
    if (hasProcessing) {
      const interval = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.videos(queryParams) });
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [hasProcessing, queryClient, queryParams]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<VideoDto>(`/api/videos/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.videos() });
      setDeleteVideo(null);
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (videoIds: string[]) =>
      apiFetch<{ deleted: number }>('/api/videos/bulk-delete', {
        method: 'POST',
        json: { videoIds },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.videos() });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
    },
  });

  const allSelected = videos.length > 0 && selectedIds.size === videos.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < videos.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(videos.map((v) => v.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const resetFilters = () => {
    setStatusFilter('all');
    setSearch('');
    setPage(1);
    setSort('createdAt');
    setOrder('desc');
  };

  const handleBulkCaptionSuccess = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.videos() });
    setSelectedIds(new Set());
  };

  const hasFilters = statusFilter !== 'all' || debouncedSearch !== '';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Content Library</h1>
          <p className="text-sm text-muted-foreground">Manage your video uploads and metadata</p>
        </div>
        <Button onClick={() => router.push('/upload')}>
          <Plus className="size-4" />
          Upload video
        </Button>
      </div>

      <Card>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search videos..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>
            <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-auto">
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setOrder(order === 'asc' ? 'desc' : 'asc')}
              aria-label={`Sort ${order === 'asc' ? 'descending' : 'ascending'}`}
            >
              {order === 'asc' ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
            </Button>
          </div>
        </div>

        <div className="border-t border-border px-4 py-3">
          <Tabs
            items={STATUS_FILTERS.map((s) => ({ value: s.value, label: s.label }))}
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
          />
        </div>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 border-t border-border bg-muted/40 px-4 py-2">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setBulkCaptionOpen(true)}>
                <MessageSquare className="size-4" />
                Set caption
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBulkDeleteOpen(true)}
                className="text-error hover:bg-error/10"
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            </div>
          </div>
        )}

        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : videos.length === 0 ? (
            hasFilters ? (
              <EmptyState
                icon={<Search className="size-6" />}
                title="No videos match these filters"
                description="Try adjusting your search or filter criteria"
                action={
                  <Button variant="outline" onClick={resetFilters}>
                    Reset filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={<VideoIcon className="size-6" />}
                title="No videos yet"
                description="Upload your first video to get started"
                action={
                  <Button onClick={() => router.push('/upload')}>
                    <Plus className="size-4" />
                    Upload video
                  </Button>
                }
              />
            )
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={allSelected}
                        indeterminate={someSelected}
                        onChange={toggleSelectAll}
                        label="Select all videos"
                      />
                    </TableHead>
                    <TableHead>Video</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Resolution</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {videos.map((video) => (
                    <TableRow key={video.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(video.id)}
                          onChange={() => toggleSelect(video.id)}
                          label={`Select ${video.title}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="aspect-video w-20 overflow-hidden rounded bg-muted">
                            {video.thumbnailUrl ? (
                              <img
                                src={video.thumbnailUrl}
                                alt=""
                                className="size-full object-cover"
                              />
                            ) : (
                              <div className="flex size-full items-center justify-center">
                                <VideoIcon className="size-4 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{video.title}</p>
                            <p className="truncate text-xs text-muted-foreground">{video.filename}</p>
                            {video.status === 'FAILED' && video.processingError && (
                              <p className="mt-1 text-xs text-error">{video.processingError}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="tabular">{formatDuration(video.duration)}</TableCell>
                      <TableCell className="tabular">
                        {video.width && video.height ? `${video.width}×${video.height}` : '—'}
                      </TableCell>
                      <TableCell className="tabular">{formatBytes(video.fileSize)}</TableCell>
                      <TableCell>
                        <StatusBadge status={video.status} />
                      </TableCell>
                      <TableCell>
                        {video.scheduledPost ? (
                          <div className="text-xs">
                            <p className="font-medium">
                              {formatLocalDate(video.scheduledPost.scheduledAt, 'UTC')}{' '}
                              {formatLocalTime(video.scheduledPost.scheduledAt, 'UTC')}
                            </p>
                            <p className="text-muted-foreground">
                              @{video.scheduledPost.accountUsername}
                            </p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <RowActions
                          onPreview={() => setPreviewVideo(video)}
                          onEdit={() => setEditVideo(video)}
                          onDelete={() => setDeleteVideo(video)}
                          onMoveToQueue={() => router.push(`/calendar?videoId=${video.id}`)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {data && data.totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-border px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    Page {data.page} of {data.totalPages} · {data.total} video
                    {data.total !== 1 ? 's' : ''}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={page >= data.totalPages}
                      onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                      aria-label="Next page"
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <VideoPreviewDialog
        video={previewVideo}
        open={!!previewVideo}
        onOpenChange={(open) => !open && setPreviewVideo(null)}
      />

      <VideoEditDialog
        video={editVideo}
        open={!!editVideo}
        onOpenChange={(open) => !open && setEditVideo(null)}
      />

      <ConfirmDialog
        open={!!deleteVideo}
        onOpenChange={(open) => !open && setDeleteVideo(null)}
        title="Delete video"
        description={`Are you sure you want to delete "${deleteVideo?.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => deleteVideo && deleteMutation.mutate(deleteVideo.id)}
        pending={deleteMutation.isPending}
      />

      <BulkCaptionDialog
        open={bulkCaptionOpen}
        onOpenChange={setBulkCaptionOpen}
        videoIds={Array.from(selectedIds)}
        onSuccess={handleBulkCaptionSuccess}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`Delete ${selectedIds.size} video${selectedIds.size !== 1 ? 's' : ''}`}
        description={`Are you sure you want to delete ${selectedIds.size} video${selectedIds.size !== 1 ? 's' : ''}? Any scheduled posts for these videos will also be removed. This action cannot be undone.`}
        confirmLabel="Delete all"
        onConfirm={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
        pending={bulkDeleteMutation.isPending}
      />
    </div>
  );
}

function RowActions({
  onPreview,
  onEdit,
  onDelete,
  onMoveToQueue,
}: {
  onPreview: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMoveToQueue: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button variant="ghost" size="icon" onClick={() => setOpen(!open)} aria-label="Actions">
        <MoreHorizontal className="size-4" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-border bg-card p-1 shadow-lg">
            <button
              type="button"
              onClick={() => {
                onPreview();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              <Eye className="size-4" />
              Preview
            </button>
            <button
              type="button"
              onClick={() => {
                onEdit();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              <Edit3 className="size-4" />
              Edit metadata
            </button>
            <button
              type="button"
              onClick={() => {
                onMoveToQueue();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              <Calendar className="size-4" />
              Move to queue
            </button>
            <div className="my-1 border-t border-border" />
            <button
              type="button"
              onClick={() => {
                onDelete();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-error hover:bg-error/10"
            >
              <Trash2 className="size-4" />
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}
