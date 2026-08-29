import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import SyncManager from './components/SyncManager';
import ErrorBoundary from './components/ErrorBoundary';
import { useUser } from './contexts/UserContext';
import SplashScreen from './components/SplashScreen';

// Eagerly load Login/Signup — first thing unauthenticated users see
import Login from './pages/Login';
import Signup from './pages/Signup';

// All other pages are lazy-loaded — only fetched when the user navigates to them
const Dashboard            = lazy(() => import('./pages/Dashboard'));
const AddRecord            = lazy(() => import('./pages/AddRecord'));
const RecordList           = lazy(() => import('./pages/RecordList'));
const RecordDetail         = lazy(() => import('./pages/RecordDetail'));
const Subscription         = lazy(() => import('./pages/Subscription'));
const Profile              = lazy(() => import('./pages/Profile'));
const Setup                = lazy(() => import('./pages/Setup'));
const SubscriptionCallback = lazy(() => import('./pages/SubscriptionCallback'));
const SalesPersons         = lazy(() => import('./pages/SalesPersons'));
const Reports              = lazy(() => import('./pages/Reports'));
const Inventory            = lazy(() => import('./pages/Inventory'));
const ActivateSubscription = lazy(() => import('./pages/ActivateSubscription'));
const AdminSubscription    = lazy(() => import('./pages/AdminSubscription'));

// Market pages — large feature set, only loaded for market users
const MarketDashboard = lazy(() => import('./pages/market/MarketDashboard'));
const MarketMembers   = lazy(() => import('./pages/market/MarketMembers'));
const MarketOfficials = lazy(() => import('./pages/market/MarketOfficials'));
const MarketRevenue   = lazy(() => import('./pages/market/MarketRevenue'));
const MarketTasks     = lazy(() => import('./pages/market/MarketTasks'));
const MarketIDCards   = lazy(() => import('./pages/market/MarketIDCards'));
const MarketReports   = lazy(() => import('./pages/market/MarketReports'));
const MarketSettings  = lazy(() => import('./pages/market/MarketSettings'));
const MarketDatabase  = lazy(() => import('./pages/market/MarketDatabase'));

interface PrivateRouteProps {
  element: React.ReactElement;
  requireAdmin?: boolean;
  allowExpired?: boolean;
}

// Business Route Logic
function PrivateRoute({ element, requireAdmin = false, allowExpired = false }: PrivateRouteProps) {
  const { user, metadata, loading, activeProfileMode } = useUser();

  if (loading) return <SplashScreen />;
  if (!user) return <Navigate to="/login" replace />;

  const role = metadata?.role;
  const isSuperAdmin = role === 'admin';
  const isMarketUser = (role === 'market_admin' || role === 'market_official' || role === 'market_member') && activeProfileMode !== 'business';

  if (isSuperAdmin) return element;

  // If user is strictly a market user (and hasn't switched to business mode), redirect to market dashboard
  if (isMarketUser) return <Navigate to="/market/dashboard" replace />;

  if (requireAdmin) return <Navigate to="/" replace />;

  // Check if they need to complete account setup first
  const isSetupPage = window.location.pathname === '/setup';
  if (!metadata?.spreadsheetId && !isSetupPage) return <Navigate to="/setup" replace />;

  // Check subscription access
  const isTrialActive = metadata?.subscriptionStatus === 'trial' && new Date(metadata?.trialEndsAt || '') > new Date();
  const isSubscribed = metadata?.subscriptionStatus === 'active' || metadata?.subscriptionStatus === 'lifetime';
  const hasAccess = isTrialActive || isSubscribed;

  if (!hasAccess && !allowExpired) return <Navigate to="/activate" replace />;

  return element;
}

// Market Route Logic
function MarketRoute({ element, requireMarketAdmin = false }: { element: React.ReactElement; requireMarketAdmin?: boolean }) {
  const { user, metadata, loading, activeProfileMode } = useUser();

  if (loading) return <SplashScreen />;
  if (!user) return <Navigate to="/login" replace />;

  const role = metadata?.role;
  const isSuperAdmin = role === 'admin';
  const isMarketAdmin = role === 'market_admin' || isSuperAdmin;
  const isMarketOfficial = role === 'market_official';
  const isMarketUser = (isMarketAdmin || isMarketOfficial || role === 'market_member') && activeProfileMode !== 'business';

  if (!isMarketUser) return <Navigate to="/" replace />;
  if (requireMarketAdmin && !isMarketAdmin) return <Navigate to="/market/dashboard" replace />;

  return element;
}

export default function App() {
  const { user, loading: authLoading } = useUser();

  // Show splash only while Firebase resolves auth state — no artificial delay
  if (authLoading) return <SplashScreen />;

  return (
    <ErrorBoundary>
      <Router>
        <Toaster position="top-center" richColors />
        {user && <SyncManager />}
        {/* Suspense catches lazy chunk loads — shows SplashScreen during navigation to new pages */}
        <Suspense fallback={<SplashScreen />}>
          <Routes>
            <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
            <Route path="/signup" element={!user ? <Signup /> : <Navigate to="/" />} />

            {/* Business Protected Routes */}
            <Route path="/" element={<PrivateRoute element={<Dashboard />} />} />
            <Route path="/add" element={<PrivateRoute element={<AddRecord />} />} />
            <Route path="/records" element={<PrivateRoute element={<RecordList />} />} />
            <Route path="/records/:id" element={<PrivateRoute element={<RecordDetail />} />} />
            <Route path="/subscription" element={<PrivateRoute element={<Subscription />} allowExpired />} />
            <Route path="/subscription/callback" element={<PrivateRoute element={<SubscriptionCallback />} allowExpired />} />
            <Route path="/sales-persons" element={<PrivateRoute element={<SalesPersons />} />} />
            <Route path="/reports" element={<PrivateRoute element={<Reports />} />} />
            <Route path="/inventory" element={<PrivateRoute element={<Inventory />} />} />
            <Route path="/profile" element={<PrivateRoute element={<Profile />} allowExpired />} />
            <Route path="/setup" element={<PrivateRoute element={<Setup />} allowExpired />} />
            <Route path="/activate" element={<PrivateRoute element={<ActivateSubscription />} allowExpired />} />

            {/* Super Admin Routes */}
            <Route path="/admin/subscription" element={<PrivateRoute element={<AdminSubscription />} requireAdmin />} />

            {/* Market Protected Routes */}
            <Route path="/market/dashboard" element={<MarketRoute element={<MarketDashboard />} />} />
            <Route path="/market/members" element={<MarketRoute element={<MarketMembers />} />} />
            <Route path="/market/officials" element={<MarketRoute element={<MarketOfficials />} requireMarketAdmin />} />
            <Route path="/market/revenue" element={<MarketRoute element={<MarketRevenue />} />} />
            <Route path="/market/tasks" element={<MarketRoute element={<MarketTasks />} />} />
            <Route path="/market/id-cards" element={<MarketRoute element={<MarketIDCards />} requireMarketAdmin />} />
            <Route path="/market/reports" element={<MarketRoute element={<MarketReports />} requireMarketAdmin />} />
            <Route path="/market/settings" element={<MarketRoute element={<MarketSettings />} requireMarketAdmin />} />
            <Route path="/market/database" element={<MarketRoute element={<MarketDatabase />} requireMarketAdmin />} />
            <Route path="/market/profile" element={<MarketRoute element={<Profile />} />} />
          </Routes>
        </Suspense>
      </Router>
    </ErrorBoundary>
  );
}
