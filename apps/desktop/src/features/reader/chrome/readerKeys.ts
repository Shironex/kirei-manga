import { createContext, useContext } from 'react';

import { DEFAULT_BINDINGS, firstKeyLabel, type Bindings, type ReaderCommand } from '../model/keys';

/** The bindings in effect, so tooltips name the keys the reader set. */
export const ReaderKeys = createContext<Bindings>(DEFAULT_BINDINGS);

/** Key cap label of the first key bound to `command`, or none when unbound. */
export function useKeyLabel(command: ReaderCommand): string | undefined {
  return firstKeyLabel(useContext(ReaderKeys), command);
}
