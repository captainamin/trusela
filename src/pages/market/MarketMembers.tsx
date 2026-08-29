import React, { useState, useEffect, useRef } from 'react';
import MarketLayout from '../../components/MarketLayout';
import { Search, Plus, Filter, MoreVertical, XCircle, Camera, CheckCircle2, Eye, Edit2, ShieldOff, ShieldCheck, Trash2, Phone, MapPin, Briefcase, Hash, Calendar, Crown } from 'lucide-react';
import { useUser } from '../../contexts/UserContext';
import axios from 'axios';
import { toast } from 'sonner';

import MarketAvatar from '../../components/MarketAvatar';

export default function MarketMembers() {
  const { user, metadata } = useUser();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showAddModal, setShowAddModal] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [revenueTypes, setRevenueTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [viewMember, setViewMember] = useState<any | null>(null);
  const [editMember, setEditMember] = useState<any | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);

  useEffect(() => {
    if (metadata?.marketSpreadsheetId && metadata?.isGoogleConnected) {
      fetchMembers();
    } else {
      setLoading(false);
    }
  }, [user, metadata]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = () => setOpenMenuId(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const fetchMembers = async () => {
    if (!user || !metadata?.marketSpreadsheetId || !metadata?.isGoogleConnected) return;
    try {
      setLoading(true);
      const res = await axios.get(`/api/market/members/${user.uid}`);
      setMembers(res.data);
      const revRes = await axios.get(`/api/market/revenue-types/${user.uid}`);
      setRevenueTypes(revRes.data.filter((r: any) => r.status === 'Active'));
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to load members';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (member: any) => {
    const newStatus = member.status === 'Active' ? 'Suspended' : 'Active';
    try {
      await axios.put(`/api/market/members/${user!.uid}/${member.id}`, { status: newStatus });
      toast.success(`Member ${newStatus === 'Active' ? 'activated' : 'suspended'} successfully`);
      setMembers(prev => prev.map(m => m.id === member.id ? { ...m, status: newStatus } : m));
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update status');
    }
    setOpenMenuId(null);
  };

  const handleDelete = async (member: any) => {
    setDeletingId(member.id);
    try {
      await axios.delete(`/api/market/members/${user!.uid}/${member.id}`);
      toast.success('Member deleted successfully');
      setMembers(prev => prev.filter(m => m.id !== member.id));
      setConfirmDelete(null);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete member');
    } finally {
      setDeletingId(null);
    }
  };

  // â”€â”€ View Details Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const ViewModal = () => {
    if (!viewMember) return null;
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setViewMember(null)}>
        <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="bg-emerald-700 p-6 text-white relative">
            <button onClick={() => setViewMember(null)} className="absolute top-4 right-4 hover:bg-white/20 rounded-full p-1"><XCircle className="w-5 h-5" /></button>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-white/30 shadow-lg bg-emerald-600 text-3xl text-emerald-100">
                <MarketAvatar photoUrl={viewMember.photoUrl} fullName={viewMember.fullName} className="w-full h-full" fallbackClassName="bg-emerald-600 text-emerald-100" />
              </div>
              <div>
                <h2 className="text-xl font-black">{viewMember.fullName}</h2>
                <p className="text-emerald-200 text-sm font-mono">{viewMember.id}</p>
                <div className="flex gap-2 mt-1">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${viewMember.status === 'Active' ? 'bg-white/20 text-white' : 'bg-red-400/30 text-red-100'}`}>{viewMember.status}</span>
                  {viewMember.isPrincipalOwner && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-400/20 text-yellow-100 border border-yellow-400/30">
                      <Crown className="w-3 h-3" /> Principal Owner
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-3">
            {[
              { icon: Phone, label: 'Phone', value: viewMember.phone },
              { icon: Briefcase, label: 'Business', value: viewMember.businessName },
              { icon: Hash, label: 'Business Type', value: viewMember.businessType },
              { icon: Hash, label: 'Shop Number', value: viewMember.shopNumber },
              { icon: MapPin, label: 'Address', value: viewMember.address || 'N/A' },
              { icon: Calendar, label: 'Registered', value: viewMember.registrationDate },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-3 text-sm">
                <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-emerald-700" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 font-medium">{label}</p>
                  <p className="text-gray-900 font-semibold">{value}</p>
                </div>
              </div>
            ))}
            <div className="flex items-start gap-3 text-sm">
              <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 text-emerald-700" />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">Assigned Revenue Types</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {!viewMember.assignedRevenueTypes ? (
                    <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">ALL (Legacy)</span>
                  ) : viewMember.assignedRevenueTypes === 'NONE' ? (
                    <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded font-medium">Exempt from ALL</span>
                  ) : (
                    viewMember.assignedRevenueTypes.split(',').map((id: string) => {
                      const rt = revenueTypes.find(r => r.id === id);
                      return <span key={id} className="bg-emerald-100 text-emerald-800 text-xs px-2 py-1 rounded">{rt ? rt.name : id}</span>;
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // â”€â”€ Edit Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const EditModal = () => {
    const [form, setForm] = useState({ ...editMember });
    const [selectedRevTypes, setSelectedRevTypes] = useState<string[]>(
      editMember.assignedRevenueTypes ? editMember.assignedRevenueTypes.split(',').filter(Boolean) : []
    );
    const [saving, setSaving] = useState(false);
    if (!editMember) return null;

    const handleSave = async (e: React.FormEvent) => {
      e.preventDefault();
      setSaving(true);
      try {
        await axios.put(`/api/market/members/${user!.uid}/${editMember.id}`, {
          fullName: form.fullName,
          phone: form.phone,
          businessName: form.businessName,
          businessType: form.businessType,
          shopNumber: form.shopNumber,
          address: form.address,
          assignedRevenueTypes: selectedRevTypes.length > 0 ? selectedRevTypes.join(',') : 'NONE',
          isPrincipalOwner: form.isPrincipalOwner
        });
        toast.success('Member updated successfully');
        setMembers(prev => prev.map(m => m.id === editMember.id ? { ...m, ...form, assignedRevenueTypes: selectedRevTypes.length > 0 ? selectedRevTypes.join(',') : 'NONE' } : m));
        setEditMember(null);
      } catch (err: any) {
        toast.error(err.response?.data?.error || 'Failed to update member');
      } finally {
        setSaving(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-black text-gray-900">Edit Member</h2>
            <button onClick={() => setEditMember(null)}><XCircle className="w-6 h-6 text-gray-400 hover:text-gray-600" /></button>
          </div>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[
                { key: 'fullName', label: 'Full Name', type: 'text' },
                { key: 'phone', label: 'Phone', type: 'tel' },
                { key: 'businessName', label: 'Business Name', type: 'text' },
                { key: 'shopNumber', label: 'Shop Number', type: 'text' },
                { key: 'address', label: 'Address', type: 'text' },
              ].map(({ key, label, type }) => (
                <div key={key} className={key === 'address' ? 'col-span-2' : ''}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                  <input type={type} value={form[key] || ''}
                    onChange={e => setForm({ ...form, [key]: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Business Type</label>
                <select value={form.businessType || ''} onChange={e => setForm({ ...form, businessType: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm">
                  {['Phone Seller','Phone Technician','Phone Accessories','Electronics','Fashion','Food','Automotive','Services','Other'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 mt-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Assigned Revenue Types</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {revenueTypes.map(rt => (
                    <label key={rt.id} className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                        checked={selectedRevTypes.includes(rt.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedRevTypes(prev => [...prev, rt.id]);
                          else setSelectedRevTypes(prev => prev.filter(id => id !== rt.id));
                        }}
                      />
                      <span className="text-sm font-medium text-gray-700">{rt.name}</span>
                    </label>
                  ))}
                  {revenueTypes.length === 0 && <span className="text-sm text-gray-500">No active revenue types found.</span>}
                </div>
                <p className="text-xs text-gray-400 mt-1">Leave all unchecked to indicate exemption from all.</p>
              </div>
              <div className="col-span-2 mt-2 pt-4 border-t border-gray-100">
                <label className="flex items-center gap-3 cursor-pointer w-fit">
                  <input type="checkbox" className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500"
                    checked={form.isPrincipalOwner ?? false}
                    onChange={(e) => setForm({ ...form, isPrincipalOwner: e.target.checked })}
                  />
                  <span className="font-bold text-gray-900">Principal Owner of Shop</span>
                </label>
                <p className="text-xs text-gray-500 mt-1 ml-8">Only one person can be the principal owner per shop number.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setEditMember(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm font-medium">Cancel</button>
              <button type="submit" disabled={saving} className="px-6 py-2 bg-emerald-700 text-white font-bold rounded-lg hover:bg-emerald-800 disabled:opacity-50 text-sm flex items-center gap-2">
                {saving ? 'Saving...' : <><CheckCircle2 className="w-4 h-4" /> Save Changes</>}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // â”€â”€ Delete Confirm Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const DeleteConfirmModal = () => {
    if (!confirmDelete) return null;
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl p-6 text-center">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trash2 className="w-7 h-7 text-red-600" />
          </div>
          <h3 className="text-lg font-black text-gray-900 mb-1">Delete Member?</h3>
          <p className="text-sm text-gray-500 mb-6">This will permanently remove <span className="font-bold text-gray-700">{confirmDelete.fullName}</span> from your records. This cannot be undone.</p>
          <div className="flex gap-3">
            <button onClick={() => setConfirmDelete(null)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium">Cancel</button>
            <button onClick={() => handleDelete(confirmDelete)} disabled={!!deletingId}
              className="flex-1 px-4 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 disabled:opacity-50">
              {deletingId ? 'Deleting...' : 'Yes, Delete'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // â”€â”€ Add Member Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const AddMemberModal = () => {
    const [formData, setFormData] = useState({ fullName: '', phone: '', businessName: '', businessType: '', shopNumber: '', address: '', isPrincipalOwner: false });
    const [selectedRevTypes, setSelectedRevTypes] = useState<string[]>([]);
    const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        streamRef.current = stream;
        setIsCameraOpen(true);
      } catch { toast.error('Could not access camera. Please check permissions.'); }
    };

    useEffect(() => {
      if (isCameraOpen && videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current;
    }, [isCameraOpen]);

    const stopCamera = () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      setIsCameraOpen(false);
    };

    const capturePhoto = () => {
      if (videoRef.current && canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          canvasRef.current.width = videoRef.current.videoWidth;
          canvasRef.current.height = videoRef.current.videoHeight;
          ctx.drawImage(videoRef.current, 0, 0);
          setPhotoDataUrl(canvasRef.current.toDataURL('image/jpeg', 0.8));
          stopCamera();
        }
      }
    };

    const handleClose = () => { stopCamera(); setShowAddModal(false); };
    useEffect(() => () => stopCamera(), []);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user) return;
      if (!photoDataUrl) { toast.error('Please capture a photo of the member.'); return; }
      setIsSubmitting(true);
      const memberId = 'MKT-' + Math.floor(100000 + Math.random() * 900000);
      try {
        await axios.post('/api/market/members', { 
          userId: user.uid, 
          memberId, 
          ...formData, 
          photoDataUrl, 
          qrCode: JSON.stringify({ type: 'market_member', memberId }), 
          status: 'Active',
          assignedRevenueTypes: selectedRevTypes.length > 0 ? selectedRevTypes.join(',') : 'NONE',
          isPrincipalOwner: formData.isPrincipalOwner
        });
        toast.success('Member registered successfully!');
        handleClose();
        fetchMembers();
      } catch (err: any) {
        console.error('Registration error:', err);
        let errorMsg = 'Registration failed.';
        if (err.response?.data) {
          const { error, details } = err.response.data;
          if (typeof error === 'string') {
            errorMsg = error;
            if (details && Array.isArray(details)) {
              errorMsg += ': ' + details.map((d: any) => d.message).join(', ');
            }
          } else if (typeof error === 'object') {
             errorMsg = 'Validation Error (Object)';
          }
        }
        toast.error(errorMsg);
      } finally {
        setIsSubmitting(false);
      }
    };

    if (!showAddModal) return null;
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">Register New Member</h2>
            <button onClick={handleClose}><XCircle className="w-6 h-6 text-gray-400" /></button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { key: 'fullName', label: 'Full Name', type: 'text' },
                { key: 'phone', label: 'Phone Number', type: 'tel' },
                { key: 'businessName', label: 'Business Name', type: 'text' },
                { key: 'shopNumber', label: 'Shop Number', type: 'text' },
                { key: 'address', label: 'Address', type: 'text' },
              ].map(({ key, label, type }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                  <input type={type} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                    required={key !== 'address'} value={(formData as any)[key]} onChange={e => setFormData({ ...formData, [key]: e.target.value })} />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Business Type</label>
                <select className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" required
                  value={formData.businessType} onChange={e => setFormData({ ...formData, businessType: e.target.value })}>
                  <option value="">Select Type...</option>
                  {['Phone Seller','Phone Technician','Phone Accessories','Electronics','Fashion','Food','Automotive','Services','Other'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="md:col-span-2 mt-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Assigned Revenue Types</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {revenueTypes.map(rt => (
                    <label key={rt.id} className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                        checked={selectedRevTypes.includes(rt.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedRevTypes(prev => [...prev, rt.id]);
                          else setSelectedRevTypes(prev => prev.filter(id => id !== rt.id));
                        }}
                      />
                      <span className="text-sm font-medium text-gray-700">{rt.name}</span>
                    </label>
                  ))}
                  {revenueTypes.length === 0 && <span className="text-sm text-gray-500">No active revenue types found.</span>}
                </div>
              </div>
              <div className="md:col-span-2 mt-2 pt-4 border-t border-gray-100">
                <label className="flex items-center gap-3 cursor-pointer w-fit">
                  <input type="checkbox" className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500"
                    checked={formData.isPrincipalOwner}
                    onChange={(e) => setFormData({ ...formData, isPrincipalOwner: e.target.checked })}
                  />
                  <span className="font-bold text-gray-900">Principal Owner of Shop</span>
                </label>
                <p className="text-xs text-gray-500 mt-1 ml-8">Only one person can be the principal owner per shop number.</p>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Member Photo Capture</label>
                <div className="border-2 border-gray-200 rounded-xl overflow-hidden bg-gray-50 flex flex-col items-center justify-center p-4">
                  {photoDataUrl ? (
                    <div className="relative w-48 h-48 rounded-lg overflow-hidden border-4 border-white shadow-lg mb-4">
                      <img src={photoDataUrl} alt="Captured" className="w-full h-full object-cover" />
                      <button type="button" onClick={() => setPhotoDataUrl(null)} className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"><XCircle className="w-5 h-5" /></button>
                    </div>
                  ) : isCameraOpen ? (
                    <div className="relative w-full max-w-sm rounded-lg overflow-hidden border-4 border-emerald-900 shadow-lg mb-4">
                      <video ref={videoRef} autoPlay playsInline muted className="w-full h-48 object-cover bg-black"></video>
                      <button type="button" onClick={capturePhoto} className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-6 py-2 rounded-full font-bold shadow-lg hover:bg-emerald-700">Capture Photo</button>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Camera className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <button type="button" onClick={startCamera} className="bg-emerald-100 text-emerald-800 px-6 py-2 rounded-lg font-bold hover:bg-emerald-200 transition-colors">Start Camera</button>
                      <p className="text-xs text-gray-500 mt-2">Required for PVC ID Card</p>
                    </div>
                  )}
                  <canvas ref={canvasRef} className="hidden"></canvas>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-8">
              <button type="button" onClick={handleClose} disabled={isSubmitting} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={isSubmitting || !photoDataUrl} className="px-6 py-2 bg-emerald-700 text-white font-bold rounded-lg hover:bg-emerald-800 disabled:opacity-50 flex items-center gap-2">
                {isSubmitting ? 'Registering...' : <><CheckCircle2 className="w-5 h-5" /> Register Member</>}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const filteredMembers = members.filter(m => {
    const matchesSearch = m.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.shopNumber?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'All' || m.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const groupedMembers = filteredMembers.reduce((acc, m) => {
    const shop = m.shopNumber?.trim() || 'Independent / Unassigned';
    if (!acc[shop]) acc[shop] = [];
    acc[shop].push(m);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <MarketLayout title="Market Members">
      <div className="bg-white rounded-xl shadow-sm border border-emerald-50 overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4 justify-between items-center bg-gray-50/50">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input type="text" placeholder="Search members by name, shop, or ID..."
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex w-full sm:w-auto gap-2">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="flex-1 sm:flex-none px-3 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium bg-white">
              <option value="All">All Status</option>
              <option value="Active">Active</option>
              <option value="Suspended">Suspended</option>
            </select>
            <button onClick={() => setShowAddModal(true)}
              disabled={!metadata?.marketSpreadsheetId || !metadata?.isGoogleConnected}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              title={(!metadata?.marketSpreadsheetId || !metadata?.isGoogleConnected) ? 'Please connect Data and configure database first' : ''}>
              <Plus className="w-4 h-4" /> New Member
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto min-h-[300px]">
          {loading ? (
            <div className="flex justify-center items-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-900"></div></div>
          ) : (!metadata?.marketSpreadsheetId || !metadata?.isGoogleConnected) ? (
            <div className="text-center py-16 px-4">
              <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4"><XCircle className="w-8 h-8 text-gray-400" /></div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Data Not Connected</h3>
              <p className="text-gray-500 max-w-sm mx-auto">Please go to the Database tab to securely connect your Data and set up your sheets before adding members.</p>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              {searchTerm || statusFilter !== 'All' ? 'No members found matching your filters.' : 'No members registered yet. Click "New Member" to add one.'}
            </div>
          ) : (
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 font-bold">Member</th>
                  <th className="px-6 py-4 font-bold">Business</th>
                  <th className="px-6 py-4 font-bold">Shop No.</th>
                  <th className="px-6 py-4 font-bold">Status</th>
                  <th className="px-6 py-4 text-right font-bold">Actions</th>
                </tr>
              </thead>
              {Object.keys(groupedMembers).sort((a, b) => a === 'Independent / Unassigned' ? 1 : b === 'Independent / Unassigned' ? -1 : a.localeCompare(b)).map(shop => (
                <tbody key={shop} className="bg-white">
                  <tr className="bg-emerald-50/50 border-y border-emerald-100">
                    <td colSpan={5} className="px-6 py-2">
                      <span className="font-bold text-emerald-800 text-sm">{shop === 'Independent / Unassigned' ? 'Independent Members' : `Shop: ${shop}`}</span>
                      <span className="ml-2 text-xs text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">{groupedMembers[shop].length} member(s)</span>
                    </td>
                  </tr>
                  {groupedMembers[shop].sort((a, b) => (b.isPrincipalOwner ? 1 : 0) - (a.isPrincipalOwner ? 1 : 0)).map((member) => (
                    <tr key={member.id} className="border-b border-gray-50 hover:bg-emerald-50/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold overflow-hidden shadow-sm border border-emerald-200">
                              <MarketAvatar photoUrl={member.photoUrl} fullName={member.fullName} className="w-full h-full" />
                            </div>
                            {member.isPrincipalOwner && (
                              <div className="absolute -top-1 -right-1 bg-yellow-400 text-white rounded-full p-0.5 shadow-sm border border-white" title="Principal Owner">
                                <Crown className="w-3 h-3" />
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-gray-900">{member.fullName}</p>
                            <p className="text-xs text-gray-500">{member.id} • {member.phone}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-medium text-gray-900">{member.businessName}</p>
                        <p className="text-xs text-gray-500">{member.businessType}</p>
                      </td>
                      <td className="px-6 py-4 font-medium">{member.shopNumber || '-'}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${member.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {member.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="relative inline-block">
                          <button
                            onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === member.id ? null : member.id); }}
                            className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition-colors">
                            <MoreVertical className="w-5 h-5" />
                          </button>
                          {openMenuId === member.id && (
                            <div className="absolute right-0 top-10 w-48 bg-white rounded-xl shadow-xl border border-gray-100 z-30 overflow-hidden" onClick={e => e.stopPropagation()}>
                              <button onClick={() => { setViewMember(member); setOpenMenuId(null); }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                                <Eye className="w-4 h-4 text-blue-500" /> View Details
                              </button>
                              <button onClick={() => { setEditMember(member); setOpenMenuId(null); }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                                <Edit2 className="w-4 h-4 text-emerald-600" /> Edit Member
                              </button>
                              <div className="border-t border-gray-100" />
                              <button onClick={() => handleToggleStatus(member)}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors">
                                {member.status === 'Active'
                                  ? <><ShieldOff className="w-4 h-4 text-orange-500" /><span className="text-orange-700">Suspend Member</span></>
                                  : <><ShieldCheck className="w-4 h-4 text-emerald-600" /><span className="text-emerald-700">Activate Member</span></>}
                              </button>
                              <div className="border-t border-gray-100" />
                              <button onClick={() => { setConfirmDelete(member); setOpenMenuId(null); }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
                                <Trash2 className="w-4 h-4" /> Delete Member
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 flex justify-between items-center text-sm text-gray-500">
          <span>Showing {filteredMembers.length} of {members.length} members</span>
        </div>
      </div>

      {showAddModal && <AddMemberModal />}
      {viewMember && <ViewModal />}
      {editMember && <EditModal />}
      {confirmDelete && <DeleteConfirmModal />}
    </MarketLayout>
  );
}
