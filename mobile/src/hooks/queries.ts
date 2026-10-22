import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { accountApi, setupsApi } from '@/api/endpoints'
import type { SetupDocument, SetupFull } from '@/api/types'
import { appVersionCode } from '@/config'

export const keys = {
  setups: ['setups'] as const,
  setup: (id: number) => ['setups', id] as const,
  subscription: ['subscription'] as const,
  version: ['app-version'] as const,
}

export function useSetups() {
  return useQuery({ queryKey: keys.setups, queryFn: setupsApi.list })
}

export function useSetup(id: number) {
  return useQuery({ queryKey: keys.setup(id), queryFn: () => setupsApi.get(id), enabled: Number.isInteger(id) && id > 0 })
}

export function useSaveSetup(id: number) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (doc: SetupDocument) => setupsApi.save(id, doc),
    onSuccess: (saved: SetupFull) => {
      client.setQueryData(keys.setup(id), saved)
      void client.invalidateQueries({ queryKey: keys.setups, exact: true })
    },
  })
}

/** A blank setup, or a copy of a template / one of the seller's setups. */
export function useCreateSetup() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: { name?: string; from_setup_id?: number }) => setupsApi.create(body),
    onSuccess: (created: SetupFull) => {
      client.setQueryData(keys.setup(created.id), created)
      void client.invalidateQueries({ queryKey: keys.setups, exact: true })
    },
  })
}

export function useSubscription() {
  return useQuery({ queryKey: keys.subscription, queryFn: accountApi.subscription })
}

/**
 * The newest APK on the website, compared with this one. Checked at most every 6 hours;
 * `once` asks a single time per launch (the forced-update gate, so it never flips mid-live).
 */
export function useAppUpdate({ once = false }: { once?: boolean } = {}) {
  const query = useQuery({
    queryKey: once ? [...keys.version, 'launch'] : keys.version,
    queryFn: accountApi.version,
    staleTime: once ? Infinity : 6 * 60 * 60 * 1000,
    refetchOnReconnect: !once,
    retry: false,
  })
  const current = appVersionCode()
  const latest = query.data
  return {
    latest,
    current,
    available: Boolean(latest && latest.apk_url && latest.version_code > current),
    required: Boolean(latest && latest.apk_url && latest.min_version_code > current),
  }
}
