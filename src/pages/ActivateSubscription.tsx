import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import Layout from '../components/Layout';
import { KeyRound, Scan, QrCode, ShieldAlert, Sparkles, CheckCircle2, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import { Html5Qrcode } from 'html5-qrcode';
import { useUser } from '../contexts/UserContext';

export default function ActivateSubscription() {
  const [activationKey, setActivationKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const { user, metadata } = useUser();
  const navigate = useNavigate();

  // Redirect if already active/lifetime and not expired
  useEffect(() => {
    if (metadata) {
      const isTrialActive = metadata.subscriptionStatus === 'trial' && new Date(metadata.trialEndsAt) > new Date();
      const isActive = metadata.subscriptionStatus === 'active' || metadata.subscriptionStatus === 'lifetime';
      
      // If user is admin or is already active, allow navigating to dashboard
      if (metadata.role === 'admin' || isActive || isTrialActive) {
        // Only redirect if they didn't just land here or if they have completed setup
        if (metadata.spreadsheetId) {
          navigate('/');
        }
      }
    }
  }, [metadata, navigate]);

  // Format the key as TS-XXXX-XXXX-XXXX-XXXX-XXXX as the user types
  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    // Prefix must be TS
    if (value.length > 0 && !value.startsWith('T')) {
      value = 'T' + value;
    }
    if (value.length > 1 && !value.startsWith('TS')) {
      value = 'TS' + value.substring(1);
    }
    if (value.length === 0) {
      value = 'TS';
    }

    // Format blocks
    let formatted = '';
    for (let i = 0; i < value.length && i < 22; i++) {
      if (i > 1 && (i - 2) % 4 === 0) {
        formatted += '-';
      }
      formatted += value[i];
    }
    
    setActivationKey(formatted);
  };

  // Launch the html5-qrcode scanner
  useEffect(() => {
    let html5QrCode: Html5Qrcode;

    if (showScanner) {
      html5QrCode = new Html5Qrcode('activation-reader');

      const onScanSuccess = (decodedText: string) => {
        if (html5QrCode.isScanning) {
          html5QrCode.stop().catch(e => console.error(e));
        }

        try {
          // Check if scanned QR data is JSON and contains key
          const parsed = JSON.parse(decodedText);
          if (parsed.type === 'activation' && parsed.key) {
            setActivationKey(parsed.key);
            toast.success('QR Code Scanned Successfully!');
          } else if (parsed.key) {
            setActivationKey(parsed.key);
            toast.success('QR Code Scanned Successfully!');
          } else {
            setActivationKey(decodedText);
            toast.success('QR Code Text Scanned!');
          }
        } catch (e) {
          // Treat as raw key string
          setActivationKey(decodedText.trim());
          toast.success('QR Code Scanned!');
        }
        setShowScanner(false);
      };

      html5QrCode.start(
        { facingMode: "environment" },
        { fps: 15, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
        onScanSuccess,
        () => {} // Silent scan errors
      ).catch((err) => {
        console.error("Camera start error:", err);
        toast.error("Could not start camera. Please check permissions.");
      });

      return () => {
        if (html5QrCode && html5QrCode.isScanning) {
          html5QrCode.stop().then(() => {
            html5QrCode.clear();
          }).catch(err => console.error('Scanner cleanup failed:', err));
        }
      };
    }
  }, [showScanner]);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activationKey || activationKey.length < 22) {
      toast.error('Please enter a complete 22-character key.');
      return;
    }

    setLoading(true);
    try {
      toast.info('Validating activation key...');
      const response = await axios.post('/api/subscription/activate-key', {
        activationKey,
        userId: auth.currentUser?.uid,
        username: auth.currentUser?.email
      });

      if (response.data.success) {
        toast.success('Subscription activated successfully! Enjoy premium features.');
        
        // Wait a second for Firestore sync before redirecting
        setTimeout(() => {
          navigate('/');
        }, 1500);
      } else {
        toast.error(response.data.error || 'Failed to activate subscription.');
      }
    } catch (error: any) {
      console.error(error);
      const msg = error.response?.data?.error || error.message || 'Key activation failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const isExpired = metadata?.subscriptionStatus === 'expired' || 
    (metadata?.subscriptionStatus === 'trial' && new Date(metadata.trialEndsAt) < new Date());

  return (
    <Layout title="Activate Subscription">
      {showScanner && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in duration-200">
            <div className="p-5 bg-navy text-white flex justify-between items-center">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <QrCode className="w-5 h-5 text-yellow" /> Scan QR Key
              </h3>
              <button 
                onClick={() => setShowScanner(false)} 
                className="py-1 px-3 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition-colors"
              >
                Close
              </button>
            </div>
            <div className="p-4">
              <div id="activation-reader" className="w-full rounded-2xl overflow-hidden border-2 border-gray-100"></div>
            </div>
            <div className="p-4 text-center text-xs text-gray-500 bg-gray-50 border-t">
              Align the subscription voucher's QR code within the scanning frame.
            </div>
          </div>
        </div>
      )}

      <div className="max-w-md mx-auto space-y-8 py-6">
        {isExpired && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-2xl flex items-start gap-3 animate-pulse">
            <ShieldAlert className="text-red-500 shrink-0 mt-0.5 w-5 h-5" />
            <div>
              <h4 className="font-bold text-red-800 text-sm">Subscription Expired</h4>
              <p className="text-xs text-red-700 mt-0.5">
                Your access is currently restricted. Please scan or enter an activation key to restore dashboard features.
              </p>
            </div>
          </div>
        )}

        <div className="card text-center space-y-6 p-8 border-navy/5 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-5">
            <KeyRound className="w-32 h-32 text-navy" />
          </div>
          
          <div className="w-20 h-20 bg-yellow/10 rounded-3xl flex items-center justify-center mx-auto text-navy border border-yellow/20">
            <Sparkles className="w-10 h-10 text-yellow" />
          </div>

          <div className="space-y-2">
            <h3 className="text-2xl font-bold text-navy">Enter Activation Key</h3>
            <p className="text-xs text-gray-500">
              Enter your standard format <code className="bg-gray-100 px-1 py-0.5 rounded font-mono">TS-XXXX-...</code> subscription license key.
            </p>
          </div>

          <form onSubmit={handleActivate} className="space-y-4">
            <div className="relative">
              <input
                id="activationKey"
                name="activationKey"
                type="text"
                required
                className="input-field py-4 pl-12 text-center font-mono text-lg tracking-wider border-2 border-navy/20 focus:border-navy"
                placeholder="TS-XXXX-XXXX-XXXX-XXXX-XXXX"
                value={activationKey}
                onChange={handleKeyChange}
                disabled={loading}
              />
              <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowScanner(true)}
                disabled={loading}
                className="flex-1 py-4 border-2 border-dashed border-navy/20 rounded-2xl text-navy hover:border-navy/40 font-bold transition-all flex items-center justify-center gap-2 hover:bg-gray-50"
              >
                <Scan className="w-5 h-5" /> Scan QR Key
              </button>

              <button
                type="submit"
                disabled={loading || activationKey.length < 22}
                className="flex-[2] btn-primary py-4 font-bold text-lg rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCcw className="w-5 h-5 animate-spin" /> Activating...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" /> Activate
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        <div className="card p-6 bg-navy text-white text-xs space-y-3">
          <h4 className="font-bold text-yellow uppercase tracking-wider">How to activate:</h4>
          <ol className="list-decimal pl-4 space-y-2 text-white/80">
            <li>Buy a Trusela subscription voucher key from an authorized vendor/admin.</li>
            <li>Scan the QR code printed on the voucher using the **Scan QR Key** button.</li>
            <li>Alternatively, manually type the 22-character voucher key in the input box.</li>
            <li>Click **Activate** to instantly unlock all premium dashboard features.</li>
          </ol>
        </div>
      </div>
    </Layout>
  );
}
