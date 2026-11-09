import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { CircleAlert, Compass, FolderOpen, Pause, Play, RotateCw, Trash2, X } from 'lucide-react';

import { EmptyState } from '@/components/page/EmptyState';
import { PageHeader } from '@/components/page/PageHeader';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tag } from '@/components/ui/chip';
import {
  cancelDownloads,
  clearFinishedDownloads,
  describeJob,
  downloadProgress,
  isActive,
  jobTitle,
  openDownloadFolder,
  pauseDownloads,
  resumeDownloads,
  type DownloadJob,
} from '@/lib/downloads';
import { cn } from '@/lib/utils';

import { useDownloads } from './downloadsStore';

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Runs a queue command and keeps its error for the alert line. */
function useQueueAction(): [string | null, (run: () => Promise<unknown>) => void] {
  const [error, setError] = useState<string | null>(null);
  const act = (run: () => Promise<unknown>) => {
    setError(null);
    run().catch(reason => setError(message(reason)));
  };
  return [error, act];
}

function JobRow({ job, act }: { job: DownloadJob; act: (run: () => Promise<unknown>) => void }) {
  const title = jobTitle(job);
  const label = job.chapterLabel ?? job.chapterId;
  const name = `${title}, ${label}`;
  const canPause = job.state === 'queued' || job.state === 'downloading';
  const canResume = job.state === 'paused' || job.state === 'failed';

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 px-6 py-4 [&+&]:border-t [&+&]:border-line">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{title}</span>
          {job.quality === 'dataSaver' && <Tag>Data saver</Tag>}
          {job.auto && <Tag>Followed</Tag>}
        </div>
        <div className="truncate text-sm text-fg-2">{label}</div>
        {job.state !== 'done' && (
          <Progress
            className="mt-2"
            size="md"
            value={downloadProgress(job)}
            label={`${name} progress`}
            tone={job.state === 'failed' ? 'error' : job.state === 'paused' ? 'muted' : 'accent'}
          />
        )}
        <p
          className={cn(
            'm-0 mt-1 flex items-center gap-1.5 text-sm tabular',
            job.state === 'failed' ? 'text-err' : 'text-fg-3'
          )}
        >
          {job.state === 'failed' && <CircleAlert aria-hidden className="size-4 shrink-0" />}
          <span className="min-w-0 break-words">{describeJob(job)}</span>
        </p>
      </div>
      <div className="flex items-center gap-1">
        {canPause && (
          <Button
            variant="quiet"
            size="icon-sm"
            aria-label={`Pause ${name}`}
            onClick={() => act(() => pauseDownloads([job.id]))}
          >
            <Pause />
          </Button>
        )}
        {canResume && (
          <Button
            variant="quiet"
            size="icon-sm"
            aria-label={`${job.state === 'failed' ? 'Retry' : 'Resume'} ${name}`}
            onClick={() => act(() => resumeDownloads([job.id]))}
          >
            {job.state === 'failed' ? <RotateCw /> : <Play />}
          </Button>
        )}
        {job.state !== 'done' && (
          <Button
            variant="quiet"
            size="icon-sm"
            aria-label={`Cancel ${name}`}
            onClick={() => act(() => cancelDownloads([job.id]))}
          >
            <X />
          </Button>
        )}
      </div>
    </li>
  );
}

function JobList({
  title,
  jobs,
  act,
}: {
  title: string;
  jobs: DownloadJob[];
  act: (run: () => Promise<unknown>) => void;
}) {
  const id = `downloads-${title.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <section aria-labelledby={id} className="mb-10 max-w-[820px]">
      <h2 id={id} className="m-0 mb-3 font-display text-xl font-[650] font-condensed">
        {title}
      </h2>
      <ul className="m-0 list-none rounded-panel border border-line bg-ink-1 p-0">
        {jobs.map(job => (
          <JobRow key={job.id} job={job} act={act} />
        ))}
      </ul>
    </section>
  );
}

export function DownloadsPage() {
  const { status, error, jobs, folder } = useDownloads();
  const [actionError, act] = useQueueAction();
  const active = jobs.filter(isActive);
  const finished = jobs.filter(job => !isActive(job));
  const anyRunning = active.some(job => job.state === 'queued' || job.state === 'downloading');
  const anyHeld = active.some(job => job.state === 'paused' || job.state === 'failed');

  return (
    <>
      <PageHeader
        title="Downloads"
        lead="Chapters are written as CBZ archives with ComicInfo.xml, so they open in any reader and survive without KireiManga."
        actions={
          jobs.length > 0 && (
            <>
              {anyRunning && (
                <Button variant="ghost" size="sm" onClick={() => act(() => pauseDownloads())}>
                  <Pause /> Pause all
                </Button>
              )}
              {anyHeld && (
                <Button variant="ghost" size="sm" onClick={() => act(() => resumeDownloads())}>
                  <Play /> Resume all
                </Button>
              )}
              {finished.length > 0 && (
                <Button variant="quiet" size="sm" onClick={() => act(clearFinishedDownloads)}>
                  <Trash2 /> Clear finished
                </Button>
              )}
            </>
          )
        }
      />

      {folder && folder.path && (
        <p className="m-0 mb-6 flex max-w-[820px] flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-3">
          <span className="min-w-0">
            Saving to{' '}
            <code className="font-mono text-[13px] text-fg-2" title={folder.path}>
              {folder.path}
            </code>
          </span>
          <Button variant="quiet" size="sm" onClick={() => act(openDownloadFolder)}>
            <FolderOpen /> Show folder
          </Button>
          {!folder.inLibrary && (
            <span role="alert" className="block w-full text-err">
              This folder is not in your library, so downloads will not show up there
              {folder.error ? `: ${folder.error}` : '.'} Pick another folder in Settings.
            </span>
          )}
        </p>
      )}

      {actionError && (
        <p role="alert" className="m-0 mb-6 max-w-[820px] text-sm text-err">
          {actionError}
        </p>
      )}

      {status === 'error' ? (
        <EmptyState title="Downloads are unavailable" tone="alert">
          <p>{error}</p>
        </EmptyState>
      ) : jobs.length === 0 ? (
        status === 'ready' && (
          <EmptyState
            title="Nothing downloading"
            actions={
              <Button variant="ghost" asChild>
                <Link to="/browse">
                  <Compass /> Browse
                </Link>
              </Button>
            }
          >
            <p>
              Chapters you download from Browse queue up here, then join your library like any other
              folder.
            </p>
          </EmptyState>
        )
      ) : (
        <>
          {active.length > 0 && <JobList title="In progress" jobs={active} act={act} />}
          {finished.length > 0 && <JobList title="Finished" jobs={finished} act={act} />}
        </>
      )}
    </>
  );
}
