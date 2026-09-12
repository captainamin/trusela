import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import {
  AlertTriangle, CheckCircle2, Filter, Package, RefreshCcw, Search,
  ShoppingCart, Smartphone, TrendingUp, X, Printer
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { Html5Qrcode } from 'html5-qrcode';
import Layout from '../components/Layout';
import { useUser } from '../contexts/UserContext';
import { db } from '../firebase';
import { getEmbedUrl } from '../utils/googleDrive';

type View = 'SHOP' | 'STOCK' | 'SALES';
type FilterValue = 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'SOLD';

export default function Inventory() {
  const { user, metadata } = useUser();
  const navigate = useNavigate();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('SHOP');
  const [filter, setFilter] = useState<FilterValue>('ALL');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [showBuyerModal, setShowBuyerModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [buyerDetails, setBuyerDetails] = useState({
    name: '', phone: '', address: '', salesPersonId: '', salesPersonName: ''
  });
  const [showScanner, setShowScanner] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const [salesPersons, setSalesPersons] = useState<any[]>([]);
  const [saleAssignments, setSaleAssignments] = useState<Record<string, any>>({});
  const [salesPersonFilter, setSalesPersonFilter] = useState('');
  const canManageInventory = metadata?.role === 'admin' ||
    (metadata?.planType === 'manager' && metadata?.subscriptionStatus === 'active');

  const loadRecords = async () => {
    if (!user || !metadata?.spreadsheetId) return;
    try {
      setLoading(true);
      const response = await axios.get(
        `/api/google/records?spreadsheetId=${metadata.spreadsheetId}&userId=${user.uid}`
      );
      setRecords(response.data.reverse());
    } catch {
      toast.error('We could not load your shop items');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRecords(); }, [user, metadata?.spreadsheetId]);

  useEffect(() => {
    if (!user || !canManageInventory) {
      setSalesPersons([]);
      setSaleAssignments({});
      return;
    }
    const stopPeople = onSnapshot(collection(db, 'users', user.uid, 'salespersons'), snapshot => {
      setSalesPersons(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
    }, () => toast.error('We could not load your sales team'));
    const stopAssignments = onSnapshot(collection(db, 'users', user.uid, 'saleAssignments'), snapshot => {
      setSaleAssignments(Object.fromEntries(snapshot.docs.map(item => [item.id, item.data()])));
    }, () => toast.error('We could not load sale assignments'));
    return () => {
      stopPeople();
      stopAssignments();
    };
  }, [user, canManageInventory]);

  useEffect(() => {
    if (!showScanner) return;
    const scanner = new Html5Qrcode('inventory-scanner');
    let active = true;
    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 240, height: 160 } },
      decodedText => {
        if (!active) return;
        setSearch(decodedText);
        setShowScanner(false);
        toast.success('Code scanned. Matching items are shown below.');
      },
      () => {}
    ).catch(() => {
      if (active) setScannerError('Camera could not start. Check browser permission and try again.');
    });
    return () => {
      active = false;
      if (scanner.isScanning) {
        scanner.stop().catch(() => {});
      }
    };
  }, [showScanner]);

  const stockRecords = useMemo(
    () => records.filter(record => record.deviceStatus !== 'SOLD'),
    [records]
  );
  const soldRecords = useMemo(
    () => records.filter(record => record.deviceStatus === 'SOLD'),
    [records]
  );
  const lowStock = stockRecords.filter(record => Number(record.stock || 1) <= 1);

  const filteredRecords = useMemo(() => {
    const term = search.toLowerCase().trim();
    return records.filter(record => {
      const searchable = [
        record.brand, record.model, record.imei1, record.imei2, record.sku, record.barcode
      ].filter(Boolean).join(' ').toLowerCase();
      const matchesSearch = !term || searchable.includes(term);
      const matchesFilter =
        filter === 'ALL' ||
        (filter === 'SOLD' && record.deviceStatus === 'SOLD') ||
        (filter === 'IN_STOCK' && record.deviceStatus !== 'SOLD') ||
        (filter === 'LOW_STOCK' && record.deviceStatus !== 'SOLD' && Number(record.stock || 1) <= 1);
      const assignment = saleAssignments[record.id];
      const matchesSalesPerson = !salesPersonFilter || assignment?.salesPersonId === salesPersonFilter;
      return matchesSearch && matchesFilter && matchesSalesPerson;
    });
  }, [records, search, filter, saleAssignments, salesPersonFilter]);

  const updateStatus = async (recordId: string, status: string, details?: any) => {
    if (!metadata?.spreadsheetId || !user) return;
    if (status === 'SOLD' && !details) {
      setSelectedRecordId(recordId);
      setShowBuyerModal(true);
      return;
    }
    if (status === 'IN_STOCK' && !details) {
      setSelectedRecordId(recordId);
      setShowReturnModal(true);
      return;
    }
    setUpdating(recordId);
    try {
      await axios.post('/api/google/update-record-status', {
        spreadsheetId: metadata.spreadsheetId,
        recordId,
        status,
        buyerDetails: details,
        userId: user.uid
      });
      if (status === 'SOLD' && details?.salesPersonId) {
        await setDoc(doc(db, 'users', user.uid, 'saleAssignments', recordId), {
          recordId,
          salesPersonId: details.salesPersonId,
          salesPersonName: details.salesPersonName,
          soldAt: new Date().toISOString()
        });
      } else if (status === 'IN_STOCK') {
        await deleteDoc(doc(db, 'users', user.uid, 'saleAssignments', recordId));
      }
      setRecords(previous => previous.map(record => record.id === recordId ? {
        ...record,
        deviceStatus: status,
        buyerName: details?.name || '',
        buyerPhone: details?.phone || '',
        buyerAddress: details?.address || '',
        salesPersonName: details?.salesPersonName || ''
      } : record));
      toast.success(status === 'SOLD' ? 'Sale recorded' : 'Item returned to stock');
      setShowBuyerModal(false);
      setShowReturnModal(false);
      setSelectedRecordId(null);
      setBuyerDetails({ name: '', phone: '', address: '', salesPersonId: '', salesPersonName: '' });
    } catch {
      toast.error('We could not update this item');
    } finally {
      setUpdating(null);
    }
  };

  const productPhoto = (record: any) => getEmbedUrl(
    record.deviceImg1Url || record.deviceImg2Url || record.sellerPhotoUrl,
    user?.uid
  );

  const printReceipt = (record: any) => {
    const receiptWindow = window.open('', '_blank', 'width=420,height=700');
    if (!receiptWindow) {
      toast.error('Please allow pop-ups to print a receipt');
      return;
    }
    const shopName = metadata?.dealerName || 'Trusela Shop';
    receiptWindow.document.write(`<!doctype html><html><head><title>Receipt ${record.id}</title>
      <style>
        @page { size: 80mm auto; margin: 4mm; }
        body { width: 72mm; font: 13px Arial, sans-serif; color: #111; margin: 0; }
        h1 { font-size: 20px; text-align: center; margin: 0 0 4px; }
        p { margin: 5px 0; } .line { border-top: 1px dashed #555; margin: 10px 0; }
        .row { display: flex; justify-content: space-between; gap: 8px; }
        .small { font-size: 11px; color: #555; }
      </style></head><body>
      <h1>${escapeHtml(shopName)}</h1>
      <p style="text-align:center">Sales Receipt</p><div class="line"></div>
      <div class="row"><span>Receipt</span><strong>${escapeHtml(record.id || '')}</strong></div>
      <div class="row"><span>Date</span><span>${escapeHtml(record.date || new Date().toLocaleDateString())}</span></div>
      <div class="line"></div>
      <p><strong>${escapeHtml(`${record.brand || ''} ${record.model || ''}`.trim())}</strong></p>
      <p class="small">IMEI: ${escapeHtml(record.imei1 || 'N/A')}</p>
      <p class="small">Buyer: ${escapeHtml(record.buyerName || 'Walk-in customer')}</p>
      <p class="small">Phone: ${escapeHtml(record.buyerPhone || 'N/A')}</p>
      <div class="line"></div><p style="text-align:center">Thank you for your business.</p>
      <script>window.onload = function () { window.print(); window.close(); }<\/script>
      </body></html>`);
    receiptWindow.document.close();
  };

  if (loading) {
    return <Layout title="Shop"><div className="animate-pulse h-64 bg-gray-200 rounded-2xl" /></Layout>;
  }

  return (
    <Layout title="Shop">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm text-gray-500">Sell phones and accessories with a few taps.</p>
          </div>
          {canManageInventory && (
            <div className="flex gap-2">
              <button onClick={() => navigate('/add', { state: { inventoryMode: 'product' } })}
                className="px-4 py-3 rounded-xl bg-navy text-white font-bold text-sm">
                Add Product
              </button>
              <button onClick={() => navigate('/add', { state: { inventoryMode: 'stock' } })}
                className="px-4 py-3 rounded-xl bg-yellow text-navy font-bold text-sm">
                Add Stock
              </button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard label="Today's Sales" value={soldRecords.length} icon={TrendingUp} tone="navy" />
          <SummaryCard label="Items in Stock" value={stockRecords.length} icon={Package} tone="yellow" />
          <SummaryCard label="Low Stock" value={lowStock.length} icon={AlertTriangle} tone="orange" />
          <SummaryCard label="Items Sold" value={soldRecords.length} icon={ShoppingCart} tone="green" />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {([
            ['SHOP', 'Shop'],
            ['STOCK', 'Stock'],
            ['SALES', 'Sales']
          ] as [View, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setView(key)}
              className={`min-w-[100px] px-5 py-3 rounded-xl font-bold text-sm ${
                view === key ? 'bg-navy text-white' : 'bg-gray-100 text-gray-600'
              }`}>
              {label}
            </button>
          ))}
          <button onClick={loadRecords} className="ml-auto p-3 rounded-xl bg-gray-100 text-gray-600" title="Refresh">
            <RefreshCcw className="w-5 h-5" />
          </button>
        </div>

        {view === 'SALES' && canManageInventory && salesPersons.length > 0 && (
          <select value={salesPersonFilter} onChange={event => setSalesPersonFilter(event.target.value)}
            className="input-field max-w-sm">
            <option value="">All sales people</option>
            {salesPersons.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        )}

        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input value={search} onChange={event => setSearch(event.target.value)}
              className="input-field pl-12 py-4 rounded-2xl" placeholder="Search phone, charger, cable, IMEI..." />
          </div>
          <button onClick={() => { setScannerError(''); setShowScanner(true); }}
            className="px-4 rounded-2xl bg-yellow text-navy font-bold flex items-center gap-2" title="Scan barcode or QR code">
            <Smartphone className="w-5 h-5" /><span className="hidden sm:inline">Scan</span>
          </button>
          <button onClick={() => setShowFilters(previous => !previous)}
            className={`px-4 rounded-2xl border flex items-center gap-2 font-bold ${showFilters ? 'bg-navy text-white' : 'bg-white text-gray-600'}`}>
            <Filter className="w-5 h-5" /><span className="hidden sm:inline">Filter</span>
          </button>
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-2 p-4 bg-gray-50 rounded-2xl">
            {([
              ['ALL', 'All'], ['IN_STOCK', 'In Stock'], ['LOW_STOCK', 'Low Stock'], ['SOLD', 'Sold']
            ] as [FilterValue, string][]).map(([key, label]) => (
              <button key={key} onClick={() => setFilter(key)}
                className={`px-4 py-2 rounded-xl text-sm font-bold ${filter === key ? 'bg-navy text-white' : 'bg-white text-gray-600'}`}>
                {label}
              </button>
            ))}
          </div>
        )}

        {view === 'SHOP' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRecords.filter(record => record.deviceStatus !== 'SOLD').map(record => (
              <ProductCard key={record.id} record={record} photo={productPhoto(record)}
                updating={updating === record.id} onSell={() => updateStatus(record.id, 'SOLD')} />
            ))}
          </div>
        )}
        {view === 'STOCK' && <ItemList records={filteredRecords.filter(record => record.deviceStatus !== 'SOLD')} onSell={record => updateStatus(record.id, 'SOLD')} updating={updating} />}
        {view === 'SALES' && <ItemList records={filteredRecords.filter(record => record.deviceStatus === 'SOLD')} assignments={saleAssignments}
          onReturn={record => updateStatus(record.id, 'IN_STOCK')} onPrint={printReceipt} updating={updating} />}

        {filteredRecords.length === 0 && (
          <div className="text-center py-12 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="font-bold text-gray-600">Nothing here yet</p>
            <p className="text-sm text-gray-500 mt-1">Try another search or add a new record.</p>
          </div>
        )}
      </div>

      {showScanner && (
        <div className="fixed inset-0 z-50 bg-navy/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-black text-navy text-lg">Scan barcode or QR code</h2>
              <button onClick={() => setShowScanner(false)}><X /></button>
            </div>
            <div id="inventory-scanner" className="overflow-hidden rounded-2xl bg-black min-h-[240px]" />
            <p className="text-sm text-gray-500">Point the camera at the product code. The result will be used to search your shop.</p>
            {scannerError && <p className="text-sm text-red-600 font-medium">{scannerError}</p>}
            <button onClick={() => setShowScanner(false)} className="w-full py-3 rounded-xl bg-gray-100 text-gray-700 font-bold">Close</button>
          </div>
        </div>
      )}

      {showBuyerModal && <BuyerModal details={buyerDetails} setDetails={setBuyerDetails}
        salesPersons={salesPersons}
        onCancel={() => setShowBuyerModal(false)}
        onConfirm={() => selectedRecordId && updateStatus(selectedRecordId, 'SOLD', buyerDetails)}
        busy={!!updating} />}
      {showReturnModal && <ConfirmModal onCancel={() => setShowReturnModal(false)}
        onConfirm={() => selectedRecordId && updateStatus(selectedRecordId, 'IN_STOCK', {})}
        busy={!!updating} />}
    </Layout>
  );
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[character] || character));
}

