import { useQuery } from '@tanstack/react-query';
import { config } from '../config';
export interface AddressProvider { provider: 'google' | 'photon'; browserKey: string | null }
export function useAddressProviderState() {
  return useQuery({ queryKey: ['address-provider'], staleTime: Infinity, refetchOnWindowFocus: false,
    queryFn: async ({ signal }): Promise<AddressProvider> => {
      const response = await fetch(`${config.apiUrl}/locations/config`, { signal, cache: 'no-store' });
      if (!response.ok) throw new Error('No pudimos cargar la configuración de mapas.');
      const { data } = await response.json();
      if (!data || !['google', 'photon'].includes(data.provider) || !(data.browserKey === null || typeof data.browserKey === 'string')) throw new Error('La configuración de mapas no es válida.');
      return data;
    },
  });
}
export function useAddressProvider() { return useAddressProviderState().data ?? null; }
