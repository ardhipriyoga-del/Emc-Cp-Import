import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';
import { 
  LayoutDashboard, Users, Clock, History, 
  Upload, FileBarChart, Settings, LogOut, Moon, Sun, Menu, Info, Receipt, Download,
  ClipboardList, FileSpreadsheet
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const { user, logout } = useAuth();
  const { rsName } = useAppContext();
  const { theme, setTheme } = useTheme();
  const [location] = useLocation();
  const [isSidebarOpen, setSidebarOpen] = useState(true);


  const menuItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/patients', label: 'Pasien Rawat Inap', icon: Users },
    { path: '/pending', label: 'Pending Operan', icon: Clock },
    { path: '/history', label: 'Riwayat Pasien', icon: History },
    { path: '/import', label: 'Import Excel', icon: Upload },
    { path: '/reports', label: 'Laporan', icon: FileBarChart },
    { path: '/kasir', label: 'Pesan Kasir', icon: Receipt },
    { path: '/settings', label: 'Pengaturan', icon: Settings },
    { path: '/about', label: 'Tentang Aplikasi', icon: Info },
    ...(user?.role === 'superuser' ? [
      { path: '/master-tarif', label: 'Master Tarif', icon: FileSpreadsheet },
      { path: '/download', label: 'Download Aplikasi', icon: Download },
    ] : []),
  ];

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className={`
        ${isSidebarOpen ? 'w-64' : 'w-20'} 
        transition-all duration-300 ease-in-out
        bg-sidebar text-sidebar-foreground border-r border-sidebar-border
        flex flex-col shrink-0
      `}>
        <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
          {isSidebarOpen && (
            <div className="font-bold text-lg text-sidebar-primary-foreground truncate">
              {rsName}
            </div>
          )}
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!isSidebarOpen)} className="text-sidebar-foreground hover:bg-sidebar-accent">
            <Menu className="h-5 w-5" />
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 space-y-1 px-2">
          {menuItems.map(item => {
            const Icon = item.icon;
            const isActive = location === item.path || (item.path !== '/' && location.startsWith(item.path));
            return (
              <Link key={item.path} href={item.path}>
                <div className={`
                  flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors
                  ${isActive ? 'bg-sidebar-primary text-sidebar-primary-foreground font-medium shadow-sm' : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}
                `}>
                  <Icon className="h-5 w-5 shrink-0" />
                  {isSidebarOpen && <span className="truncate">{item.label}</span>}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border space-y-4">
          {isSidebarOpen && (
            <div className="bg-sidebar-accent rounded-md p-3">
              <p className="text-sm font-medium truncate">{user?.namaLengkap}</p>
              <p className="text-xs text-sidebar-foreground/70 uppercase tracking-wider">{user?.role}</p>
            </div>
          )}
          
          <div className={`flex ${isSidebarOpen ? 'justify-between' : 'flex-col gap-2 items-center'}`}>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="text-sidebar-foreground hover:bg-sidebar-accent"
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={logout}
              className="text-sidebar-foreground hover:bg-destructive hover:text-destructive-foreground"
              title="Logout"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
        
        {/* Footer */}
        <footer className="h-10 shrink-0 border-t bg-card text-card-foreground flex items-center justify-between px-6 text-xs text-muted-foreground font-medium">
          <div>EMC Admission Operan</div>
          <div>Version 1.0.0</div>
          <div className="hidden sm:block">Developed by Dedi Supriadi | {rsName}</div>
        </footer>
      </main>
    </div>
  );
};
