import { useQuery, useQueryClient } from '@tanstack/react-query';

import { getSupabaseClient } from '@/lib/supabase';
import { queryKeys } from '@/lib/query-keys';
import { useAuth } from '@/providers/auth-provider';
import {
  blockUser,
  deleteAccount,
  getBlockedUsers,
  reportUser,
  setChatHidden,
  unblockUser,
  unmatchChat,
  type ReportReason,
} from '@/services/safety-service';

export function useBlockedUsersQuery() {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.blockedUsers(user?.id ?? 'anonymous'),
    queryFn: getBlockedUsers,
    enabled: Boolean(user),
  });
}

/**
 * Report, block, unmatch, hide and account deletion, each followed by refreshing the screens it
 * affects (a block removes the person from Discover, Likes and Chats at once).
 */
export function useSafetyActions() {
  const client = useQueryClient();
  const { user } = useAuth();
  const id = user?.id ?? 'anonymous';

  function refreshPeople() {
    return Promise.all(
      [queryKeys.discoverProfiles(id), queryKeys.incomingLikes(id), queryKeys.chatPreviews(id), queryKeys.blockedUsers(id)].map(
        (queryKey) => client.invalidateQueries({ queryKey })
      )
    );
  }

  return {
    block: async (userId: string) => {
      await blockUser(userId);
      await refreshPeople();
    },
    unblock: async (userId: string) => {
      await unblockUser(userId);
      await refreshPeople();
    },
    report: async (input: { userId: string; reason: ReportReason; details?: string; block: boolean }) => {
      await reportUser(input);
      if (input.block) {
        await refreshPeople();
      }
    },
    unmatch: async (chatId: string) => {
      await unmatchChat(chatId);
      client.removeQueries({ queryKey: queryKeys.chatMessages(id, chatId) });
      await client.invalidateQueries({ queryKey: queryKeys.chatPreviews(id) });
    },
    setHidden: async (chatId: string, hidden: boolean) => {
      await setChatHidden(chatId, hidden);
      await client.invalidateQueries({ queryKey: queryKeys.chatPreviews(id) });
    },
    deleteAccount: async () => {
      await deleteAccount();
      // The user no longer exists on the server, so only clear the session on this device.
      await getSupabaseClient().auth.signOut({ scope: 'local' }).catch(() => undefined);
      client.clear();
    },
  };
}
