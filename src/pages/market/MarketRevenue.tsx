import React, { useState, useEffect } from 'react';
import MarketLayout from '../../components/MarketLayout';
import { Search, Plus, Filter, Banknote, QrCode, Calendar, Receipt, FileText, XCircle, CheckCircle2, Lock, Unlock, ShieldAlert } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { useUser } from '../../contexts/UserContext';
import axios from 'axios';
import { toast } from 'sonner';
import { toJpeg, toPng } from 'html-to-image';
import { auth } from '../../firebase';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';

export default function MarketRevenue() {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState<'collection' | 'types'>('collection');
  const [showAddTypeModal, setShowAddTypeModal] = useState(false);
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [showRecordCollectionModal, setShowRecordCollectionModal] = useState(false);

  const [scannedMemberId, setScannedMemberId] = useState<string | null>(null);

  const [revenueTypes, setRevenueTypes] = useState<any[]>([]);
  const [recentCollections, setRecentCollections] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [receiptData, setReceiptData] = useState<any>(null);

  const [lockedRevenueMode, setLockedRevenueMode] = useState<any | null>(null);
  const [showModeSwitchModal, setShowModeSwitchModal] = useState(false);

  useEffect(() => {
    if (user) {
      fetchRevenueTypes();
      fetchCollections();
      fetchMembers();
    }
  }, [user]);

  useEffect(() => {
    if (receiptData) {
      setTimeout(async () => {
        const el = document.getElementById('thermal-receipt-container');
        if (el) {
          try {
            const dataUrl = await toPng(el, { pixelRatio: 2, backgroundColor: '#ffffff' });
            
            // Create a temporary link to download
            const link = document.createElement('a');
            link.href = dataUrl;
            const memberName = receiptData.memberName || 'Member';
            link.download = `Receipt_${receiptData.ref}_${memberName.replace(/\s+/g, '_')}.png`;
            link.click();
            setReceiptData(null); 
            toast.success('Thermal receipt downloaded successfully!');
          } catch(e) {
            console.error(e);
            toast.error('Failed to generate receipt PNG');
          }
        }
      }, 500); 
    }
  }, [receiptData]);

  const fetchMembers = async () => {
    if (!user) return;
    try {
      const res = await axios.get(`/api/market/members/${user.uid}`);
      setMembers(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchRevenueTypes = async () => {
    if (!user) return;
    try {
      const res = await axios.get(`/api/market/revenue-types/${user.uid}`);
      setRevenueTypes(res.data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load revenue types');
    }
  };

  const fetchCollections = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const res = await axios.get(`/api/market/collections/${user.uid}`);
      // Reverse array to show recent first
      setRecentCollections(res.data.reverse());
    } catch (err) {
      console.error(err);
      toast.error('Failed to load collections');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let html5QrCode: Html5Qrcode;

    if (showCollectionModal) {
      html5QrCode = new Html5Qrcode("qr-reader");

      const onScanSuccess = (decodedText: string) => {
        if (html5QrCode.isScanning) {
          html5QrCode.stop().catch(e => console.error(e));
        }
        
        let memId = decodedText;
        try {
          const data = JSON.parse(decodedText);
          if (data.type === 'market_member' && data.memberId) {
            memId = data.memberId;
          }
        } catch(e) {
          // It's a raw string
        }

        const searchId = memId.trim().toLowerCase();
        const exists = members.find(m => 
          (m.id && m.id.toLowerCase() === searchId) || 
          (m.phone && m.phone.toLowerCase() === searchId) || 
          (m.phoneNumber && m.phoneNumber.toLowerCase() === searchId) || 
          (m.shopNumber && m.shopNumber.toLowerCase() === searchId)
        );
        if (!exists) {
          toast.error('Strict Mode: Member not found. Only registered members can be recorded.');
          setShowCollectionModal(false);
          return;
        }

        setScannedMemberId(exists.id);
        setShowCollectionModal(false);
        setShowRecordCollectionModal(true);
      };

      html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        onScanSuccess,
        () => {} // Ignore scan failure logs
      ).catch((err) => {
        console.error("Camera start error:", err);
        toast.error("Could not start camera. Please check permissions.");
      });

      return () => {
        if (html5QrCode && html5QrCode.isScanning) {
          html5QrCode.stop().then(() => {
            html5QrCode.clear();
          }).catch(e => console.error(e));
        }
      };
    }
  }, [showCollectionModal]);

  const AddRevenueTypeModal = () => {
    const [formData, setFormData] = useState({
      name: '',
      amount: '',
      frequency: 'Daily',
      description: '',
      prefix: '',
      adminPassword: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user || !auth.currentUser?.email) return;
      setIsSubmitting(true);
      try {
        // Authenticate as Admin first
        const credential = EmailAuthProvider.credential(auth.currentUser.email, formData.adminPassword);
        await reauthenticateWithCredential(auth.currentUser, credential);

        await axios.post('/api/market/revenue-types', {
          userId: user.uid,
          ...formData,
          amount: Number(formData.amount)
        });
        toast.success('Revenue type added successfully!');
        setShowAddTypeModal(false);
        fetchRevenueTypes();
      } catch (err) {
        console.error(err);
        toast.error('Failed to add revenue type.');
      } finally {
        setIsSubmitting(false);
      }
    };

    if (!showAddTypeModal) return null;

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl max-w-md w-full p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">New Revenue Type</h2>
            <button onClick={() => setShowAddTypeModal(false)} className="text-gray-500 hover:text-gray-700">
              <XCircle className="w-6 h-6" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name / Title</label>
              <input type="text" className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" required 
                value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Sanitation Levy" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₦)</label>
                <input type="number" className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" required min="0"
                  value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
                <select className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" required
                  value={formData.frequency} onChange={e => setFormData({...formData, frequency: e.target.value})}>
                  <option value="Daily">Daily</option>
                  <option value="Weekly">Weekly</option>
                  <option value="Monthly">Monthly</option>
                  <option value="Annual">Annual</option>
                  <option value="One-time">One-time</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Receipt Prefix (3 letters)</label>
              <input type="text" className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none uppercase" required maxLength={3}
                value={formData.prefix} onChange={e => setFormData({...formData, prefix: e.target.value})} placeholder="SAN" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input type="text" className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" 
                value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
            </div>
            <div className="pt-4 border-t border-gray-100">
              <label className="block text-sm font-bold text-gray-900 mb-1 flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-600" /> Admin Password Required
              </label>
              <p className="text-xs text-gray-500 mb-2">Please enter your login password to authorize adding a new revenue type.</p>
              <input type="password" className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" required 
                value={formData.adminPassword} onChange={e => setFormData({...formData, adminPassword: e.target.value})} placeholder="Your Password" />
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button type="button" onClick={() => setShowAddTypeModal(false)} disabled={isSubmitting} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                Cancel
              </button>
              <button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-emerald-700 text-white font-bold rounded-lg hover:bg-emerald-800 disabled:opacity-50 flex items-center gap-2">
                {isSubmitting ? 'Saving...' : 'Add Type'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const RecordCollectionModal = () => {
    const [selectedTypeId, setSelectedTypeId] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
      if (lockedRevenueMode) {
        setSelectedTypeId(lockedRevenueMode.id);
      }
    }, [showRecordCollectionModal]);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user || !scannedMemberId) return;
      
      const member = members.find(m => m.id === scannedMemberId);
      if (!member) {
        toast.error("Strict Mode: Unregistered member ID. Cannot record activity.");
        return;
      }

      const type = revenueTypes.find(rt => rt.id === selectedTypeId);
      if (!type) {
        toast.error("Please select a revenue type");
        return;
      }

      setIsSubmitting(true);
      try {
        const response = await axios.post('/api/market/collections', {
          userId: user.uid,
          memberId: scannedMemberId,
          officialId: user.uid, 
          typeId: type.id,
          typeName: type.name,
          amount: type.amount,
          prefix: type.prefix
        });
        toast.success('Collection recorded successfully!');
        
        // Generate Instant PNG Receipt Data
        setReceiptData({
          marketName: user.displayName || 'Market',
          memberName: member.fullName,
          memberId: member.id,
          type: type.name,
          amount: type.amount,
          date: new Date().toLocaleString(),
          ref: response.data?.collectionId || `${type.prefix}-${Math.floor(100000 + Math.random() * 900000)}`
        });

        setShowRecordCollectionModal(false);
        setScannedMemberId(null);
        fetchCollections();
      } catch (err) {
        console.error(err);
        toast.error('Failed to record collection.');
      } finally {
        setIsSubmitting(false);
      }
    };

    if (!showRecordCollectionModal) return null;

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl max-w-md w-full p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">Record Collection</h2>
            <button onClick={() => {setShowRecordCollectionModal(false); setScannedMemberId(null);}} className="text-gray-500 hover:text-gray-700">
              <XCircle className="w-6 h-6" />
            </button>
          </div>
          
          <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-500">Recording for Member</p>
            <p className="font-bold text-gray-900">{members.find(m => m.id === scannedMemberId)?.fullName || 'Unknown'}</p>
            <p className="text-xs text-gray-500 font-mono mt-1">{scannedMemberId}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Select Revenue Type</label>
              <select className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-gray-100 disabled:opacity-75 disabled:cursor-not-allowed" required
                disabled={!!lockedRevenueMode}
                value={selectedTypeId} onChange={e => setSelectedTypeId(e.target.value)}>
                <option value="">Select a type...</option>
                {revenueTypes.filter(rt => {
                  const member = members.find(m => m.id === scannedMemberId);
                  if (!member || !member.assignedRevenueTypes) return true; // Default ALL
                  if (member.assignedRevenueTypes === 'NONE') return false; // Exempt from all
                  return member.assignedRevenueTypes.split(',').includes(rt.id);
                }).map(rt => (
                  <option key={rt.id} value={rt.id}>{rt.name} - ₦{rt.amount}</option>
                ))}
              </select>
              {(() => {
                const member = members.find(m => m.id === scannedMemberId);
                if (member?.assignedRevenueTypes === 'NONE') {
                  return <p className="text-xs text-red-500 mt-1 font-medium">This member is exempt from all revenue types.</p>;
                }
                return null;
              })()}
              {(() => {
                const member = members.find(m => m.id === scannedMemberId);
                const isExempt = member?.assignedRevenueTypes === 'NONE' || (lockedRevenueMode && member?.assignedRevenueTypes && member.assignedRevenueTypes !== 'NONE' && !member.assignedRevenueTypes.split(',').includes(lockedRevenueMode.id));
                
                if (lockedRevenueMode && isExempt) {
                  return (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                      <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-red-800">Cannot Collect Locked Revenue</p>
                        <p className="text-xs text-red-600 mt-1">This member is exempt or not assigned to pay {lockedRevenueMode.name}. Switch out of Locked Mode or scan a different member.</p>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button type="button" onClick={() => {setShowRecordCollectionModal(false); setScannedMemberId(null);}} disabled={isSubmitting} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                Cancel
              </button>
              <button type="submit" disabled={isSubmitting || !selectedTypeId || (() => {
                  const member = members.find(m => m.id === scannedMemberId);
                  return member?.assignedRevenueTypes === 'NONE' || (lockedRevenueMode && member?.assignedRevenueTypes && member.assignedRevenueTypes !== 'NONE' && !member.assignedRevenueTypes.split(',').includes(lockedRevenueMode.id));
                })()} className="px-6 py-2 bg-emerald-700 text-white font-bold rounded-lg hover:bg-emerald-800 disabled:opacity-50 flex items-center gap-2">
                {isSubmitting ? 'Recording...' : 'Record Payment'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const SwitchModeModal = () => {
    const [selectedModeId, setSelectedModeId] = useState('');
    const [codeInput, setCodeInput] = useState('');

    const handleSwitch = (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedModeId) {
        setLockedRevenueMode(null);
        toast.success("Switched to Manual Mode");
        setShowModeSwitchModal(false);
        return;
      }
      const targetType = revenueTypes.find(rt => rt.id === selectedModeId);
      if (targetType) {
        if (!targetType.prefix) {
            toast.error("This revenue type does not have a prefix code to unlock it.");
            return;
        }
        if (codeInput.trim().toUpperCase() !== targetType.prefix.toUpperCase()) {
          toast.error("Incorrect Revenue Code. Mode switch denied.");
          return;
        }
        setLockedRevenueMode(targetType);
        toast.success(`Locked Mode Activated for ${targetType.name}`);
        setShowModeSwitchModal(false);
      }
    };

    if (!showModeSwitchModal) return null;

    const targetType = revenueTypes.find(rt => rt.id === selectedModeId);

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl max-w-md w-full p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">Switch Revenue Mode</h2>
            <button onClick={() => setShowModeSwitchModal(false)} className="text-gray-500 hover:text-gray-700">
              <XCircle className="w-6 h-6" />
            </button>
          </div>
          <form onSubmit={handleSwitch} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Select Operating Mode</label>
              <select className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" required
                value={selectedModeId} onChange={e => { setSelectedModeId(e.target.value); setCodeInput(''); }}>
                <option value="">Manual Mode (Default)</option>
                {revenueTypes.map(rt => (
                  <option key={rt.id} value={rt.id}>Lock to {rt.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-2">Manual mode allows the official to choose the revenue type per scan. Locked mode overrides manual selection.</p>
            </div>
            
            {targetType && (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg mt-4">
                <label className="block text-sm font-bold text-gray-900 mb-2">Enter Revenue Code to Unlock</label>
                <p className="text-xs text-gray-600 mb-3">Please enter the 3-letter Receipt Prefix for <b>{targetType.name}</b> to authorize this switch.</p>
                <input type="text" className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-mono uppercase tracking-widest text-center text-lg" required maxLength={3}
                  value={codeInput} onChange={e => setCodeInput(e.target.value)} placeholder="XXX" />
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button type="button" onClick={() => setShowModeSwitchModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" className="px-6 py-2 bg-emerald-700 text-white font-bold rounded-lg hover:bg-emerald-800 flex items-center gap-2">
                Switch Mode
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // Calculate today's total
  const todayDateStr = new Date().toISOString().split('T')[0];
  const todaysTotal = recentCollections
    .filter(c => c.date === todayDateStr)
    .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

  const CollectionTab = () => (
    <div className="space-y-6">
      
      {lockedRevenueMode ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center text-yellow-600 shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-yellow-900">Collection Locked to {lockedRevenueMode.name}</h3>
              <p className="text-xs text-yellow-700">All scans will only record payments for this specific revenue type.</p>
            </div>
          </div>
          <button onClick={() => setShowModeSwitchModal(true)} className="px-4 py-2 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 font-bold text-sm rounded-lg transition-colors whitespace-nowrap">
            Change Mode
          </button>
        </div>
      ) : (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
           <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 shrink-0">
              <Unlock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-blue-900">Manual Collection Mode</h3>
              <p className="text-xs text-blue-700">You must manually select the revenue type from a list for each scan.</p>
            </div>
          </div>
          <button onClick={() => setShowModeSwitchModal(true)} className="px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-800 font-bold text-sm rounded-lg transition-colors whitespace-nowrap">
            Lock Mode
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <button onClick={() => setShowCollectionModal(true)} className="flex flex-col items-center justify-center p-6 bg-emerald-700 text-white rounded-xl hover:bg-emerald-800 transition-colors shadow-sm">
          <QrCode className="w-10 h-10 mb-3" />
          <span className="font-bold text-lg">Scan to Collect</span>
          <span className="text-emerald-100 text-sm">Scan Member QR Code</span>
        </button>
        <button onClick={() => {
            // Simple prompt for member ID if scanning fails or want manual entry
            const rawId = prompt("Enter Member ID, Phone Number, or Shop Number:");
            if (rawId) {
              const searchId = rawId.trim().toLowerCase();
              const exists = members.find(m => 
                (m.id && m.id.toLowerCase() === searchId) || 
                (m.phone && m.phone.toLowerCase() === searchId) || 
                (m.phoneNumber && m.phoneNumber.toLowerCase() === searchId) || 
                (m.shopNumber && m.shopNumber.toLowerCase() === searchId)
              );
              if (!exists) {
                toast.error("Strict Mode: Member not found. Only registered members can be recorded.");
                return;
              }
              setScannedMemberId(exists.id);
              setShowRecordCollectionModal(true);
            }
          }} className="flex flex-col items-center justify-center p-6 bg-white border border-emerald-100 text-emerald-900 rounded-xl hover:bg-emerald-50 transition-colors shadow-sm">
          <Search className="w-10 h-10 mb-3 text-emerald-600" />
          <span className="font-bold text-lg">Search Member</span>
          <span className="text-gray-500 text-sm">Enter Member ID Manually</span>
        </button>
        <div className="bg-gradient-to-br from-emerald-50 to-blue-50 p-6 rounded-xl border border-emerald-100 shadow-sm flex flex-col justify-center">
          <p className="text-sm font-medium text-gray-500 mb-1">Your Collections Today</p>
          <h3 className="text-3xl font-bold text-emerald-900">₦{todaysTotal.toLocaleString()}</h3>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-emerald-50 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-emerald-600" />
            Recent Collections
          </h3>
          <button className="text-sm font-medium text-emerald-700 hover:text-emerald-800 flex items-center gap-1">
            <Filter className="w-4 h-4" /> Filter
          </button>
        </div>
        <div className="overflow-x-auto min-h-[300px]">
          {loading ? (
            <div className="flex justify-center items-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-900"></div>
            </div>
          ) : recentCollections.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              No collections recorded yet.
            </div>
          ) : (
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 font-bold">Receipt</th>
                  <th className="px-6 py-4 font-bold">Member</th>
                  <th className="px-6 py-4 font-bold">Revenue Type</th>
                  <th className="px-6 py-4 font-bold">Amount</th>
                  <th className="px-6 py-4 font-bold">Date & Time</th>
                </tr>
              </thead>
              <tbody>
                {recentCollections.map((c, idx) => (
                  <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-6 py-4 font-bold text-emerald-700">{c.receipt}</td>
                    <td className="px-6 py-4 font-medium text-gray-900">{c.member}</td>
                    <td className="px-6 py-4">{c.type}</td>
                    <td className="px-6 py-4 font-bold text-gray-900">₦{Number(c.amount).toLocaleString()}</td>
                    <td className="px-6 py-4 text-xs text-gray-500">{c.date} {c.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );

  const RevenueTypesTab = () => (
    <div className="bg-white rounded-xl shadow-sm border border-emerald-50 overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
        <h3 className="font-bold text-gray-900 flex items-center gap-2">
          <FileText className="w-5 h-5 text-emerald-600" />
          Active Revenue Types
        </h3>
        <button onClick={() => setShowAddTypeModal(true)} className="flex items-center gap-2 px-4 py-2 bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 text-sm font-medium">
          <Plus className="w-4 h-4" />
          New Category
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6 min-h-[300px]">
        {revenueTypes.length === 0 ? (
          <div className="col-span-full text-center py-16 text-gray-500">
            No revenue types available.
          </div>
        ) : revenueTypes.map((type) => (
          <div key={type.id} className="border border-gray-200 rounded-xl p-5 hover:border-emerald-300 transition-colors bg-white">
            <div className="flex justify-between items-start mb-3">
              <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg">
                <Banknote className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded uppercase">{type.prefix}</span>
            </div>
            <h4 className="font-bold text-gray-900 mb-1">{type.name}</h4>
            <div className="flex items-end gap-2 mb-4">
              <span className="text-2xl font-bold text-emerald-700">₦{Number(type.amount).toLocaleString()}</span>
              <span className="text-sm text-gray-500 mb-1">/ {type.frequency.toLowerCase()}</span>
            </div>
            <div className="flex justify-between items-center pt-4 border-t border-gray-100">
              <span className="text-xs text-gray-500">ID: {type.id}</span>
              <span className={`text-xs font-bold px-2 py-1 rounded ${type.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                {type.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <MarketLayout title="Revenue & Collections">
      
      {/* Tab Switcher */}
      <div className="flex bg-gray-200/50 p-1 rounded-xl mb-6 w-fit">
        <button 
          onClick={() => setActiveTab('collection')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'collection' ? 'bg-white text-emerald-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Receipt className="w-4 h-4" />
          Collection
        </button>
        <button 
          onClick={() => setActiveTab('types')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'types' ? 'bg-white text-emerald-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Banknote className="w-4 h-4" />
          Revenue Types
        </button>
      </div>

      {activeTab === 'collection' ? <CollectionTab /> : <RevenueTypesTab />}

      {/* Real QR Scanner Modal */}
      {showCollectionModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full text-center">
            <h3 className="text-xl font-bold mb-2">Scan Member QR</h3>
            <p className="text-gray-500 mb-4 text-sm">Please point your camera at the member's ID card.</p>
            
            <div id="qr-reader" className="w-full mb-6 overflow-hidden rounded-lg"></div>

            <button onClick={() => setShowCollectionModal(false)} className="w-full py-3 bg-gray-100 text-gray-700 font-bold rounded-lg hover:bg-gray-200 transition-colors">
              Cancel Scan
            </button>
          </div>
        </div>
      )}

      <AddRevenueTypeModal />
      <SwitchModeModal />
      <RecordCollectionModal />

      {/* Hidden Thermal Receipt Container for Generation */}
      <div style={{ position: 'absolute', top: 0, left: 0, opacity: 0, pointerEvents: 'none', zIndex: -50 }}>
        {receiptData && (
          <div id="thermal-receipt-container" style={{
            width: '384px',
            backgroundColor: '#fff',
            color: '#000',
            padding: '20px',
            fontFamily: 'monospace',
            fontSize: '14px',
            lineHeight: '1.4'
          }}>
            <div style={{ textAlign: 'center', marginBottom: '15px' }}>
              <h2 style={{ fontSize: '20px', margin: '0 0 5px 0', fontWeight: 'bold' }}>{receiptData.marketName}</h2>
              <p style={{ margin: '0', fontSize: '12px' }}>Revenue Collection Receipt</p>
            </div>
            
            <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '10px 0', marginBottom: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>Date:</span>
                <span>{receiptData.date}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>Ref:</span>
                <span>{receiptData.ref}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Official:</span>
                <span>{user?.displayName || 'Admin'}</span>
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>Member:</span>
                <span style={{ fontWeight: 'bold' }}>{receiptData.memberName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>Member ID:</span>
                <span>{receiptData.memberId}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                <span>Payment For:</span>
                <span>{receiptData.type}</span>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #000', paddingTop: '10px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 'bold' }}>
                <span>TOTAL:</span>
                <span>₦{Number(receiptData.amount).toLocaleString()}</span>
              </div>
            </div>

            <div style={{ textAlign: 'center', fontSize: '12px', marginTop: '20px' }}>
              <p style={{ margin: '0 0 5px 0' }}>Thank you for your payment!</p>
              <p style={{ margin: '0' }}>Powered by Trusela</p>
            </div>
          </div>
        )}
      </div>

    </MarketLayout>
  );
}
