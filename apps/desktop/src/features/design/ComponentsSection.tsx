import { useState } from 'react';
import {
  BookOpen,
  Columns2,
  FileText,
  FolderOpen,
  Globe,
  HardDrive,
  Info,
  Pause,
  RotateCw,
  Search,
  SlidersHorizontal,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';

import kireiFull from '@/assets/kirei/full.webp';
import { Button } from '@/components/ui/button';
import { Chip, Tag } from '@/components/ui/chip';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Panel } from '@/components/ui/panel';
import { Progress } from '@/components/ui/progress';
import { Segmented, SegmentedItem } from '@/components/ui/segmented';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Kbd, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { Caption, Section, Specimen } from './Section';

const BUTTON_ROWS = [
  { variant: 'primary', label: 'Resume chapter 42', icon: BookOpen },
  { variant: 'secondary', label: 'Open folder', icon: FolderOpen },
  { variant: 'ghost', label: 'Series details', icon: Info },
  { variant: 'quiet', label: 'Retry', icon: RotateCw },
  { variant: 'danger', label: 'Remove', icon: Trash2 },
] as const;

function ButtonsSpecimen() {
  return (
    <Specimen label="Button" note="Pills. Primary once per view. Hover and press are live.">
      <div className="grid gap-4">
        {BUTTON_ROWS.map(({ variant, label, icon: Icon }) => (
          <div key={variant} className="flex flex-wrap items-center gap-3">
            <span className="w-20">
              <Caption>{variant}</Caption>
            </span>
            <Button variant={variant}>
              <Icon /> {label}
            </Button>
            <Button variant={variant} size="sm">
              Small
            </Button>
            <Button variant={variant} size="icon" aria-label="Adjust">
              <SlidersHorizontal />
            </Button>
            <Button variant={variant} size="icon-sm" aria-label="Pause">
              <Pause />
            </Button>
            <Button variant={variant} disabled>
              Disabled
            </Button>
            <Button
              variant={variant}
              size="sm"
              className="outline-2 outline-offset-2 outline-accent outline-solid"
            >
              Focused
            </Button>
          </div>
        ))}
      </div>
    </Specimen>
  );
}

