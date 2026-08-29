import { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';

export default function SyncManager() {
  const [syncing, setSyncing] = useState(false);

  const processQueue = async () => {
    const queue = JSON.parse(localStorage.getItem('pending_records') || '[]');
    if (queue.length === 0) return;

    setSyncing(true);
    toast.info(`Syncing ${queue.length} pending records...`);

    const remainingQueue = [];
    for (const item of queue) {
      try {
        const { spreadsheetId, folderId, userId, ...record } = item;
        await axios.post('/api/google/save-record', {
          spreadsheetId,
          folderId,
          userId,
          record
        });
      } catch (error) {
        console.error('Sync failed for record:', item, error);
        remainingQueue.push(item);
      }
    }

    localStorage.setItem('pending_records', JSON.stringify(remainingQueue));
    setSyncing(false);

    if (remainingQueue.length === 0) {
      toast.success('All records synced successfully!');
    } else {
      toast.error(`${remainingQueue.length} records failed to sync. Will retry later.`);
    }
  };

  useEffect(() => {
    const handleOnline = () => {
      processQueue();
    };

    window.addEventListener('online', handleOnline);
    
    // Also check on mount if we are online
    if (navigator.onLine) {
      processQueue();
    }

    return () => window.removeEventListener('online', handleOnline);
  }, []);

  if (!syncing) return null;

  return (
    <div className="fixed top-20 right-4 z-50 bg-navy text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-xs font-bold animate-bounce">
      <RefreshCw className="w-4 h-4 animate-spin" />
      Syncing Data...
    </div>
  );
}
