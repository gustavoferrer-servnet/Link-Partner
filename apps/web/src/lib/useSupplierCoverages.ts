import { useQueries, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import { useSession } from '../auth/SessionContext';
import type { CoverageMapVersion, SupplierCoverage } from '../types';

function combineMaps(results: UseQueryResult<SupplierCoverage>[]) {
  return {
    data: results.flatMap(result => result.data ? [result.data] : []),
    isLoading: results.some(result => result.isPending),
    isError: results.some(result => result.isError),
    isSuccess: results.every(result => result.isSuccess),
  };
}
// Load exact geometry independently. Identity/revision keys survive token renewal
// and navigation; replacement revisions never display their retired geometry.
export function useSupplierCoverages(token: string | null, enabled: boolean) {
  const { user } = useSession();
  const identity = user.authUid;
  const client = useQueryClient();
  const versions = useQuery({ queryKey: ['supplier-coverage-versions', identity], queryFn: ({ signal }) => apiGet<CoverageMapVersion[]>('/supplier-coverages/versions', token, signal, 15000), enabled, refetchInterval: 10000 });
  const maps = useQueries({
    queries: (versions.data ?? []).map(version => ({
      queryKey: ['supplier-coverages', identity, version.id, version.revisionId ?? version.updatedAt],
      queryFn: ({ signal }: { signal: AbortSignal }) => apiGet<SupplierCoverage>(`/supplier-coverages/${encodeURIComponent(version.id)}${version.revisionId ? `?revision=${encodeURIComponent(version.revisionId)}` : ''}`, token, signal, 45000),
      enabled: enabled && versions.isSuccess,
      staleTime: Infinity,
      structuralSharing: false,
      retry: false,
    })),
    combine: combineMaps,
  });
  return {
    ...maps,
    data: versions.isError ? [] : maps.data,
    isLoading: enabled && (versions.isPending || versions.isSuccess && maps.isLoading),
    isError: versions.isError || maps.isError,
    isSuccess: versions.isSuccess && maps.isSuccess,
    refetch: async () => {
      await versions.refetch();
      await client.refetchQueries({ queryKey: ['supplier-coverages', identity], predicate: query => query.state.status === 'error' });
    },
  };
}