function ControlsSpecimens() {
  const [mode, setMode] = useState('double');
  const [dir, setDir] = useState('rtl');
  const [brightness, setBrightness] = useState([100]);
  const [chips, setChips] = useState({ local: true, mangadex: false, reading: true });
  const [lang, setLang] = useState('en');

  return (
    <>
      <Specimen label="Segmented" note="One of a few. The selected segment inverts.">
        <Segmented aria-label="Reader mode" value={mode} onValueChange={setMode}>
          <SegmentedItem value="single">
            <Smartphone /> Single
          </SegmentedItem>
          <SegmentedItem value="double">
            <Columns2 /> Double
          </SegmentedItem>
          <SegmentedItem value="webtoon">
            <FileText /> Webtoon
          </SegmentedItem>
        </Segmented>
        <Segmented aria-label="Direction" value={dir} onValueChange={setDir}>
          <SegmentedItem value="rtl">Right to left</SegmentedItem>
          <SegmentedItem value="ltr">Left to right</SegmentedItem>
        </Segmented>
        <Segmented aria-label="Parallel downloads" defaultValue="2" size="sm">
          <SegmentedItem value="1">1</SegmentedItem>
          <SegmentedItem value="2">2</SegmentedItem>
          <SegmentedItem value="3">3</SegmentedItem>
        </Segmented>
        <Segmented aria-label="Disabled example" defaultValue="a" disabled>
          <SegmentedItem value="a">Disabled</SegmentedItem>
          <SegmentedItem value="b">Group</SegmentedItem>
        </Segmented>
      </Specimen>

      <Specimen label="Chip and tag" note="Chips toggle filters; tags only label.">
        <Chip pressed={chips.local} onPressedChange={v => setChips(c => ({ ...c, local: v }))}>
          <HardDrive /> Local
        </Chip>
        <Chip
          pressed={chips.mangadex}
          onPressedChange={v => setChips(c => ({ ...c, mangadex: v }))}
        >
          <Globe /> MangaDex
        </Chip>
        <Chip pressed={chips.reading} onPressedChange={v => setChips(c => ({ ...c, reading: v }))}>
          Reading
        </Chip>
        <Chip disabled>Disabled</Chip>
        <span className="mx-2 h-6 w-px bg-line" aria-hidden />
        <Tag>Slice of life</Tag>
        <Tag>Mystery</Tag>
        <Tag>Ongoing</Tag>
      </Specimen>

      <Specimen label="Switch" note="Applies at once. Always labelled.">
        <label className="flex items-center gap-3 text-sm">
          <Switch defaultChecked /> Cover theming
        </label>
        <label className="flex items-center gap-3 text-sm">
          <Switch /> Invert for night reading
        </label>
        <label className="flex items-center gap-3 text-sm text-fg-3">
          <Switch disabled defaultChecked /> Disabled on
        </label>
        <label className="flex items-center gap-3 text-sm text-fg-3">
          <Switch disabled /> Disabled off
        </label>
      </Specimen>

      <Specimen label="Slider" note="Continuous values in the adjust panel.">
        <div className="grid w-full max-w-[300px] gap-1">
          <div className="flex justify-between text-sm text-fg-2">
            <span id="ds-brightness">Brightness</span>
            <output className="text-fg-1 tabular">{brightness[0]}%</output>
          </div>
          <Slider
            aria-labelledby="ds-brightness"
            value={brightness}
            onValueChange={setBrightness}
            min={50}
            max={150}
          />
        </div>
        <div className="grid w-full max-w-[300px] gap-1">
          <div className="flex justify-between text-sm text-fg-3">
            <span id="ds-sharpen">Sharpen (disabled)</span>
            <output className="tabular">0%</output>
          </div>
          <Slider aria-labelledby="ds-sharpen" defaultValue={[0]} disabled />
        </div>
      </Specimen>

      <Specimen label="Select" note="Short lists of fixed options.">
        <Select value={lang} onValueChange={setLang}>
          <SelectTrigger aria-label="Interface language">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="pl">Polski</SelectItem>
            <SelectItem value="ja">日本語</SelectItem>
          </SelectContent>
        </Select>
        <Select defaultValue="lanczos3">
          <SelectTrigger aria-label="Resampling">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="lanczos3">Lanczos3</SelectItem>
            <SelectItem value="catmull">Catmull-Rom</SelectItem>
            <SelectItem value="nearest">Nearest, for pixel art</SelectItem>
          </SelectContent>
        </Select>
        <Select>
          <SelectTrigger aria-label="Fit">
            <SelectValue placeholder="Choose a fit" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="height">Height</SelectItem>
            <SelectItem value="width">Width</SelectItem>
          </SelectContent>
        </Select>
        <Select disabled defaultValue="glow">
          <SelectTrigger aria-label="Background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="glow">Cover glow</SelectItem>
          </SelectContent>
        </Select>
      </Specimen>

      <Specimen label="Input" note="Label every field, even with an icon.">
        <div className="grid w-full max-w-[420px] gap-3">
          <Input
            icon={<Search />}
            placeholder="Search your library"
            aria-label="Search your library"
          />
          <Input defaultValue="~/Manga" aria-label="Library folder" className="font-mono text-sm" />
          <div className="grid gap-1.5">
            <Input
              invalid
              defaultValue="/Volumes/Missing"
              aria-label="Library folder, invalid"
              aria-describedby="ds-folder-error"
            />
            <p id="ds-folder-error" className="m-0 pl-4 text-xs text-err">
              That folder is not there any more. Pick it again.
            </p>
          </div>
          <Input disabled placeholder="Disabled" aria-label="Disabled field" />
        </div>
      </Specimen>

      <Specimen label="Tabs" note="Sibling views. Vertical for settings sections.">
        <Tabs defaultValue="appearance" orientation="vertical" className="w-full">
          <TabsList aria-label="Settings sections" className="w-[180px]">
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="reader">Reader</TabsTrigger>
            <TabsTrigger value="library">Library</TabsTrigger>
            <TabsTrigger value="online" disabled>
              Online (1.1)
            </TabsTrigger>
          </TabsList>
          <TabsContent value="appearance" className="text-sm text-fg-2">
            The interface takes its colour from the cover you are looking at.
          </TabsContent>
          <TabsContent value="reader" className="text-sm text-fg-2">
            Webtoon titles open in webtoon mode regardless.
          </TabsContent>
          <TabsContent value="library" className="text-sm text-fg-2">
            Folders are scanned in place; nothing is copied.
          </TabsContent>
        </Tabs>
      </Specimen>

      <Specimen label="Progress" note="Reading and downloads.">
        <div className="grid w-full max-w-[520px] grid-cols-[120px_minmax(0,1fr)] items-center gap-x-4 gap-y-4">
          <Caption>thin, accent</Caption>
          <Progress value={0.71} label="Chapter 42 of 58" />
          <Caption>md, accent</Caption>
          <Progress value={0.62} label="32 of 52 pages" size="md" />
          <Caption>md, muted</Caption>
          <Progress value={0.4} label="Paused" tone="muted" size="md" />
          <Caption>md, error</Caption>
          <Progress value={0.42} label="Failed" tone="error" size="md" />
        </div>
      </Specimen>
    </>
  );
}

