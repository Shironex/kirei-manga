import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectOption<T extends string> {
  value: T;
  label: ReactNode;
}

interface SelectProps<T extends string> {
  value: T | undefined;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  placeholder,
  ariaLabel,
  className,
  disabled = false,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(
      0,
      options.findIndex(o => o.value === value)
    )
  );
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);

  const selected = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const idx = options.findIndex(o => o.value === value);
    setActiveIndex(idx >= 0 ? idx : 0);
  }, [open, value, options]);

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (e: PointerEvent) => {
      const root = rootRef.current;
      if (root && e.target instanceof Node && !root.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDocPointer);
    return () => document.removeEventListener('pointerdown', onDocPointer);
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLLIElement>(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  function commit(idx: number) {
    const opt = options[idx];
    if (!opt) return;
    onChange(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onTriggerKey(e: ReactKeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onListKey(e: ReactKeyboardEvent<HTMLUListElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(options.length - 1, i + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(0, i - 1));
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(options.length - 1);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      commit(activeIndex);
      return;
    }
    if (e.key === 'Tab') {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={cn('relative inline-block', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        onKeyDown={onTriggerKey}
        className={cn(
          'flex h-8 min-w-[7rem] items-center justify-between gap-2 rounded-sm border border-border bg-[var(--color-ink-sunken)] pr-2 pl-2.5 text-left text-[12px] text-foreground transition-colors',
          'hover:border-[var(--color-rule-strong)]',
          'focus-visible:border-[var(--color-accent)] focus-visible:outline-none',
          disabled && 'cursor-not-allowed opacity-60',
          open && 'border-[var(--color-accent)]'
        )}
      >
        <span className="truncate">
          {selected ? (
            selected.label
          ) : (
            <span className="text-[var(--color-bone-faint)]">{placeholder ?? ''}</span>
          )}
        </span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-[var(--color-bone-faint)] transition-transform',
            open && 'rotate-180'
          )}
          aria-hidden
        />
      </button>

      {open && (
        <ul
          ref={el => {
            listRef.current = el;
            // Focus the listbox so arrow / Enter / Escape land here rather
            // than on the trigger. tabIndex={-1} keeps it out of the tab cycle.
            el?.focus();
          }}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel}
          onKeyDown={onListKey}
          className="animate-fade-up absolute right-0 z-20 mt-1 max-h-64 min-w-full overflow-y-auto border border-[var(--color-rule-strong)] bg-[var(--color-ink-raised)] py-1 shadow-[0_18px_40px_rgba(0,0,0,0.45)] outline-none"
        >
          {options.map((opt, idx) => {
            const isActive = idx === activeIndex;
            const isSelected = opt.value === value;
            return (
              <li
                key={opt.value}
                data-idx={idx}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => commit(idx)}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-3 px-2.5 py-1.5 text-[12px] text-foreground',
                  isActive && 'bg-[var(--color-ink-sunken)]',
                  isSelected && 'text-[var(--color-accent)]'
                )}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <Check className="h-3 w-3 shrink-0" aria-hidden />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
