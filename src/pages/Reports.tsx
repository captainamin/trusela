import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { BarChart3, TrendingUp, Smartphone, ShieldAlert, PieChart as PieChartIcon, RefreshCcw } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend
} from 'recharts';

import { useUser } from '../contexts/UserContext';
import { useSync } from '../hooks/useSync';

export default function Reports() {
  const { user, metadata, loading: userLoading } = useUser();
  const { syncCount, syncing: recalculating } = useSync();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async (silent = false) => {
    if (!user || !metadata?.spreadsheetId) return;
    if (!silent) setLoading(true);
    try {
      const response = await axios.get(`/api/google/records?spreadsheetId=${metadata.spreadsheetId}&userId=${user.uid}`);
      setRecords(response.data);
    } catch (error) {
      console.error(error);
      toast.error('Failed to fetch records');
    } finally {
      setLoading(false);
    }
  };

  const handleRecalculate = async () => {
    const count = await syncCount();
    if (count !== undefined) {
      await fetchData(true); // Silently refresh records cache
    }
  };

  useEffect(() => {
    if (!userLoading) fetchData();
  }, [user, metadata, userLoading]);

  if (loading) return <Layout title="Business Reports"><div className="animate-pulse h-64 bg-gray-200 rounded-xl" /></Layout>;

  // Data Processing
  const brandData = records.reduce((acc: any, curr) => {
    acc[curr.brand] = (acc[curr.brand] || 0) + 1;
    return acc;
  }, {});

  const brandChartData = Object.keys(brandData).map(name => ({
    name,
    value: brandData[name]
  })).sort((a, b) => b.value - a.value).slice(0, 5);

  const riskData = [
    { name: 'LOW', value: records.filter(r => r.riskLevel === 'LOW').length, color: '#22c55e' },
    { name: 'MEDIUM', value: records.filter(r => r.riskLevel === 'MEDIUM').length, color: '#f97316' },
    { name: 'HIGH', value: records.filter(r => r.riskLevel === 'HIGH').length, color: '#ef4444' },
  ];

  const statusData = [
    { name: 'In Stock', value: records.filter(r => r.deviceStatus === 'IN_STOCK').length, color: '#001f3f' },
    { name: 'Sold', value: records.filter(r => r.deviceStatus === 'SOLD').length, color: '#facc15' },
  ];

  // Group by date for trend
  const trendData = records.reduce((acc: any, curr) => {
    const date = curr.date;
    acc[date] = (acc[date] || 0) + 1;
    return acc;
  }, {});

  const trendChartData = Object.keys(trendData).map(date => ({
    date,
    count: trendData[date]
  })).slice(-7);

  const COLORS = ['#001f3f', '#facc15', '#22c55e', '#ef4444', '#3b82f6'];

  return (
    <Layout title="Business Reports">
      <div className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card bg-navy text-white p-4 relative flex flex-col justify-between">
            <div className="flex justify-between items-start mb-2">
              <TrendingUp className="w-5 h-5 text-yellow" />
              <button
                onClick={handleRecalculate}
                disabled={recalculating}
                className={`flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 rounded-lg transition-colors border border-white/10 ${recalculating ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <RefreshCcw className={`w-3 h-3 text-green ${recalculating ? 'animate-spin' : ''}`} />
                <span className="text-[10px] font-bold uppercase text-navy/80">Sync</span>
              </button>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-navy/60">Total Volume</p>
              <p className="text-2xl text-navy font-bold">{records.length}</p>
            </div>
          </div>
          <div className="card p-4">
            <Smartphone className="w-5 h-5 text-navy mb-2" />
            <p className="text-[10px] uppercase font-bold text-gray-400">In Stock</p>
            <p className="text-2xl font-bold text-navy">{records.filter(r => r.deviceStatus === 'IN_STOCK').length}</p>
          </div>
          <div className="card p-4">
            <BarChart3 className="w-5 h-5 text-navy mb-2" />
            <p className="text-[10px] uppercase font-bold text-gray-400">Sold Units</p>
            <p className="text-2xl font-bold text-navy">{records.filter(r => r.deviceStatus === 'SOLD').length}</p>
          </div>
          <div className="card p-4">
            <ShieldAlert className="w-5 h-5 text-red-500 mb-2" />
            <p className="text-[10px] uppercase font-bold text-gray-400">High Risk</p>
            <p className="text-2xl font-bold text-red-600">{records.filter(r => r.riskLevel === 'HIGH').length}</p>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Transaction Trend */}
          <div className="card">
            <h4 className="font-bold text-navy mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Transaction Trend (Last 7 Days)
            </h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" fontSize={10} />
                  <YAxis fontSize={10} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#001f3f" strokeWidth={2} dot={{ fill: '#facc15' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Brand Distribution */}
          <div className="card">
            <h4 className="font-bold text-navy mb-4 flex items-center gap-2">
              <PieChartIcon className="w-4 h-4" /> Top 5 Brands
            </h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={brandChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {brandChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Risk Analysis */}
          <div className="card">
            <h4 className="font-bold text-navy mb-4 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" /> Security Risk Distribution
            </h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={riskData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" fontSize={10} />
                  <YAxis fontSize={10} />
                  <Tooltip />
                  <Bar dataKey="value">
                    {riskData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Inventory Status */}
          <div className="card">
            <h4 className="font-bold text-navy mb-4 flex items-center gap-2">
              <Smartphone className="w-4 h-4" /> Inventory Status
            </h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
