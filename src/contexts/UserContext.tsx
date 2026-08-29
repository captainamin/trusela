import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { getEmbedUrl } from '../utils/googleDrive';

export interface UserMetadata {
  spreadsheetId?: string;
  folderId?: string;
  subscriptionStatus?: 'trial' | 'active' | 'expired' | 'lifetime' | 'suspended';
  trialEndsAt?: string;
  recordCount?: number;
  planType?: string;
  role?: 'admin' | 'user' | 'market_admin' | 'market_official' | 'market_member';
  subscriptionPlan?: 'monthly' | 'quarterly' | 'yearly' | 'lifetime' | null;
  subscriptionExpiry?: string;
  lastActivationDate?: string;
  marketId?: string; // Reference to market document
  assignedTasks?: string[]; // For officials
  [key: string]: any;
}

interface UserContextType {
  user: User | null;
  metadata: UserMetadata | null;
  loading: boolean;
  refreshMetadata: () => Promise<void>;
  profilePhoto: string;
  activeProfileMode: 'business' | 'market';
  setActiveProfileMode: (mode: 'business' | 'market') => void;
}

const UserContext = createContext<UserContextType>({
  user: null,
  metadata: null,
  loading: true,
  refreshMetadata: async () => {},
  profilePhoto: '',
  activeProfileMode: 'market',
  setActiveProfileMode: () => {},
});

export const useUser = () => useContext(UserContext);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [metadata, setMetadata] = useState<UserMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Load initial mode from localStorage
  const [activeProfileMode, setActiveProfileModeState] = useState<'business' | 'market'>(
    (localStorage.getItem('activeProfileMode') as 'business' | 'market') || 'market'
  );

  const setActiveProfileMode = (mode: 'business' | 'market') => {
    localStorage.setItem('activeProfileMode', mode);
    setActiveProfileModeState(mode);
  };


  // refreshMetadata is a no-op now since onSnapshot keeps data live
  const refreshMetadata = async () => {};

  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);

      // Clean up any previous snapshot listener
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }

      if (currentUser) {
        // Subscribe to real-time updates on the user document
        const docRef = doc(db, 'users', currentUser.uid);
        unsubscribeSnapshot = onSnapshot(
          docRef,
          (snap) => {
            if (snap.exists()) {
              setMetadata(snap.data() as UserMetadata);
            } else {
              setMetadata(null);
            }
            setLoading(false);
          },
          (error) => {
            console.error('UserContext onSnapshot error:', error);
            setMetadata(null);
            setLoading(false);
          }
        );
      } else {
        setMetadata(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, []);

  return (
    <UserContext.Provider value={{ 
      user, 
      metadata, 
      loading, 
      refreshMetadata,
      profilePhoto: getEmbedUrl(metadata?.profilePhoto || user?.photoURL || '', user?.uid),
      activeProfileMode,
      setActiveProfileMode
    }}>
      {children}
    </UserContext.Provider>
  );
}
