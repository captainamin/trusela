import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Mail, Lock, User, ArrowRight, AlertCircle } from 'lucide-react';
import logo from '../assets/logo.png';
import { toast } from 'sonner';
import axios from 'axios';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const [configStatus, setConfigStatus] = useState<any>(null);

  useEffect(() => {
    const checkConfig = async () => {
      try {
        const res = await axios.get('/api/config-check');
        setConfigStatus(res.data);
      } catch (e) {}
    };
    checkConfig();
  }, []);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Just initialize the user document in Firestore. 
      // The database setup (Google Drive/Sheets) will happen on the /setup page after OAuth connection.
      await setDoc(doc(db, 'users', user.uid), {
        email: user.email,
        createdAt: new Date().toISOString(),
        subscriptionStatus: 'trial',
        trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        recordCount: 0,
      });

      toast.success('Account created successfully!');
      navigate('/');
    } catch (error: any) {
      console.error(error);
      const errorMsg = error.response?.data?.details || error.message || 'Failed to sign up';
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-4 drop-shadow-lg animate-fade-in rounded-2xl overflow-hidden">
            <img src={logo} alt="Trusela Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">Join Trusela</h1>
          <p className="text-white/70">Start securing your transactions</p>
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-2xl">
          {configStatus && (!configStatus.hasGoogleCreds || !configStatus.hasPaystackKey) && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl mb-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-amber-800 text-sm">Configuration Required</h3>
                  <p className="text-xs text-amber-700">The app administrator needs to set up API keys in the Secrets panel before you can sign up.</p>
                </div>
              </div>
            </div>
          )}
          <h2 className="text-2xl font-bold text-navy mb-6">Create Account</h2>
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="signup-email" className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Mail className="w-4 h-4" /> Email Address
              </label>
              <input
                id="signup-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="input-field"
                placeholder="dealer@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="signup-password" className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Lock className="w-4 h-4" /> Password
              </label>
              <input
                id="signup-password"
                name="password"
                type="password"
                required
                autoComplete="new-password"
                className="input-field"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-4 text-lg flex items-center justify-center gap-2 mt-4"
            >
              {loading ? 'Setting up...' : (
                <>
                  Sign Up <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Or continue with</span>
            </div>
          </div>

          <button
            onClick={async () => {
              setLoading(true);
              try {
                const { signInWithPopup, GoogleAuthProvider } = await import('firebase/auth');
                const { doc, getDoc, setDoc } = await import('firebase/firestore');
                const { db } = await import('../firebase');
                
                const provider = new GoogleAuthProvider();
                const result = await signInWithPopup(auth, provider);
                const user = result.user;
                
                const userDocRef = doc(db, 'users', user.uid);
                const userDoc = await getDoc(userDocRef);
                
                if (!userDoc.exists()) {
                  await setDoc(userDocRef, {
                    email: user.email,
                    createdAt: new Date().toISOString(),
                    subscriptionStatus: 'trial',
                    trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                    recordCount: 0,
                  });
                  window.location.href = `/api/google/auth-url?userId=${user.uid}`;
                } else if (!userDoc.data().isGoogleConnected) {
                  window.location.href = `/api/google/auth-url?userId=${user.uid}`;
                } else {
                  toast.success('Account verified!');
                  navigate('/');
                }
              } catch (error: any) {
                toast.error(error.message || 'Google sign in failed');
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
            className="w-full py-3 px-4 border border-gray-200 rounded-xl flex items-center justify-center gap-3 hover:bg-gray-50 transition-colors text-gray-700 font-medium disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Sign up with Google
          </button>

          <div className="mt-8 text-center text-gray-600">
            Already have an account?{' '}
            <Link to="/login" className="text-navy font-bold hover:underline">
              Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
