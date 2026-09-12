import { ReactNode, useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { LayoutDashboard, PlusCircle, List, LogOut, User as UserIcon, RefreshCcw, CreditCard, ShoppingBag } from 'lucide-react';
import logo from '../assets/logo.png';
import { toast } from 'sonner';
import { useUser } from '../contexts/UserContext';
import { useSync } from '../hooks/useSync';

interface LayoutProps {
  children: ReactNode;
  title: string;
}

export default function Layout({ children, title }: LayoutProps) {
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

  const isAdmin = metadata?.role === 'admin';
  const isExpired = metadata?.subscriptionStatus === 'expired' || 
    (metadata?.subscriptionStatus === 'trial' && new Date(metadata?.trialEndsAt || '') < new Date());

  const navItems = isAdmin 
    ? [
        { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
        { path: '/admin/subscription', icon: CreditCard, label: 'Subscription' },
        { path: '/profile', icon: UserIcon, label: 'Profile' },
      ]
    : [
        { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
        { path: '/inventory', icon: ShoppingBag, label: 'Shop' },
        { path: '/add', icon: PlusCircle, label: 'Add Record' },
        { path: '/records', icon: List, label: 'Records' },
        { path: isExpired ? '/activate' : '/subscription', icon: CreditCard, label: 'Subscription' },
        { path: '/profile', icon: UserIcon, label: 'Profile' },
      ];

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="bg-red-600 text-white text-[10px] py-1 px-4 text-center font-bold uppercase tracking-widest animate-pulse">
          Offline Mode - Data will sync when connected
        </div>
      )}
      
      {/* Header */}
      <header className="bg-navy text-white p-4 sticky top-0 z-10 shadow-md">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <img src={logo} alt="Trusela" className="w-8 h-8 object-contain rounded-lg" />
            <h1 className="text-xl font-bold tracking-tight">Trusela</h1>
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
             <Link to="/profile" className="flex items-center gap-2 hover:bg-white/10 p-1.5 pr-3 rounded-full transition-colors border border-white/10">
               <div className="w-7 h-7 bg-yellow rounded-full flex items-center justify-center text-navy font-bold overflow-hidden">
                 {profilePhoto ? (
                   <img src={profilePhoto} className="w-full h-full object-cover" alt="Profile" />
                 ) : (
                   <UserIcon className="w-4 h-4" />
                 )}
               </div>
               <span className="text-xs font-medium hidden xs:block">{user?.displayName?.split(' ')[0] || 'Dealer'}</span>
             </Link>
             <button onClick={handleLogout} className="p-2 hover:bg-white/10 rounded-full transition-colors">
               <LogOut className="w-5 h-5" />
             </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 pb-24">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-navy">{title}</h2>
        </div>
        {children}
      </main>

      {/* Bottom Navigation (Mobile-first) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-2 flex justify-around items-center z-10 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center p-2 rounded-lg transition-colors ${
                isActive ? 'text-navy bg-navy/5' : 'text-gray-500 hover:text-navy'
              }`}
            >
              <Icon className={`w-6 h-6 ${isActive ? 'text-navy' : ''}`} />
              <span className="text-[10px] mt-1 font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
