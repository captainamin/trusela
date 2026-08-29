import React, { useState, useEffect, useRef } from 'react';
import MarketLayout from '../../components/MarketLayout';
import { Search, Printer, Download, CreditCard, XCircle, CheckSquare, Square, Layers, ShieldCheck, User } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useUser } from '../../contexts/UserContext';
import axios from 'axios';
import { toast } from 'sonner';
import MarketAvatar from '../../components/MarketAvatar';
import { toPng } from 'html-to-image';

const CR80_WIDTH = '54.5mm';
const CR80_HEIGHT = '86.5mm';
const CR80_RADIUS = '3mm';

// Pixel dimensions for the PNG export (85.6mm × 54mm @ 96dpi ≈ 323 × 204px, scaled up 2× for quality)
const PX_W = 323;
const PX_H = 204;


const getProxyImageUrl = (driveUrl: string, userId: string) => {
  if (!driveUrl) return '';
  if (!driveUrl.includes('drive.google.com')) return driveUrl;
  let fileId = '';
  try {
    const urlObj = new URL(driveUrl);
    if (driveUrl.includes('/d/')) {
      fileId = driveUrl.split('/d/')[1].split('/')[0];
    } else if (urlObj.searchParams.has('id')) {
      fileId = urlObj.searchParams.get('id') || '';
    }
  } catch (e) {
    return driveUrl;
  }
  if (fileId && userId) return '/api/drive-image/' + fileId + '?userId=' + userId;
  return driveUrl;
};

export const SophisticatedIDCardFront = ({ member, marketName, brandColor, cardRef, userId }: any) => {
  const isActive = member.status !== 'Suspended' && member.status !== 'Inactive';
  const headerColor = isActive ? brandColor : '#991b1b';
  const qrPayload = JSON.stringify({ type: 'market_member', memberId: member.id, market: marketName, status: member.status });
  return (
    <div ref={cardRef} className="relative overflow-hidden shadow-2xl print:shadow-none flex flex-col box-border"
      style={{ width: CR80_WIDTH, height: CR80_HEIGHT, borderRadius: CR80_RADIUS, border: '1px solid #e5e7eb', backgroundColor: '#ffffff', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as any}>
      <div className="text-center py-2 relative shadow-md" style={{ backgroundColor: headerColor, color: '#ffffff' }}>
        <h1 className="text-[10px] font-black tracking-widest uppercase mb-0.5 leading-tight px-1 truncate">{marketName}</h1>
        <p className="text-[6px] tracking-widest uppercase opacity-80">Official Member ID</p>
      </div>
      {!isActive && (
        <div className="text-[6px] font-bold text-center uppercase tracking-widest py-0.5" style={{ backgroundColor: '#dc2626', color: '#ffffff' }}>{member.status || 'INACTIVE'}</div>
      )}
      <div className="p-3 flex flex-col items-center flex-1 relative z-10">
        <div className="relative">
          <div className="w-20 h-20 rounded-lg overflow-hidden border-2 mb-2 shadow-md" style={{ borderColor: headerColor, backgroundColor: '#f3f4f6' }}>
            {member.photoUrl ? (
              <img src={getProxyImageUrl(member.photoUrl, userId)} alt="Member" className="w-full h-full object-cover" crossOrigin="anonymous"
                onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ color: '#9ca3af' }}><CreditCard size={32} className="opacity-50" /></div>
            )}
          </div>
          <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full border-2 shadow-sm flex items-center justify-center opacity-90"
            style={{ background: 'linear-gradient(to top right, #fde047, #eab308, #ca8a04)', borderColor: '#ffffff' }}>
            <ShieldCheck size={16} color="#ffffff" />
          </div>
        </div>
        <h2 className="text-sm font-black leading-tight text-center whitespace-nowrap overflow-hidden text-ellipsis w-full uppercase mt-3" style={{ color: '#111827' }}>{member.fullName}</h2>
        <p className="text-[8px] font-bold mb-2 text-center uppercase truncate w-full" style={{ color: '#4b5563' }}>{member.businessName}</p>
        <div className="w-full rounded p-1.5 border mt-auto" style={{ backgroundColor: 'rgba(239,246,255,0.5)', borderColor: '#dbeafe' }}>
          <div className="flex justify-between items-center mb-1">
            <span className="text-[6px] uppercase font-bold" style={{ color: '#1e40af' }}>Member ID</span>
            <span className="text-[8px] font-black" style={{ color: '#111827' }}>{member.id}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[6px] uppercase font-bold" style={{ color: '#1e40af' }}>Shop No</span>
            <span className="text-[8px] font-black" style={{ color: '#111827' }}>{member.shopNumber || 'N/A'}</span>
          </div>
        </div>
      </div>
      <div className="w-full h-10 flex items-center justify-between px-3 pb-2 border-t relative z-10" style={{ backgroundColor: '#f9fafb', borderColor: '#f3f4f6' }}>
        <div className="w-7 h-7 p-0.5 border rounded-sm" style={{ backgroundColor: '#ffffff', borderColor: '#e5e7eb' }}>
          <QRCodeSVG value={qrPayload} size={24} />
        </div>
        <div className="text-right">
          <p className="text-[5px] font-bold uppercase mb-0.5" style={{ color: '#6b7280' }}>Registration</p>
          <p className="text-[7px] font-black" style={{ color: '#111827' }}>{member.registrationDate || new Date().toLocaleDateString()}</p>
        </div>
      </div>
    </div>
  );
};

