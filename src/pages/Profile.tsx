import React, { useEffect, useState, useRef } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import axios from 'axios';
import Layout from '../components/Layout';
import { User, Phone, Store, MapPin, Save, ShieldCheck, Users, ChevronRight, Camera, Zap, CreditCard, RefreshCcw, LogOut, AlertCircle, Settings as SettingsIcon, LayoutDashboard, Database, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Link, useNavigate } from 'react-router-dom';
import { signOut, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { useUser } from '../contexts/UserContext';
import { getEmbedUrl } from '../utils/googleDrive';

export default function Profile() {
  const navigate = useNavigate();
  const { user, metadata, loading: userLoading, refreshMetadata, activeProfileMode, setActiveProfileMode } = useUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [formData, setFormData] = useState({
    dealerName: '',
    dealerPhone: '',
    marketName: '',
    shopNumber: '',
    profilePhoto: '',
  });
  const [activeTab, setActiveTab] = useState<'member' | 'admin'>(
    activeProfileMode === 'business' ? 'member' : 'admin'
  );
  
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [verifyingPassword, setVerifyingPassword] = useState(false);

  const [dbSettingsUnlocked, setDbSettingsUnlocked] = useState(false);
  const [dbPassword, setDbPassword] = useState('');
  const [verifyingDbPassword, setVerifyingDbPassword] = useState(false);
  const [savingDb, setSavingDb] = useState(false);
  const [manualDbIds, setManualDbIds] = useState({ spreadsheetId: '', folderId: '' });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!userLoading) {
      if (metadata) {
        setUserData(metadata);
        setFormData({
          dealerName: metadata.dealerName || '',
          dealerPhone: metadata.dealerPhone || '',
          marketName: metadata.marketName || '',
          shopNumber: metadata.shopNumber || '',
          profilePhoto: metadata.profilePhoto || user?.photoURL || '',
        });
        setManualDbIds({
          spreadsheetId: metadata.spreadsheetId || '',
          folderId: metadata.folderId || ''
        });
      }
      setLoading(false);
    }
  }, [metadata, userLoading]);

  const confirmSwitchToAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser?.email || !passwordInput) return;
    
    setVerifyingPassword(true);
    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, passwordInput);
      await reauthenticateWithCredential(auth.currentUser, credential);
      
      setShowPasswordModal(false);
      setPasswordInput('');
      setActiveTab('admin');
      if (setActiveProfileMode) {
        setActiveProfileMode('market');
      }
      navigate('/market/dashboard');
    } catch (error: any) {
      console.error(error);
      toast.error('Incorrect password');
    } finally {
      setVerifyingPassword(false);
    }
  };

  const handleUnlockDbSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser?.email || !dbPassword) return;
    
    setVerifyingDbPassword(true);
    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, dbPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      
      setDbSettingsUnlocked(true);
      setDbPassword('');
      toast.success('Database settings unlocked');
    } catch (error: any) {
      console.error(error);
      toast.error('Incorrect password');
    } finally {
      setVerifyingDbPassword(false);
    }
  };

  const handleSaveDbSettings = async () => {
    if (!auth.currentUser) return;
    if (!manualDbIds.spreadsheetId) {
      toast.error('Spreadsheet ID is required');
      return;
    }
    
    setSavingDb(true);
    try {
      await axios.post('/api/google/save-setup', {
        userId: auth.currentUser.uid,
        spreadsheetId: manualDbIds.spreadsheetId,
        folderId: manualDbIds.folderId
      });
      await refreshMetadata();
      toast.success('Database configuration updated');
    } catch (error: any) {
      console.error(error);
      toast.error('Failed to update database configuration');
    } finally {
      setSavingDb(false);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      setCapturing(true);
    } catch (err) {
      toast.error('Could not access camera');
    }
  };

  useEffect(() => {
    if (capturing && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [capturing]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCapturing(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvasRef.current.toDataURL('image/jpeg');
        setFormData({ ...formData, profilePhoto: dataUrl });
        stopCamera();
      }
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setShowConfirmModal(true);
  };

  const confirmSave = async () => {
    if (!auth.currentUser) return;
    setSaving(true);
    setShowConfirmModal(false);
    try {
      let finalFormData = { ...formData };

      // If profile photo is a new base64 image, upload it to Firebase Storage
      if (formData.profilePhoto && formData.profilePhoto.startsWith('data:image')) {
        try {
          const response = await axios.post('/api/google/upload-image', {
            base64: formData.profilePhoto,
            name: `profile_${auth.currentUser.uid}.jpg`,
            userId: auth.currentUser.uid // Fixed: Added missing userId
          });
          finalFormData.profilePhoto = response.data.url;
        } catch (uploadErr: any) {
          console.error('Failed to upload profile photo to Storage:', uploadErr);
          const details = uploadErr.response?.data?.details || uploadErr.message;
          toast.error(`Photo upload failed: ${details}. Falling back to local storage.`);
          // Fallback to base64 if upload fails, but it might hit Firestore limits
        }
      }

      // Update profile via backend Admin SDK to bypass strict client-side rules
      await axios.post('/api/google/update-profile', {
        userId: auth.currentUser.uid,
        ...finalFormData
      });
      
      await refreshMetadata(); // Refresh the context with new data
      setFormData(finalFormData);
      toast.success('Profile updated successfully');
    } catch (error) {
      console.error(error);
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success('Logged out successfully');
      navigate('/login');
    } catch (error) {
      toast.error('Failed to logout');
    }
  };

  if (loading) {
    return (
      <Layout title="Dealer Profile">
        <div className="animate-pulse space-y-4">
          <div className="h-64 bg-gray-200 rounded-xl"></div>
        </div>
      </Layout>
    );
  }

  const isLifetime = userData?.subscriptionStatus === 'lifetime';
  const isSubscribed = userData?.subscriptionStatus === 'active' || isLifetime;
  const isTrialActive = userData?.subscriptionStatus === 'trial' && new Date(userData.trialEndsAt) > new Date();
  const isTrialExpired = userData?.subscriptionStatus === 'trial' && new Date(userData.trialEndsAt) < new Date();
  const isExpired = userData?.subscriptionStatus === 'expired' || isTrialExpired;
  const isSuspended = userData?.subscriptionStatus === 'suspended';

  const expiryDate = isLifetime ? 'Lifetime' : 
                     (userData?.subscriptionExpiry ? new Date(userData.subscriptionExpiry).toLocaleDateString() : 
                     (userData?.trialEndsAt ? new Date(userData.trialEndsAt).toLocaleDateString() : 'N/A'));

  const getDaysRemaining = () => {
    if (isLifetime) return 'Unlimited';
    const targetDate = userData?.subscriptionExpiry || userData?.trialEndsAt;
    if (!targetDate) return 0;
    const diff = new Date(targetDate).getTime() - new Date().getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
  };

  const isMarketAdmin = userData?.role === 'market_admin';

  return (
    <Layout title="My Profile">
      {isMarketAdmin && (
        <div className="flex p-1 bg-gray-200/50 rounded-xl max-w-md mx-auto mb-6 relative">
          <button 
            onClick={() => {
              setActiveTab('member');
              if (setActiveProfileMode) {
                setActiveProfileMode('business');
              }
            }} 
            className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${activeTab === 'member' ? 'bg-white text-navy shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Member Profile
          </button>
          <button 
            onClick={() => setShowPasswordModal(true)} 
            className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'admin' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <ShieldCheck className="w-4 h-4" /> Market Admin
          </button>
        </div>
      )}
      {capturing && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-4">
          <video ref={videoRef} autoPlay playsInline className="w-full max-h-[70vh] rounded-2xl bg-gray-900" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="mt-8 flex gap-4">
              <button type="button" onClick={stopCamera} className="bg-red-500 text-white px-4 py-2 rounded-lg font-bold">Cancel</button>
            <button onClick={capturePhoto} className="btn-secondary px-8 py-4 text-xl">Capture</button>
          </div>
        </div>
      )}

      {activeTab === 'member' && (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="card bg-navy text-white p-8 flex flex-col items-center text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 p-2">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${userData?.planType === 'manager' ? 'bg-yellow text-navy' : 'bg-white/20 text-white'}`}>
              {userData?.planType || 'Basic'} Plan
            </span>
          </div>
          
          <div className="relative group">
            <div className="w-24 h-24 bg-yellow rounded-full flex items-center justify-center text-navy mb-4 overflow-hidden border-4 border-white/20">
              {formData.profilePhoto ? (
                <img src={getEmbedUrl(formData.profilePhoto, user?.uid)} className="w-full h-full object-cover" alt="Profile" />
              ) : (
                <User className="w-12 h-12" />
              )}
            </div>
            <button 
              onClick={startCamera}
              className="absolute bottom-4 right-0 bg-white text-navy p-2 rounded-full shadow-lg hover:scale-110 transition-transform"
            >
              <Camera className="w-4 h-4" />
            </button>
          </div>

          <h3 className="text-xl font-bold">{formData.dealerName || 'New Dealer'}</h3>
          <p className="text-white/70 text-sm">{auth.currentUser?.email}</p>
        </div>

        {/* Subscription Summary */}
        <div className="card border-navy/10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-navy flex items-center gap-2">
              <CreditCard className="w-5 h-5" /> Subscription Status
            </h3>
            <Zap className={`w-5 h-5 ${isSubscribed ? 'text-yellow' : 'text-gray-300'}`} />
          </div>
          
          <div className="flex justify-between items-end">
            <div className="space-y-1.5">
              <p className="text-sm text-gray-600">
                Subscription: <span className="font-bold text-navy uppercase">{userData?.subscriptionPlan || userData?.planType || 'Trial'}</span>
              </p>
              <p className="text-xs text-gray-500">
                Status: <span className={`font-bold ${
                  isSubscribed ? 'text-green-500' :
                  isSuspended ? 'text-orange-500' :
                  'text-red-500'
                }`}>
                  {isLifetime ? 'Lifetime' : (isSubscribed ? 'Active' : isSuspended ? 'Suspended' : 'Expired')}
                </span>
              </p>
              <p className="text-xs text-gray-500">
                Expires: <span className="font-medium text-gray-700">{expiryDate}</span>
              </p>
              <p className="text-xs text-gray-500">
                Days Remaining: <span className="font-bold text-navy">{getDaysRemaining()}</span>
              </p>
            </div>
            
            {!isLifetime && (
              <Link 
                to={isExpired ? "/activate" : "/subscription"} 
                className="btn-primary py-2 px-4 text-xs flex items-center gap-2"
              >
                <Zap className="w-3 h-3" /> {isExpired ? 'Activate' : 'Upgrade'}
              </Link>
            )}
          </div>
        </div>

        {userData?.planType === 'manager' && (
          <Link to="/sales-persons" className="card flex items-center justify-between hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-navy/5 rounded-full flex items-center justify-center text-navy">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-navy">Manage Sales Persons</h4>
                <p className="text-xs text-gray-500">Register and manage your team (Max 3)</p>
              </div>
            </div>
            <ChevronRight className="text-gray-400 w-5 h-5" />
          </Link>
        )}

        <form onSubmit={handleSave} className="card space-y-4">
          <div className="space-y-2">
            <label htmlFor="dealerName" className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <User className="w-4 h-4" /> Dealer Full Name
            </label>
            <input
              id="dealerName"
              name="dealerName"
              type="text"
              autoComplete="name"
              className="input-field"
              placeholder="e.g. John Doe"
              value={formData.dealerName}
              onChange={(e) => setFormData({ ...formData, dealerName: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="dealerPhone" className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Phone className="w-4 h-4" /> Business Phone Number
            </label>
            <input
              id="dealerPhone"
              name="dealerPhone"
              type="tel"
              autoComplete="tel"
              className="input-field"
              placeholder="e.g. +234 800 000 0000"
              value={formData.dealerPhone}
              onChange={(e) => setFormData({ ...formData, dealerPhone: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="marketName" className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <MapPin className="w-4 h-4" /> Market Name
            </label>
            <input
              id="marketName"
              name="marketName"
              type="text"
              autoComplete="off"
              className="input-field"
              placeholder="e.g. Computer Village"
              value={formData.marketName}
              onChange={(e) => setFormData({ ...formData, marketName: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="shopNumber" className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Store className="w-4 h-4" /> Shop Number
            </label>
            <input
              id="shopNumber"
              name="shopNumber"
              type="text"
              autoComplete="off"
              className="input-field"
              placeholder="e.g. Suite 4, Block B"
              value={formData.shopNumber}
              onChange={(e) => setFormData({ ...formData, shopNumber: e.target.value })}
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full btn-primary py-4 flex items-center justify-center gap-2 mt-4"
          >
            {saving ? (
              <>
                <RefreshCcw className="w-5 h-5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" /> Save Profile
              </>
            )}
          </button>
        </form>

        <div className="bg-yellow/10 border border-yellow/20 p-4 rounded-xl flex items-start gap-3">
          <ShieldCheck className="text-navy w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-xs text-navy">
            Your profile information will be automatically included in all generated transaction receipts (PDFs).
          </p>
        </div>

        {/* Database Configuration Section */}
        <div className="card space-y-4 border-emerald-100">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-600" /> Database Integration
            </h3>
          </div>
          
          {!dbSettingsUnlocked ? (
            <form onSubmit={handleUnlockDbSettings} className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-100">
              <div className="flex items-center gap-2 text-amber-600 mb-2">
                <Lock className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Locked Setting</span>
              </div>
              <p className="text-xs text-gray-600">Enter your password to view or modify your Data connection settings.</p>
              <div className="flex gap-2">
                <input 
                  type="password" 
                  value={dbPassword} 
                  onChange={(e) => setDbPassword(e.target.value)} 
                  className="input-field flex-1 py-2" 
                  placeholder="Password" 
                  required 
                />
                <button 
                  type="submit" 
                  disabled={verifyingDbPassword} 
                  className="bg-gray-800 text-white px-4 py-2 rounded-lg font-bold hover:bg-gray-900 transition-colors disabled:opacity-50 flex items-center justify-center min-w-[3rem]"
                >
                  {verifyingDbPassword ? <RefreshCcw className="w-4 h-4 animate-spin" /> : 'Unlock'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4 bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 animate-in fade-in duration-300">
              <p className="text-xs text-gray-600">Your secure database configuration:</p>
              
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-500 uppercase">Spreadsheet ID</label>
                <input 
                  type="text" 
                  value={manualDbIds.spreadsheetId} 
                  onChange={(e) => setManualDbIds({...manualDbIds, spreadsheetId: e.target.value})} 
                  className="input-field font-mono text-xs py-2" 
                  placeholder="e.g. 1BxiMVs0XRYFgwnm..."
                />
              </div>
              
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-500 uppercase">Folder ID (Optional)</label>
                <input 
                  type="text" 
                  value={manualDbIds.folderId} 
                  onChange={(e) => setManualDbIds({...manualDbIds, folderId: e.target.value})} 
                  className="input-field font-mono text-xs py-2" 
                  placeholder="Folder for image uploads"
                />
              </div>
              
              <button 
                onClick={handleSaveDbSettings} 
                disabled={savingDb} 
                className="w-full bg-emerald-600 text-white rounded-lg py-3 flex items-center justify-center gap-2 font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {savingDb ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Database Config
              </button>
            </div>
          )}
        </div>


        <button
          onClick={handleLogout}
          className="w-full py-4 rounded-xl border-2 border-red-100 text-red-500 font-bold hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
        >
          <LogOut className="w-5 h-5" /> Sign Out
        </button>
      </div>
      )}

      {activeTab === 'admin' && isMarketAdmin && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="card bg-emerald-900 text-white p-8 flex flex-col items-center text-center relative overflow-hidden">
            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center text-emerald-900 mb-4 overflow-hidden border-4 border-emerald-500/30">
              <ShieldCheck className="w-12 h-12" />
            </div>
            <h3 className="text-xl font-bold">{userData?.marketSettings?.name || 'Trusela Market'}</h3>
            <p className="text-emerald-200 text-sm mt-1">Market Administrator</p>
          </div>

          <div className="card p-6 border-emerald-100 flex flex-col gap-4">
            <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2 mb-2">
              <SettingsIcon className="w-5 h-5 text-emerald-600" /> Market Configuration
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              As a market administrator, you have global control over the market's operations, revenue, and members. Switch context to the Market Portal below.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Link to="/market/dashboard" className="bg-gray-50 hover:bg-emerald-50 border border-gray-200 hover:border-emerald-200 p-4 rounded-xl transition-all flex items-center gap-4 group">
                 <div className="bg-emerald-100 p-3 rounded-lg text-emerald-700 group-hover:scale-110 transition-transform">
                   <LayoutDashboard className="w-6 h-6" />
                 </div>
                 <div>
                   <h4 className="font-bold text-gray-900">Market Dashboard</h4>
                   <p className="text-xs text-gray-500">View overall statistics</p>
                 </div>
              </Link>
              <Link to="/market/settings" className="bg-gray-50 hover:bg-emerald-50 border border-gray-200 hover:border-emerald-200 p-4 rounded-xl transition-all flex items-center gap-4 group">
                 <div className="bg-emerald-100 p-3 rounded-lg text-emerald-700 group-hover:scale-110 transition-transform">
                   <SettingsIcon className="w-6 h-6" />
                 </div>
                 <div>
                   <h4 className="font-bold text-gray-900">Market Settings</h4>
                   <p className="text-xs text-gray-500">Configure brand & revenues</p>
                 </div>
              </Link>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full py-4 rounded-xl border-2 border-red-100 text-red-500 font-bold hover:bg-red-50 transition-colors flex items-center justify-center gap-2 mt-8"
          >
            <LogOut className="w-5 h-5" /> Sign Out
          </button>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/80 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-yellow/20 rounded-full flex items-center justify-center text-navy">
                <AlertCircle className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-navy">Save Changes?</h3>
                <p className="text-sm text-gray-600">
                  Are you sure you want to update your profile information? These details will appear on all future receipts.
                </p>
              </div>
              <div className="flex w-full gap-3 pt-2">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 py-3 rounded-xl border border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmSave}
                  className="flex-1 py-3 rounded-xl bg-navy text-white font-bold hover:bg-navy/90 transition-colors"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Password Confirmation Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/80 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <div className="space-y-2 w-full">
                <h3 className="text-xl font-bold text-navy">Market Admin Access</h3>
                <p className="text-sm text-gray-600">
                  Please enter your password to access the market management features.
                </p>
                <form onSubmit={confirmSwitchToAdmin} className="mt-4 w-full">
                  <input
                    type="password"
                    placeholder="Enter your password"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    required
                  />
                  <div className="flex w-full gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowPasswordModal(false)}
                      className="flex-1 py-3 rounded-xl border border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                      disabled={verifyingPassword}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-colors flex justify-center items-center gap-2"
                      disabled={verifyingPassword}
                    >
                      {verifyingPassword ? <RefreshCcw className="w-5 h-5 animate-spin" /> : 'Confirm'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
