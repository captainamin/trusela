import React, { useState, useEffect, useRef } from 'react';
import MarketLayout from '../../components/MarketLayout';
import logo from '../../assets/logo.png';
import { useUser } from '../../contexts/UserContext';
import { Download, Filter, Calendar, BarChart2, Users, Banknote, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import axios from 'axios';
import { toJpeg, toPng } from 'html-to-image';
import jsPDF from 'jspdf';
import { toast } from 'sonner';

export default function MarketReports() {
  const { user, metadata } = useUser();
  const [isExporting, setIsExporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reportType, setReportType] = useState('revenue');
  const [timeFilter, setTimeFilter] = useState('thisMonth'); // all, thisMonth, lastMonth
  
  const reportRef = useRef<HTMLDivElement>(null);

  const [members, setMembers] = useState<any[]>([]);
  const [collections, setCollections] = useState<any[]>([]);
  const [revenueTypes, setRevenueTypes] = useState<any[]>([]);
  const [officials, setOfficials] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        const [membersRes, collectionsRes, revenueTypesRes, officialsRes, tasksRes] = await Promise.all([
          axios.get(`/api/market/members/${user.uid}`).catch(() => ({ data: [] })),
          axios.get(`/api/market/collections/${user.uid}`).catch(() => ({ data: [] })),
          axios.get(`/api/market/revenue-types/${user.uid}`).catch(() => ({ data: [] })),
          axios.get(`/api/market/officials/${user.uid}`).catch(() => ({ data: [] })),
          axios.get(`/api/market/tasks/${user.uid}`).catch(() => ({ data: [] }))
        ]);

        setMembers(membersRes.data || []);
        
        // Parse collection dates
        const cols = (collectionsRes.data || []).map((c: any) => {
          let parsedDate = new Date(0);
          if (c.date) {
            const d = new Date(c.date);
            if (!isNaN(d.getTime())) {
              parsedDate = d;
            } else if (c.date.includes('/')) {
               const parts = c.date.split('/');
               if (parts.length === 3) {
                  parsedDate = new Date(`${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`);
               }
            }
          }
          return { ...c, parsedDate };
        });
        setCollections(cols);
        setRevenueTypes(revenueTypesRes.data || []);
        setOfficials(officialsRes.data || []);
        setTasks(tasksRes.data || []);

      } catch (error) {
        console.error("Fetch error", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const COLORS = ['#059669', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#f43f5e'];

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
  };

  const handleExportPDF = async () => {
    if (!reportRef.current) return;
    
    try {
      toast.info("Generating PDF report...");
      setIsExporting(true);
      await new Promise(resolve => setTimeout(resolve, 300)); // Wait for React to render header and watermark
      
      // Filter out stylesheet nodes that contain oklch() — unsupported by html-to-image's CSS parser
      // (Tailwind CSS v4 uses oklch for its color palette)
      const filterOklch = (node: HTMLElement) => {
        if (node.tagName === 'STYLE' && node.textContent?.includes('oklch')) return false;
        if (node.tagName === 'LINK' && (node as HTMLLinkElement).rel === 'stylesheet') return false;
        return true;
      };

      const imgData = await toJpeg(reportRef.current, {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        filter: filterOklch,
      });
      if (!imgData) {
        throw new Error("Image rendering failed");
      }
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (reportRef.current.offsetHeight * pdfWidth) / reportRef.current.offsetWidth;
      
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Market_Report_${reportType}_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success("PDF Downloaded successfully!");
    } catch (error: any) {
      console.error("PDF Export Error:", error);
      toast.error(`Failed to generate PDF: ${error.message || 'Unknown error'}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Filter Data based on timeFilter
  const now = new Date();
  const getFilterDates = () => {
    if (timeFilter === 'thisMonth') {
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) };
    }
    if (timeFilter === 'lastMonth') {
      return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59) };
    }
    return { start: new Date(0), end: new Date(3000, 0, 1) }; // All time
  };

  const { start: startDate, end: endDate } = getFilterDates();

  const filteredCollections = collections.filter(c => c.parsedDate >= startDate && c.parsedDate <= endDate);
  const filteredMembers = members.filter(m => {
    if (!m.registrationDate) return false;
    const d = new Date(m.registrationDate);
    return d >= startDate && d <= endDate;
  });

  // --- REVENUE DATA PREP ---
  const totalRevenue = filteredCollections.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  
  const revenueByType: Record<string, number> = {};
  filteredCollections.forEach(c => {
    revenueByType[c.type] = (revenueByType[c.type] || 0) + (Number(c.amount) || 0);
  });
  
  const revenueData = Object.keys(revenueByType).map(key => ({
    name: key,
    value: revenueByType[key]
  })).sort((a, b) => b.value - a.value);

  const topRevenueSource = revenueData.length > 0 ? revenueData[0] : { name: 'N/A', value: 0 };

  // Calculate Outstanding using the same logic from Dashboard
  let outstandingAmount = 0;
  const activeRevTypes = revenueTypes.filter((rt: any) => rt.status === 'Active');
  
  const getStartOfPeriod = (frequency: string) => {
    if (timeFilter === 'thisMonth') return new Date(now.getFullYear(), now.getMonth(), 1);
    if (timeFilter === 'lastMonth') return new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const d = new Date();
    if (frequency === 'Daily') return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (frequency === 'Weekly') {
      const day = d.getDay() || 7; 
      if (day !== 1) d.setHours(-24 * (day - 1)); 
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
    if (frequency === 'Monthly') return new Date(d.getFullYear(), d.getMonth(), 1);
    if (frequency === 'Yearly') return new Date(d.getFullYear(), 0, 1);
    return new Date(0);
  };

  members.forEach((member: any) => {
    if (member.status !== 'Active') return;
    activeRevTypes.forEach((rt: any) => {
      const startOfPeriod = getStartOfPeriod(rt.frequency);
      const hasPaid = collections.some((c: any) => 
        c.member === member.id && c.type === rt.name && c.parsedDate >= startOfPeriod
      );
      if (!hasPaid) outstandingAmount += Number(rt.amount) || 0;
    });
  });

  const recentTransactions = [...filteredCollections].sort((a, b) => b.parsedDate.getTime() - a.parsedDate.getTime()).slice(0, 5);

  // --- MEMBERSHIP DATA PREP ---
  const activeMembers = members.filter(m => m.status === 'Active').length;
  const inactiveMembers = members.filter(m => m.status !== 'Active').length;
  const newRegistrations = filteredMembers.length;

  const registrationData = [];
  for (let i = 5; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
    const count = members.filter(m => {
      if (!m.registrationDate) return false;
      const d = new Date(m.registrationDate);
      return d >= monthStart && d <= monthEnd;
    }).length;
    registrationData.push({
      name: monthStart.toLocaleDateString('en-US', { month: 'short' }),
      value: count
    });
  }

  // --- OFFICIALS DATA PREP ---
  const officialStats = officials.map(off => {
    const offName = off.fullName || off.name;
    const offCollections = filteredCollections.filter(c => c.official === offName);
    const collectedAmount = offCollections.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    
    const assignedTasks = tasks.filter(t => t.assignedTo === offName);
    const completedTasks = assignedTasks.filter(t => t.status === 'Completed').length;
    const completionRate = assignedTasks.length > 0 ? Math.round((completedTasks / assignedTasks.length) * 100) : 0;

    return {
      ...off,
      collectedAmount,
      transactionCount: offCollections.length,
      assignedTasks: assignedTasks.length,
      completionRate
    };
  }).sort((a, b) => b.collectedAmount - a.collectedAmount);

  return (
    <MarketLayout title="Market Reports">
      <div className="bg-white rounded-xl shadow-sm border border-emerald-50 overflow-hidden">
        
        {/* Toolbar */}
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4 justify-between items-center bg-gray-50/50">
          <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0">
            <button 
              onClick={() => setReportType('revenue')}
              className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 whitespace-nowrap transition-colors ${reportType === 'revenue' ? 'bg-emerald-700 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
            >
              <Banknote className="w-4 h-4" /> Revenue Report
            </button>
            <button 
              onClick={() => setReportType('members')}
              className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 whitespace-nowrap transition-colors ${reportType === 'members' ? 'bg-emerald-700 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
            >
              <Users className="w-4 h-4" /> Membership Report
            </button>
            <button 
              onClick={() => setReportType('officials')}
              className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 whitespace-nowrap transition-colors ${reportType === 'officials' ? 'bg-emerald-700 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
            >
              <ShieldAlert className="w-4 h-4" /> Official Performance
            </button>
          </div>
          
          <div className="flex w-full sm:w-auto gap-2">
            <div className="relative flex-1 sm:flex-none">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <select 
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm appearance-none bg-white font-medium text-gray-700"
              >
                <option value="thisMonth">This Month</option>
                <option value="lastMonth">Last Month</option>
                <option value="all">All Time</option>
              </select>
            </div>
            <button 
              onClick={handleExportPDF}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-800 rounded-lg hover:bg-emerald-200 text-sm font-bold transition-colors"
            >
              <Download className="w-4 h-4" />
              Export PDF
            </button>
          </div>
        </div>

        {/* Report Content */}
        <div className={`p-6 ${isExporting ? 'bg-white' : ''}`} ref={reportRef} style={isExporting ? { width: '794px', minHeight: '1123px', position: 'relative', overflow: 'hidden' } : {}}>
          
          {isExporting && (
            <>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', opacity: 0.04, pointerEvents: 'none', zIndex: 0 }}>
                <img src={metadata?.marketSettings?.logoUrl || logo} alt="Watermark" style={{ width: '500px', height: '500px', objectFit: 'contain' }} crossOrigin="anonymous" />
              </div>
              <div style={{ borderBottom: '2px solid #059669', paddingBottom: '20px', marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <img src={metadata?.marketSettings?.logoUrl || logo} alt="Logo" style={{ width: '60px', height: '60px', objectFit: 'contain' }} crossOrigin="anonymous" />
                  <div>
                    <h1 style={{ fontSize: '24px', fontWeight: '900', color: '#064e3b', margin: '0 0 5px 0' }}>{metadata?.marketSettings?.name || 'Market Administration'}</h1>
                    <h2 style={{ fontSize: '16px', color: '#6b7280', margin: '0', textTransform: 'uppercase', letterSpacing: '1px' }}>{reportType} Report</h2>
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '12px', color: '#4b5563' }}>
                  <p style={{ margin: '0 0 3px 0' }}><strong>Date:</strong> {new Date().toLocaleDateString()}</p>
                  <p style={{ margin: '0' }}><strong>Period:</strong> {timeFilter === 'thisMonth' ? 'This Month' : timeFilter === 'lastMonth' ? 'Last Month' : 'All Time'}</p>
                </div>
              </div>
            </>
          )}

          <div style={{ position: 'relative', zIndex: 1 }}>
          {loading ? (
             <div className="flex items-center justify-center h-64">
               <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-900"></div>
             </div>
          ) : reportType === 'revenue' ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-emerald-50 p-6 rounded-xl border border-emerald-100">
                  <p className="text-emerald-800 text-sm font-bold mb-1">Total Revenue Collected</p>
                  <h3 className="text-3xl font-black text-emerald-900">{formatCurrency(totalRevenue)}</h3>
                  <p className="text-xs text-emerald-600 mt-2 font-medium bg-emerald-100 inline-block px-2 py-0.5 rounded-md">Based on selected timeframe</p>
                </div>
                <div className="bg-blue-50 p-6 rounded-xl border border-blue-100">
                  <p className="text-blue-800 text-sm font-bold mb-1">Top Revenue Source</p>
                  <h3 className="text-xl font-black text-blue-900 mt-2">{topRevenueSource.name}</h3>
                  <p className="text-sm text-blue-700 font-bold mt-1">{formatCurrency(topRevenueSource.value)}</p>
                </div>
                <div className="bg-orange-50 p-6 rounded-xl border border-orange-100">
                  <p className="text-orange-800 text-sm font-bold mb-1">Total Outstanding Debt</p>
                  <h3 className="text-3xl font-black text-orange-900">{formatCurrency(outstandingAmount)}</h3>
                  <p className="text-xs text-orange-600 mt-2 font-medium bg-orange-100 inline-block px-2 py-0.5 rounded-md">Accumulated total</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
                <div className="border border-gray-100 rounded-xl p-6 shadow-sm bg-white">
                  <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2"><BarChart2 className="w-5 h-5 text-emerald-600"/> Revenue Distribution</h3>
                  {revenueData.length > 0 ? (
                    <>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={revenueData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {revenueData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => formatCurrency(value)} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-wrap justify-center gap-4 mt-4">
                        {revenueData.map((entry, index) => (
                          <div key={index} className="flex items-center gap-2 text-sm font-medium text-gray-600">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                            {entry.name}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="h-64 flex items-center justify-center text-gray-400 font-medium">No revenue data for this period</div>
                  )}
                </div>

                <div className="border border-gray-100 rounded-xl p-6 shadow-sm bg-white">
                  <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2"><Banknote className="w-5 h-5 text-blue-600"/> Recent Transactions</h3>
                  <div className="space-y-4">
                    {recentTransactions.length > 0 ? recentTransactions.map((tx, i) => (
                      <div key={i} className="flex justify-between items-center pb-3 border-b border-gray-50 last:border-0 last:pb-0">
                        <div>
                          <p className="font-bold text-gray-900 text-sm">{tx.member || 'Unknown'} - {tx.type}</p>
                          <p className="text-xs text-gray-500">{tx.date} • {tx.official}</p>
                        </div>
                        <span className="font-bold text-emerald-700 text-sm">+{formatCurrency(tx.amount)}</span>
                      </div>
                    )) : (
                      <p className="text-gray-400 text-sm text-center py-8 font-medium">No recent transactions</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : reportType === 'members' ? (
             <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-emerald-50 p-6 rounded-xl border border-emerald-100">
                    <p className="text-emerald-800 text-sm font-bold mb-1">Total Active Members</p>
                    <h3 className="text-3xl font-black text-emerald-900">{activeMembers}</h3>
                  </div>
                  <div className="bg-red-50 p-6 rounded-xl border border-red-100">
                    <p className="text-red-800 text-sm font-bold mb-1">Suspended/Inactive</p>
                    <h3 className="text-3xl font-black text-red-900">{inactiveMembers}</h3>
                  </div>
                  <div className="bg-blue-50 p-6 rounded-xl border border-blue-100">
                    <p className="text-blue-800 text-sm font-bold mb-1">New Registrations</p>
                    <h3 className="text-3xl font-black text-blue-900">{newRegistrations}</h3>
                    <p className="text-xs text-blue-600 mt-2 font-medium bg-blue-100 inline-block px-2 py-0.5 rounded-md">Based on selected timeframe</p>
                  </div>
                </div>

                <div className="border border-gray-100 rounded-xl p-6 shadow-sm mt-8 bg-white">
                  <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2"><Users className="w-5 h-5 text-emerald-600"/> Registration History (Last 6 Months)</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={registrationData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} />
                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} />
                        <Tooltip cursor={{fill: '#f9fafb'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                        <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
             </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {officialStats.map((off, index) => (
                  <div key={index} className="border border-gray-200 rounded-xl p-5 bg-white shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                        {off.fullName ? off.fullName.charAt(0) : 'O'}
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900 text-sm">{off.fullName || off.name}</h4>
                        <p className="text-xs text-gray-500 capitalize">{off.role}</p>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">Revenue Collected</span>
                        <span className="font-bold text-emerald-600">{formatCurrency(off.collectedAmount)}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">Transactions</span>
                        <span className="font-bold text-gray-900">{off.transactionCount}</span>
                      </div>
                      
                      <div className="pt-3 border-t border-gray-100">
                        <div className="flex justify-between items-center text-sm mb-1">
                          <span className="text-gray-500">Task Completion</span>
                          <span className="font-bold text-blue-600">{off.completionRate}%</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${off.completionRate}%` }}></div>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1 text-right">{off.assignedTasks} total assigned</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              {officialStats.length === 0 && (
                <div className="text-center py-16">
                   <ShieldAlert className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                   <h3 className="text-xl font-bold text-gray-900 mb-2">No Officials Data</h3>
                   <p className="text-gray-500">There are no recorded transactions or tasks for the selected period.</p>
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      </div>
    </MarketLayout>
  );
}