function SummaryCard({ label, value, icon: Icon, tone }: any) {
  const styles: Record<string, string> = {
    navy: 'bg-navy text-white', yellow: 'bg-yellow text-navy',
    orange: 'bg-orange-50 text-orange-800', green: 'bg-green-50 text-green-800'
  };
  return <div className={`rounded-2xl p-4 min-h-[105px] ${styles[tone]}`}>
    <Icon className="w-5 h-5 mb-3 opacity-80" />
    <p className="text-2xl font-black">{value}</p><p className="text-xs font-bold opacity-70">{label}</p>
  </div>;
}

function ProductCard({ record, photo, onSell, updating }: any) {
  return <div className="card overflow-hidden">
    <div className="h-40 bg-gray-100 flex items-center justify-center">
      {photo ? <img src={photo} alt="" className="w-full h-full object-cover" /> : <Smartphone className="w-14 h-14 text-gray-300" />}
    </div>
    <div className="p-4">
      <h3 className="font-black text-navy text-lg truncate">{record.brand} {record.model}</h3>
      <p className="text-xs text-gray-500 mt-1">IMEI: {record.imei1 || 'Not provided'}</p>
      <div className="flex justify-between items-center mt-4">
        <span className="text-sm font-bold text-green-700">Stock: {record.stock || 1}</span>
        <button onClick={onSell} disabled={updating} className="px-5 py-2.5 bg-yellow text-navy rounded-xl font-black text-sm flex items-center gap-2">
          {updating ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />} Sell
        </button>
      </div>
    </div>
  </div>;
}

