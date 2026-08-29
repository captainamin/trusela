import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import Layout from '../components/Layout';
import { ShieldCheck, RefreshCcw, AlertCircle } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { useUser } from '../contexts/UserContext';

export default function Setup() {
  const { user, metadata, loading: userLoading, refreshMetadata } = useUser();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'true') {
      toast.success('Data connected successfully!');
      refreshMetadata();
      // Remove the query param without refreshing
      window.history.replaceState({}, '', window.location.pathname);
    }
    
    if (!userLoading) {
      if (metadata?.spreadsheetId) {
        navigate('/');
      } else {
        setChecking(false);
      }
    }
  }, [navigate, metadata, userLoading, refreshMetadata]);

  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [showManual, setShowManual] = useState(false);
  const [manualIds, setManualIds] = useState({ spreadsheetId: '', folderId: '' });
  const [dealerInfo, setDealerInfo] = useState({
    dealerName: '',
    dealerPhone: '',
    marketName: '',
    shopNumber: '',
  });

  useEffect(() => {
    const fetchDiagnostics = async () => {
      try {
        const response = await axios.get('/api/google/diagnostics');
        setDiagnostics(response.data);
      } catch (e) {}
    };
    fetchDiagnostics();
  }, []);

  const saveSetup = async (spreadsheetId: string, folderId: string) => {
    if (!auth.currentUser) return;

    // Use the backend (Admin SDK) to save the setup — avoids Firestore security rule blocks
    await axios.post('/api/google/save-setup', {
      userId: auth.currentUser.uid,
      spreadsheetId,
      folderId,
      dealerInfo,
    });
    
    await refreshMetadata();
    toast.success('Account setup complete!');
    navigate('/');
  };

  const handleSetup = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    setErrorDetails(null);
    try {
      toast.info('Setting up your secure database...');
      const response = await axios.post('/api/google/setup-user', { userId: auth.currentUser.uid });
      const { spreadsheetId, folderId } = response.data;
      await saveSetup(spreadsheetId, folderId);
    } catch (error: any) {
      console.error(error);
      const errorMsg = error.response?.data?.details || error.message || 'Failed to setup database';
      setErrorDetails(errorMsg);
      toast.error('Setup failed. See details below.');
    } finally {
      setLoading(false);
    }
  };

  const handleManualSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualIds.spreadsheetId || !manualIds.folderId) {
      toast.error('Please provide both Spreadsheet and Folder IDs');
      return;
    }
    setLoading(true);
    try {
      await saveSetup(manualIds.spreadsheetId, manualIds.folderId);
    } catch (error: any) {
      toast.error('Failed to save manual setup');
    } finally {
      setLoading(false);
    }
  };

  if (checking) return <Layout title="Checking Status"><div className="animate-pulse h-64 bg-gray-200 rounded-xl" /></Layout>;

  return (
    <Layout title="Account Setup">
      <div className="max-w-md mx-auto space-y-8 py-12 text-center">
        <div className="w-24 h-24 bg-navy/5 rounded-full flex items-center justify-center mx-auto text-navy">
          <ShieldCheck className="w-12 h-12" />
        </div>
        
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-navy">Complete Your Setup</h2>
          <p className="text-gray-600">
            Enter your business details and initialize your secure database to start recording transactions.
          </p>
        </div>

        <div className="card text-left space-y-4 p-6">
          <h3 className="font-bold text-navy border-b pb-2">Business Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="dealerName" className="text-[10px] font-bold text-gray-400 uppercase">Dealer Name</label>
              <input 
                id="dealerName"
                name="dealerName"
                type="text" 
                className="input-field" 
                placeholder="e.g. John Doe"
                value={dealerInfo.dealerName}
                onChange={e => setDealerInfo({...dealerInfo, dealerName: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="dealerPhone" className="text-[10px] font-bold text-gray-400 uppercase">Phone Number</label>
              <input 
                id="dealerPhone"
                name="dealerPhone"
                type="tel" 
                className="input-field" 
                placeholder="e.g. 080..."
                value={dealerInfo.dealerPhone}
                onChange={e => setDealerInfo({...dealerInfo, dealerPhone: e.target.value})}
              />
            </div>
          </div>
          
          <div className="pt-4 border-t">
            <h4 className="text-xs font-bold text-navy uppercase mb-3">Data Connection</h4>
            {!metadata?.isGoogleConnected ? (
              <button
                type="button"
                className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-navy/20 rounded-xl hover:border-navy/40 transition-colors text-navy font-medium"
                disabled={!user}
                onClick={async () => {
                  if (!user) {
                    toast.error('Authentication not ready. Please wait.');
                    return;
                  }
                  try {
                    const res = await axios.get(`/api/google/auth-url?userId=${user.uid}`);
                    window.location.href = res.data.url;
                  } catch (e) {
                    toast.error('Failed to get auth URL');
                  }
                }}
              >
                <RefreshCcw className="w-4 h-4" />
                {!user ? 'Loading Auth...' : 'Connect Your Data'}
              </button>
            ) : (
              <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-xl border border-green-100">
                <ShieldCheck className="w-5 h-5" />
                <span className="text-sm font-medium">Data Connected</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="marketName" className="text-[10px] font-bold text-gray-400 uppercase">Market Name</label>
              <input 
                id="marketName"
                name="marketName"
                type="text" 
                className="input-field" 
                placeholder="e.g. Computer Village"
                value={dealerInfo.marketName}
                onChange={e => setDealerInfo({...dealerInfo, marketName: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="shopNumber" className="text-[10px] font-bold text-gray-400 uppercase">Shop Number</label>
              <input 
                id="shopNumber"
                name="shopNumber"
                type="text" 
                className="input-field" 
                placeholder="e.g. Suite 4"
                value={dealerInfo.shopNumber}
                onChange={e => setDealerInfo({...dealerInfo, shopNumber: e.target.value})}
              />
            </div>
          </div>
        </div>

        {errorDetails && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-xl text-left space-y-3">
            <div className="flex items-center gap-2 text-red-700 font-semibold">
              <AlertCircle className="w-5 h-5" />
              <span>Setup Error</span>
            </div>
            <p className="text-sm text-red-600 break-words">
              {errorDetails}
            </p>
            {diagnostics && showManual && (
              <div className="bg-white/50 p-3 rounded-lg border border-red-100 space-y-1">
                <p className="text-[10px] text-red-400 uppercase font-bold">Background Service Account Diagnostics</p>
                <p className="text-xs text-red-400 mb-2 italic">Note: These are for the system backup account, not your linked Data.</p>
                <p className="text-xs text-red-700"><b>Email:</b> {diagnostics.email}</p>
                <p className="text-xs text-red-700"><b>Project ID:</b> {diagnostics.projectId}</p>
                <p className={`text-xs font-bold ${diagnostics.bucketExists ? 'text-green-600' : 'text-red-600'}`}>
                  <b>Bucket Status:</b> {diagnostics.bucketExists ? 'Found' : 'Not Found'}
                </p>
              </div>
            )}
            <div className="pt-2 border-t border-red-100">
              <p className="text-xs text-red-500 font-medium uppercase tracking-wider mb-1">Troubleshooting Steps:</p>
              <ol className="text-xs text-red-600 list-decimal pl-4 space-y-1">
                <li>Go to <a href="https://console.cloud.google.com/apis/library/sheets.googleapis.com" target="_blank" rel="noopener noreferrer" className="underline font-bold">Google Sheets API Library</a> and click <b>Enable</b>.</li>
                <li>Go to <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noopener noreferrer" className="underline font-bold">Data API Library</a> and click <b>Enable</b>.</li>
                <li>Ensure the Service Account email shown above has the <b>Editor</b> role in your project IAM settings.</li>
              </ol>
            </div>
          </div>
        )}

        <div className="bg-yellow/10 border border-yellow/20 p-4 rounded-xl flex items-start gap-3 text-left">
          <AlertCircle className="text-navy w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-xs text-navy">
            This will create a dedicated folder in your Google account (via our service account) where all your records and photos will be stored privately.
          </p>
        </div>

        {!showManual ? (
          <div className="space-y-4">
            <button
              onClick={handleSetup}
              disabled={loading || !dealerInfo.dealerName || !dealerInfo.dealerPhone || !metadata?.isGoogleConnected}
              className="w-full btn-primary py-4 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCcw className="w-5 h-5 animate-spin" />
                  Setting up...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-5 h-5" />
                  Initialize Database
                </>
              )}
            </button>
            <button
              onClick={() => setShowManual(true)}
              className="text-xs text-navy/60 hover:text-navy underline"
            >
              Having trouble? Try manual setup
            </button>
          </div>
        ) : (
          <form onSubmit={handleManualSetup} className="space-y-4 text-left bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <h3 className="font-semibold text-navy">Manual Database Setup</h3>
            <p className="text-xs text-gray-500 mb-4">
              1. Create a folder in Data.<br/>
              2. Create a Google Sheet inside it.<br/>
              3. Share both with: <code className="bg-gray-100 px-1 rounded">{diagnostics?.email}</code> as <b>Editor</b>.<br/>
              4. Copy the IDs from the URLs and paste them below.
            </p>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-700">Spreadsheet ID</label>
                <input
                  id="spreadsheetId"
                  name="spreadsheetId"
                  type="text"
                  required
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  placeholder="e.g. 1aBC...xyz"
                  value={manualIds.spreadsheetId}
                  onChange={e => setManualIds({ ...manualIds, spreadsheetId: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Folder ID</label>
                <input
                  id="folderId"
                  name="folderId"
                  type="text"
                  required
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  placeholder="e.g. 1xYZ...abc"
                  value={manualIds.folderId}
                  onChange={e => setManualIds({ ...manualIds, folderId: e.target.value })}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowManual(false)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 btn-primary py-2 text-sm"
              >
                {loading ? 'Saving...' : 'Save Setup'}
              </button>
            </div>
          </form>
        )}
      </div>
    </Layout>
  );
}
