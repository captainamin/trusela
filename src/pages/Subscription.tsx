import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import Layout from '../components/Layout';
import { Check, CreditCard, ShieldCheck, Zap } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

export default function Subscription() {
  const [metadata, setMetadata] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    const checkPayment = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const reference = urlParams.get('reference');
      
      if (reference && auth.currentUser) {
        setVerifying(true);
        try {
          toast.info('Verifying payment...');
          const response = await axios.post('/api/paystack/verify-and-activate', {
            reference,
            userId: auth.currentUser.uid
          });
          
          if (response.data.success) {
            toast.success(`Subscription activated! Plan: ${response.data.plan}`);
            // Remove reference from URL
            window.history.replaceState({}, document.title, window.location.pathname);
            // Refresh metadata
            const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
            setMetadata(userDoc.data());
          }
        } catch (error) {
          toast.error('Payment verification failed');
        } finally {
          setVerifying(false);
        }
      }
    };

    const fetchData = async () => {
      if (!auth.currentUser) return;
      try {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userDoc.exists()) {
          setMetadata(userDoc.data());
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    checkPayment();
  }, []);

  const handleSubscribe = async (plan: string, amount: number) => {
    if (metadata?.planType === plan.toLowerCase() && metadata?.subscriptionStatus === 'active') {
      toast.info(`You are already subscribed to the ${plan} plan.`);
      return;
    }

    try {
      toast.info(`Initializing payment for ${plan}...`);
      const response = await axios.post('/api/paystack/initialize', {
        email: auth.currentUser?.email,
        amount: amount,
        metadata: {
          plan: plan.toLowerCase(),
          userId: auth.currentUser?.uid
        }
      });
      
      if (response.data.status) {
        window.location.href = response.data.data.authorization_url;
      } else {
        toast.error('Failed to initialize payment');
      }
    } catch (error) {
      toast.error('Payment initialization failed');
    }
  };

  const standardFeatures = [
    'Unlimited Transaction Records',
    'Professional PDF Generation',
    'Data Image Backup',
    'Google Sheets Data Sync',
    'WhatsApp Sharing',
    'Priority Support',
  ];

  const managerFeatures = [
    ...standardFeatures,
    'Register up to 3 Sales Persons',
    'Inventory Management Features',
    'Advanced Business Reports',
    'Multi-device Sync',
  ];

  if (loading || verifying) return <Layout title="Subscription"><div className="animate-pulse h-64 bg-gray-200 rounded-xl flex items-center justify-center font-bold text-navy">
    {verifying ? 'Verifying Payment...' : 'Loading...'}
  </div></Layout>;

  return (
    <Layout title="Subscription Plans">
      <div className="space-y-8">
        <div className="grid md:grid-cols-2 gap-6">
          {/* Standard Plan */}
          <div className="card border-navy/10 flex flex-col">
            <div className="mb-6">
              <h3 className="text-xl font-bold text-black">Standard Plan</h3>
              <p className="text-black/70 text-sm">Perfect for individual dealers.</p>
            </div>
            <div className="flex items-baseline gap-1 mb-8">
              <span className="text-4xl font-bold text-black">₦3,000</span>
              <span className="text-black/50">/month</span>
            </div>
            
            <ul className="space-y-3 mb-8 flex-1">
              {standardFeatures.map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-black/80">
                  <Check className="w-4 h-4 text-green-500" /> {f}
                </li>
              ))}
            </ul>

            <button 
              onClick={() => handleSubscribe('Standard', 3000)} 
              disabled={metadata?.planType === 'standard' && metadata?.subscriptionStatus === 'active'}
              className={`w-full border-2 border-black py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 ${
                metadata?.planType === 'standard' && metadata?.subscriptionStatus === 'active'
                ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                : 'text-black hover:bg-black hover:text-white'
              }`}
            >
              <CreditCard className="w-5 h-5" /> 
              {metadata?.planType === 'standard' && metadata?.subscriptionStatus === 'active' ? 'Current Plan' : 'Select Standard'}
            </button>
          </div>

          {/* Manager Plan */}
          <div className="card bg-white text-black overflow-hidden relative flex flex-col border-2 border-yellow shadow-xl">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <Zap className="w-32 h-32 text-navy" />
            </div>
            <div className="relative z-10 flex flex-col h-full">
              <div className="mb-6">
                <div className="inline-block bg-yellow text-black text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider mb-2">Most Popular</div>
                <h3 className="text-xl font-bold">Manager Plan</h3>
                <p className="text-black/70 text-sm">For growing businesses with teams.</p>
              </div>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="text-4xl font-bold">₦5,000</span>
                <span className="text-black/60">/month</span>
              </div>
              
              <ul className="space-y-3 mb-8 flex-1">
                {managerFeatures.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-black/80">
                    <Check className="w-4 h-4 text-yellow" /> {f}
                  </li>
                ))}
              </ul>

              <button 
                onClick={() => handleSubscribe('Manager', 5000)} 
                disabled={metadata?.planType === 'manager' && metadata?.subscriptionStatus === 'active'}
                className={`w-full py-4 rounded-xl text-lg font-bold flex items-center justify-center gap-2 transition-colors ${
                  metadata?.planType === 'manager' && metadata?.subscriptionStatus === 'active'
                  ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                  : 'bg-navy text-white hover:bg-navy/90'
                }`}
              >
                <CreditCard className="w-5 h-5" /> 
                {metadata?.planType === 'manager' && metadata?.subscriptionStatus === 'active' ? 'Current Plan' : 'Select Manager'}
              </button>
            </div>
          </div>
        </div>

        <div className="card border-navy/10">
          <h4 className="font-bold text-navy mb-2">Current Status</h4>
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-500">
                Plan: <span className="capitalize font-bold text-navy">{metadata?.planType || 'None'}</span> ({metadata?.subscriptionStatus || 'Trial'})
              </p>
              {metadata?.subscriptionStatus === 'trial' && (
                <p className="text-xs text-navy font-medium mt-1">
                  Trial ends on: {new Date(metadata.trialEndsAt).toLocaleDateString()}
                </p>
              )}
            </div>
            <ShieldCheck className="text-navy w-6 h-6" />
          </div>
        </div>
      </div>
    </Layout>
  );
}
