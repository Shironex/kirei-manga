import { useId, useState, type FormEvent, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { MAX_NAME_CHARS } from '@/lib/shelf';

/**
 * Asks for one name (a new collection, a rename). The dialog stays open with
 * the reason when the save fails, such as a name already taken.
 */
export function NameDialog({
  trigger,
  title,
  description,
  label,
  initial = '',
  placeholder,
  submitLabel,
  onSubmit,
}: {
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  label: string;
  initial?: string;
  placeholder?: string;
  submitLabel: string;
  onSubmit: (name: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        {open && (
          <NameForm
            title={title}
            description={description}
            label={label}
            initial={initial}
            placeholder={placeholder}
            submitLabel={submitLabel}
            onSubmit={onSubmit}
            onDone={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function NameForm({
  title,
  description,
  label,
  initial,
  placeholder,
  submitLabel,
  onSubmit,
  onDone,
}: {
  title: string;
  description?: ReactNode;
  label: string;
  initial: string;
  placeholder?: string;
  submitLabel: string;
  onSubmit: (name: string) => Promise<unknown>;
  onDone: () => void;
}) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const id = useId();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('A name is needed.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(name);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      <div className="grid gap-1.5">
        <label htmlFor={id} className="text-sm font-medium text-fg-2">
          {label}
        </label>
        <Input
          id={id}
          autoFocus
          size="sm"
          value={name}
          maxLength={MAX_NAME_CHARS}
          placeholder={placeholder}
          invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={event => setName(event.target.value)}
        />
        {error && (
          <p id={`${id}-error`} role="alert" className="m-0 text-xs text-err">
            {error}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
