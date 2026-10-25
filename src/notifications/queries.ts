// Server state for notifications (A21, ADR-007). Keys carry the user, so switching salesperson shows
// that person's list and count (AC-11.5).
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi, useCurrentUser } from '../app/context.tsx'
import type { UserId } from '../contract.ts'

export const notificationKeys = {
  all: ['notifications'] as const,
  unread: (userId: UserId | undefined) => ['notifications', userId, 'unread'] as const,
  list: (userId: UserId | undefined) => ['notifications', userId, 'list'] as const,
}

export function useUnreadCount() {
  const api = useApi()
  const userId = useCurrentUser().user?.id
  return useQuery({
    queryKey: notificationKeys.unread(userId),
    queryFn: ({ signal }) => api.getUnread(userId!, signal),
    enabled: userId !== undefined,
    select: (data) => data.unread,
  })
}

/** Loaded only while the list is open (AC-11.2): the component using it mounts on open. */
export function useNotifications() {
  const api = useApi()
  const userId = useCurrentUser().user?.id
  return useInfiniteQuery({
    queryKey: notificationKeys.list(userId),
    queryFn: ({ pageParam, signal }) => api.listNotifications(userId!, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: userId !== undefined,
  })
}

export function useMarkRead() {
  const api = useApi()
  const queryClient = useQueryClient()
  const userId = useCurrentUser().user?.id
  return useMutation({
    mutationFn: () => api.markNotificationsRead(userId!),
    onSuccess: (data) => queryClient.setQueryData(notificationKeys.unread(userId), data),
  })
}
