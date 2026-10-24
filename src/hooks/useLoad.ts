import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../api/client";

export interface LoadState<T> {
  data: T | undefined;
  error: string | null;
  status: number | null;
  loading: boolean;
  reload: () => Promise<void>;
  setData: (value: T) => void;
}

/** Load data on mount / when deps change, with loading and error state. */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []): LoadState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const value = await loaderRef.current();
      if (id === seq.current) setData(value);
    } catch (err) {
      if (id === seq.current) {
        setError(errorMessage(err));
        setStatus((err as { status?: number }).status ?? null);
      }
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, status, loading, reload, setData };
}
