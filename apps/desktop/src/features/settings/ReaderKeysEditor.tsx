import { useEffect, useMemo, useState } from 'react';
import { Plus, RotateCcw, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  bindKey,
  comboOf,
  commandFor,
  COMMANDS,
  DEFAULT_BINDINGS,
  keyLabel,
  MAX_KEYS_PER_COMMAND,
  resetCommand,
  resolveBindings,
  sameKeys,
  storedBindings,
  unbindKey,
  type Bindings,
  type ReaderCommand,
} from '@/features/reader/model/keys';

import { useSettingControl } from './SettingRow';

const LABELS = new Map(COMMANDS.map(entry => [entry.command, entry.label]));

/** A key that already runs another command, waiting for the user to decide. */
interface Conflict {
  command: ReaderCommand;
  combo: string;
  owner: ReaderCommand;
}

/**
 * Reader key bindings: every command with its keys, a key can be added by
 * pressing it, removed, or a command reset. A key that already runs another
 * command is not taken silently: the row asks whether to move it. Saved to
 * `reader.keys` (nothing while the bindings are the built-in ones).
 */
export function ReaderKeysEditor() {
  const [stored, setStored, error] = useSettingControl('reader.keys');
  const bindings = useMemo(() => resolveBindings(stored), [stored]);
  const [recording, setRecording] = useState<ReaderCommand | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const custom = Object.keys(storedBindings(bindings)).length > 0;

  const save = (next: Bindings) => setStored(storedBindings(next));

  // While a row records, the next bindable key press is the new key. Escape
  // cancels and Tab moves on, so the keyboard never gets stuck here.
  useEffect(() => {
    if (recording === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Tab') {
        if (event.key === 'Escape') event.preventDefault();
        setRecording(null);
        return;
      }
      const combo = comboOf(event);
      if (combo === null) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setRecording(null);
      const owner = commandFor(bindings, combo);
      if (owner === recording) return;
      if (owner !== null) setConflict({ command: recording, combo, owner });
      else save(bindKey(bindings, recording, combo));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // `save` only wraps the setter, which is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, bindings]);

  return (
    <div>
      <ul className="m-0 list-none p-0">
        {COMMANDS.map(({ command, label }) => {
          const keys = bindings[command];
          const isDefault = sameKeys(keys, DEFAULT_BINDINGS[command]);
          const waiting = recording === command;
          const asking = conflict?.command === command ? conflict : null;
          return (
            <li
              key={command}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-6 py-3 [&+&]:border-t [&+&]:border-line"
            >
              <span id={`key-${command}`} className="text-fg-2">
                {label}
              </span>
              <div
                role="group"
                aria-labelledby={`key-${command}`}
                className="flex flex-wrap items-center justify-end gap-1.5"
              >
                {keys.length === 0 && !waiting && <span className="text-sm text-fg-3">No key</span>}
                {keys.map(key => (
                  <span
                    key={key}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-line-strong bg-ink-2 pr-0.5 pl-2 font-mono text-xs"
                  >
                    <kbd className="font-mono">{keyLabel(key)}</kbd>
                    <button
                      type="button"
                      aria-label={`Remove ${keyLabel(key)} from ${label}`}
                      className="grid size-6 place-items-center rounded text-fg-3 hover:bg-ink-3 hover:text-fg-1"
                      onClick={() => save(unbindKey(bindings, command, key))}
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                ))}
                {waiting ? (
                  <Button
                    variant="primary"
                    size="sm"
                    aria-live="polite"
                    onClick={() => setRecording(null)}
                  >
                    Press a key, Esc cancels
                  </Button>
                ) : (
                  <Button
                    variant="quiet"
                    size="icon-sm"
                    aria-label={`Add a key to ${label}`}
                    title={
                      keys.length >= MAX_KEYS_PER_COMMAND
                        ? `Adding a key replaces the oldest (${MAX_KEYS_PER_COMMAND} at most)`
                        : 'Add a key'
                    }
                    onClick={() => {
                      setConflict(null);
                      setRecording(command);
                    }}
                  >
                    <Plus />
                  </Button>
                )}
                <Button
                  variant="quiet"
                  size="icon-sm"
                  aria-label={`Reset ${label} to its default keys`}
                  title="Reset to the default keys"
                  className={isDefault ? 'invisible' : undefined}
                  disabled={isDefault}
                  onClick={() => save(resetCommand(bindings, command))}
                >
                  <RotateCcw />
                </Button>
              </div>
              {asking && (
                <div
                  role="alert"
                  className="col-span-2 flex flex-wrap items-center justify-end gap-2 text-sm"
                >
                  <span className="text-fg-2">
                    {keyLabel(asking.combo)} already runs <q>{LABELS.get(asking.owner)}</q>.
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      save(bindKey(bindings, asking.command, asking.combo));
                      setConflict(null);
                    }}
                  >
                    Move it here
                  </Button>
                  <Button variant="quiet" size="sm" onClick={() => setConflict(null)}>
                    Keep it there
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between gap-4 border-t border-line px-6 py-3">
        <p aria-live="polite" className="m-0 text-sm text-err empty:hidden">
          {error}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          disabled={!custom}
          onClick={() => {
            setConflict(null);
            setStored({});
          }}
        >
          <RotateCcw /> Reset all reader keys
        </Button>
      </div>
    </div>
  );
}
