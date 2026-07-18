import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';
import { getDB } from '../lib/db';
import { hashPassword } from '../lib/auth';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldAlert, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, user } = useAuth();
  const { rsName, rsLogo } = useAppContext();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (user) {
      setLocation('/');
    }
  }, [user, setLocation]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const db = await getDB();
      const users = await db.getAll('users');
      const hashed = hashPassword(password);
      
      const found = users.find(u => u.username === username && u.passwordHash === hashed);
      
      if (found) {
        if (!found.aktif) {
          toast.error("Akun anda nonaktif. Hubungi Administrator.");
          setLoading(false);
          return;
        }
        login({ id: found.id!, username: found.username, namaLengkap: found.namaLengkap, role: found.role });
        toast.success(`Selamat datang, ${found.namaLengkap}`);
        setLocation('/');
      } else {
        toast.error("Username atau password salah.");
      }
    } catch (err) {
      toast.error("Terjadi kesalahan saat login.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary/30 p-4">
      <Card className="w-full max-w-md shadow-xl border-t-4 border-t-primary">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto bg-primary/10 w-20 h-20 rounded-full flex items-center justify-center mb-2">
            {rsLogo ? (
              <img src={rsLogo} alt="Logo" className="w-12 h-12 object-contain" />
            ) : (
              <i className="bi bi-clipboard2-pulse-fill text-4xl text-primary" />
            )}
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-primary">
            IP Admission Workspace
          </CardTitle>
          <CardDescription className="text-base font-medium">
            Workspace Operasional Admission Rawat Inap {rsName}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Username</label>
              <Input 
                autoFocus
                placeholder="Masukkan username" 
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                className="h-12 bg-background"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">Password</label>
              <div className="relative">
                <Input 
                  type={showPassword ? "text" : "password"}
                  placeholder="Masukkan password" 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="h-12 bg-background pr-10"
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            
            <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={loading}>
              {loading ? "Memverifikasi..." : "Login ke Sistem"}
            </Button>
            
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mt-4">
              <ShieldAlert className="w-4 h-4" />
              Sistem Internal 100% Offline
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
