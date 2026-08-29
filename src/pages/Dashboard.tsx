import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { Plus, List, ShieldCheck, AlertCircle, Clock, CheckCircle2, Users, Package, BarChart3, Search, ShieldAlert, ShieldQuestion, Smartphone, RefreshCcw } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { useUser } from '../contexts/UserContext';
import { useSync } from '../hooks/useSync';

export default function Dashboard() {
  const { user, metadata, loading: userLoading } = useUser();
  const { syncCount, syncing: recalculating } = useSync();
  const [recentRecords, setRecentRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const navigate = useNavigate();

  const handleRecalculate = () => syncCount();

  useEffect(() => {
    const queue = JSON.parse(localStorage.getItem('pending_records') || '[]');
    setPendingSyncCount(queue.length);

    // Auto-sync if count is 0 and we have a spreadsheet
    if (metadata?.recordCount === 0 && metadata?.spreadsheetId) {
      handleRecalculate();
    }
  }, [metadata?.recordCount, metadata?.spreadsheetId]);

  const [configStatus, setConfigStatus] = useState<any>(null);

  // IMEI Verifier State
  const [verifyImei, setVerifyImei] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyImei || verifyImei.length < 14) {
      toast.error('Please enter a valid IMEI (at least 14 digits)');
      return;
    }

    setVerifying(true);
    setVerificationResult(null);
    try {
      const response = await axios.post('/api/verify-imei', { imei: verifyImei });
      setVerificationResult(response.data);

      // Save to cache for AddRecord page
      localStorage.setItem(`imei_cache_${verifyImei}`, JSON.stringify(response.data));

      toast.success('IMEI Verification Complete');
    } catch (error) {
      toast.error('Failed to verify IMEI');
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Check config status
        const configRes = await axios.get('/api/config-check');
        setConfigStatus(configRes.data);

        // Fetch recent records from Google Sheets if metadata is available
        if (metadata?.spreadsheetId && user) {
          const response = await axios.get(`/api/google/records?spreadsheetId=${metadata.spreadsheetId}&userId=${user.uid}`);
          setRecentRecords(response.data.slice(-5).reverse());
        } else if (!userLoading) {
          // Only redirect if user has fully loaded and still no valid metadata
          navigate('/setup');
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    if (!userLoading) {
      fetchData();
    }
  }, [navigate, metadata, userLoading]);

  if (loading || userLoading) {
    return (
      <Layout title="Dashboard">
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-gray-200 rounded-xl"></div>
          <div className="h-64 bg-gray-200 rounded-xl"></div>
        </div>
      </Layout>
    );
  }

  const isTrialExpired = metadata?.subscriptionStatus === 'trial' && new Date(metadata.trialEndsAt) < new Date();
  const isSubscribed = metadata?.subscriptionStatus === 'active' || !isTrialExpired;

  return (
    <Layout title="Dashboard">
      {/* Config Warning */}
      {configStatus && (!configStatus.hasGoogleCreds || !configStatus.hasPaystackKey) && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-amber-800">Configuration Required</h3>
              <p className="text-sm text-amber-700">Some features are disabled because API keys are missing in the Secrets panel.</p>
              <ul className="text-xs text-amber-600 mt-2 list-disc ml-4">
                {!configStatus.hasGoogleCreds && <li>GOOGLE_SERVICE_ACCOUNT_JSON is missing</li>}
                {!configStatus.hasPaystackKey && <li>PAYSTACK_SECRET_KEY is missing</li>}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Pending Sync Banner */}
      {pendingSyncCount > 0 && (
        <div className="bg-navy border border-navy-light p-4 rounded-xl mb-6 flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3 text-white">
            <RefreshCcw className="w-5 h-5 animate-spin" />
            <div>
              <p className="font-bold">Sync Pending</p>
              <p className="text-xs text-white/70">{pendingSyncCount} records waiting to be saved to cloud.</p>
            </div>
          </div>
          <button
            onClick={() => window.dispatchEvent(new Event('online'))}
            className="text-xs font-bold text-yellow underline"
          >
            Retry Now
          </button>
        </div>
      )}

      {/* Subscription Banner */}
      {!isSubscribed && (
        <div className="bg-red-50 border border-red-200 p-4 rounded-xl mb-6 flex items-start gap-3">
          <AlertCircle className="text-red-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-red-800">Subscription Expired</h3>
            <p className="text-sm text-red-700 mb-2">Your 7-day trial has ended. Subscribe to continue generating PDFs and saving records.</p>
            <Link to="/subscription" className="text-sm font-bold text-red-800 underline">Upgrade Now</Link>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="card bg-navy text-white relative flex flex-col justify-between h-full">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-navy/70 text-sm">Total Records</p>
              <p className="text-3xl font-bold text-navy">{metadata?.recordCount || 0}</p>
            </div>
            <button
              onClick={handleRecalculate}
              disabled={recalculating}
              className={`flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 rounded-lg transition-colors border border-white/10 ${recalculating ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <RefreshCcw className={`w-4 h-4 text-yellow ${recalculating ? 'animate-spin' : ''}`} />
              <span className="text-[10px] font-bold uppercase text-white/80">Sync</span>
            </button>
          </div>
        </div>
        <div className="card bg-yellow text-navy">
          <p className="text-navy/70 text-sm mb-1">Status</p>
          <p className="text-xl font-bold capitalize">{metadata?.subscriptionStatus || 'Trial'}</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-4 mb-8">
        <Link to="/add" className="flex-1 btn-primary py-4 flex flex-col items-center gap-2">
          <Plus className="w-6 h-6" />
          <span>New Record</span>
        </Link>
        <Link to="/records" className="flex-1 bg-white border border-navy/20 text-navy py-4 rounded-xl font-medium flex flex-col items-center gap-2 hover:bg-navy/5 transition-colors">
          <List className="w-6 h-6" />
          <span>View Records</span>
        </Link>
      </div>

      {/* IMEI Verifier Section */}
      <div className="mb-8">
        <h3 className="text-lg font-bold text-navy mb-4 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5" /> IMEI Verifier
        </h3>
        <div className="card p-4">
          <form onSubmit={handleVerify} className="flex gap-2">
            <div className="relative flex-1">
              <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Enter IMEI to check..."
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-navy/20 focus:border-navy outline-none transition-all"
                value={verifyImei}
                onChange={(e) => setVerifyImei(e.target.value.replace(/\D/g, ''))}
                maxLength={16}
              />
            </div>
            <button
              type="submit"
              disabled={verifying}
              className="bg-navy text-white px-6 rounded-xl font-bold text-sm hover:bg-navy/90 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {verifying ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Search className="w-4 h-4" />}
              Check
            </button>
          </form>

          {verificationResult && (
            <div className={`mt-4 p-4 rounded-xl border animate-in fade-in slide-in-from-top-2 duration-300 ${verificationResult.risk === 'HIGH' ? 'bg-red-50 border-red-100' :
              verificationResult.risk === 'MEDIUM' ? 'bg-orange-50 border-orange-100' :
                'bg-green-50 border-green-100'
              }`}>
              <div className="flex items-center gap-3">
                {verificationResult.risk === 'HIGH' ? <ShieldAlert className="w-6 h-6 text-red-600" /> :
                  verificationResult.risk === 'MEDIUM' ? <ShieldQuestion className="w-6 h-6 text-orange-600" /> :
                    <ShieldCheck className="w-6 h-6 text-green-600" />}
                <div>
                  <p className={`text-xs font-black uppercase tracking-wider ${verificationResult.risk === 'HIGH' ? 'text-red-600' :
                    verificationResult.risk === 'MEDIUM' ? 'text-orange-600' :
                      'text-green-600'
                    }`}>
                    {verificationResult.status}: {verificationResult.risk} RISK
                  </p>
                  <p className="text-sm text-gray-700 mt-0.5">
                    {verificationResult.risk === 'HIGH' ? 'This device is reported as stolen or blacklisted.' :
                      verificationResult.risk === 'MEDIUM' ? 'This device has been flagged for suspicious activity.' :
                        'This device is clean and safe to trade.'}
                  </p>
                </div>
              </div>
              {verificationResult.risk === 'LOW' && (
                <Link to="/add" state={{ imei: verifyImei }} className="mt-3 block text-center py-2 bg-white border border-green-200 text-green-700 rounded-lg text-xs font-bold hover:bg-green-100 transition-colors">
                  Proceed to New Record
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Manager Plan Tools */}
      <div className="mb-8">
        <h3 className="text-lg font-bold text-navy mb-4 flex items-center gap-2">
          Manager Tools
          {metadata?.planType !== 'manager' && <span className="text-[10px] bg-yellow px-2 py-0.5 rounded-full text-navy uppercase font-black">Pro</span>}
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {metadata?.planType === 'manager' ? (
            <>
              <Link to="/sales-persons" className="card p-3 flex flex-col items-center gap-2 hover:bg-navy/5 transition-colors">
                <div className="w-10 h-10 bg-navy/5 rounded-full flex items-center justify-center text-navy">
                  <Users className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-bold text-center">Sales Team</span>
              </Link>
              <Link to="/inventory" className="card p-3 flex flex-col items-center gap-2 hover:bg-navy/5 transition-colors">
                <div className="w-10 h-10 bg-navy/5 rounded-full flex items-center justify-center text-navy">
                  <Package className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-bold text-center">Inventory</span>
              </Link>
              <Link to="/reports" className="card p-3 flex flex-col items-center gap-2 hover:bg-navy/5 transition-colors">
                <div className="w-10 h-10 bg-navy/5 rounded-full flex items-center justify-center text-navy">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-bold text-center">Reports</span>
              </Link>
            </>
          ) : (
            <>
              <Link to="/subscription" className="card p-3 flex flex-col items-center gap-2 opacity-50 hover:opacity-100 transition-all border-dashed border-2">
                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-400">
                  <Users className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-bold text-center text-gray-400">Sales Team</span>
              </Link>
              <Link to="/subscription" className="card p-3 flex flex-col items-center gap-2 opacity-50 hover:opacity-100 transition-all border-dashed border-2">
                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-400">
                  <Package className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-bold text-center text-gray-400">Inventory</span>
              </Link>
              <Link to="/subscription" className="card p-3 flex flex-col items-center gap-2 opacity-50 hover:opacity-100 transition-all border-dashed border-2">
                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-400">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-bold text-center text-gray-400">Reports</span>
              </Link>
            </>
          )}
        </div>
        {metadata?.planType !== 'manager' && (
          <p className="text-[10px] text-navy/60 mt-3 text-center font-medium">
            Upgrade to the <span className="font-bold text-navy">Manager Plan</span> to unlock team management and advanced analytics.
          </p>
        )}
      </div>

      {/* Recent Records */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-bold text-navy">Recent Transactions</h3>
          <Link to="/records" className="text-sm text-navy font-medium hover:underline">See All</Link>
        </div>

        {recentRecords.length === 0 ? (
          <div className="card text-center py-12 text-gray-500">
            <ShieldCheck className="w-12 h-12 mx-auto mb-2 opacity-20" />
            <p>No records yet. Start by adding your first transaction.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentRecords.map((record) => (
              <Link key={record.id} to={`/records/${record.id}`} className="card p-4 flex items-center justify-between hover:border-navy/30 transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-navy/5 rounded-full flex items-center justify-center text-navy font-bold">
                    {record.sellerName[0]}
                  </div>
                  <div>
                    <h4 className="font-bold text-navy">{record.sellerName}</h4>
                    <p className="text-xs text-gray-500">{record.brand} {record.model}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-gray-400">{record.date}</p>
                  <CheckCircle2 className="w-4 h-4 text-green-500 ml-auto mt-1" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
