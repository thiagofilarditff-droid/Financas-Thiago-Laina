// One function per write; feature tasks add theirs here. Every write invalidates the snapshot.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
import { SNAPSHOT_KEY } from './snapshot';

/** Throws a readable error when a Supabase write failed. */
export function check(error: PostgrestError | null): void {
  if (error) throw new Error(error.message);
}

/** Wraps a write so that, on success, the snapshot is reloaded. */
export function useWrite<TArgs, TResult = void>(write: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEY }),
  });
}