function ItemList({ records, onSell, onReturn, onPrint, updating, assignments }: any) {
  return <div className="space-y-3">{records.map((record: any) => (
    <div key={record.id} className="card p-4 flex items-center gap-3">
      <div className="w-12 h-12 rounded-xl bg-navy flex items-center justify-center text-white"><Smartphone /></div>
      <div className="flex-1 min-w-0"><h3 className="font-bold truncate">{record.brand} {record.model}</h3>
        <p className="text-xs text-gray-500 truncate">{record.imei1 || 'No IMEI'} {record.buyerName ? `- Buyer: ${record.buyerName}` : ''}</p>
        {assignments?.[record.id]?.salesPersonName && <p className="text-xs text-navy font-semibold">Sold by: {assignments[record.id].salesPersonName}</p>}
      </div>
      <Link to={`/records/${record.id}`} className="hidden sm:block text-xs font-bold text-gray-500">Details</Link>
      {onSell && <button onClick={() => onSell(record)} disabled={updating === record.id} className="px-3 py-2 bg-yellow rounded-lg text-xs font-bold">Sell</button>}
      {onReturn && <button onClick={() => onReturn(record)} disabled={updating === record.id} className="px-3 py-2 bg-navy text-white rounded-lg text-xs font-bold">Return</button>}
      {onPrint && <button onClick={() => onPrint(record)} className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-bold flex items-center gap-1"><Printer className="w-3 h-3" /> Receipt</button>}
    </div>
  ))}</div>;
}

function BuyerModal({ details, setDetails, salesPersons, onCancel, onConfirm, busy }: any) {
  return <Modal title="Who is buying this item?" onCancel={onCancel}>
    {(['name', 'phone', 'address'] as const).map(field => <input key={field} value={details[field]} onChange={event => setDetails({ ...details, [field]: event.target.value })}
      className="input-field" placeholder={field === 'name' ? 'Buyer name' : field === 'phone' ? 'Phone number' : 'Address'} />)}
    {salesPersons.length > 0 && <select value={details.salesPersonId} onChange={event => {
      const person = salesPersons.find((item: any) => item.id === event.target.value);
      setDetails({ ...details, salesPersonId: event.target.value, salesPersonName: person?.name || '' });
    }} className="input-field">
      <option value="">Sale handled by (optional)</option>
      {salesPersons.map((person: any) => <option key={person.id} value={person.id}>{person.name}</option>)}
    </select>}
    <button onClick={onConfirm} disabled={!details.name || !details.phone || busy} className="btn-primary w-full py-3 disabled:opacity-50">{busy ? 'Saving...' : 'Confirm Sale'}</button>
  </Modal>;
}

function ConfirmModal({ onCancel, onConfirm, busy }: any) {
  return <Modal title="Return this item to stock?" onCancel={onCancel}><p className="text-gray-600 text-sm">The buyer details will be cleared.</p><button onClick={onConfirm} disabled={busy} className="btn-primary w-full py-3">{busy ? 'Saving...' : 'Confirm Return'}</button></Modal>;
}

function Modal({ title, onCancel, children }: any) {
  return <div className="fixed inset-0 z-50 bg-navy/60 flex items-center justify-center p-4"><div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4"><div className="flex justify-between items-center"><h2 className="text-xl font-black text-navy">{title}</h2><button onClick={onCancel}><X /></button></div>{children}<button onClick={onCancel} className="w-full py-3 bg-gray-100 rounded-xl font-bold text-gray-600">Cancel</button></div></div>;
}
