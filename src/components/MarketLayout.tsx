import { ReactNode, useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { 
  LayoutDashboard, Users, ShieldCheck, Banknote, 
  ClipboardList, IdCard, BarChart, LogOut, User as UserIcon, RefreshCcw, Settings, Menu, X, Database
} from 'lucide-react';
import logo from '../assets/logo.png';
import { toast } from 'sonner';
import { useUser } from '../contexts/UserContext';
import { useSync } from '../hooks/useSync';

interface MarketLayoutProps {
  children: ReactNode;
  title: string;
}

export default function MarketLayout({ children, title }: MarketLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profilePhoto, metadata } = useUser();
  const { syncCount, syncing } = useSync();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success('Logged out successfully');
      navigate('/login');
    } catch (error) {
      toast.error('Failed to logout');
    }
  };

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const role = metadata?.role;
  const isSuperAdmin = role === 'admin';
  const isMarketAdmin = role === 'market_admin' || isSuperAdmin;
  const isMarketOfficial = role === 'market_official';

  // Build navigation based on permissions
  const bottomNavItems = [];
  const sidebarNavItems = [];
  
  if (isMarketAdmin || isMarketOfficial) {
    bottomNavItems.push({ path: '/market/dashboard', icon: LayoutDashboard, label: 'Dashboard' });
    bottomNavItems.push({ path: '/market/members', icon: Users, label: 'Members' });
  }
  
  if (isMarketAdmin) {
    bottomNavItems.push({ path: '/market/officials', icon: ShieldCheck, label: 'Officials' });
  }

  if (isMarketAdmin || isMarketOfficial) {
    bottomNavItems.push({ path: '/market/revenue', icon: Banknote, label: 'Revenue' });
    sidebarNavItems.push({ path: '/market/tasks', icon: ClipboardList, label: 'Tasks' });
  }

  if (isMarketAdmin) {
    sidebarNavItems.push({ path: '/market/id-cards', icon: IdCard, label: 'ID Cards' });
    sidebarNavItems.push({ path: '/market/reports', icon: BarChart, label: 'Reports' });
    sidebarNavItems.push({ path: '/market/settings', icon: Settings, label: 'Settings' });
    sidebarNavItems.push({ path: '/market/database', icon: Database, label: 'Database' });
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="bg-red-600 text-white text-[10px] py-1 px-4 text-center font-bold uppercase tracking-widest animate-pulse">
          Offline Mode - Data will sync when connected
        </div>
      )}
      
      {/* Header */}
      <header className="bg-emerald-900 text-white p-4 sticky top-0 z-10 shadow-md">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <img src={metadata?.marketSettings?.logoUrl || logo} alt="Market Logo" className="w-8 h-8 object-contain rounded-lg bg-white p-0.5" />
            <h1 className="text-xl font-bold tracking-tight">{metadata?.marketSettings?.name || 'Market Portal'}</h1>
          </div>
          
          <div className="flex items-center gap-3">
             {metadata?.spreadsheetId && (
                <button 
                  onClick={syncCount}
                  disabled={syncing}
                  className={`p-2 hover:bg-white/10 rounded-full transition-colors ${syncing ? 'opacity-50' : ''}`}
                  title="Recalculate Record Count"
                >
                  <RefreshCcw className={`w-5 h-5 text-yellow ${syncing ? 'animate-spin' : ''}`} />
                </button>
             )}
             <Link to="/market/profile" className="flex items-center gap-2 hover:bg-white/10 p-1.5 pr-3 rounded-full transition-colors border border-white/10">
               <div className="w-7 h-7 bg-yellow rounded-full flex items-center justify-center text-emerald-900 font-bold overflow-hidden">
                 {profilePhoto ? (
                   <img src={profilePhoto} className="w-full h-full object-cover" alt="Profile" />
                 ) : (
                   <UserIcon className="w-4 h-4" />
                 )}
               </div>
               <span className="text-xs font-medium hidden xs:block">{user?.displayName?.split(' ')[0] || 'Official'}</span>
             </Link>
             <button onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-white/10 rounded-full transition-colors" title="Menu">
               <Menu className="w-5 h-5" />
             </button>
          </div>
        </div>
      </header>

      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 transition-opacity backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed top-0 right-0 h-full w-64 bg-white z-50 transform transition-transform duration-300 ease-in-out shadow-2xl flex flex-col ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-4 bg-emerald-900 text-white flex justify-between items-center shadow-md">
          <span className="font-bold text-lg">Menu</span>
          <button onClick={() => setSidebarOpen(false)} className="p-1.5 hover:bg-white/20 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto py-4">
          {sidebarNavItems.map((item) => {
             const Icon = item.icon;
             const isActive = location.pathname.startsWith(item.path);
             return (
               <Link
                 key={item.path}
                 to={item.path}
                 onClick={() => setSidebarOpen(false)}
                 className={`flex items-center gap-4 px-6 py-3.5 transition-colors ${
                   isActive ? 'bg-emerald-50 text-emerald-900 border-r-4 border-emerald-600' : 'text-gray-600 hover:bg-gray-50'
                 }`}
               >
                 <Icon className={`w-5 h-5 ${isActive ? 'text-emerald-900' : 'text-gray-400'}`} />
                 <span className="font-medium">{item.label}</span>
               </Link>
             )
          })}
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50">
          <button 
            onClick={() => {
              setSidebarOpen(false);
              handleLogout();
            }}
            className="flex items-center gap-3 px-4 py-3 w-full text-red-600 hover:bg-red-50 rounded-xl transition-colors font-bold"
          >
            <LogOut className="w-5 h-5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 pb-24">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-emerald-900">{title}</h2>
        </div>
        {children}
      </main>

      {/* Bottom Navigation (Mobile-first scrollable) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-10 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] overflow-x-auto">
        <div className="flex justify-start min-w-full sm:justify-around p-2 gap-2">
          {bottomNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center p-2 rounded-lg transition-colors min-w-[70px] ${
                  isActive ? 'text-emerald-900 bg-emerald-50' : 'text-gray-500 hover:text-emerald-900'
                }`}
              >
                <Icon className={`w-6 h-6 ${isActive ? 'text-emerald-900' : ''}`} />
                <span className="text-[10px] mt-1 font-medium whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
