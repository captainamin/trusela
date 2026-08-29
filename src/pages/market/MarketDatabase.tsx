import React, { useState, useEffect } from 'react';
import MarketLayout from '../../components/MarketLayout';
import { useUser } from '../../contexts/UserContext';
import { Save, Lock, Database, RefreshCcw, AlertCircle, FileSpreadsheet, Folder, CheckCircle } from 'lucide-react';
import { auth } from '../../firebase';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import axios from 'axios';
import { toast } from 'sonner';

export default function MarketDatabase() {
  const { metadata, user, refreshMetadata } = useUser();
  const [loading, setLoading] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState('');

  const [setupMode, setSetupMode] = useState<'status' | 'manual'>('status');

  const [manualIds, setManualIds] = useState({
    spreadsheetId: metadata?.marketSpreadsheetId || '',
    folderId: metadata?.marketFolderId || ''
  });

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.email) return;

    try {
      setLoading(true);
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);
      setUnlocked(true);
      setPassword('');
      toast.success('Access granted.');
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        toast.error('Incorrect password. Verification failed.');
      } else {
        toast.error('Failed to verify password.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleManualSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualIds.spreadsheetId) {
      toast.error('Spreadsheet ID is required');
      return;
    }

    try {
      setLoading(true);
      await axios.post('/api/market/save-setup', {
        userId: user?.uid,
        spreadsheetId: manualIds.spreadsheetId,
        folderId: manualIds.folderId
      });
      
      await refreshMetadata();
      toast.success('Database configuration updated successfully!');
      setSetupMode('status');
    } catch (error: any) {
      console.error(error);
      toast.error('Failed to update database configuration.');
    } finally {
      setLoading(false);
    }
  };

  const handleAutomaticSync = async () => {
    if (!confirm('Are you sure you want to run Automatic Sync? This will create a new Database Folder and Sheets in your Data.')) {
      return;
    }

    try {
      setLoading(true);
      toast.loading('Provisioning Market Database in Data...');
      await axios.post('/api/market/setup-market', {
        userId: user?.uid,
        marketName: metadata?.marketSettings?.name || 'Trusela Market'
      });
      
      await refreshMetadata();
      toast.dismiss();
      toast.success('Automatic Sync completed! Database created.');
      setManualIds({
        spreadsheetId: metadata?.marketSpreadsheetId || '',
        folderId: metadata?.marketFolderId || ''
      });
    } catch (error: any) {
      console.error(error);
      toast.dismiss();
      toast.error('Failed to execute automatic sync. Make sure Data is connected.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <MarketLayout title="Database Setup">
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Database className="w-6 h-6 text-emerald-600" />
              Database Integration
            </h1>
            <p className="text-gray-500 mt-1">Configure your Data and Google Sheets connection</p>
          </div>
        </div>

        {!unlocked ? (
          <div className="bg-white rounded-xl shadow-sm border border-amber-200 overflow-hidden mb-6">
             <div className="bg-amber-50 p-6 flex flex-col items-center text-center">
               <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4">
                 <Lock className="w-8 h-8" />
               </div>
               <h2 className="text-xl font-bold text-gray-900 mb-2">Restricted Area</h2>
               <p className="text-sm text-gray-600 max-w-md">
                 Database configurations are highly sensitive. Please enter your administrator password to unlock this section.
               </p>
             </div>
             <form onSubmit={handleUnlock} className="p-6 border-t border-amber-100">
               <div className="max-w-xs mx-auto space-y-4">
                 <div>
                   <label className="text-sm font-medium text-gray-700 block mb-1">Admin Password</label>
                   <input
                     type="password"
                     value={password}
                     onChange={(e) => setPassword(e.target.value)}
                     className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                     placeholder="Enter your password"
                     required
                     autoFocus
                   />
                 </div>
                 <button
                   type="submit"
                   disabled={loading || !password}
                   className="w-full px-4 py-2 text-white bg-amber-600 rounded-lg hover:bg-amber-700 font-bold transition-colors disabled:opacity-50"
                 >
                   {loading ? 'Verifying...' : 'Unlock Configuration'}
                 </button>
               </div>
             </form>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in zoom-in duration-300">
            {/* Status View */}
            {setupMode === 'status' && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                 <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                   <h2 className="font-bold text-lg text-gray-900">Current Connection Status</h2>
                   {metadata?.marketSpreadsheetId ? (
                     <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                       <CheckCircle className="w-3 h-3" /> Connected
                     </span>
                   ) : (
                     <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                       <AlertCircle className="w-3 h-3" /> Not Configured
                     </span>
                   )}
                 </div>

                 <div className="p-6 space-y-4">
                   <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                     <div className="flex items-center gap-3 mb-2">
                       <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                       <span className="font-bold text-sm text-gray-700">Market Database (Spreadsheet)</span>
                     </div>
                     <p className="text-xs font-mono text-gray-600 bg-white p-2 border border-gray-200 rounded break-all">
                       {metadata?.marketSpreadsheetId || 'Not connected'}
                     </p>
                   </div>

                   <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                     <div className="flex items-center gap-3 mb-2">
                       <Folder className="w-5 h-5 text-emerald-600" />
                       <span className="font-bold text-sm text-gray-700">Market Folder</span>
                     </div>
                     <p className="text-xs font-mono text-gray-600 bg-white p-2 border border-gray-200 rounded break-all">
                       {metadata?.marketFolderId || 'Not connected'}
                     </p>
                   </div>
                 </div>

                 <div className="bg-gray-50 p-6 border-t border-gray-200 flex flex-col md:flex-row gap-4">
                   {!metadata?.isGoogleConnected ? (
                     <button
                       onClick={async () => {
                         try {
                           setLoading(true);
                           const res = await axios.get(`/api/google/auth-url?userId=${user?.uid}`);
                           window.location.href = res.data.url;
                         } catch (e) {
                           toast.error('Failed to get auth URL');
                           setLoading(false);
                         }
                       }}
                       disabled={loading}
                       className="flex-1 bg-blue-600 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors disabled:opacity-50"
                     >
                       Connect Data
                     </button>
                   ) : (
                     <button 
                       onClick={handleAutomaticSync}
                       disabled={loading}
                       className="flex-1 bg-emerald-600 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-700 transition-colors disabled:opacity-50"
                     >
                       {loading ? <RefreshCcw className="w-5 h-5 animate-spin" /> : <RefreshCcw className="w-5 h-5" />}
                       Automatic Setup Sync
                     </button>
                   )}
                   <button 
                     onClick={() => setSetupMode('manual')}
                     disabled={loading}
                     className="flex-1 bg-white text-gray-700 border border-gray-300 font-bold py-3 px-4 rounded-xl hover:bg-gray-50 transition-colors"
                   >
                     Manual Configuration
                   </button>
                 </div>
                 <div className="p-4 text-center text-xs text-gray-500">
                   {!metadata?.isGoogleConnected ? 
                     <strong>You must connect your Data account first before running Automatic Setup Sync.</strong> :
                     <strong>Automatic Setup Sync</strong>
                   }
                   {metadata?.isGoogleConnected && " will automatically create a new Data folder and securely structure a new Spreadsheet Database inside it for you."}
                 </div>
              </div>
            )}

            {/* Manual Config View */}
            {setupMode === 'manual' && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-100">
                   <h2 className="font-bold text-lg text-gray-900">Manual Configuration</h2>
                   <p className="text-sm text-gray-500">Provide existing Data and Spreadsheet IDs to link them to this market profile.</p>
                </div>
                <form onSubmit={handleManualSave} className="p-6 space-y-6">
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-bold text-gray-700 flex items-center gap-2 mb-1">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Google Spreadsheet ID *
                      </label>
                      <input
                        type="text"
                        required
                        value={manualIds.spreadsheetId}
                        onChange={(e) => setManualIds({ ...manualIds, spreadsheetId: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none font-mono text-sm"
                        placeholder="e.g. 1BxiMVs0XRYFgwnm... (from the URL)"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-bold text-gray-700 flex items-center gap-2 mb-1">
                        <Folder className="w-4 h-4 text-emerald-600" /> Data Folder ID
                      </label>
                      <input
                        type="text"
                        value={manualIds.folderId}
                        onChange={(e) => setManualIds({ ...manualIds, folderId: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none font-mono text-sm"
                        placeholder="e.g. 1wXy... (Optional but recommended for files)"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => {
                        setSetupMode('status');
                        setManualIds({
                          spreadsheetId: metadata?.marketSpreadsheetId || '',
                          folderId: metadata?.marketFolderId || ''
                        });
                      }}
                      className="flex-1 py-3 px-4 rounded-xl border border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-colors flex justify-center items-center gap-2 disabled:opacity-50"
                    >
                      <Save className="w-5 h-5" />
                      Save Configuration
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}
      </div>
    </MarketLayout>
  );
}
