import {
  ArrowLeft,
  BookOpen,
  RectangleVertical,
  ScrollText,
  SlidersHorizontal,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Segmented, SegmentedItem } from '@/components/ui/segmented';
import { cn } from '@/lib/utils';

import type { Direction, ReaderMode } from '../model/prefs';
import { useKeyLabel } from './readerKeys';
import { Tip } from './Tip';

const MODES = [
  { value: 'single', label: 'Single', icon: RectangleVertical, command: 'mode-single' },
  { value: 'double', label: 'Double', icon: BookOpen, command: 'mode-double' },
  { value: 'webtoon', label: 'Webtoon', icon: ScrollText, command: 'mode-webtoon' },
] as const;

type ModeEntry = (typeof MODES)[number];

/** One mode button, with the key the reader bound to it. */
function ModeItem({ value, label, icon: Icon, command }: ModeEntry) {
  return (
    // The tooltip sits on a wrapper: its trigger writes data-state, which
    // would hide the item's own "on" state.
    <Tip label={label} keys={useKeyLabel(command)}>
      <span className="inline-flex">
        <SegmentedItem value={value} aria-label={label}>
          <Icon />
          <span className="max-md:hidden">{label}</span>
        </SegmentedItem>
      </span>
    </Tip>
  );
}

/** Top glass bar: close, what is open, mode, direction and the image panel. */
export function ReaderBar({
  title,
  subtitle,
  mode,
  direction,
  panelOpen,
  visible,
  fullscreen,
  onClose,
  onMode,
  onDirection,
  onPanel,
}: {
  title: string;
  subtitle: string;
  mode: ReaderMode;
  direction: Direction;
  panelOpen: boolean;
  visible: boolean;
  fullscreen: boolean;
  onClose: () => void;
  onMode: (mode: ReaderMode) => void;
  onDirection: () => void;
  onPanel: () => void;
}) {
  const closeKey = useKeyLabel('close');
  const directionKey = useKeyLabel('toggle-direction');
  const panelKey = useKeyLabel('toggle-panel');
  return (
    <header
      data-tauri-drag-region
      data-testid="reader-bar"
      inert={!visible}
      className={cn(
        'glass absolute inset-x-0 top-0 z-[3] m-3 flex items-center gap-3 rounded-2xl p-2',
        'transition-[opacity,transform] duration-slow ease-expo',
        // Room for the macOS traffic lights over the overlay title bar.
        !fullscreen && '[:root[data-chrome=overlay]_&]:pl-[84px]',
        !visible && 'pointer-events-none -translate-y-3 opacity-0'
      )}
    >
      <Tip label="Close" keys={closeKey}>
        <Button variant="ghost" size="icon" aria-label="Close reader" onClick={onClose}>
          <ArrowLeft />
        </Button>
      </Tip>
      <div data-tauri-drag-region className="grid min-w-0 leading-tight">
        <strong className="truncate font-semibold">{title}</strong>
        <span className="truncate text-xs text-fg-3 tabular-nums">{subtitle}</span>
      </div>
      <div data-tauri-drag-region className="flex-1 self-stretch" />
      <Segmented
        aria-label="Reading mode"
        value={mode}
        onValueChange={value => onMode(value as ReaderMode)}
        className="flex-none bg-[oklch(0_0_0/0.25)]"
      >
        {MODES.map(entry => (
          <ModeItem key={entry.value} {...entry} />
        ))}
      </Segmented>
      <Tip label="Reading direction" keys={directionKey}>
        <Button
          variant="ghost"
          size="sm"
          className="max-md:hidden"
          disabled={mode === 'webtoon'}
          onClick={onDirection}
        >
          {direction === 'rtl' ? 'Right to left' : 'Left to right'}
        </Button>
      </Tip>
      <Tip label="Image and layout" keys={panelKey}>
        <Button
          variant={panelOpen ? 'primary' : 'ghost'}
          size="icon"
          aria-label="Image adjustments"
          aria-expanded={panelOpen}
          onClick={onPanel}
        >
          <SlidersHorizontal />
        </Button>
      </Tip>
    </header>
  );
}