function OverlaySpecimens() {
  return (
    <>
      <Specimen label="Tooltip" note="Names icon buttons; shows the shortcut.">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" aria-label="Adjust page">
              <SlidersHorizontal />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Adjust page <Kbd>A</Kbd>
          </TooltipContent>
        </Tooltip>
        <Tooltip open>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm">
              <RotateCw /> Retry
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Retries in 30 s on its own</TooltipContent>
        </Tooltip>
      </Specimen>

      <Specimen label="Dialog" note="Only for decisions that must interrupt.">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost">
              <Trash2 /> Remove series
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove The Moonlit Bookshop?</DialogTitle>
              <DialogDescription>
                It leaves your library and its reading progress is forgotten. The files on disk stay
                where they are.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Keep it</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button variant="danger">Remove</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Specimen>

      <Specimen
        label="Panel"
        note="Solid by default. Glass only over artwork."
        className="items-stretch"
      >
        <Panel className="w-[220px]">
          <h4 className="m-0 mb-1 font-display text-lg font-[650] font-condensed">Solid</h4>
          <p className="m-0 text-sm text-fg-3">ink-1, 1 px line, 14 px radius.</p>
        </Panel>
        <Panel tone="raised" className="w-[220px]">
          <h4 className="m-0 mb-1 font-display text-lg font-[650] font-condensed">Raised</h4>
          <p className="m-0 text-sm text-fg-3">ink-2, for a panel on a panel.</p>
        </Panel>
        <div
          className="relative flex w-[340px] items-end overflow-hidden rounded-panel p-3"
          style={{
            background:
              'radial-gradient(80% 90% at 30% 20%, var(--accent-strong), transparent 70%), radial-gradient(70% 80% at 90% 90%, var(--ambient), transparent), var(--ink-stage)',
          }}
        >
          <img
            src={kireiFull}
            alt=""
            className="absolute -top-2 right-2 w-28 opacity-90"
            draggable={false}
          />
          <Panel tone="glass" padding="sm" className="relative flex w-full items-center gap-3">
            <Button size="icon-sm" variant="quiet" aria-label="Close reader">
              <X />
            </Button>
            <div className="grid min-w-0 leading-tight">
              <strong className="truncate text-sm font-semibold">Tsukiyo no Shoten</strong>
              <span className="truncate text-xs text-fg-3">Chapter 42, Grupa Kitsune</span>
            </div>
          </Panel>
        </div>
      </Specimen>
    </>
  );
}

export function ComponentsSection() {
  return (
    <Section
      id="components"
      title="Components"
      lead="shadcn/ui on Radix, restyled to the tokens. Every state that is a prop is shown; hover and press are live, and focus rings appear with the keyboard."
    >
      <ButtonsSpecimen />
      <ControlsSpecimens />
      <OverlaySpecimens />
    </Section>
  );
}