export const SophisticatedIDCardBack = ({ member, marketName }: any) => {
  const mrzName = (member.fullName || '').toUpperCase().replace(/[^A-Z0-9]/g, '<').padEnd(25, '<');
  const mrzId = (member.id || '').toUpperCase().replace(/[^A-Z0-9]/g, '<').padEnd(15, '<');
  const mrzLine1 = 'I<NGA' + mrzId + '<<<<<<<<<<<<<<<';
  const mrzLine2 = mrzName + '<<<<<<<<<<<<';
  return (
    <div className="relative overflow-hidden shadow-2xl print:shadow-none flex flex-col box-border"
      style={{ width: CR80_WIDTH, height: CR80_HEIGHT, borderRadius: CR80_RADIUS, border: '1px solid #e5e7eb', backgroundColor: '#ffffff', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as any}>
      <div className="w-full h-8 mt-4" style={{ backgroundColor: '#111827' }}></div>
      <div className="p-3 flex-1 flex flex-col">
        <h3 className="text-[7px] font-black mb-1 uppercase tracking-wider" style={{ color: '#111827' }}>Terms & Conditions</h3>
        <p className="text-[5px] leading-relaxed text-justify mb-3" style={{ color: '#4b5563' }}>
          This card remains the property of {marketName} Management. It must be presented upon request by any market official or security personnel. Transfer or duplication is strictly prohibited.
        </p>
        <div className="p-1.5 rounded border mb-auto" style={{ backgroundColor: '#f9fafb', borderColor: '#f3f4f6' }}>
          <h3 className="text-[6px] font-black mb-0.5 uppercase" style={{ color: '#111827' }}>Emergency Contacts</h3>
          <p className="text-[5px] font-bold" style={{ color: '#4b5563' }}>Admin: 0800 123 4567</p>
          <p className="text-[5px] font-bold" style={{ color: '#4b5563' }}>Security: 0800 999 8888</p>
        </div>
        <div className="flex items-center gap-2 mb-2 mt-2">
          <QRCodeSVG value={'Verify: ' + member.id} size={24} />
          <p className="text-[5px] uppercase font-bold leading-tight" style={{ color: '#9ca3af' }}>Official<br />Verification<br />Code</p>
        </div>
      </div>
      <div className="p-2 font-mono text-[6px] leading-[8px] tracking-widest break-all border-t" style={{ backgroundColor: '#f9fafb', borderColor: '#e5e7eb', color: '#4b5563' }}>
        <div>{mrzLine1}</div><div>{mrzLine2}</div>
      </div>
    </div>
  );
};

const SophisticatedIDCard = (props: any) => {
  return (
    <div className="flex flex-col md:flex-row gap-8 items-center justify-center">
      <SophisticatedIDCardFront {...props} />
      <SophisticatedIDCardBack {...props} />
    </div>
  );
};

const ExportIDCard = ({ member, marketName, brandColor, userId }: { member: any; marketName: string; brandColor: string; userId: string }) => {
    const isActive = member.status !== 'Suspended' && member.status !== 'Inactive';
    const headerColor = isActive ? brandColor : '#991b1b';
    const qrPayload = JSON.stringify({ type: 'market_member', memberId: member.id, market: marketName, status: member.status });
    return (
      <div style={{ width: PX_W, height: PX_H, borderRadius: 12, border: '1px solid #e5e7eb', backgroundColor: '#ffffff', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', fontFamily: 'Arial, Helvetica, sans-serif', position: 'relative' }}>
        <div style={{ backgroundColor: headerColor, color: '#ffffff', textAlign: 'center', padding: '8px 4px 6px', flexShrink: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{marketName}</div>
          <div style={{ fontSize: 6, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.8, marginTop: 2 }}>Official Member ID</div>
        </div>
        {!isActive && (
          <div style={{ backgroundColor: '#dc2626', color: '#ffffff', fontSize: 6, fontWeight: 700, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '2px 0' }}>{member.status || 'INACTIVE'}</div>
        )}
        <div style={{ padding: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <div style={{ width: 72, height: 72, borderRadius: 8, overflow: 'hidden', border: '2px solid ' + headerColor, backgroundColor: '#f3f4f6' }}>
              {member.photoUrl ? (
                <img src={getProxyImageUrl(member.photoUrl, userId)} alt="Member" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} crossOrigin="anonymous" />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 28 }}>?</div>
              )}
            </div>
            <div style={{ position: 'absolute', bottom: -7, right: -7, width: 20, height: 20, borderRadius: '50%', background: 'linear-gradient(135deg, #fde047, #eab308, #ca8a04)', border: '2px solid #ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#ffffff', fontSize: 9, fontWeight: 900, lineHeight: 1 }}>✓</span>
            </div>
          </div>
          <div style={{ fontSize: 11, fontWeight: 900, color: '#111827', textAlign: 'center', textTransform: 'uppercase', lineHeight: 1.2, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.fullName}</div>
          <div style={{ fontSize: 7, fontWeight: 700, color: '#4b5563', textAlign: 'center', textTransform: 'uppercase', marginTop: 2, marginBottom: 4, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.businessName}</div>
          <div style={{ width: '100%', backgroundColor: 'rgba(239,246,255,0.7)', border: '1px solid #dbeafe', borderRadius: 4, padding: '5px 7px', marginTop: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
              <span style={{ fontSize: 6, color: '#1e40af', textTransform: 'uppercase', fontWeight: 700 }}>Member ID</span>
              <span style={{ fontSize: 8, color: '#111827', fontWeight: 900 }}>{member.id}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 6, color: '#1e40af', textTransform: 'uppercase', fontWeight: 700 }}>Shop No</span>
              <span style={{ fontSize: 8, color: '#111827', fontWeight: 900 }}>{member.shopNumber || 'N/A'}</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 10px 6px', borderTop: '1px solid #f3f4f6', backgroundColor: '#f9fafb', flexShrink: 0 }}>
          <div style={{ width: 26, height: 26, padding: 2, border: '1px solid #e5e7eb', borderRadius: 2, backgroundColor: '#ffffff' }}>
            <QRCodeSVG value={qrPayload} size={20} />
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 5, fontWeight: 700, textTransform: 'uppercase', color: '#6b7280', marginBottom: 1 }}>Registration</div>
            <div style={{ fontSize: 7, fontWeight: 900, color: '#111827' }}>{member.registrationDate || new Date().toLocaleDateString()}</div>
          </div>
        </div>
      </div>
    );
};


// ─── Back of card export (inline styles, large QR) ───────────────
const ExportBackCard = ({ member, marketName }: { member: any; marketName: string }) => {
  const mrzName = (member.fullName || '').toUpperCase().replace(/[^A-Z0-9]/g, '<').padEnd(25, '<');
  const mrzId   = (member.id   || '').toUpperCase().replace(/[^A-Z0-9]/g, '<').padEnd(15, '<');
  const mrzLine1 = 'I<NGA' + mrzId + '<<<<<<<<<<<<<<<';
  const mrzLine2 = mrzName + '<<<<<<<<<<<<';
  return (
    <div style={{ width: PX_W, height: PX_H, borderRadius: 12, border: '1px solid #e5e7eb', backgroundColor: '#ffffff', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', fontFamily: 'Arial, Helvetica, sans-serif' }}>
      {/* Magnetic stripe */}
      <div style={{ width: '100%', height: 32, backgroundColor: '#111827', marginTop: 16, flexShrink: 0 }} />
      {/* Body */}
      <div style={{ padding: 10, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 7, fontWeight: 900, color: '#111827', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Terms & Conditions</div>
        <div style={{ fontSize: 5, lineHeight: 1.6, color: '#4b5563', textAlign: 'justify', marginBottom: 8 }}>
          This card remains the property of {marketName} Management. It must be presented upon request by any market official or security personnel. Transfer or duplication is strictly prohibited and punishable by law. If found, please return to the Market Management Office immediately.
        </div>
        <div style={{ backgroundColor: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: 4, padding: '5px 7px', marginBottom: 'auto' }}>
          <div style={{ fontSize: 6, fontWeight: 900, color: '#111827', textTransform: 'uppercase', marginBottom: 3 }}>Emergency Contacts</div>
          <div style={{ fontSize: 5, fontWeight: 700, color: '#4b5563', marginBottom: 2 }}>Admin: 0800 123 4567</div>
          <div style={{ fontSize: 5, fontWeight: 700, color: '#4b5563' }}>Security: 0800 999 8888</div>
        </div>
        {/* Large QR code centred */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 8, marginBottom: 4 }}>
          <div style={{ padding: 4, backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 4, display: 'inline-block' }}>
            <QRCodeSVG value={'Verify: ' + member.id} size={60} />
          </div>
          <div style={{ fontSize: 5, fontWeight: 700, textTransform: 'uppercase', color: '#9ca3af', marginTop: 3, letterSpacing: '0.06em' }}>Official Verification Code</div>
        </div>
      </div>
      {/* MRZ */}
      <div style={{ padding: '4px 8px', backgroundColor: '#f9fafb', borderTop: '1px solid #e5e7eb', fontFamily: 'monospace', fontSize: 5.5, lineHeight: 1.5, letterSpacing: '0.1em', color: '#4b5563', wordBreak: 'break-all', flexShrink: 0 }}>
        <div>{mrzLine1}</div>
        <div>{mrzLine2}</div>
      </div>
    </div>
  );
};


export default function MarketIDCards() {
  const { user, metadata } = useUser();
  const marketSettings = metadata?.marketSettings || {};
  const marketName = marketSettings.name || 'Lagos Main Market';
  const brandColor = marketSettings.color || '#064e3b';
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMember, setSelectedMember] = useState<any | null>(null);
  const [batchSelection, setBatchSelection] = useState<Set<string>>(new Set());
  const [showBatchModal, setShowBatchModal] = useState(false);
  const cardFrontRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => { fetchMembers(); }, [user]);

  const fetchMembers = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const res = await axios.get('/api/market/members/' + user.uid);
      setMembers(res.data.filter((m: any) => m.id && m.fullName));
    } catch (err) {
      toast.error('Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  const filteredMembers = members.filter(m =>
    m.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.businessName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.shopNumber?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleSelection = (id: string) => {
    const s = new Set(batchSelection);
    s.has(id) ? s.delete(id) : s.add(id);
    setBatchSelection(s);
  };

  const toggleAll = () => {
    setBatchSelection(batchSelection.size === filteredMembers.length ? new Set() : new Set(filteredMembers.map(m => m.id)));
  };

  const handlePrint = () => window.print();

  const handleDownloadPNG = async () => {
    if (!exportRef.current) return;
    try {
      setIsDownloading(true);
      toast.info('Generating PNG...');
      await new Promise(resolve => requestAnimationFrame(resolve));
      await new Promise(resolve => setTimeout(resolve, 400));
      const dataUrl = await toPng(exportRef.current, {
        cacheBust: true,
        pixelRatio: 4,
        backgroundColor: '#ffffff',
      });
      const link = document.createElement('a');
      link.download = 'ID_' + selectedMember.id + '.png';
      link.href = dataUrl;
      link.click();
      toast.success('Downloaded successfully!');
    } catch (err: any) {
      console.error('Export error:', err);
      toast.error('Failed: ' + (err.message || 'Unknown error'));
    } finally {
      setIsDownloading(false);
    }
  };

  const IDCardModal = () => {
    if (!selectedMember) return null;
    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-4 print:bg-white print:p-0 overflow-y-auto">
        <div className="flex flex-col gap-4 mb-6 print:hidden items-center mt-8">
          <div className="flex gap-4">
            <button onClick={handlePrint} className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 shadow-lg transition-colors">
              <Printer className="w-5 h-5" /> Print Card
            </button>
            <button onClick={handleDownloadPNG} disabled={isDownloading} className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-lg transition-colors disabled:opacity-50">
              <Download className="w-5 h-5" /> {isDownloading ? 'Processing...' : 'Download PNG'}
            </button>
            <button onClick={() => setSelectedMember(null)} className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-800 font-bold rounded-lg hover:bg-gray-300 transition-colors">
              <XCircle className="w-5 h-5" /> Close
            </button>
          </div>
          <p className="text-sm text-gray-300">Tip: Enable "Background Graphics" in your browser print dialog for best print results.</p>
        </div>
        <SophisticatedIDCard member={selectedMember} marketName={marketName} brandColor={brandColor} cardRef={cardFrontRef} userId={user?.uid} />
        {/* Hidden off-screen export — uses exact A4 grid layout */}
        <div style={{ position: 'fixed', top: 0, left: '-9999px', zIndex: -1, pointerEvents: 'none' }}>
          <div ref={exportRef} className="print-page" style={{ width: '210mm', height: '297mm' }}>
            <div className="print-grid">
              <div className="card-wrapper">
                <div className="crop-tl" /><div className="crop-tr" /><div className="crop-bl" /><div className="crop-br" />
                <div className="card-rotated-180">
                  <SophisticatedIDCardBack member={selectedMember} marketName={marketName} />
                </div>
              </div>
              <div className="card-wrapper">
                <div className="crop-tl" /><div className="crop-tr" /><div className="crop-bl" /><div className="crop-br" />
                <div className="card-rotated-normal">
                  <SophisticatedIDCardFront member={selectedMember} marketName={marketName} brandColor={brandColor} userId={user?.uid} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const batchExportRef = useRef<HTMLDivElement>(null);
  const [isBatchDownloading, setIsBatchDownloading] = useState(false);

  const handleDownloadBatchPNG = async () => {
    if (!batchExportRef.current) return;
    try {
      setIsBatchDownloading(true);
      toast.info('Generating Batch PNG...');
      await new Promise(resolve => requestAnimationFrame(resolve));
      await new Promise(resolve => setTimeout(resolve, 400));
      const dataUrl = await toPng(batchExportRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      });
      const link = document.createElement('a');
      link.download = 'Batch_ID_Cards.png';
      link.href = dataUrl;
      link.click();
      toast.success('Downloaded successfully!');
    } catch (err: any) {
      console.error('Export error:', err);
      toast.error('Failed to generate PNG. ' + (err.message || ''));
    } finally {
      setIsBatchDownloading(false);
    }
  };

  const BatchPrintModal = () => {
    if (!showBatchModal) return null;
    const selectedMembersList = members.filter(m => batchSelection.has(m.id));

    // Group members into pages of 5
    const pages = [];
    for (let i = 0; i < selectedMembersList.length; i += 5) {
      pages.push(selectedMembersList.slice(i, i + 5));
    }

    return (
      <div className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center p-4 print:bg-white print:p-0 overflow-y-auto">
        <div className="flex gap-4 mb-6 print:hidden mt-8 sticky top-4 z-50 bg-white p-4 rounded-xl shadow-2xl">
          <div><h3 className="font-bold text-gray-900">Batch Print Mode</h3><p className="text-xs text-gray-500">{selectedMembersList.length} cards selected</p></div>
          <div className="w-px h-10 bg-gray-200 mx-2"></div>
          <button onClick={handlePrint} className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 shadow-lg transition-colors">
            <Printer className="w-5 h-5" /> Print A4 Sheets
          </button>
          <button onClick={handleDownloadBatchPNG} disabled={isBatchDownloading} className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-lg transition-colors disabled:opacity-50">
            <Download className="w-5 h-5" /> {isBatchDownloading ? 'Processing...' : 'Save PNG'}
          </button>
          <button onClick={() => setShowBatchModal(false)} className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-800 font-bold rounded-lg hover:bg-gray-300 transition-colors">
            <XCircle className="w-5 h-5" /> Cancel
          </button>
        </div>
        
        <div className="print-container" ref={batchExportRef} style={{ display: 'flex', flexDirection: 'column' }}>
          {pages.map((pageMembers, pageIndex) => (
            <div key={pageIndex} className="print-page">
              <div className="print-grid">
                {pageMembers.map(member => (
                  <React.Fragment key={member.id}>
                    {/* Back Card Rotated (Left Column) */}
                    <div className="card-wrapper">
                      <div className="crop-tl" /><div className="crop-tr" /><div className="crop-bl" /><div className="crop-br" />
                      <div className="card-rotated-180">
                        <SophisticatedIDCardBack member={member} marketName={marketName} />
                      </div>
                    </div>
                    {/* Front Card Rotated (Right Column) */}
                    <div className="card-wrapper">
                      <div className="crop-tl" /><div className="crop-tr" /><div className="crop-bl" /><div className="crop-br" />
                      <div className="card-rotated-normal">
                        <SophisticatedIDCardFront member={member} marketName={marketName} brandColor={brandColor} userId={user?.uid} />
                      </div>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <MarketLayout title="ID Card Generation">
      <style>{`
        .print-page {
          width: 210mm;
          height: 297mm;
          background: white;
          margin: 0 auto 20px auto;
          box-shadow: 0 10px 25px rgba(0,0,0,0.1);
          padding: 4.25mm 14.5mm; /* Exact calculation for 86.5x54.5 centering on A4 */
          box-sizing: border-box;
          page-break-after: always;
        }
        
        .print-grid {
          display: grid;
          grid-template-columns: 86.5mm 86.5mm;
          grid-template-rows: repeat(5, 54.5mm);
          column-gap: 8mm; 
          row-gap: 4mm;
          justify-content: center;
        }
        
        .card-wrapper {
          width: 86.5mm;
          height: 54.5mm;
          position: relative;
          box-sizing: border-box;
        }
        
        /* Professional Corner Crop Marks */
        .crop-tl, .crop-tr, .crop-bl, .crop-br {
          position: absolute;
          border-color: #000;
          border-style: solid;
          z-index: 10;
        }
        
        .crop-tl {
          top: -2mm; left: -4mm;
          width: 4mm; height: 2mm;
          border-width: 0 1px 1px 0;
        }
        .crop-tr {
          top: -2mm; right: -4mm;
          width: 4mm; height: 2mm;
          border-width: 0 0 1px 1px;
        }
        .crop-bl {
          bottom: -2mm; left: -4mm;
          width: 4mm; height: 2mm;
          border-width: 1px 1px 0 0;
        }
        .crop-br {
          bottom: -2mm; right: -4mm;
          width: 4mm; height: 2mm;
          border-width: 1px 0 0 1px;
        }
        
        .card-rotated-normal {
          width: 54.5mm;
          height: 86.5mm;
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(-90deg);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .card-rotated-180 {
          width: 54.5mm;
          height: 86.5mm;
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(90deg); /* 180 degrees rotated relative to -90deg */
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body * { visibility: hidden; }
          .print\\:bg-white { background: white !important; }
          .print\\:p-0 { padding: 0 !important; }
          .print\\:hidden { display: none !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .fixed.inset-0, .fixed.inset-0 * { visibility: visible; }
          .fixed.inset-0 { position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: visible; background: transparent; }
          
          .print-container { position: absolute; top: 0; left: 0; width: 100%; }
          .print-page {
            margin: 0;
            box-shadow: none;
            page-break-after: always;
            width: 210mm;
            height: 297mm;
          }
        }
      `}</style>
      <div className="bg-white rounded-xl shadow-sm border border-emerald-50 overflow-hidden print:hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4 justify-between items-center bg-gray-50/50">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input type="text" placeholder="Search by name, ID, or shop..."
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {batchSelection.size > 0 && (
              <button onClick={() => setShowBatchModal(true)} className="px-4 py-2 bg-emerald-100 text-emerald-800 font-bold rounded-lg hover:bg-emerald-200 flex items-center gap-2 text-sm whitespace-nowrap transition-colors">
                <Layers className="w-4 h-4" /> Batch Print ({batchSelection.size})
              </button>
            )}
            <button onClick={fetchMembers} className="p-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50"><Search className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="overflow-x-auto min-h-[400px]">
          {loading ? (
            <div className="flex justify-center items-center h-64 text-emerald-800"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-800"></div></div>
          ) : filteredMembers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500"><Search className="w-12 h-12 mb-4 text-gray-300" /><p>No members found matching your search.</p></div>
          ) : (
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4"><button onClick={toggleAll} className="text-gray-400 hover:text-emerald-600">{batchSelection.size === filteredMembers.length && filteredMembers.length > 0 ? <CheckSquare className="w-5 h-5 text-emerald-600" /> : <Square className="w-5 h-5" />}</button></th>
                  <th className="px-6 py-4 font-bold">Member</th>
                  <th className="px-6 py-4 font-bold">Business</th>
                  <th className="px-6 py-4 font-bold">Shop No.</th>
                  <th className="px-6 py-4 font-bold">Status</th>
                  <th className="px-6 py-4 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => (
                  <tr key={member.id} className={'border-b border-gray-50 hover:bg-emerald-50/30 transition-colors ' + (batchSelection.has(member.id) ? 'bg-emerald-50/20' : '')}>
                    <td className="px-6 py-4"><button onClick={() => toggleSelection(member.id)} className="text-gray-400 hover:text-emerald-600">{batchSelection.has(member.id) ? <CheckSquare className="w-5 h-5 text-emerald-600" /> : <Square className="w-5 h-5" />}</button></td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full overflow-hidden shadow-sm bg-gray-100 border border-gray-200">
                          <MarketAvatar photoUrl={member.photoUrl} fullName={member.fullName} className="w-full h-full" fallbackClassName="bg-gray-100 text-gray-400 text-xs" />
                        </div>
                        <div><p className="font-bold text-gray-900">{member.fullName}</p><p className="text-xs text-gray-500">{member.id}</p></div>
                      </div>
                    </td>
                    <td className="px-6 py-4"><p className="font-medium text-gray-900">{member.businessName || 'N/A'}</p></td>
                    <td className="px-6 py-4 font-medium">{member.shopNumber || 'N/A'}</td>
                    <td className="px-6 py-4"><span className={'px-2 py-1 text-[10px] font-bold uppercase rounded ' + (member.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : member.status === 'Suspended' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700')}>{member.status || 'Active'}</span></td>
                    <td className="px-6 py-4 text-right"><button onClick={() => setSelectedMember(member)} className="px-4 py-2 bg-emerald-100 text-emerald-800 font-bold rounded-lg hover:bg-emerald-200 transition-colors flex items-center justify-end gap-2 ml-auto"><CreditCard className="w-4 h-4" /> View Card</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <IDCardModal />
      <BatchPrintModal />
    </MarketLayout>
  );
}
