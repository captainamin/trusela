import { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useUser } from '../contexts/UserContext';

export function useSync() {
  const { user, metadata } = useUser();
  const [syncing, setSyncing] = useState(false);

  const syncCount = async () => {
    if (!user || !metadata?.spreadsheetId) {
      toast.error('Sync failed: Account setup incomplete');
      return;
    }
    setSyncing(true);
    try {
      const response = await axios.post('/api/google/recalculate-count', {
        userId: user.uid,
        spreadsheetId: metadata.spreadsheetId
      });
      toast.success(`Success! Found ${response.data.count} records.`);
      return response.data.count;
    } catch (e: any) {
      toast.error('Sync failed: ' + (e.response?.data?.details || e.message));
    } finally {
      setSyncing(false);
    }
  };

  return { syncCount, syncing };
}
