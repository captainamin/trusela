import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { 
  KeyRound, Plus, Filter, Search, Trash2, Download, FileSpreadsheet, FileText, 
  Settings, CreditCard, LayoutDashboard, Copy, Check, Sparkles, HelpCircle, RefreshCcw 
} from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import { auth } from '../firebase';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

export default function AdminSubscription() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'plans'>('dashboard');
  const [stats, setStats] = useState<any>({
    totalKeys: 0,
    unusedKeys: 0,
    usedKeys: 0,
    expiredKeys: 0,
    revokedKeys: 0,
    revenuePotential: 0,
    revenueActivated: 0
  });
  const [loadingStats, setLoadingStats] = useState(true);

  // Key Generator States
  const [planId, setPlanId] = useState<'monthly' | 'quarterly' | 'yearly' | 'lifetime'>('monthly');
  const [quantity, setQuantity] = useState(10);
  const [batchName, setBatchName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [showGenModal, setShowGenModal] = useState(false);
  const [generatedKeys, setGeneratedKeys] = useState<string[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Key list filters
  const [keys, setKeys] = useState<any[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPlan, setFilterPlan] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterBatch, setFilterBatch] = useState('');

  // Plans update states
  const [plans, setPlans] = useState<any[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [updatingPlanId, setUpdatingPlanId] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState({
    name: '',
    durationDays: 30,
    price: 3000
  });

  const fetchStats = async () => {
    if (!auth.currentUser) return;
    try {
      setLoadingStats(true);
      const res = await axios.get(`/api/subscription/stats?userId=${auth.currentUser.uid}`);
      setStats(res.data.stats);
    } catch (e) {
      console.error('Stats fetch failed', e);
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchKeys = async () => {
    if (!auth.currentUser) return;
    try {
      setLoadingKeys(true);
      const params = new URLSearchParams({
        userId: auth.currentUser.uid,
        search,
        plan: filterPlan,
        status: filterStatus,
        batch: filterBatch
      });
      const res = await axios.get(`/api/subscription/list-keys?${params.toString()}`);
      setKeys(res.data.keys || []);
    } catch (e) {
      console.error('Keys list fetch failed', e);
    } finally {
      setLoadingKeys(false);
    }
  };

  const fetchPlans = async () => {
    try {
      setLoadingPlans(true);
      const res = await axios.get('/api/subscription/plans');
      setPlans(res.data.plans || []);
    } catch (e) {
      console.error('Plans fetch failed', e);
    } finally {
      setLoadingPlans(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'dashboard') {
      fetchStats();
      fetchKeys();
    } else {
      fetchPlans();
    }
  }, [activeTab, filterPlan, filterStatus, filterBatch]);

  // Debounced search trigger
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (activeTab === 'dashboard') fetchKeys();
    }, 500);
    return () => clearTimeout(delayDebounce);
  }, [search]);

  // Generate Keys submit
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchName) {
      toast.error('Please enter a batch name');
      return;
    }
    setGenerating(true);
    try {
      const res = await axios.post('/api/subscription/generate-keys', {
        planId,
        quantity,
        batchName,
        userId: auth.currentUser?.uid
      });

      if (res.data.success) {
        toast.success(`Successfully generated ${quantity} keys!`);
        setGeneratedKeys(res.data.keys);
        setShowGenModal(true);
        setBatchName('');
        // Refresh dashboard data
        fetchStats();
        fetchKeys();
      }
    } catch (error: any) {
      const msg = error.response?.data?.error || error.message || 'Key generation failed';
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  // Revoke key
  const handleRevoke = async (hash: string, keyId: string) => {
    if (!window.confirm(`Are you sure you want to revoke key: ${keyId}? This cannot be undone.`)) {
      return;
    }

    try {
      toast.info('Revoking key...');
      await axios.post('/api/subscription/revoke-key', {
        keyHash: hash,
        userId: auth.currentUser?.uid
      });
      toast.success('Key revoked successfully');
      fetchStats();
      fetchKeys();
    } catch (error: any) {
      const msg = error.response?.data?.error || error.message || 'Revocation failed';
      toast.error(msg);
    }
  };

  // Copy key to clipboard
  const handleCopyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    toast.success('Key copied!');
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Copy all keys to clipboard
  const handleCopyAllKeys = () => {
    const text = generatedKeys.join('\n');
    navigator.clipboard.writeText(text);
    toast.success('All keys copied to clipboard!');
  };

  // Update Plan Settings submit
  const handleUpdatePlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updatingPlanId) return;

    try {
      const res = await axios.post('/api/subscription/plans/update', {
        planId: updatingPlanId,
        name: editingPlan.name,
        durationDays: Number(editingPlan.durationDays),
        price: Number(editingPlan.price),
        userId: auth.currentUser?.uid
      });

      if (res.data.success) {
        toast.success(res.data.message);
        setUpdatingPlanId(null);
        fetchPlans();
      }
    } catch (error: any) {
      const msg = error.response?.data?.error || error.message || 'Plan update failed';
      toast.error(msg);
    }
  };

  // Export List to CSV
  const handleExportCSV = () => {
    if (keys.length === 0) {
      toast.info('No keys available to export.');
      return;
    }

    const headers = [
      'Key ID', 'Batch ID', 'Hash', 'Plan', 'Duration (Days)', 
      'Price', 'Status', 'Generated Date', 'Activated By', 
      'Activated Date', 'Expiry Date'
    ];

    const rows = keys.map(k => [
      k.keyId,
      k.batchId,
      k.activationKeyHash,
      k.plan,
      k.durationDays,
      k.price,
      k.status,
      k.generatedDate,
      k.activatedBy || '',
      k.activatedDate || '',
      k.expiryDate || ''
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `trusela_keys_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('CSV downloaded successfully.');
  };

  // Export Batch or Filtered Keys to PDF (A4 Sheet layout or Mini Voucher layout)
  const handleExportPDF = async (keysList: string[], isMiniFormat: boolean) => {
    if (keysList.length === 0) {
      toast.info('No keys available to print.');
      return;
    }

    const targetPlan = plans.find(p => p.id === planId) || DEFAULT_PLANS.find(p => p.id === planId);
    const planName = targetPlan?.name || planId;
    const planPrice = targetPlan?.price || 3000;

    toast.info('Generating PDF vouchers, please wait...');

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: isMiniFormat ? [80, 150] : 'a4'
    });

    if (isMiniFormat) {
      // 80mm Mini ticket format
      for (let i = 0; i < keysList.length; i++) {
        const key = keysList[i];
        if (i > 0) doc.addPage([80, 150]);

        // Draw card border
        doc.setDrawColor(0, 31, 63);
        doc.setLineWidth(0.8);
        doc.rect(4, 4, 72, 142);

        // Header
        doc.setTextColor(0, 31, 63);
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(13);
        doc.text('Trusela Subscription Key', 40, 16, { align: 'center' });
        doc.setDrawColor(245, 197, 24); // Yellow accent line
        doc.line(15, 20, 65, 20);

        // Plan detail fields
        doc.setFontSize(10);
        doc.setFont('Helvetica', 'normal');
        doc.text(`Plan: ${planName}`, 40, 28, { align: 'center' });
        doc.text(`Price: ₦${planPrice.toLocaleString()}`, 40, 34, { align: 'center' });

        // The Key
        doc.setFontSize(11);
        doc.setFont('Courier', 'bold');
        doc.setFillColor(240, 240, 240);
        doc.rect(10, 40, 60, 10, 'F');
        doc.text(key, 40, 46.5, { align: 'center' });

        // Generate QR code
        try {
          const qrData = JSON.stringify({ type: 'activation', key });
          const qrDataUrl = await QRCode.toDataURL(qrData, { margin: 1, width: 200 });
          doc.addImage(qrDataUrl, 'PNG', 18, 54, 44, 44);
        } catch (qrErr) {
          console.error(qrErr);
        }

        // Help text instructions
        doc.setTextColor(80, 80, 80);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.text('Instructions:', 12, 106);
        doc.text('1. Visit app.trusela.com and log in.', 12, 111);
        doc.text('2. Navigate to "Activate Subscription" page.', 12, 116);
        doc.text('3. Scan this QR code or enter the key above.', 12, 121);
        
        doc.setFont('Helvetica', 'bold');
        doc.setTextColor(0, 31, 63);
        doc.text('THANK YOU FOR YOUR PATRONAGE!', 40, 134, { align: 'center' });
      }
    } else {
      // Standard A4 Grid Voucher Layout
      const cardWidth = 58;
      const cardHeight = 82;
      const paddingX = 6;
      const paddingY = 6;
      const startX = 12;
      const startY = 15;

      let col = 0;
      let row = 0;

      for (let i = 0; i < keysList.length; i++) {
        const key = keysList[i];
        if (i > 0 && col === 0 && row === 0) {
          doc.addPage();
        }

        const x = startX + col * (cardWidth + paddingX);
        const y = startY + row * (cardHeight + paddingY);

        // Border card
        doc.setDrawColor(0, 31, 63);
        doc.setLineWidth(0.4);
        doc.rect(x, y, cardWidth, cardHeight);

        // Dashed cutter guides
        doc.setDrawColor(210, 210, 210);
        doc.setLineDashPattern([2, 2], 0);
        if (col === 0) doc.line(x - 5, y + cardHeight + paddingY / 2, x + (cardWidth + paddingX) * 3 - paddingX + 5, y + cardHeight + paddingY / 2);
        if (row === 0) doc.line(x + cardWidth + paddingX / 2, y - 5, x + cardWidth + paddingX / 2, y + (cardHeight + paddingY) * 4 - paddingY + 5);
        doc.setLineDashPattern([], 0);

        // Card Header Title
        doc.setTextColor(0, 31, 63);
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text('Trusela Subscription Key', x + cardWidth / 2, y + 8, { align: 'center' });
        
        // Plan & Price tags
        doc.setFontSize(6.5);
        doc.setFont('Helvetica', 'normal');
        doc.text(`Plan: ${planName} | Price: ₦${planPrice.toLocaleString()}`, x + cardWidth / 2, y + 13, { align: 'center' });

        // Key String Box
        doc.setFontSize(7.5);
        doc.setFont('Courier', 'bold');
        doc.setFillColor(242, 242, 242);
        doc.rect(x + 4, y + 17, cardWidth - 8, 7, 'F');
        doc.text(key, x + cardWidth / 2, y + 21.5, { align: 'center' });

        // QR Code draw
        try {
          const qrData = JSON.stringify({ type: 'activation', key });
          const qrDataUrl = await QRCode.toDataURL(qrData, { margin: 1, width: 120 });
          doc.addImage(qrDataUrl, 'PNG', x + cardWidth / 2 - 13, y + 26, 26, 26);
        } catch (qrErr) {
          console.error(qrErr);
        }

        // Instructions
        doc.setTextColor(110, 110, 110);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(5);
        doc.text('1. Login at app.trusela.com', x + cardWidth / 2, y + 56, { align: 'center' });
        doc.text('2. Go to "Activate Subscription" page', x + cardWidth / 2, y + 60, { align: 'center' });
        doc.text('3. Scan QR or type the key above', x + cardWidth / 2, y + 64, { align: 'center' });

        doc.setFont('Helvetica', 'bold');
        doc.setTextColor(0, 31, 63);
        doc.text('AUTHENTIC LICENSED VOUCHER', x + cardWidth / 2, y + 74, { align: 'center' });

        col++;
        if (col >= 3) {
          col = 0;
          row++;
        }
        if (row >= 4) {
          row = 0;
        }
      }
    }

    doc.save(`trusela_vouchers_${planName.toLowerCase()}_${Date.now()}.pdf`);
    toast.success('PDF download completed!');
  };

  const DEFAULT_PLANS = [
    { id: 'monthly', name: 'Monthly Plan', durationDays: 30, price: 3000 },
    { id: 'quarterly', name: 'Quarterly Plan', durationDays: 90, price: 8000 },
    { id: 'yearly', name: 'Yearly Plan', durationDays: 365, price: 30000 },
    { id: 'lifetime', name: 'Lifetime Plan', durationDays: 99999, price: 100000 }
  ];

  return (
    <Layout title="Subscription Management">
      <div className="space-y-6">
        {/* Navigation Tabs */}
        <div className="flex bg-navy/5 p-1 rounded-2xl border border-navy/5">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex-1 py-3 font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition-colors ${
              activeTab === 'dashboard' ? 'bg-navy text-white shadow-lg' : 'text-gray-600 hover:text-navy'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" /> Keys & Dashboard
          </button>
          
          <button
            onClick={() => setActiveTab('plans')}
            className={`flex-1 py-3 font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition-colors ${
              activeTab === 'plans' ? 'bg-navy text-white shadow-lg' : 'text-gray-600 hover:text-navy'
            }`}
          >
            <Settings className="w-4 h-4" /> Config Plans
          </button>
        </div>

        {activeTab === 'dashboard' ? (
          <div className="space-y-6">
            {/* Stats Cards */}
            {loadingStats ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 animate-pulse">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="h-24 bg-gray-200 rounded-2xl"></div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="card p-5 border-navy/5 shadow-sm text-center">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total Keys</span>
                  <span className="text-2xl font-bold text-navy mt-1 block">{stats.totalKeys}</span>
                </div>
                <div className="card p-5 border-navy/5 shadow-sm text-center">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Unused Keys</span>
                  <span className="text-2xl font-bold text-yellow mt-1 block">{stats.unusedKeys}</span>
                </div>
                <div className="card p-5 border-navy/5 shadow-sm text-center">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Activated Keys</span>
                  <span className="text-2xl font-bold text-green-600 mt-1 block">{stats.usedKeys}</span>
                </div>
                <div className="card p-5 border-navy/5 shadow-sm text-center">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Revoked Keys</span>
                  <span className="text-2xl font-bold text-red-500 mt-1 block">{stats.revokedKeys}</span>
                </div>
                <div className="card p-5 border-navy/5 shadow-sm text-center bg-navy text-white">
                  <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider block">Activated Rev.</span>
                  <span className="text-xl font-bold text-yellow mt-1 block">₦{(stats.revenueActivated || 0).toLocaleString()}</span>
                </div>
                <div className="card p-5 border-navy/5 shadow-sm text-center bg-yellow/10 border-yellow/20">
                  <span className="text-[10px] font-bold text-navy uppercase tracking-wider block">Potential Rev.</span>
                  <span className="text-xl font-bold text-navy mt-1 block">₦{(stats.revenuePotential || 0).toLocaleString()}</span>
                </div>
              </div>
            )}

            {/* Generator Form */}
            <div className="card p-6 border-navy/5 shadow-md">
              <h3 className="text-lg font-bold text-navy flex items-center gap-2 mb-4">
                <Plus className="w-5 h-5 text-yellow" /> Generate Activation Keys
              </h3>
              
              <form onSubmit={handleGenerate} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div className="space-y-1">
                  <label htmlFor="planId" className="text-[10px] font-bold text-gray-400 uppercase">Target Plan</label>
                  <select
                    id="planId"
                    name="planId"
                    value={planId}
                    onChange={(e) => setPlanId(e.target.value as any)}
                    className="w-full p-3 border border-gray-200 rounded-xl text-sm font-semibold bg-white text-navy focus:outline-none focus:border-navy"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                    <option value="lifetime">Lifetime</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="quantity" className="text-[10px] font-bold text-gray-400 uppercase">Quantity</label>
                  <input
                    id="quantity"
                    name="quantity"
                    type="number"
                    min="1"
                    max="500"
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="input-field"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="batchName" className="text-[10px] font-bold text-gray-400 uppercase">Batch Identifier Name</label>
                  <input
                    id="batchName"
                    name="batchName"
                    type="text"
                    placeholder="e.g. JULY-2026-VOUCHERS"
                    value={batchName}
                    onChange={(e) => setBatchName(e.target.value.toUpperCase())}
                    className="input-field"
                  />
                </div>

                <button
                  type="submit"
                  disabled={generating || !batchName}
                  className="btn-primary py-4 h-[50px] font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {generating ? (
                    <>
                      <RefreshCcw className="w-4 h-4 animate-spin" /> Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-yellow" /> Create Batch
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Keys Table & List */}
            <div className="card p-6 border-navy/5 shadow-md space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h3 className="text-lg font-bold text-navy">Activation Keys Registry</h3>
                <div className="flex gap-2">
                  <button
                    onClick={handleExportCSV}
                    className="p-2.5 border border-gray-200 rounded-xl text-gray-600 hover:text-navy hover:bg-gray-50 text-xs font-semibold flex items-center gap-2"
                    title="Export all filtered keys to CSV"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-green-600" /> Export CSV
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search Key ID / User..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-navy"
                  />
                  <Search className="absolute left-3 top-3.5 text-gray-400 w-4 h-4" />
                </div>

                <select
                  value={filterPlan}
                  onChange={(e) => setFilterPlan(e.target.value)}
                  className="w-full p-2.5 border border-gray-200 rounded-xl text-xs bg-white text-navy focus:outline-none"
                >
                  <option value="">All Plans</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                  <option value="lifetime">Lifetime</option>
                </select>

                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full p-2.5 border border-gray-200 rounded-xl text-xs bg-white text-navy focus:outline-none"
                >
                  <option value="">All Statuses</option>
                  <option value="unused">Unused</option>
                  <option value="used">Used</option>
                  <option value="expired">Expired</option>
                  <option value="revoked">Revoked</option>
                </select>

                <input
                  type="text"
                  placeholder="Batch Name..."
                  value={filterBatch}
                  onChange={(e) => setFilterBatch(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-navy"
                />
              </div>

              {/* Keys Table */}
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                {loadingKeys ? (
                  <div className="p-12 text-center text-gray-500 font-semibold flex items-center justify-center gap-2">
                    <RefreshCcw className="w-5 h-5 animate-spin text-navy" /> Loading keys...
                  </div>
                ) : keys.length === 0 ? (
                  <div className="p-12 text-center text-gray-500">
                    No keys found matching the filters.
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-navy text-white">
                        <th className="p-3">Key ID</th>
                        <th className="p-3">Batch</th>
                        <th className="p-3">Plan</th>
                        <th className="p-3">Price</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Activated By</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium">
                      {keys.map((keyObj) => (
                        <tr key={keyObj.activationKeyHash} className="hover:bg-gray-50">
                          <td className="p-3 font-mono font-bold text-navy">{keyObj.keyId}</td>
                          <td className="p-3 text-gray-600">{keyObj.batchId}</td>
                          <td className="p-3 uppercase font-bold text-gray-700">{keyObj.plan}</td>
                          <td className="p-3">₦{(keyObj.price || 0).toLocaleString()}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              keyObj.status === 'unused' ? 'bg-yellow/20 text-yellow-800 border border-yellow/30' :
                              keyObj.status === 'used' ? 'bg-green-100 text-green-800' :
                              keyObj.status === 'revoked' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {keyObj.status}
                            </span>
                          </td>
                          <td className="p-3 text-gray-500">
                            {keyObj.activatedByUsername ? (
                              <div>
                                <span className="block text-gray-800">{keyObj.activatedByUsername}</span>
                                <span className="block text-[10px] text-gray-400">Date: {new Date(keyObj.activatedDate).toLocaleDateString()}</span>
                              </div>
                            ) : '-'}
                          </td>
                          <td className="p-3 text-right">
                            {keyObj.status === 'unused' && (
                              <button
                                onClick={() => handleRevoke(keyObj.activationKeyHash, keyObj.keyId)}
                                className="p-1 text-red-500 hover:bg-red-50 rounded-lg transition-colors inline-flex items-center gap-1 font-bold"
                                title="Revoke Key"
                              >
                                <Trash2 className="w-4 h-4" /> Revoke
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Config Plans Tab */
          <div className="card p-6 border-navy/5 shadow-md space-y-6">
            <h3 className="text-lg font-bold text-navy flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-yellow" /> Subscription Plans Configuration
            </h3>

            {loadingPlans ? (
              <div className="p-12 text-center text-gray-500 font-semibold flex items-center justify-center gap-2">
                <RefreshCcw className="w-5 h-5 animate-spin text-navy" /> Loading plans...
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                {plans.map((plan) => (
                  <div key={plan.id} className="border border-gray-100 p-5 rounded-2xl shadow-sm relative flex flex-col justify-between hover:border-navy/15 transition-colors">
                    {updatingPlanId === plan.id ? (
                      <form onSubmit={handleUpdatePlanSubmit} className="space-y-4">
                        <h4 className="font-bold text-navy uppercase text-sm">Edit {plan.id} plan</h4>
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase">Plan Name</label>
                            <input
                              id={`name-${plan.id}`}
                              name="name"
                              type="text"
                              required
                              className="input-field"
                              value={editingPlan.name}
                              onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })}
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase">Duration (Days)</label>
                            <input
                              id={`duration-${plan.id}`}
                              name="durationDays"
                              type="number"
                              required
                              className="input-field"
                              value={editingPlan.durationDays}
                              onChange={(e) => setEditingPlan({ ...editingPlan, durationDays: Number(e.target.value) })}
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-400 uppercase">Price (₦)</label>
                            <input
                              id={`price-${plan.id}`}
                              name="price"
                              type="number"
                              required
                              className="input-field"
                              value={editingPlan.price}
                              onChange={(e) => setEditingPlan({ ...editingPlan, price: Number(e.target.value) })}
                            />
                          </div>
                        </div>

                        <div className="flex gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => setUpdatingPlanId(null)}
                            className="flex-1 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="flex-1 py-2 rounded-xl bg-navy text-white text-xs font-bold hover:bg-navy/90 transition-colors"
                          >
                            Save Plan
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <h4 className="font-bold text-navy text-lg">{plan.name}</h4>
                          <p className="text-xs text-gray-500 font-medium">Duration: <span className="font-bold text-gray-700">{plan.durationDays} days</span></p>
                          <p className="text-xl font-bold text-navy">₦{plan.price.toLocaleString()}</p>
                        </div>
                        <button
                          onClick={() => {
                            setUpdatingPlanId(plan.id);
                            setEditingPlan({
                              name: plan.name,
                              durationDays: plan.durationDays,
                              price: plan.price
                            });
                          }}
                          className="mt-6 w-full border border-navy text-navy font-bold py-2.5 rounded-xl hover:bg-navy hover:text-white transition-all text-xs"
                        >
                          Configure Plan
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Generated Keys Display Modal */}
      {showGenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/80 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b pb-4 mb-4">
              <h3 className="text-xl font-bold text-navy flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-yellow" /> Generated Keys Batch
              </h3>
              <button 
                onClick={() => setShowGenModal(false)}
                className="py-1 px-3 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-bold transition-colors"
              >
                Done
              </button>
            </div>

            <p className="text-xs text-gray-500 mb-4">
              These raw subscription keys are shown **ONLY ONCE** for security. Copy or export them now.
            </p>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[40vh] border border-gray-100 rounded-xl p-3 bg-gray-50">
              {generatedKeys.map((key, index) => (
                <div key={index} className="flex justify-between items-center bg-white p-2.5 rounded-lg border border-gray-100">
                  <span className="font-mono text-sm font-bold text-navy select-all">{key}</span>
                  <button
                    onClick={() => handleCopyToClipboard(key, index)}
                    className="p-1 hover:bg-navy/5 rounded transition-colors text-gray-500"
                  >
                    {copiedIndex === index ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2 mt-6">
              <button
                onClick={handleCopyAllKeys}
                className="py-3 border border-navy rounded-xl text-navy font-bold text-xs hover:bg-navy/5 transition-all flex items-center justify-center gap-1.5"
              >
                <Copy className="w-4 h-4" /> Copy All
              </button>
              
              <button
                onClick={() => handleExportPDF(generatedKeys, false)}
                className="py-3 bg-navy text-white rounded-xl font-bold text-xs hover:bg-navy/90 transition-all flex items-center justify-center gap-1.5"
              >
                <FileText className="w-4 h-4 text-yellow" /> Print A4 Grid
              </button>

              <button
                onClick={() => handleExportPDF(generatedKeys, true)}
                className="py-3 bg-yellow text-navy rounded-xl font-bold text-xs hover:bg-yellow/90 transition-all flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4" /> Print Mini 80mm
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
