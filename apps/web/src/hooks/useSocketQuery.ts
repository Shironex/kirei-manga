import { useCallback, useEffect, useRef, useState } from 'react';
import { emitWithResponse } from '@/lib/socket';
import { useSocketStore } from '@/stores/socket-store';

const DISCONNECTED_ERROR = 'Disconnected';

interface ErrorEnvelope {
  error?: string;
}

export interface UseSocketQueryOptions<TPayload, TRaw, TData> {
  event: string;
  payload: TPayload | null;
  select: (response: TRaw) => TData;
  initialData: TData;
  disabled?: boolean;
}

export interface UseSocketQueryResult<TData> {
  data: TData;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

export function useSocketQuery<TPayload, TRaw extends ErrorEnvelope, TData>(
  opts: UseSocketQueryOptions<TPayload, TRaw, TData>
): UseSocketQueryResult<TData> {
  const { event, payload, select, initialData, disabled = false } = opts;
  const status = useSocketStore(s => s.status);

  const [data, setData] = useState<TData>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const initialDataRef = useRef(initialData);
  const selectRef = useRef(select);

  useEffect(() => {
    selectRef.current = select;
  }, [select]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const skip = disabled || payload === null;
  const payloadKey = payload === null ? null : JSON.stringify(payload);

  useEffect(() => {
    if (skip) {
      requestIdRef.current += 1;
      setData(initialDataRef.current);
      setLoading(false);
      setError(null);
      return;
    }

    const rid = ++requestIdRef.current;

    if (status !== 'connected') {
      setError(DISCONNECTED_ERROR);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const response = await emitWithResponse<TPayload, TRaw>(event, payload as TPayload);
        if (!mountedRef.current || rid !== requestIdRef.current) return;
        if (response.error) {
          setError(response.error);
          setData(initialDataRef.current);
        } else {
          setData(selectRef.current(response));
        }
      } catch (err) {
        if (!mountedRef.current || rid !== requestIdRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
        setData(initialDataRef.current);
      } finally {
        if (mountedRef.current && rid === requestIdRef.current) {
          setLoading(false);
        }
      }
    })();
  }, [event, payloadKey, skip, status, nonce]);

  const retry = useCallback(() => {
    setNonce(n => n + 1);
  }, []);

  return { data, loading, error, retry };
}

export interface UseSocketPagedQueryOptions<TPayload, TRaw, TItem> {
  event: string;
  buildPayload: (offset: number) => TPayload;
  selectItems: (response: TRaw) => TItem[];
  selectTotal: (response: TRaw, items: TItem[]) => number;
  pageSize: number;
  maxOffsetPlusLimit: number;
  resetKey: string;
  disabled?: boolean;
  resetWhenDisabled?: boolean;
  initial?: { results: TItem[]; total: number } | null;
  onReplace?: (items: TItem[], total: number) => void;
  onAppend?: (items: TItem[], total: number) => void;
  onRetry?: () => void;
}

export interface UseSocketPagedQueryResult<TItem> {
  results: TItem[];
  total: number | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  retry: () => void;
}

export function useSocketPagedQuery<TPayload, TRaw extends ErrorEnvelope, TItem>(
  opts: UseSocketPagedQueryOptions<TPayload, TRaw, TItem>
): UseSocketPagedQueryResult<TItem> {
  const {
    event,
    buildPayload,
    selectItems,
    selectTotal,
    pageSize,
    maxOffsetPlusLimit,
    resetKey,
    disabled = false,
    resetWhenDisabled = false,
    initial = null,
    onReplace,
    onAppend,
    onRetry,
  } = opts;

  const status = useSocketStore(s => s.status);

  const [results, setResults] = useState<TItem[]>(() => initial?.results ?? []);
  const [total, setTotal] = useState<number | null>(() => initial?.total ?? null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const buildPayloadRef = useRef(buildPayload);
  const selectItemsRef = useRef(selectItems);
  const selectTotalRef = useRef(selectTotal);
  const onReplaceRef = useRef(onReplace);
  const onAppendRef = useRef(onAppend);
  const loadMorePayloadRef = useRef<((offset: number) => TPayload) | null>(null);

  useEffect(() => {
    buildPayloadRef.current = buildPayload;
    selectItemsRef.current = selectItems;
    selectTotalRef.current = selectTotal;
    onReplaceRef.current = onReplace;
    onAppendRef.current = onAppend;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchPage = useCallback(
    async (
      builder: (offset: number) => TPayload,
      offset: number,
      append: boolean,
      rid: number
    ) => {
      if (status !== 'connected') {
        setError(DISCONNECTED_ERROR);
        if (append) setLoadingMore(false);
        else setLoading(false);
        return;
      }
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const payload = builder(offset);
        const response = await emitWithResponse<TPayload, TRaw>(event, payload);
        if (!mountedRef.current || rid !== requestIdRef.current) return;
        if (response.error) {
          setError(response.error);
          if (!append) setResults([]);
          return;
        }
        const entries = selectItemsRef.current(response);
        const nextTotal = selectTotalRef.current(response, entries);
        if (append) {
          setResults(prev => {
            const next = [...prev, ...entries];
            onAppendRef.current?.(next, nextTotal);
            return next;
          });
        } else {
          setResults(entries);
          loadMorePayloadRef.current = builder;
          onReplaceRef.current?.(entries, nextTotal);
        }
        setTotal(nextTotal);
      } catch (err) {
        if (!mountedRef.current || rid !== requestIdRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
        if (!append) setResults([]);
      } finally {
        if (mountedRef.current && rid === requestIdRef.current) {
          if (append) setLoadingMore(false);
          else setLoading(false);
        }
      }
    },
    [event, status]
  );

  useEffect(() => {
    if (disabled) {
      if (resetWhenDisabled) {
        requestIdRef.current += 1;
        setResults([]);
        setTotal(null);
        setLoading(false);
        setError(null);
        loadMorePayloadRef.current = null;
      }
      return;
    }
    if (initial) {
      setResults(initial.results);
      setTotal(initial.total);
      setLoading(false);
      setError(null);
      loadMorePayloadRef.current = buildPayloadRef.current;
      return;
    }
    const rid = ++requestIdRef.current;
    setResults([]);
    setTotal(null);
    void fetchPage(buildPayloadRef.current, 0, false, rid);
  }, [resetKey, disabled, fetchPage, nonce]);

  const loadMore = useCallback(() => {
    if (disabled) return;
    if (loading || loadingMore) return;
    if (total === null) return;
    const builder = loadMorePayloadRef.current;
    if (!builder) return;
    const offset = results.length;
    if (offset >= total) return;
    if (offset + pageSize > maxOffsetPlusLimit) return;
    const rid = ++requestIdRef.current;
    void fetchPage(builder, offset, true, rid);
  }, [disabled, loading, loadingMore, total, results.length, pageSize, maxOffsetPlusLimit, fetchPage]);

  const retry = useCallback(() => {
    onRetry?.();
    setNonce(n => n + 1);
  }, [onRetry]);

  const hasMore =
    total !== null && results.length < total && results.length + pageSize <= maxOffsetPlusLimit;

  return { results, total, loading, loadingMore, error, hasMore, loadMore, retry };
}
