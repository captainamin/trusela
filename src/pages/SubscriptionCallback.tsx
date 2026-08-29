import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import Layout from '../components/Layout';
import { RefreshCcw, CheckCircle, XCircle } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';

export default function SubscriptionCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const reference = searchParams.get('reference');

  useEffect(() => {
    const verifyTransaction = async () => {
      if (!reference) {
        setStatus('error');
        return;
      }

      try {
        const userId = auth.currentUser?.uid;
        if (!userId) {
          throw new Error('User not authenticated');
        }

        // Use the backend endpoint which uses Admin SDK to bypass Firestore rules
        const response = await axios.post('/api/paystack/verify-and-activate', {
          reference,
          userId,
        });

        if (response.data.success) {
          setStatus('success');
          toast.success(`Successfully subscribed to ${response.data.plan} plan!`);
          setTimeout(() => navigate('/'), 3000);
        } else {
          setStatus('error');
          toast.error('Payment verification failed');
        }
      } catch (error: any) {
        console.error('Verification error:', error);
        setStatus('error');
        toast.error(error.response?.data?.error || 'An error occurred during verification');
      }
    };

    if (auth.currentUser) {
      verifyTransaction();
    }
  }, [reference, navigate]);

  return (
    <Layout title="Payment Verification">
      <div className="max-w-md mx-auto py-20 text-center space-y-6">
        {status === 'verifying' && (
          <>
            <div className="w-20 h-20 bg-navy/5 rounded-full flex items-center justify-center mx-auto text-navy">
              <RefreshCcw className="w-10 h-10 animate-spin" />
            </div>
            <h2 className="text-2xl font-bold text-navy">Verifying Payment...</h2>
            <p className="text-gray-500 text-sm">Please wait while we confirm your transaction with Paystack.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto text-green-600">
              <CheckCircle className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold text-navy">Payment Successful!</h2>
            <p className="text-gray-500 text-sm">Your subscription has been activated. Redirecting you to the dashboard...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600">
              <XCircle className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold text-navy">Verification Failed</h2>
            <p className="text-gray-500 text-sm">We couldn't verify your payment. If you were charged, please contact support.</p>
            <button 
              onClick={() => navigate('/subscription')}
              className="btn-primary px-8 py-3 mt-4"
            >
              Back to Subscription
            </button>
          </>
        )}
      </div>
    </Layout>
  );
}
