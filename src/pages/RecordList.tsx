import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { Search, ChevronRight, Smartphone, User, Calendar, Filter } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useUser } from '../contexts/UserContext';

export default function RecordList() {
  const { user, metadata, loading: userLoading } = useUser();
  const [records, setRecords] = useState<any[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      if (!user || !metadata?.spreadsheetId) return;
      try {
        const response = await axios.get(`/api/google/records?spreadsheetId=${metadata.spreadsheetId}&userId=${user.uid}`);
        const sorted = response.data.reverse();
        setRecords(sorted);
        setFilteredRecords(sorted);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    if (!userLoading) {
      if (!metadata?.spreadsheetId) {
        navigate('/setup');
      } else {
        fetchData();
      }
    }
  }, [user, metadata, userLoading, navigate]);

  useEffect(() => {
    const filtered = records.filter(r => 
      r.sellerName.toLowerCase().includes(search.toLowerCase()) ||
      r.brand.toLowerCase().includes(search.toLowerCase()) ||
      r.model.toLowerCase().includes(search.toLowerCase()) ||
      r.imei1.includes(search)
    );
    setFilteredRecords(filtered);
  }, [search, records]);

  return (
    <Layout title="All Records">
      <div className="space-y-6">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            id="search"
            name="search"
            type="text"
            className="input-field pl-12 py-4"
            placeholder="Search by name, brand, or IMEI..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-gray-200 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="card text-center py-12 text-gray-500">
            <p>No records found matching your search.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRecords.map((record) => (
              <Link key={record.id} to={`/records/${record.id}`} className="card p-4 flex items-center justify-between hover:border-navy/30 transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-navy/5 rounded-xl flex items-center justify-center text-navy">
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-navy">{record.sellerName}</h4>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                      <span className="flex items-center gap-1"><Smartphone className="w-3 h-3" /> {record.brand} {record.model}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {record.date}</span>
                    </div>
                  </div>
                </div>
                <ChevronRight className="text-gray-300 w-5 h-5" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
