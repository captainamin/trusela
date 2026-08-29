import React, { useState } from 'react';
import MarketLayout from '../../components/MarketLayout';
import { useUser } from '../../contexts/UserContext';
import { Save, Lock, ExternalLink, Settings as SettingsIcon, Image as ImageIcon, Loader2 } from 'lucide-react';
import { auth } from '../../firebase';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import axios from 'axios';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

export default function MarketSettings() {
  const { metadata, user } = useUser();
  const [loading, setLoading] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');

  const [settings, setSettings] = useState({
    name: metadata?.marketSettings?.name || 'Trusela Market',
    address: metadata?.marketSettings?.address || '',
    registrationNumber: metadata?.marketSettings?.registrationNumber || '',
    logoUrl: metadata?.marketSettings?.logoUrl || '',
    color: metadata?.marketSettings?.color || '#065f46', // Default emerald-800
    emergencyNumbers: metadata?.marketSettings?.emergencyNumbers || ''
  });
  
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    
    setUploadingLogo(true);
    toast.info("Uploading logo securely to Google Drive...");
    
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const res = await axios.post('/api/market/upload-logo', {
          userId: user.uid,
          logoDataUrl: reader.result
        });
        setSettings({ ...settings, logoUrl: res.data.logoUrl });
        toast.success("Logo uploaded successfully to Google Drive!");
      } catch (err: any) {
        console.error(err);
        toast.error("Failed to upload logo to Google Drive.");
      } finally {
        setUploadingLogo(false);
      }
    };
    reader.onerror = () => {
      toast.error("Failed to read image file.");
      setUploadingLogo(false);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings.name) {
      toast.error('Market name is required');
      return;
    }
    setShowPasswordModal(true);
  };

  const executeSave = async () => {
    if (!user || !user.email) return;

    try {
      setLoading(true);
      // 1. Re-authenticate
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);

      // 2. Save settings via API
      await axios.post('/api/market/settings', {
        userId: user.uid,
        settings
      });

      toast.success('Market settings updated successfully!');
      setShowPasswordModal(false);
      setPassword('');
      
      // Reload window to reflect context changes completely if needed, 
      // though UserContext onSnapshot should update it automatically
      // window.location.reload(); 
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        toast.error('Incorrect password. Verification failed.');
      } else {
        toast.error('Failed to update settings. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <MarketLayout title="Market Settings">
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <SettingsIcon className="w-6 h-6 text-emerald-600" />
              Brand Configuration
            </h1>
            <p className="text-gray-500 mt-1">Manage global market details and branding</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
          <form onSubmit={handleSaveRequest} className="p-6 space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Market Name *</label>
                <input
                  type="text"
                  required
                  value={settings.name}
                  onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  placeholder="e.g. Lagos Main Market"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Registration Number</label>
                <input
                  type="text"
                  value={settings.registrationNumber}
                  onChange={(e) => setSettings({ ...settings, registrationNumber: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  placeholder="e.g. RC-123456"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-gray-700">Market Address</label>
                <input
                  type="text"
                  value={settings.address}
                  onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  placeholder="e.g. 123 Market Square, Trade Hub"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-gray-700">Market Logo</label>
                <div className="flex items-center gap-4">
                  {settings.logoUrl ? (
                    <img src={settings.logoUrl} alt="Logo Preview" className="h-16 object-contain rounded-lg border border-gray-200 bg-gray-50 p-1" />
                  ) : (
                    <div className="h-16 w-16 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-400">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                  )}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                        {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                        {uploadingLogo ? 'Uploading...' : 'Upload Image'}
                        <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploadingLogo} />
                      </label>
                    </div>
                    <p className="text-xs text-gray-500">Upload a logo for your market. Leave blank to use the default Trusela logo.</p>
                  </div>
                </div>
              </div>
              
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-gray-700">Emergency Numbers</label>
                <input
                  type="text"
                  value={settings.emergencyNumbers}
                  onChange={(e) => setSettings({ ...settings, emergencyNumbers: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  placeholder="e.g. 08001234567, 09001234567"
                />
                <p className="text-xs text-gray-500">Enter emergency contact numbers for the market administration (comma separated).</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Brand Color</label>
                <div className="flex items-center gap-4">
                  <input
                    type="color"
                    value={settings.color}
                    onChange={(e) => setSettings({ ...settings, color: e.target.value })}
                    className="w-12 h-12 p-1 border border-gray-300 rounded-lg cursor-pointer"
                  />
                  <span className="text-sm text-gray-600 font-mono">{settings.color}</span>
                </div>
                <p className="text-xs text-gray-500">This color will be applied to ID Card headers and official documents.</p>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100 flex justify-end">
              <button
                type="submit"
                className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-emerald-700 transition-colors"
              >
                <Save className="w-4 h-4" />
                Save Configuration
              </button>
            </div>
          </form>
        </div>

        {/* Revenues & Collections Nav Card */}
        <div className="bg-emerald-50 rounded-xl p-6 border border-emerald-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-emerald-900 mb-1">Revenues & Collections</h3>
            <p className="text-sm text-emerald-700">Configure global revenue types, fees, and collection tracking.</p>
          </div>
          <Link
            to="/market/revenue"
            className="flex items-center gap-2 bg-white text-emerald-700 px-4 py-2 rounded-lg font-bold border border-emerald-200 hover:bg-emerald-100 transition-colors whitespace-nowrap"
          >
            Configure Revenues
            <ExternalLink className="w-4 h-4" />
          </Link>
        </div>

      </div>

      {/* Password Verification Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center border-b border-gray-100">
              <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Admin Verification Required</h2>
              <p className="text-sm text-gray-500">
                You are about to modify global brand settings for the market. Please enter your password to confirm.
              </p>
            </div>
            
            <div className="p-6 space-y-4 bg-gray-50">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Admin Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                  placeholder="Enter your current password"
                  autoFocus
                />
              </div>
              
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="flex-1 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={executeSave}
                  disabled={loading || !password}
                  className="flex-1 px-4 py-2 text-white bg-amber-600 rounded-lg hover:bg-amber-700 font-medium transition-colors disabled:opacity-50"
                >
                  {loading ? 'Verifying...' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </MarketLayout>
  );
}
