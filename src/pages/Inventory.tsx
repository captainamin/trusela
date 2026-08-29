import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import Layout from '../components/Layout';
import { Package, Search, Filter, Smartphone, CheckCircle2, ShoppingCart, RefreshCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import axios from 'axios';
import { useUser } from '../contexts/UserContext';

export default function Inventory() {
  const { user, metadata, loading: userLoading } = useUser();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);
  const [showBuyerModal, setShowBuyerModal] = useState(false);
  const [showConfirmReturnModal, setShowConfirmReturnModal] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [buyerDetails, setBuyerDetails] = useState({ name: '', phone: '', address: '' });

  useEffect(() => {
    const fetchData = async () => {
      if (!user || !metadata?.spreadsheetId) return;
      try {
        const response = await axios.get(`/api/google/records?spreadsheetId=${metadata.spreadsheetId}&userId=${user.uid}`);
        setRecords(response.data.reverse());
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user, metadata]);

  const handleUpdateStatus = async (recordId: string, newStatus: string, details?: any) => {
    if (!metadata?.spreadsheetId) return;
    
    if (newStatus === 'SOLD' && !details) {
      setSelectedRecordId(recordId);
      setShowBuyerModal(true);
      return;
    }

    if (newStatus === 'IN_STOCK' && !details) {
      setSelectedRecordId(recordId);
      setShowConfirmReturnModal(true);
      return;
    }

    setUpdating(recordId);
    try {
      await axios.post('/api/google/update-record-status', {
        spreadsheetId: metadata.spreadsheetId,
        recordId,
        status: newStatus,
        buyerDetails: details,
        userId: user.uid
      });
      
      setRecords(prev => prev.map(r => r.id === recordId ? { 
        ...r, 
        deviceStatus: newStatus,
        buyerName: details?.name || '',
        buyerPhone: details?.phone || '',
        buyerAddress: details?.address || ''
      } : r));
      toast.success(`Device marked as ${newStatus === 'SOLD' ? 'Sold' : 'In Stock'}`);
      setShowBuyerModal(false);
      setShowConfirmReturnModal(false);
      setSelectedRecordId(null);
      setBuyerDetails({ name: '', phone: '', address: '' });
    } catch (error) {
      toast.error('Failed to update status');
    } finally {
      setUpdating(null);
    }
  };

  const filteredRecords = records.filter(r => {
    const matchesFilter = filter === 'ALL' || r.deviceStatus === filter;
    const matchesSearch = r.brand.toLowerCase().includes(search.toLowerCase()) || 
                          r.model.toLowerCase().includes(search.toLowerCase()) ||
                          r.imei1.includes(search);
    return matchesFilter && matchesSearch;
  });

  if (loading) return <Layout title="Inventory Management"><div className="animate-pulse h-64 bg-gray-200 rounded-xl" /></Layout>;

  return (
    <Layout title="Inventory Management">
      <div className="space-y-6">
        {/* Filters & Search */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <label htmlFor="inventorySearch" className="sr-only">Search Inventory</label>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              id="inventorySearch"
              name="inventorySearch"
              type="text"
              placeholder="Search brand, model, or IMEI..."
              className="input-field pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setFilter('ALL')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${filter === 'ALL' ? 'bg-navy text-white' : 'bg-gray-100 text-gray-500'}`}
            >
              All
            </button>
            <button 
              onClick={() => setFilter('IN_STOCK')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${filter === 'IN_STOCK' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
            >
              In Stock
            </button>
            <button 
              onClick={() => setFilter('SOLD')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${filter === 'SOLD' ? 'bg-yellow text-navy' : 'bg-gray-100 text-gray-500'}`}
            >
              Sold
            </button>
          </div>
        </div>

        {/* Inventory List */}
        <div className="space-y-4">
          {filteredRecords.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No devices found matching your filters.</p>
            </div>
          ) : (
            filteredRecords.map((record) => (
              <div key={record.id} className="card p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold ${record.deviceStatus === 'SOLD' ? 'bg-yellow text-navy' : 'bg-navy'}`}>
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-navy">{record.brand} {record.model}</h4>
                    <p className="text-xs text-gray-500">IMEI: {record.imei1}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        record.deviceStatus === 'SOLD' ? 'bg-yellow/20 text-navy' : 'bg-green-100 text-green-700'
                      }`}>
                        {record.deviceStatus === 'SOLD' ? 'Sold' : 'In Stock'}
                      </span>
                      {record.deviceStatus === 'SOLD' && record.buyerName && (
                        <span className="text-[10px] text-navy font-bold">Buyer: {record.buyerName}</span>
                      )}
                      <span className="text-[10px] text-gray-400">Added: {record.date}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link to={`/records/${record.id}`} className="flex-1 md:flex-none px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-200 transition-colors text-center">
                    Details
                  </Link>
                  {record.deviceStatus === 'IN_STOCK' ? (
                    <button 
                      onClick={() => handleUpdateStatus(record.id, 'SOLD')}
                      disabled={updating === record.id}
                      className="flex-1 md:flex-none px-4 py-2 bg-yellow text-navy rounded-lg text-xs font-bold hover:bg-yellow/90 transition-colors flex items-center justify-center gap-2"
                    >
                      {updating === record.id ? <RefreshCcw className="w-3 h-3 animate-spin" /> : <ShoppingCart className="w-3 h-3" />}
                      Mark as Sold
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleUpdateStatus(record.id, 'IN_STOCK')}
                      disabled={updating === record.id}
                      className="flex-1 md:flex-none px-4 py-2 bg-navy text-white rounded-lg text-xs font-bold hover:bg-navy/90 transition-colors flex items-center justify-center gap-2"
                    >
                      {updating === record.id ? <RefreshCcw className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                      Return to Stock
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showBuyerModal && (
        <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in duration-300">
            <h3 className="text-xl font-bold text-navy mb-4">Buyer Information</h3>
            <p className="text-sm text-gray-500 mb-6">Please record the details of the buyer for this transaction.</p>
            
            <div className="space-y-4">
               <div>
                <label htmlFor="buyerName" className="block text-xs font-bold text-gray-400 uppercase mb-1">Buyer Name</label>
                <input 
                  id="buyerName"
                  name="buyerName"
                  type="text" 
                  value={buyerDetails.name}
                  onChange={(e) => setBuyerDetails({...buyerDetails, name: e.target.value})}
                  className="w-full bg-gray-50 border-none rounded-xl px-4 py-3 text-navy font-medium focus:ring-2 focus:ring-navy/10"
                  placeholder="Full Name"
                />
              </div>
              <div>
                <label htmlFor="buyerPhone" className="block text-xs font-bold text-gray-400 uppercase mb-1">Phone Number</label>
                <input 
                  id="buyerPhone"
                  name="buyerPhone"
                  type="tel" 
                  value={buyerDetails.phone}
                  onChange={(e) => setBuyerDetails({...buyerDetails, phone: e.target.value})}
                  className="w-full bg-gray-50 border-none rounded-xl px-4 py-3 text-navy font-medium focus:ring-2 focus:ring-navy/10"
                  placeholder="080..."
                />
              </div>
              <div>
                <label htmlFor="buyerAddress" className="block text-xs font-bold text-gray-400 uppercase mb-1">Address</label>
                <textarea 
                  id="buyerAddress"
                  name="buyerAddress"
                  value={buyerDetails.address}
                  onChange={(e) => setBuyerDetails({...buyerDetails, address: e.target.value})}
                  className="w-full bg-gray-50 border-none rounded-xl px-4 py-3 text-navy font-medium focus:ring-2 focus:ring-navy/10 h-24 resize-none"
                  placeholder="Buyer's Address"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button 
                onClick={() => {
                  setShowBuyerModal(false);
                  setSelectedRecordId(null);
                }}
                className="flex-1 py-3 rounded-xl font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => selectedRecordId && handleUpdateStatus(selectedRecordId, 'SOLD', buyerDetails)}
                disabled={!buyerDetails.name || !buyerDetails.phone || !!updating}
                className="flex-1 py-3 rounded-xl font-bold text-white bg-navy hover:bg-navy/90 transition-colors disabled:opacity-50"
              >
                {updating ? 'Processing...' : 'Confirm Sale'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirmReturnModal && (
        <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 bg-yellow/10 rounded-2xl flex items-center justify-center text-yellow-600 mb-6">
              <RefreshCcw className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-navy mb-2">Return to Stock?</h3>
            <p className="text-sm text-gray-500 mb-8">
              Are you sure you want to return this device to stock? This will clear the current buyer information.
            </p>
            
            <div className="flex gap-3">
              <button 
                onClick={() => {
                  setShowConfirmReturnModal(false);
                  setSelectedRecordId(null);
                }}
                className="flex-1 py-3 rounded-xl font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => selectedRecordId && handleUpdateStatus(selectedRecordId, 'IN_STOCK', {})}
                disabled={!!updating}
                className="flex-1 py-3 rounded-xl font-bold text-white bg-navy hover:bg-navy/90 transition-colors disabled:opacity-50"
              >
                {updating ? 'Processing...' : 'Confirm Return'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
