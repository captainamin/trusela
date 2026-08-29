import React, { useState, useEffect } from 'react';
import MarketLayout from '../../components/MarketLayout';
import { Search, ShieldPlus, Filter, MoreVertical, ShieldAlert, Award, Briefcase, RefreshCcw, XCircle, Eye, Edit2, ShieldOff, ShieldCheck, Trash2, CheckCircle2, Calendar, Hash, ClipboardList } from 'lucide-react';
import { useUser } from '../../contexts/UserContext';
import axios from 'axios';
import { toast } from 'sonner';

import MarketAvatar from '../../components/MarketAvatar';

export default function MarketOfficials() {
  const { user, metadata } = useUser();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showAddModal, setShowAddModal] = useState(false);
  
  const [officials, setOfficials] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [members, setMembers] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [viewOfficial, setViewOfficial] = useState<any | null>(null);
  const [editOfficial, setEditOfficial] = useState<any | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);

  useEffect(() => {
    if (metadata?.marketSpreadsheetId && metadata?.isGoogleConnected) {
      fetchData();
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

  const fetchData = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const [officialsRes, tasksRes] = await Promise.all([
        axios.get(`/api/market/officials/${user.uid}`),
        axios.get(`/api/market/tasks/${user.uid}`)
      ]);
      setOfficials(officialsRes.data.filter((off: any) => off.id && off.fullName));
      setTasks(tasksRes.data.filter((t: any) => t.id && t.title));
    } catch (err: any) {
      toast.error('Failed to load officials data');
    } finally {
      setLoading(false);
    }
  };

  const fetchMembers = async () => {
    if (!user) return;
    try {
      setLoadingMembers(true);
      const res = await axios.get(`/api/market/members/${user.uid}`);
      setMembers(res.data.filter((m: any) => m.id && m.fullName));
    } catch (err) {
      toast.error('Failed to load members for selection');
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    if (showAddModal && members.length === 0) fetchMembers();
  }, [showAddModal]);

  const handleToggleStatus = async (official: any) => {
    const newStatus = official.status === 'Active' ? 'Inactive' : 'Active';
    try {
      await axios.put(`/api/market/officials/${user!.uid}/${official.id}`, { status: newStatus });
      toast.success(`Official ${newStatus === 'Active' ? 'activated' : 'deactivated'} successfully`);
      setOfficials(prev => prev.map(o => o.id === official.id ? { ...o, status: newStatus } : o));
    } catch (err: any) {
      toast.error('Failed to update status');
    }
    setOpenMenuId(null);
  };

  const handleDelete = async (official: any) => {
    setDeletingId(official.id);
    try {
      await axios.delete(`/api/market/officials/${user!.uid}/${official.id}`);
      toast.success('Official deleted successfully');
      setOfficials(prev => prev.filter(o => o.id !== official.id));
      setConfirmDelete(null);
    } catch (err: any) {
      toast.error('Failed to delete official');
    } finally {
      setDeletingId(null);
    }
  };

  // ── View Details Modal ──────────────────────────────────────────
  const ViewModal = () => {
    if (!viewOfficial) return null;
    
    // Find tasks assigned to this official by name or ID
    const assignedTasks = tasks.filter(t => 
      t.assignedTo === viewOfficial.fullName || 
      t.assignedTo === viewOfficial.id || 
      t.assignedTo === viewOfficial.officialNumber
    );

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setViewOfficial(null)}>
        <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="bg-emerald-700 p-6 text-white relative flex-shrink-0">
            <button onClick={() => setViewOfficial(null)} className="absolute top-4 right-4 hover:bg-white/20 rounded-full p-1"><XCircle className="w-5 h-5" /></button>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-white/30 shadow-lg bg-emerald-600 text-3xl text-emerald-100">
                <MarketAvatar photoUrl={viewOfficial.photoUrl} fullName={viewOfficial.fullName} className="w-full h-full" fallbackClassName="bg-emerald-600 text-emerald-100" />
              </div>
              <div>
                <h2 className="text-xl font-black">{viewOfficial.fullName}</h2>
                <p className="text-emerald-200 text-sm font-mono">{viewOfficial.officialNumber || viewOfficial.id}</p>
                <span className={`mt-1 inline-block px-2 py-0.5 rounded-full text-xs font-bold ${viewOfficial.status === 'Active' ? 'bg-white/20 text-white' : 'bg-red-400/30 text-red-100'}`}>{viewOfficial.status}</span>
              </div>
            </div>
          </div>
          
          <div className="p-6 overflow-y-auto flex-1 bg-gray-50/50">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Official Details</h3>
            <div className="grid grid-cols-2 gap-4 mb-8">
              {[
                { icon: Award, label: 'Rank', value: viewOfficial.rank },
                { icon: Briefcase, label: 'Department', value: viewOfficial.department },
                { icon: ShieldAlert, label: 'Permissions', value: viewOfficial.type },
                { icon: Hash, label: 'Official Number', value: viewOfficial.officialNumber || 'N/A' },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-3 text-sm p-3 bg-white rounded-xl border border-gray-100">
                  <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-emerald-700" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-medium">{label}</p>
                    <p className="text-gray-900 font-semibold">{value}</p>
                  </div>
                </div>
              ))}
            </div>

            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
              <ClipboardList className="w-4 h-4" /> Assigned Tasks ({assignedTasks.length})
            </h3>
            
            {assignedTasks.length === 0 ? (
              <div className="text-center p-6 bg-white rounded-xl border border-gray-100 text-gray-500 text-sm">
                No tasks currently assigned to this official.
              </div>
            ) : (
              <div className="space-y-3">
                {assignedTasks.map(task => (
                  <div key={task.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center">
                    <div>
                      <h4 className="font-bold text-gray-900 text-sm">{task.title}</h4>
                      <div className="flex gap-3 text-xs text-gray-500 mt-1">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3"/> Due: {task.dueDate}</span>
                        <span className="flex items-center gap-1"><ShieldAlert className="w-3 h-3"/> {task.priority}</span>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                      task.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' :
                      task.status === 'In Progress' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {task.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── Edit Modal ──────────────────────────────────────────────────
  const EditModal = () => {
    const [form, setForm] = useState({ ...editOfficial });
    const [saving, setSaving] = useState(false);
    if (!editOfficial) return null;

    const handleSave = async (e: React.FormEvent) => {
      e.preventDefault();
      setSaving(true);
      try {
        await axios.put(`/api/market/officials/${user!.uid}/${editOfficial.id}`, {
          fullName: form.fullName,
          rank: form.rank,
          department: form.department,
          officialNumber: form.officialNumber,
          type: form.type
        });
        toast.success('Official updated successfully');
        setOfficials(prev => prev.map(o => o.id === editOfficial.id ? { ...o, ...form } : o));
        setEditOfficial(null);
      } catch (err: any) {
        toast.error('Failed to update official');
      } finally {
        setSaving(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-black text-gray-900">Edit Official</h2>
            <button onClick={() => setEditOfficial(null)}><XCircle className="w-6 h-6 text-gray-400 hover:text-gray-600" /></button>
          </div>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input type="text" value={form.fullName || ''} onChange={e => setForm({...form, fullName: e.target.value})} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm" required />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Official Rank</label>
                <select value={form.rank || ''} onChange={e => setForm({...form, rank: e.target.value})} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm" required>
                  {['Officer', 'Senior Officer', 'Supervisor', 'Inspector', 'Chief'].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <select value={form.department || ''} onChange={e => setForm({...form, department: e.target.value})} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm" required>
                  {['Revenue Collection', 'Registration', 'Task Force', 'Audit', 'Administration'].map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Permissions Type</label>
                <select value={form.type || ''} onChange={e => setForm({...form, type: e.target.value})} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm" required>
                  <option value="Revenue Officer">Revenue Officer</option>
                  <option value="Registration Officer">Registration Officer</option>
                  <option value="Task Manager">Task Manager</option>
                  <option value="Full Access">Supervisor (Full Access)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Official Number</label>
                <input type="text" value={form.officialNumber || ''} onChange={e => setForm({...form, officialNumber: e.target.value})} className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm" required />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => setEditOfficial(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm font-medium">Cancel</button>
              <button type="submit" disabled={saving} className="px-6 py-2 bg-emerald-700 text-white font-bold rounded-lg hover:bg-emerald-800 disabled:opacity-50 text-sm flex items-center gap-2">
                {saving ? 'Saving...' : <><CheckCircle2 className="w-4 h-4" /> Save Changes</>}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // ── Delete Confirm Modal ─────────────────────────────────────────
  const DeleteConfirmModal = () => {
    if (!confirmDelete) return null;
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl p-6 text-center">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trash2 className="w-7 h-7 text-red-600" />
          </div>
          <h3 className="text-lg font-black text-gray-900 mb-1">Remove Official?</h3>
          <p className="text-sm text-gray-500 mb-6">This will revoke official privileges for <span className="font-bold text-gray-700">{confirmDelete.fullName}</span>. They will remain a market member.</p>
          <div className="flex gap-3">
            <button onClick={() => setConfirmDelete(null)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium">Cancel</button>
            <button onClick={() => handleDelete(confirmDelete)} disabled={!!deletingId}
              className="flex-1 px-4 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 disabled:opacity-50">
              {deletingId ? 'Removing...' : 'Yes, Remove'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const AddOfficialModal = () => {
    const [formData, setFormData] = useState({ memberId: '', rank: '', department: '', officialType: '', officialNumber: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!showAddModal) return null;

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user) return;
      
      const selectedMember = members.find(m => m.id === formData.memberId);
      if (!selectedMember) { toast.error('Invalid member selected'); return; }

      setIsSubmitting(true);
      const officialId = 'OFF-' + Math.floor(100000 + Math.random() * 900000);

      try {
        await axios.post('/api/market/sheet-append', {
          userId: user.uid,
          sheetName: 'Officials',
          values: [
            officialId,
            selectedMember.fullName,
            formData.rank,
            formData.department,
            formData.officialNumber,
            selectedMember.photoUrl || '',
            'Active',
            formData.officialType
          ]
        });

        toast.success('Official added successfully!');
        setShowAddModal(false);
        fetchData(); // reload
      } catch (err: any) {
        toast.error('Failed to add official');
      } finally {
        setIsSubmitting(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl max-w-2xl w-full p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <ShieldPlus className="text-emerald-700 w-6 h-6" /> Promote to Official
            </h2>
            <button onClick={() => setShowAddModal(false)} disabled={isSubmitting} className="text-gray-500 hover:text-gray-700"><XCircle className="w-6 h-6" /></button>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-emerald-50 text-emerald-800 p-4 rounded-lg mb-6 text-sm border border-emerald-100">
              Select an existing member to promote to an official role. They will gain access to the Market Management portal based on their assigned rank.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Member</label>
                <select className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" required
                  value={formData.memberId} onChange={(e) => setFormData({...formData, memberId: e.target.value})} disabled={loadingMembers || isSubmitting}>
                  <option value="">{loadingMembers ? 'Loading members...' : 'Select a member...'}</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.fullName} ({m.id})</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Official Rank</label>
                <select className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" required
                  value={formData.rank} onChange={(e) => setFormData({...formData, rank: e.target.value})} disabled={isSubmitting}>
                  <option value="">Select Rank...</option>
                  {['Officer', 'Senior Officer', 'Supervisor', 'Inspector', 'Chief'].map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <select className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" required
                  value={formData.department} onChange={(e) => setFormData({...formData, department: e.target.value})} disabled={isSubmitting}>
                  <option value="">Select Dept...</option>
                  {['Revenue Collection', 'Registration', 'Task Force', 'Audit', 'Administration'].map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Official Type (Permissions)</label>
                <select className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" required
                  value={formData.officialType} onChange={(e) => setFormData({...formData, officialType: e.target.value})} disabled={isSubmitting}>
                  <option value="">Select Permissions...</option>
                  <option value="Revenue Officer">Revenue Officer (Collections only)</option>
                  <option value="Registration Officer">Registration Officer (Members only)</option>
                  <option value="Task Manager">Task Manager (Tasks only)</option>
                  <option value="Full Access">Supervisor (Full Access)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Official ID / Number</label>
                <input type="text" placeholder="e.g. RC-001" className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none" required 
                  value={formData.officialNumber} onChange={(e) => setFormData({...formData, officialNumber: e.target.value})} disabled={isSubmitting} />
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-8">
              <button type="button" onClick={() => setShowAddModal(false)} disabled={isSubmitting} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 font-medium disabled:opacity-50 flex items-center gap-2">
                {isSubmitting ? <RefreshCcw className="w-4 h-4 animate-spin" /> : null} Confirm Promotion
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const filteredOfficials = officials.filter(off => {
    const matchesSearch = off.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          off.officialNumber?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'All' || off.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <MarketLayout title="Market Officials">
      <div className="bg-white rounded-xl shadow-sm border border-emerald-50 overflow-hidden min-h-[500px] flex flex-col">
        
        {/* Toolbar */}
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4 justify-between items-center bg-gray-50/50">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input type="text" placeholder="Search officials..." className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          
          <div className="flex w-full sm:w-auto gap-2">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="flex-1 sm:flex-none px-3 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium bg-white">
              <option value="All">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
            <button onClick={() => setShowAddModal(true)} disabled={!metadata?.marketSpreadsheetId || !metadata?.isGoogleConnected}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 text-sm font-medium disabled:opacity-50"
              title={(!metadata?.marketSpreadsheetId || !metadata?.isGoogleConnected) ? "Please connect Data first" : ""}>
              <ShieldPlus className="w-4 h-4" /> Assign Official
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 py-16">
            <RefreshCcw className="w-8 h-8 animate-spin mb-4 text-emerald-600" />
            <p>Loading Officials...</p>
          </div>
        ) : (!metadata?.marketSpreadsheetId || !metadata?.isGoogleConnected) ? (
          <div className="flex-1 text-center py-16">
             <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4"><ShieldAlert className="w-8 h-8 text-gray-400" /></div>
             <h3 className="text-lg font-bold text-gray-900 mb-2">Data Not Connected</h3>
             <p className="text-gray-500 max-w-sm mx-auto">Please go to the Database tab to securely connect your Data and set up your sheets before assigning officials.</p>
          </div>
        ) : filteredOfficials.length === 0 ? (
          <div className="flex-1 text-center py-16 text-gray-500">
             {searchTerm || statusFilter !== 'All' ? 'No officials match your filters.' : 'No officials have been assigned yet.'}
          </div>
        ) : (
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 flex-1">
            {filteredOfficials.map((official) => (
              <div key={official.id} className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow bg-white relative overflow-hidden flex flex-col h-full">
                <div className={`absolute top-0 left-0 w-1 h-full ${official.status === 'Active' ? 'bg-emerald-600' : 'bg-gray-400'}`}></div>
                
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800 font-bold text-lg overflow-hidden border-2 border-emerald-100 shrink-0">
                      <MarketAvatar photoUrl={official.photoUrl} fullName={official.fullName} className="w-full h-full" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">{official.fullName}</h3>
                      <p className="text-xs text-gray-500">{official.officialNumber || official.id}</p>
                    </div>
                  </div>
                  
                  {/* Actions Dropdown */}
                  <div className="relative">
                    <button onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === official.id ? null : official.id); }}
                      className="p-1 text-gray-400 hover:bg-gray-100 rounded hover:text-emerald-700 transition-colors">
                      <MoreVertical className="w-5 h-5" />
                    </button>
                    {openMenuId === official.id && (
                      <div className="absolute right-0 top-8 w-48 bg-white rounded-xl shadow-xl border border-gray-100 z-30 overflow-hidden" onClick={e => e.stopPropagation()}>
                        <button onClick={() => { setViewOfficial(official); setOpenMenuId(null); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                          <Eye className="w-4 h-4 text-blue-500" /> View Details
                        </button>
                        <button onClick={() => { setEditOfficial(official); setOpenMenuId(null); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                          <Edit2 className="w-4 h-4 text-emerald-600" /> Edit Official
                        </button>
                        <div className="border-t border-gray-100" />
                        <button onClick={() => handleToggleStatus(official)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors">
                          {official.status === 'Active'
                            ? <><ShieldOff className="w-4 h-4 text-orange-500" /><span className="text-orange-700">Deactivate</span></>
                            : <><ShieldCheck className="w-4 h-4 text-emerald-600" /><span className="text-emerald-700">Activate</span></>}
                        </button>
                        <div className="border-t border-gray-100" />
                        <button onClick={() => { setConfirmDelete(official); setOpenMenuId(null); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
                          <Trash2 className="w-4 h-4" /> Remove Official
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2 mb-4 flex-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 flex items-center gap-1.5"><Award className="w-4 h-4" /> Rank</span>
                    <span className="font-medium text-gray-900">{official.rank}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 flex items-center gap-1.5"><Briefcase className="w-4 h-4" /> Dept</span>
                    <span className="font-medium text-gray-900">{official.department}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 flex items-center gap-1.5"><ShieldAlert className="w-4 h-4" /> Type</span>
                    <span className="font-medium text-emerald-700">{official.type}</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    official.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {official.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

      <AddOfficialModal />
      <ViewModal />
      <EditModal />
      <DeleteConfirmModal />
    </MarketLayout>
  );
}
