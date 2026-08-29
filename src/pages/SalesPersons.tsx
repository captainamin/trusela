import React, { useEffect, useState } from 'react';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import Layout from '../components/Layout';
import { Users, UserPlus, Trash2, Mail, Phone, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';

export default function SalesPersons() {
  const [salesPersons, setSalesPersons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phoneNumber: '',
  });

  useEffect(() => {
    if (!auth.currentUser) return;

    const fetchUserData = async () => {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser!.uid));
      if (userDoc.exists()) {
        setUserData(userDoc.data());
      }
    };
    fetchUserData();

    const q = query(collection(db, 'users', auth.currentUser.uid, 'salespersons'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSalesPersons(list);
      setLoading(false);
    }, (error) => {
      console.error(error);
      toast.error('Failed to load sales persons');
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    
    if (salesPersons.length >= 3) {
      toast.error('Manager plan is limited to 3 sales persons');
      return;
    }

    setAdding(true);
    try {
      await addDoc(collection(db, 'users', auth.currentUser.uid, 'salespersons'), {
        ...formData,
        managerId: auth.currentUser.uid,
        createdAt: new Date().toISOString(),
      });
      toast.success('Sales person added successfully');
      setFormData({ name: '', email: '', phoneNumber: '' });
    } catch (error) {
      console.error(error);
      toast.error('Failed to add sales person');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!auth.currentUser || !window.confirm('Are you sure you want to remove this sales person?')) return;
    try {
      await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'salespersons', id));
      toast.success('Sales person removed');
    } catch (error) {
      console.error(error);
      toast.error('Failed to remove sales person');
    }
  };

  if (loading) return <Layout title="Sales Persons"><div className="animate-pulse h-64 bg-gray-200 rounded-xl" /></Layout>;

  return (
    <Layout title="Manage Team">
      <div className="space-y-6">
        <div className="card bg-navy text-white p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-yellow rounded-full flex items-center justify-center text-navy">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Sales Team</h3>
              <p className="text-white/70 text-sm">{salesPersons.length} of 3 registered</p>
            </div>
          </div>
        </div>

        {salesPersons.length < 3 && (
          <form onSubmit={handleAdd} className="card space-y-4">
            <h4 className="font-bold text-navy flex items-center gap-2">
              <UserPlus className="w-5 h-5" /> Add New Sales Person
            </h4>
            <div className="grid md:grid-cols-3 gap-4">
              <input
                id="sp-name"
                name="name"
                type="text"
                required
                autoComplete="off"
                placeholder="Full Name"
                className="input-field"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
              <input
                id="sp-email"
                name="email"
                type="email"
                required
                autoComplete="off"
                placeholder="Email Address"
                className="input-field"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
              <input
                id="sp-phone"
                name="phoneNumber"
                type="tel"
                required
                autoComplete="off"
                placeholder="Phone Number"
                className="input-field"
                value={formData.phoneNumber}
                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
              />
            </div>
            <button
              type="submit"
              disabled={adding}
              className="w-full btn-primary py-3 flex items-center justify-center gap-2"
            >
              {adding ? <RefreshCcw className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
              Register Sales Person
            </button>
          </form>
        )}

        <div className="space-y-4">
          {salesPersons.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No sales persons registered yet.</p>
            </div>
          ) : (
            salesPersons.map((sp) => (
              <div key={sp.id} className="card flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-navy/5 rounded-full flex items-center justify-center text-navy font-bold">
                    {sp.name.charAt(0)}
                  </div>
                  <div>
                    <h5 className="font-bold text-navy">{sp.name}</h5>
                    <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                      <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {sp.email}</span>
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {sp.phoneNumber}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(sp.id)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}
