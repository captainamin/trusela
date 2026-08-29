import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import MarketLayout from '../../components/MarketLayout';
import { useUser } from '../../contexts/UserContext';
import { 
  Users, ShieldCheck, Banknote, ClipboardList, 
  TrendingUp, Activity, UserPlus, AlertCircle, Search, Filter, Bell,
  ScanLine, CheckCircle2, XCircle, X, MoreVertical, Printer, Download, Receipt, Calendar
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line
} from 'recharts';
import axios from 'axios';
import { toast } from 'sonner';
import MarketAvatar from '../../components/MarketAvatar';
import { Html5QrcodeScanner } from 'html5-qrcode';
import logo from '../../assets/logo.png';
import { toJpeg } from 'html-to-image';
import jsPDF from 'jspdf';

export default function MarketDashboard() {
  const { user, metadata } = useUser();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeTab, setActiveTab] = useState<'overview' | 'defaulters'>('overview');
  
  const [stats, setStats] = useState({
    totalMembers: 0,
    officials: 0,
    revenueToday: 0,
    revenueMonth: 0,
    pendingTasks: 0,
    completedTasks: 0,
    totalDefaulters: 0
  });

  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [registrationData, setRegistrationData] = useState<any[]>([]);
  const [recentCollections, setRecentCollections] = useState<any[]>([]);
  const [pendingTasksList, setPendingTasksList] = useState<any[]>([]);
  
  // Defaulters specific state
  const [defaulters, setDefaulters] = useState<any[]>([]);
  const [uniqueCategories, setUniqueCategories] = useState<string[]>([]);
  const [activeRevenueTypes, setActiveRevenueTypes] = useState<any[]>([]);
  const [selectedDefaulter, setSelectedDefaulter] = useState<any>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);

  const [defaulterFilters, setDefaulterFilters] = useState({
    category: '',
    revenueType: '',
    search: ''
  });

  // QR Scanner specific state
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [scannedMember, setScannedMember] = useState<any>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  useEffect(() => {
    if (!user) return;

    const fetchDashboardData = async () => {
      try {
        const [membersRes, officialsRes, collectionsRes, tasksRes, revenueTypesRes] = await Promise.all([
          axios.get(`/api/market/members/${user.uid}`).catch(() => ({ data: [] })),
          axios.get(`/api/market/officials/${user.uid}`).catch(() => ({ data: [] })),
          axios.get(`/api/market/collections/${user.uid}`).catch(() => ({ data: [] })),
          axios.get(`/api/market/tasks/${user.uid}`).catch(() => ({ data: [] })),
          axios.get(`/api/market/revenue-types/${user.uid}`).catch(() => ({ data: [] }))
        ]);

        const members = membersRes.data || [];
        const officials = officialsRes.data || [];
        const collections = collectionsRes.data || [];
        const tasks = tasksRes.data || [];
        const revenueTypes = revenueTypesRes.data || [];

        // Parse collection dates reliably
        const collectionsWithDate = collections.map((c: any) => {
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

        // Processing Stats
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        let revToday = 0;
        let revMonth = 0;

        collectionsWithDate.forEach((c: any) => {
          const amount = Number(c.amount) || 0;
          if (c.parsedDate >= startOfToday) {
            revToday += amount;
          }
          if (c.parsedDate >= startOfMonth) {
            revMonth += amount;
          }
        });

        const pending = tasks.filter((t: any) => t.status !== 'Completed');
        const completed = tasks.filter((t: any) => t.status === 'Completed');

        // Extract Unique Categories
        const categories = Array.from(new Set(members.map((m: any) => m.businessType).filter(Boolean))) as string[];
        setUniqueCategories(categories);
        
        const activeRevTypes = revenueTypes.filter((rt: any) => rt.status === 'Active');
        setActiveRevenueTypes(activeRevTypes);

        // Calculate Defaulters
        const getStartOfPeriod = (frequency: string) => {
          const d = new Date();
          if (frequency === 'Daily') {
            return new Date(d.getFullYear(), d.getMonth(), d.getDate());
          }
          if (frequency === 'Weekly') {
            const day = d.getDay() || 7; 
            if (day !== 1) d.setHours(-24 * (day - 1)); 
            return new Date(d.getFullYear(), d.getMonth(), d.getDate());
          }
          if (frequency === 'Monthly') {
            return new Date(d.getFullYear(), d.getMonth(), 1);
          }
          if (frequency === 'Yearly') {
            return new Date(d.getFullYear(), 0, 1);
          }
          return new Date(0);
        };

        const currentDefaultersList: any[] = [];
        const defaultMemberIds = new Set();

        members.forEach((member: any) => {
          if (member.status !== 'Active') return;

          activeRevTypes.forEach((rt: any) => {
            const startOfPeriod = getStartOfPeriod(rt.frequency);
            
            const hasPaid = collectionsWithDate.some((c: any) => 
              c.member === member.id && 
              c.type === rt.name && 
              c.parsedDate >= startOfPeriod
            );

            if (!hasPaid) {
              defaultMemberIds.add(member.id);
              currentDefaultersList.push({
                member,
                revenueType: rt,
                amountDue: rt.amount,
                periodStart: startOfPeriod
              });
            }
          });
        });
        const aggregatedDefaulters = Object.values(currentDefaultersList.reduce((acc: any, curr: any) => {
          if (!acc[curr.member.id]) {
            acc[curr.member.id] = {
              member: curr.member,
              defaults: [],
              totalAmountDue: 0
            };
          }
          acc[curr.member.id].defaults.push(curr);
          acc[curr.member.id].totalAmountDue += Number(curr.amountDue || 0);
          return acc;
        }, {}));

        setDefaulters(aggregatedDefaulters);
        setStats({
          totalMembers: members.length,
          officials: officials.filter((o: any) => o.status !== 'Inactive').length,
          revenueToday: revToday,
          revenueMonth: revMonth,
          pendingTasks: pending.length,
          completedTasks: completed.length,
          totalDefaulters: defaultMemberIds.size
        });

        const recentCols = [...collections].reverse().slice(0, 3);
        setRecentCollections(recentCols);

        const pendingList = [...pending].reverse().slice(0, 2);
        setPendingTasksList(pendingList);

        const last7Days = Array.from({length: 7}, (_, i) => {
          const d = new Date();
          d.setDate(now.getDate() - (6 - i));
          return d;
        });

        const revChart = last7Days.map(d => {
           const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
           const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
           const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
           
           const dayTotal = collectionsWithDate
             .filter((c: any) => c.parsedDate >= dayStart && c.parsedDate < dayEnd)
             .reduce((sum: number, c: any) => sum + (Number(c.amount) || 0), 0);
             
           return { name: dayName, amount: dayTotal };
        });
        setRevenueData(revChart);

        const regChart = [];
        for (let i = 3; i >= 0; i--) {
           const weekStart = new Date();
           weekStart.setDate(now.getDate() - (i * 7 + 7));
           const weekEnd = new Date();
           weekEnd.setDate(now.getDate() - (i * 7));
           
           const count = members.filter((m: any) => {
             if (!m.registrationDate) return false;
             const d = new Date(m.registrationDate);
             return d >= weekStart && d <= weekEnd;
           }).length;
           
           regChart.push({
             name: `Week ${4 - i}`,
             users: count
           });
        }
        setRegistrationData(regChart);

      } catch (error) {
        console.error("Dashboard fetch error:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [user, refreshTrigger]);

  // QR Scanner Effect
  useEffect(() => {
    if (showQRScanner && !scannedMember) {
      const scanner = new Html5QrcodeScanner(
        "defaulter-qr-reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        false
      );

      scanner.render(
        (decodedText) => {
          try {
            const data = JSON.parse(decodedText);
            if (data.type === 'market_member' && data.memberId) {
              scanner.clear();
              handleScannedMember(data.memberId);
            } else {
              toast.error("Invalid QR code format");
            }
          } catch (e) {
            toast.error("Unrecognized QR code format");
          }
        },
        (error) => {
          // Ignore general scan errors
        }
      );

      return () => {
        scanner.clear().catch(e => console.error("Failed to clear scanner", e));
      };
    }
  }, [showQRScanner, scannedMember]);

  const handleScannedMember = (memberId: string) => {
    const memberDefaults = defaulters.filter(d => d.member.id === memberId);
    if (memberDefaults.length === 0) {
      toast.success("This member has no outstanding debts!");
      setShowQRScanner(false);
      return;
    }

    const totalDebt = memberDefaults.reduce((sum, d) => sum + d.amountDue, 0);
    setScannedMember({
      member: memberDefaults[0].member,
      defaults: memberDefaults,
      totalDebt
    });
  };

  const clearScannedDebt = async () => {
    if (!user || !scannedMember) return;
    setIsProcessingPayment(true);

    try {
      // Process all defaulted revenue types for this member
      const promises = scannedMember.defaults.map((d: any) => {
        return axios.post('/api/market/collections', {
          userId: user.uid,
          memberId: scannedMember.member.id,
          officialId: user.displayName || 'Admin',
          typeId: d.revenueType.id,
          typeName: d.revenueType.name,
          amount: d.amountDue,
          prefix: d.revenueType.prefix || 'PAY'
        });
      });

      await Promise.all(promises);
      toast.success(`Successfully cleared ₦${scannedMember.totalDebt.toLocaleString()} debt!`);
      
      setScannedMember(null);
      setShowQRScanner(false);
      setRefreshTrigger(prev => prev + 1); // Refresh dashboard data
    } catch (error) {
      console.error(error);
      toast.error("Failed to process payment");
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleClearDebts = async (defaulter: any) => {
    if (!user) return;
    toast.info(`Processing clearance for ${defaulter.member.fullName}...`);
    try {
      const promises = defaulter.defaults.map((d: any) => {
        return axios.post('/api/market/collections', {
          userId: user.uid,
          memberId: defaulter.member.id,
          officialId: user.displayName || 'Admin',
          typeId: d.revenueType.id,
          typeName: d.revenueType.name,
          amount: d.amountDue,
          prefix: d.revenueType.prefix || 'PAY'
        });
      });
      await Promise.all(promises);
      toast.success(`Successfully cleared ₦${defaulter.totalAmountDue.toLocaleString()} debt!`);
      
      const ref = `CLR-${Math.floor(100000 + Math.random() * 900000)}`;
      setReceiptData({
        marketName: user.displayName || 'Market',
        memberName: defaulter.member.fullName,
        memberId: defaulter.member.id,
        items: defaulter.defaults.map((d: any) => ({ name: d.revenueType.name, amount: d.amountDue, period: d.periodStart })),
        totalAmount: defaulter.totalAmountDue,
        date: new Date().toLocaleString(),
        ref
      });
      
      setSelectedDefaulter(null);
      setRefreshTrigger(prev => prev + 1);
    } catch (error) {
      console.error(error);
      toast.error("Failed to process payment");
    }
  };


  const generateDefaulterReport = async (defaulter: any) => {
    setIsGeneratingReport(true);
    toast.info("Generating report...");
    setTimeout(async () => {
      try {
        const el = document.getElementById('defaulter-report-container');
        if (!el) {
          toast.error("Report template not found");
          setIsGeneratingReport(false);
          return;
        }
        
        // Filter out stylesheet nodes that contain oklch() — unsupported by html-to-image's CSS parser
        // (Tailwind CSS v4 uses oklch for its color palette)
        const filterOklch = (node: HTMLElement) => {
          if (node.tagName === 'STYLE' && node.textContent?.includes('oklch')) return false;
          if (node.tagName === 'LINK' && (node as HTMLLinkElement).rel === 'stylesheet') return false;
          return true;
        };

        const imgData = await toJpeg(el, {
          quality: 0.95,
          pixelRatio: 2,
          backgroundColor: '#ffffff',
          filter: filterOklch,
          style: { transform: 'scale(1)', transformOrigin: 'top left' },
        });
        if (!imgData) throw new Error("Image rendering failed");
        
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (el.offsetHeight * pdfWidth) / el.offsetWidth;
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`Defaulting_Report_${defaulter.member.fullName.replace(/\s+/g, '_')}.pdf`);
        toast.success("Report generated successfully!");
        setIsGeneratingReport(false);
      } catch (err: any) {
        console.error("PDF Generation Error:", err);
        toast.error(`Failed to generate report: ${err.message || 'Unknown error'}`);
        setIsGeneratingReport(false);
      }
    }, 500);
  };


  const closeScanner = () => {
    setScannedMember(null);
    setShowQRScanner(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
  };

  const handleSendReminder = (memberId: string) => {
    toast.success(`Reminder scheduled for member ${memberId}`);
  };

  const filteredDefaulters = defaulters.filter(d => {
    const matchCat = defaulterFilters.category ? d.member.businessType === defaulterFilters.category : true;
    const matchRev = defaulterFilters.revenueType ? d.defaults.some((df: any) => df.revenueType.name === defaulterFilters.revenueType) : true;
    const matchSearch = defaulterFilters.search 
      ? d.member.fullName.toLowerCase().includes(defaulterFilters.search.toLowerCase()) || 
        d.member.id.toLowerCase().includes(defaulterFilters.search.toLowerCase()) ||
        d.member.shopNumber.toLowerCase().includes(defaulterFilters.search.toLowerCase())
      : true;
    return matchCat && matchRev && matchSearch;
  });

  const StatCard = ({ title, value, icon: Icon, trend, color, link }: any) => (
    <div 
      className={`bg-white rounded-xl p-6 shadow-sm border border-emerald-50 hover:shadow-md transition-all ${link ? 'cursor-pointer hover:-translate-y-1' : ''}`}
      onClick={() => link && navigate(link)}
    >
      <div className="flex justify-between items-start">
        <div>
          <p className="text-gray-500 text-sm font-medium">{title}</p>
          <h3 className="text-2xl font-bold text-gray-900 mt-2">{value}</h3>
        </div>
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
      {trend && (
        <div className="mt-4 flex items-center text-sm">
          <TrendingUp className="w-4 h-4 text-emerald-500 mr-1" />
          <span className="text-emerald-500 font-medium">{trend}%</span>
          <span className="text-gray-400 ml-2">vs last month</span>
        </div>
      )}
    </div>
  );

  return (
    <MarketLayout title="Market Dashboard">
      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6 space-x-8">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-4 text-sm font-bold transition-colors relative ${
            activeTab === 'overview' ? 'text-emerald-700' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Overview
          {activeTab === 'overview' && (
            <span className="absolute bottom-0 left-0 w-full h-1 bg-emerald-600 rounded-t-md"></span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('defaulters')}
          className={`pb-4 text-sm font-bold transition-colors relative flex items-center gap-2 ${
            activeTab === 'defaulters' ? 'text-emerald-700' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Defaulters List
          {stats.totalDefaulters > 0 && (
            <span className="bg-red-100 text-red-600 py-0.5 px-2 rounded-full text-[10px]">
              {stats.totalDefaulters}
            </span>
          )}
          {activeTab === 'defaulters' && (
            <span className="absolute bottom-0 left-0 w-full h-1 bg-emerald-600 rounded-t-md"></span>
          )}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-900"></div>
        </div>
      ) : activeTab === 'overview' ? (
        <div className="space-y-6">
          
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard 
              title="Total Members" 
              value={stats.totalMembers.toLocaleString()} 
              icon={Users} 
              color="bg-blue-50 text-blue-600"
              link="/market/members"
            />
            <StatCard 
              title="Revenue Today" 
              value={formatCurrency(stats.revenueToday)} 
              icon={Banknote} 
              color="bg-emerald-50 text-emerald-600"
              link="/market/revenue"
            />
            <StatCard 
              title="Active Officials" 
              value={stats.officials} 
              icon={ShieldCheck} 
              color="bg-purple-50 text-purple-600"
              link="/market/officials"
            />
            <StatCard 
              title="Pending Tasks" 
              value={stats.pendingTasks} 
              icon={ClipboardList} 
              color="bg-orange-50 text-orange-600"
              link="/market/tasks"
            />
            <div 
              className="bg-white rounded-xl p-6 shadow-sm border border-red-100 hover:shadow-md transition-all cursor-pointer hover:-translate-y-1"
              onClick={() => setActiveTab('defaulters')}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-gray-500 text-sm font-medium">Defaulters</p>
                  <h3 className="text-2xl font-bold text-red-600 mt-2">{stats.totalDefaulters}</h3>
                </div>
                <div className="p-3 rounded-lg bg-red-50 text-red-600">
                  <AlertCircle className="w-6 h-6" />
                </div>
              </div>
              <div className="mt-4 flex items-center text-xs font-medium text-red-500">
                <span>Missing payments in current period</span>
              </div>
            </div>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-emerald-50">
              <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center">
                <Activity className="w-5 h-5 mr-2 text-emerald-600" />
                Revenue Trend (7 Days)
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0fdf4" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} tickFormatter={(value) => `₦${value/1000}k`} />
                    <Tooltip 
                      cursor={{fill: '#f0fdf4'}}
                      contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                    />
                    <Bar dataKey="amount" fill="#059669" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-emerald-50">
              <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center">
                <UserPlus className="w-5 h-5 mr-2 text-blue-600" />
                Registration Trend (4 Weeks)
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={registrationData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eff6ff" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} />
                    <Tooltip 
                      contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                    />
                    <Line type="monotone" dataKey="users" stroke="#2563eb" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} activeDot={{r: 6}} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Recent Activity Sections */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
             <div className="bg-white p-6 rounded-xl shadow-sm border border-emerald-50">
               <div className="flex justify-between items-center mb-4">
                 <h3 className="text-lg font-bold text-gray-900">Recent Collections</h3>
                 <button className="text-emerald-600 text-sm font-medium hover:underline">View All</button>
               </div>
               <div className="space-y-4">
                 {recentCollections.length > 0 ? recentCollections.map((col, i) => (
                   <div key={i} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors border border-gray-100">
                     <div className="flex items-center gap-3">
                       <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold overflow-hidden">
                         <MarketAvatar photoUrl={col.photoUrl} fullName={col.member || `M${i}`} className="w-full h-full" fallbackClassName="bg-emerald-100 text-emerald-600 text-sm" />
                       </div>
                       <div>
                         <p className="text-sm font-bold text-gray-900">{col.member || 'Unknown Member'}</p>
                         <p className="text-xs text-gray-500">{col.type} • {col.official}</p>
                       </div>
                     </div>
                     <div className="text-right">
                       <p className="text-sm font-bold text-emerald-600">+{formatCurrency(col.amount)}</p>
                       <p className="text-xs text-gray-400">{col.time || col.date}</p>
                     </div>
                   </div>
                 )) : (
                   <p className="text-sm text-gray-500 text-center py-4">No recent collections</p>
                 )}
               </div>
             </div>

             <div className="bg-white p-6 rounded-xl shadow-sm border border-emerald-50">
               <div className="flex justify-between items-center mb-4">
                 <h3 className="text-lg font-bold text-gray-900">Pending Tasks</h3>
                 <button className="text-emerald-600 text-sm font-medium hover:underline">View All</button>
               </div>
               <div className="space-y-4">
                 {pendingTasksList.length > 0 ? pendingTasksList.map((task, i) => (
                   <div key={i} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors border border-gray-100">
                     <div className="flex items-center gap-3">
                       <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600">
                         <ClipboardList className="w-5 h-5" />
                       </div>
                       <div>
                         <p className="text-sm font-bold text-gray-900">{task.title}</p>
                         <p className="text-xs text-gray-500">Assigned to: {task.assignedTo || 'Unassigned'}</p>
                       </div>
                     </div>
                     <span className={`px-2 py-1 text-[10px] font-bold rounded uppercase ${
                        task.priority === 'High' ? 'bg-red-50 text-red-600' : 
                        task.priority === 'Medium' ? 'bg-yellow-50 text-yellow-600' : 
                        'bg-blue-50 text-blue-600'
                     }`}>
                       {task.priority || 'Normal'}
                     </span>
                   </div>
                 )) : (
                   <p className="text-sm text-gray-500 text-center py-4">No pending tasks</p>
                 )}
               </div>
             </div>
          </div>

        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-red-100 overflow-hidden">
            
            {/* Toolbar */}
            <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row gap-4 justify-between items-center bg-gray-50/50">
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input 
                  type="text" 
                  placeholder="Search defaulters by name or shop..." 
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none text-sm"
                  value={defaulterFilters.search}
                  onChange={(e) => setDefaulterFilters({...defaulterFilters, search: e.target.value})}
                />
              </div>
              
              <div className="flex w-full md:w-auto gap-3">
                <div className="relative flex-1 md:flex-none">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <select 
                    className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none text-sm appearance-none bg-white"
                    value={defaulterFilters.category}
                    onChange={(e) => setDefaulterFilters({...defaulterFilters, category: e.target.value})}
                  >
                    <option value="">All Categories</option>
                    {uniqueCategories.map((cat, i) => (
                      <option key={i} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                
                <div className="relative flex-1 md:flex-none">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <select 
                    className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none text-sm appearance-none bg-white"
                    value={defaulterFilters.revenueType}
                    onChange={(e) => setDefaulterFilters({...defaulterFilters, revenueType: e.target.value})}
                  >
                    <option value="">All Revenue Types</option>
                    {activeRevenueTypes.map((rt: any) => (
                      <option key={rt.id} value={rt.name}>{rt.name}</option>
                    ))}
                  </select>
                </div>

                <button 
                  onClick={() => setShowQRScanner(true)}
                  className="flex-none flex items-center justify-center gap-2 px-4 py-2 bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 text-sm font-bold shadow-sm hover:shadow transition-all"
                >
                  <ScanLine className="w-4 h-4" />
                  <span className="hidden sm:inline">Scan to Clear Debt</span>
                  <span className="sm:hidden">Scan</span>
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto min-h-[300px]">
              {filteredDefaulters.length === 0 ? (
                <div className="text-center py-16 px-4 flex flex-col items-center">
                   <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
                     <ShieldCheck className="w-8 h-8 text-emerald-500" />
                   </div>
                   <h3 className="text-lg font-bold text-gray-900 mb-2">No Defaulters Found</h3>
                   <p className="text-gray-500">Everyone is up to date with their payments based on the current filters.</p>
                </div>
              ) : (
                <table className="w-full text-left text-sm text-gray-600">
                  <thead className="text-xs text-gray-700 uppercase bg-red-50/50 border-b border-red-100">
                    <tr>
                      <th className="px-6 py-4 font-bold">Member Details</th>
                      <th className="px-6 py-4 font-bold">Category & Shop</th>
                      <th className="px-6 py-4 font-bold">Missing Payment</th>
                      <th className="px-6 py-4 font-bold">Amount Due</th>
                      <th className="px-6 py-4 text-right font-bold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDefaulters.map((d, index) => (
                      <tr key={index} className="border-b border-gray-50 hover:bg-red-50/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold overflow-hidden">
                              <MarketAvatar photoUrl={d.member.photoUrl} fullName={d.member.fullName} className="w-full h-full" fallbackClassName="bg-gray-100 text-gray-600 text-sm" />
                            </div>
                            <div>
                              <p className="font-bold text-gray-900">{d.member.fullName}</p>
                              <p className="text-xs text-gray-500">{d.member.id} • {d.member.phone}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-medium text-gray-900">{d.member.businessType}</p>
                          <p className="text-xs text-gray-500">Shop: {d.member.shopNumber}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700">
                            {d.defaults.length} Missed Payment{d.defaults.length !== 1 ? 's' : ''}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-bold text-red-600">{formatCurrency(d.totalAmountDue)}</p>
                        </td>
                        <td className="px-6 py-4 text-right relative">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => setSelectedDefaulter(d)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-bold transition-colors"
                            >
                              View Details
                            </button>
                            <button 
                              onClick={() => handleSendReminder(d.member.id)}
                              className="inline-flex items-center justify-center p-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                              title="Send Reminder"
                            >
                              <Bell className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* QR Scanner Modal */}
      {showQRScanner && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-4 bg-emerald-900 text-white flex justify-between items-center">
              <h3 className="font-bold flex items-center gap-2">
                <ScanLine className="w-5 h-5" />
                Scan to Clear Debt
              </h3>
              <button onClick={closeScanner} className="text-emerald-100 hover:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6">
              {!scannedMember ? (
                <div>
                  <p className="text-sm text-gray-500 mb-4 text-center">Scan a member's ID card QR code to view and clear their total outstanding debt.</p>
                  <div id="defaulter-qr-reader" className="w-full rounded-xl overflow-hidden border-2 border-emerald-100"></div>
                </div>
              ) : (
                <div className="text-center">
                  <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertCircle className="w-10 h-10" />
                  </div>
                  <h4 className="text-xl font-bold text-gray-900 mb-1">{scannedMember.member.fullName}</h4>
                  <p className="text-sm text-gray-500 mb-6">{scannedMember.member.id} • {scannedMember.member.shopNumber}</p>
                  
                  <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left border border-gray-100">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Outstanding Debts</p>
                    <div className="space-y-2 mb-4">
                      {scannedMember.defaults.map((d: any, i: number) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">{d.revenueType.name}</span>
                          <span className="font-bold text-red-600">{formatCurrency(d.amountDue)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="pt-3 border-t border-gray-200 flex justify-between items-center">
                      <span className="font-bold text-gray-900">Total Debt</span>
                      <span className="text-lg font-bold text-red-600">{formatCurrency(scannedMember.totalDebt)}</span>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button 
                      onClick={closeScanner}
                      disabled={isProcessingPayment}
                      className="flex-1 py-3 border border-gray-200 text-gray-700 rounded-xl font-bold hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={clearScannedDebt}
                      disabled={isProcessingPayment}
                      className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isProcessingPayment ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <>
                          <CheckCircle2 className="w-5 h-5" />
                          Clear All
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    

      {/* Defaulter Details Modal */}
      {selectedDefaulter && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 bg-emerald-900 text-white flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold flex items-center gap-2"><AlertCircle className="w-5 h-5" /> Defaulter Details</h2>
              <button onClick={() => setSelectedDefaulter(null)} className="text-white/70 hover:text-white p-1 bg-white/10 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-100">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold overflow-hidden shadow-sm shrink-0">
                  <MarketAvatar photoUrl={selectedDefaulter.member.photoUrl} fullName={selectedDefaulter.member.fullName} className="w-full h-full" fallbackClassName="bg-emerald-100 text-emerald-600 text-2xl" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900">{selectedDefaulter.member.fullName}</h3>
                  <p className="text-sm text-gray-500">ID: {selectedDefaulter.member.id} • {selectedDefaulter.member.phone}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{selectedDefaulter.member.businessType}</p>
                  <p className="text-xs text-gray-500">Shop: {selectedDefaulter.member.shopNumber}</p>
                </div>
              </div>

              <div className="mb-2 flex justify-between items-end">
                <h4 className="font-bold text-gray-900">Defaulted Revenues ({selectedDefaulter.defaults.length})</h4>
              </div>
              
              <div className="space-y-3 mb-6">
                {selectedDefaulter.defaults.map((d: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center p-3 bg-red-50/50 rounded-lg border border-red-100">
                    <div>
                      <p className="font-bold text-red-900">{d.revenueType.name}</p>
                      <p className="text-xs text-red-600 flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3 h-3" /> 
                        Since: {new Date(d.periodStart).toLocaleDateString()}
                      </p>
                    </div>
                    <p className="font-bold text-red-700">{formatCurrency(d.amountDue)}</p>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center p-4 bg-gray-50 rounded-xl border border-gray-200">
                <span className="font-black text-gray-700">TOTAL AMOUNT DUE</span>
                <span className="text-2xl font-black text-red-600">{formatCurrency(selectedDefaulter.totalAmountDue)}</span>
              </div>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center shrink-0">
              <button 
                onClick={() => generateDefaulterReport(selectedDefaulter)}
                disabled={isGeneratingReport}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-bold disabled:opacity-50 transition-colors shadow-sm"
              >
                {isGeneratingReport ? <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div> : <Download className="w-4 h-4" />}
                Report (PDF)
              </button>
              
              <button 
                onClick={() => handleClearDebts(selectedDefaulter)}
                className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-bold transition-colors shadow-md hover:shadow-lg"
              >
                <CheckCircle2 className="w-5 h-5" />
                Clear All Debts
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Templates for Export */}
      <div style={{ position: 'absolute', top: '-10000px', left: '-10000px', zIndex: -50 }}>
        {/* Thermal Clearance Receipt */}
        {receiptData && (
          <div id="thermal-clearance-receipt-container" style={{ position: 'relative', overflow: 'hidden',
            width: '384px',
            backgroundColor: '#fff',
            color: '#000',
            padding: '20px',
            fontFamily: 'monospace',
            fontSize: '14px',
            lineHeight: '1.4'
          }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', opacity: 0.05, pointerEvents: 'none', zIndex: 0 }}>
              <img src={metadata?.marketSettings?.logoUrl || logo} alt="Watermark" style={{ width: '250px', height: '250px', objectFit: 'contain' }} crossOrigin="anonymous" />
            </div>
            <div style={{ textAlign: 'center', marginBottom: '15px', position: 'relative', zIndex: 1 }}>
              <img src={metadata?.marketSettings?.logoUrl || logo} alt="Logo" style={{ width: '40px', height: '40px', objectFit: 'contain', margin: '0 auto 10px auto' }} crossOrigin="anonymous" />
              <h2 style={{ fontSize: '20px', margin: '0 0 5px 0', fontWeight: 'bold' }}>{metadata?.marketSettings?.name || receiptData.marketName}</h2>
              <p style={{ margin: '0', fontSize: '12px' }}>Clearance Receipt</p>
            </div>
            
            <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '10px 0', marginBottom: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>Date:</span>
                <span>{receiptData.date}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>Ref:</span>
                <span>{receiptData.ref}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Official:</span>
                <span>{user?.displayName || 'Admin'}</span>
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <span>Member:</span>
                <span style={{ fontWeight: 'bold' }}>{receiptData.memberName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span>Member ID:</span>
                <span>{receiptData.memberId}</span>
              </div>
              <div style={{ borderBottom: '1px dotted #ccc', margin: '10px 0' }}></div>
              <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>Cleared Items:</div>
              {receiptData.items.map((item: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span>{item.name}</span>
                  <span>₦{Number(item.amount).toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div style={{ borderTop: '1px solid #000', paddingTop: '10px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 'bold' }}>
                <span>TOTAL PAID:</span>
                <span>₦{Number(receiptData.totalAmount).toLocaleString()}</span>
              </div>
            </div>

            <div style={{ textAlign: 'center', fontSize: '12px', marginTop: '20px' }}>
              <p style={{ margin: '0 0 5px 0' }}>Thank you for your payment!</p>
              <p style={{ margin: '0' }}>Powered by Trusela</p>
            </div>
          </div>
        )}

        {/* A4 Defaulter Report */}
        {selectedDefaulter && (
          <div id="defaulter-report-container" style={{ position: 'relative', overflow: 'hidden',
            width: '794px',
            minHeight: '1123px',
            backgroundColor: '#ffffff',
            padding: '75px',
            color: '#111827',
            fontFamily: 'sans-serif'
          }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', opacity: 0.04, pointerEvents: 'none', zIndex: 0 }}>
              <img src={metadata?.marketSettings?.logoUrl || logo} alt="Watermark" style={{ width: '600px', height: '600px', objectFit: 'contain' }} crossOrigin="anonymous" />
            </div>
            
            <div style={{ borderBottom: '2px solid #059669', paddingBottom: '20px', marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <img src={metadata?.marketSettings?.logoUrl || logo} alt="Logo" style={{ width: '70px', height: '70px', objectFit: 'contain' }} crossOrigin="anonymous" />
                <div>
                  <h1 style={{ fontSize: '28px', fontWeight: '900', color: '#064e3b', margin: '0 0 5px 0' }}>{metadata?.marketSettings?.name || 'Market Administration'}</h1>
                  <h2 style={{ fontSize: '18px', color: '#6b7280', margin: '0', textTransform: 'uppercase', letterSpacing: '1px' }}>Official Defaulting Report</h2>
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '12px', color: '#4b5563' }}>
                <p style={{ margin: '0 0 3px 0' }}><strong>Generated Date:</strong> {new Date().toLocaleDateString()}</p>
                <p style={{ margin: '0 0 3px 0' }}><strong>Generated By:</strong> {user?.displayName}</p>
                <p style={{ margin: '0' }}><strong>Report ID:</strong> REP-{Math.floor(Math.random() * 900000) + 100000}</p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '30px', marginBottom: '40px' }}>
              <div style={{ flex: 1, backgroundColor: '#f9fafb', padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                <h3 style={{ fontSize: '14px', textTransform: 'uppercase', color: '#6b7280', margin: '0 0 15px 0', letterSpacing: '1px', borderBottom: '1px solid #e5e7eb', paddingBottom: '8px' }}>Member Information</h3>
                <table style={{ width: '100%', fontSize: '14px' }}>
                  <tbody>
                    <tr><td style={{ padding: '5px 0', color: '#6b7280', width: '120px' }}>Full Name:</td><td style={{ fontWeight: 'bold' }}>{selectedDefaulter.member.fullName}</td></tr>
                    <tr><td style={{ padding: '5px 0', color: '#6b7280' }}>Member ID:</td><td style={{ fontWeight: 'bold' }}>{selectedDefaulter.member.id}</td></tr>
                    <tr><td style={{ padding: '5px 0', color: '#6b7280' }}>Phone:</td><td style={{ fontWeight: 'bold' }}>{selectedDefaulter.member.phone}</td></tr>
                  </tbody>
                </table>
              </div>
              <div style={{ flex: 1, backgroundColor: '#f9fafb', padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                <h3 style={{ fontSize: '14px', textTransform: 'uppercase', color: '#6b7280', margin: '0 0 15px 0', letterSpacing: '1px', borderBottom: '1px solid #e5e7eb', paddingBottom: '8px' }}>Business Details</h3>
                <table style={{ width: '100%', fontSize: '14px' }}>
                  <tbody>
                    <tr><td style={{ padding: '5px 0', color: '#6b7280', width: '120px' }}>Category:</td><td style={{ fontWeight: 'bold' }}>{selectedDefaulter.member.businessType}</td></tr>
                    <tr><td style={{ padding: '5px 0', color: '#6b7280' }}>Shop No:</td><td style={{ fontWeight: 'bold' }}>{selectedDefaulter.member.shopNumber}</td></tr>
                    <tr><td style={{ padding: '5px 0', color: '#6b7280' }}>Status:</td><td><span style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>Defaulter</span></td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#111827', margin: '0 0 15px 0' }}>Outstanding Debts Statement</h3>
            
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f3f4f6' }}>
                  <th style={{ textAlign: 'left', padding: '12px 15px', borderBottom: '2px solid #e5e7eb', color: '#374151' }}>No.</th>
                  <th style={{ textAlign: 'left', padding: '12px 15px', borderBottom: '2px solid #e5e7eb', color: '#374151' }}>Revenue Description</th>
                  <th style={{ textAlign: 'left', padding: '12px 15px', borderBottom: '2px solid #e5e7eb', color: '#374151' }}>Missing Since</th>
                  <th style={{ textAlign: 'right', padding: '12px 15px', borderBottom: '2px solid #e5e7eb', color: '#374151' }}>Amount (₦)</th>
                </tr>
              </thead>
              <tbody>
                {selectedDefaulter.defaults.map((d: any, index: number) => (
                  <tr key={index} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '15px', color: '#6b7280' }}>{index + 1}</td>
                    <td style={{ padding: '15px', fontWeight: 'bold', color: '#1f2937' }}>{d.revenueType.name}</td>
                    <td style={{ padding: '15px', color: '#4b5563' }}>{new Date(d.periodStart).toLocaleDateString()}</td>
                    <td style={{ padding: '15px', textAlign: 'right', fontWeight: 'bold', color: '#b91c1c' }}>{Number(d.amountDue).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ width: '300px', backgroundColor: '#fef2f2', padding: '20px', borderRadius: '8px', border: '1px solid #fecaca' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #fca5a5', paddingBottom: '10px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '14px', color: '#7f1d1d', fontWeight: 'bold' }}>Total Items</span>
                  <span style={{ fontSize: '16px', color: '#7f1d1d', fontWeight: 'bold' }}>{selectedDefaulter.defaults.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '18px', color: '#991b1b', fontWeight: '900' }}>TOTAL DUE</span>
                  <span style={{ fontSize: '24px', color: '#b91c1c', fontWeight: '900' }}>₦{Number(selectedDefaulter.totalAmountDue).toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '60px', borderTop: '1px solid #e5e7eb', paddingTop: '20px', fontSize: '12px', color: '#9ca3af', textAlign: 'center' }}>
              <p style={{ margin: '0 0 5px 0' }}>This is an official document generated by the Trusela Management System.</p>
              <p style={{ margin: '0' }}>Debts must be cleared immediately to avoid suspension of shop privileges.</p>
            </div>
          </div>
        )}
      </div>
    </MarketLayout>
  );
}
