import React, { createContext, useContext, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { getDB } from '../lib/db';
import { initDefaultSettingsAndAdmin } from '../lib/auth';

interface AuthUser {
  id: number;
  username: string;
  namaLengkap: string;
  role: 'superuser' | 'officer';
}

interface AuthContextType {
  user: AuthUser | null;
  isInitialized: boolean;
  login: (user: AuthUser) => void;
  logout: () => void;
  updateSession: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const init = async () => {
      await initDefaultSettingsAndAdmin();
      const storedSession = localStorage.getItem('emc_session');
      if (storedSession) {
        try {
          const session = JSON.parse(storedSession);
          const now = Date.now();
          if (now - session.lastActivity < 30 * 60 * 1000) {
            setUser(session.user);
            // refresh lastActivity
            session.lastActivity = now;
            localStorage.setItem('emc_session', JSON.stringify(session));
          } else {
            localStorage.removeItem('emc_session');
          }
        } catch {
          localStorage.removeItem('emc_session');
        }
      }
      setIsInitialized(true);
    };
    init();
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      const session = localStorage.getItem('emc_session');
      if (session) {
        const db = await getDB();
        const timeoutSetting = await db.get('settings', 'timeoutMins');
        const timeoutMins = timeoutSetting?.value || 30;
        
        const parsed = JSON.parse(session);
        if (Date.now() - parsed.lastActivity > timeoutMins * 60 * 1000) {
          logout();
          window.alert("Sesi telah berakhir karena tidak ada aktivitas.");
        }
      }
    }, 60000); // check every minute
    return () => clearInterval(interval);
  }, []);

  const login = (userData: AuthUser) => {
    setUser(userData);
    localStorage.setItem('emc_session', JSON.stringify({
      user: userData,
      loginAt: Date.now(),
      lastActivity: Date.now()
    }));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('emc_session');
    setLocation('/login');
  };

  const updateSession = () => {
    const session = localStorage.getItem('emc_session');
    if (session) {
      const parsed = JSON.parse(session);
      parsed.lastActivity = Date.now();
      localStorage.setItem('emc_session', JSON.stringify(parsed));
    }
  };

  return (
    <AuthContext.Provider value={{ user, isInitialized, login, logout, updateSession }}>
      <div onClick={updateSession} onKeyDown={updateSession}>
        {children}
      </div>
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
