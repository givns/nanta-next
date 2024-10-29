// hooks/useLeaveSettings.ts
import { useQuery, useMutation, useQueryClient } from 'react-query';

export function useLeaveSettings() {
  const queryClient = useQueryClient();

  const {
    data: settings,
    isLoading,
    error,
  } = useQuery('leaveSettings', async () => {
    const response = await fetch('/api/admin/leave-settings');
    if (!response.ok) throw new Error('Failed to fetch leave settings');
    return response.json();
  });

  const mutation = useMutation(
    async (newSettings: any) => {
      const response = await fetch('/api/admin/leave-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });
      if (!response.ok) throw new Error('Failed to update leave settings');
      return response.json();
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('leaveSettings');
      },
    },
  );

  return {
    settings,
    isLoading,
    error,
    updateSettings: mutation.mutate,
    isUpdating: mutation.isLoading,
    updateError: mutation.error,
  };
}
