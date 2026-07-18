import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';
import { getDB } from '../lib/db';
import { backupData, restoreData } from '../lib/backup';
import { hashPassword } from '../lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Save, Download, Upload, Shield, Users, Building, Database, KeyRound, Eye, EyeOff } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export default function SettingsPage() {
  const { user } = useAuth();
  const { rsName, refreshSettings } = useAppContext();
  
  const [activeTab, setActiveTab] = useState<'profil' | 'users' | 'app' | 'backup'>('profil');
  
  // App Config
  const [appNameInput, setAppNameInput] = useState(rsName);
  
  // Users
  const [usersList, setUsersList] = useState<any[]>([]);
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', namaLengkap: '', password: '', role: 'officer' });

  // Change Password
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Backup
  const [restoreFile, setRestoreFile] = useState<File | null>(null);

  useEffect(() => {
    if (user?.role === 'superuser' && activeTab === 'users') {
      loadUsers();
    }
  }, [activeTab, user]);

  const loadUsers = async () => {
    const db = await getDB();
    const u = await db.getAll('users');
    setUsersList(u);
  };

  const handleSaveAppConfig = async () => {
    const db = await getDB();
    await db.put('settings', { key: 'rsName', value: appNameInput });
    refreshSettings();
    toast.success('Konfigurasi aplikasi berhasil disimpan.');
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const db = await getDB();
    const existing = await db.getAll('users');
    if (existing.find(u => u.username === newUser.username)) {
      toast.error('Username sudah digunakan!');
      return;
    }
    
    await db.put('users', {
      username: newUser.username,
      namaLengkap: newUser.namaLengkap,
      role: newUser.role,
      passwordHash: hashPassword(newUser.password),
      aktif: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    
    toast.success('Pengguna berhasil ditambahkan.');
    setIsAddUserOpen(false);
    setNewUser({ username: '', namaLengkap: '', password: '', role: 'officer' });
    loadUsers();
  };

  const handleToggleUserStatus = async (u: any) => {
    if (u.username === user?.username) {
      toast.error('Tidak bisa menonaktifkan diri sendiri!');
      return;
    }
    const db = await getDB();
    u.aktif = !u.aktif;
    u.updatedAt = Date.now();
    await db.put('users', u);
    loadUsers();
    toast.success(`User ${u.username} ${u.aktif ? 'diaktifkan' : 'dinonaktifkan'}.`);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (pwForm.next !== pwForm.confirm) {
      toast.error('Password baru dan konfirmasi tidak cocok!');
      return;
    }
    if (pwForm.next.length < 6) {
      toast.error('Password baru minimal 6 karakter!');
      return;
    }
    setPwLoading(true);
    try {
      const db = await getDB();
      const allUsers = await db.getAll('users');
      const dbUser = allUsers.find(u => u.username === user.username);
      if (!dbUser) throw new Error('User tidak ditemukan');
      if (dbUser.passwordHash !== hashPassword(pwForm.current)) {
        toast.error('Password lama tidak sesuai!');
        return;
      }
      dbUser.passwordHash = hashPassword(pwForm.next);
      dbUser.updatedAt = Date.now();
      await db.put('users', dbUser);
      toast.success('Password berhasil diubah. Silakan login ulang berikutnya.');
      setPwForm({ current: '', next: '', confirm: '' });
    } catch (err: any) {
      toast.error('Gagal mengubah password: ' + err.message);
    } finally {
      setPwLoading(false);
    }
  };

  const handleBackup = async () => {
    try {
      await backupData();
      toast.success('Backup berhasil didownload.');
    } catch(e: any) {
      toast.error('Gagal backup: ' + e.message);
    }
  };

  const handleRestore = async () => {
    if (!restoreFile) return;
    if (!confirm('Peringatan: Proses restore akan menimpa SEMUA data saat ini. Lanjutkan?')) return;
    
    try {
      toast.loading('Melakukan restore data...');
      await restoreData(restoreFile);
      toast.success('Restore berhasil! Memuat ulang aplikasi...');
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch(e: any) {
      toast.error('Gagal restore: ' + e.message);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pengaturan Sistem</h1>
        <p className="text-muted-foreground mt-1">Konfigurasi aplikasi dan manajemen pengguna.</p>
      </div>

      <div className="flex border-b border-border mb-6 flex-wrap">
        <TabButton active={activeTab === 'profil'} onClick={() => setActiveTab('profil')} icon={Shield} label="Profil Saya" />
        <TabButton active={activeTab === 'backup'} onClick={() => setActiveTab('backup')} icon={Database} label="Backup & Restore" />
        {user?.role === 'superuser' && (
          <>
            <TabButton active={activeTab === 'app'} onClick={() => setActiveTab('app')} icon={Building} label="Aplikasi" />
            <TabButton active={activeTab === 'users'} onClick={() => setActiveTab('users')} icon={Users} label="Master User" />
          </>
        )}
      </div>

      {activeTab === 'profil' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Profil Pengguna</CardTitle>
              <CardDescription>Informasi akun Anda saat ini.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-w-md">
              <div>
                <label className="text-sm font-semibold text-muted-foreground">Nama Lengkap</label>
                <div className="text-lg font-medium">{user?.namaLengkap}</div>
              </div>
              <div>
                <label className="text-sm font-semibold text-muted-foreground">Username</label>
                <div className="text-lg">{user?.username}</div>
              </div>
              <div>
                <label className="text-sm font-semibold text-muted-foreground">Role Akses</label>
                <div className="inline-block mt-1 uppercase tracking-wider text-xs font-bold bg-primary/10 text-primary px-3 py-1 rounded-md">
                  {user?.role}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="w-5 h-5" /> Ubah Password
              </CardTitle>
              <CardDescription>Masukkan password lama untuk verifikasi, lalu tetapkan password baru.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Password Lama</label>
                  <div className="relative">
                    <Input
                      type={showCurrent ? 'text' : 'password'}
                      value={pwForm.current}
                      onChange={e => setPwForm({ ...pwForm, current: e.target.value })}
                      placeholder="Masukkan password saat ini"
                      required
                      className="pr-10"
                    />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowCurrent(v => !v)}>
                      {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Password Baru</label>
                  <div className="relative">
                    <Input
                      type={showNext ? 'text' : 'password'}
                      value={pwForm.next}
                      onChange={e => setPwForm({ ...pwForm, next: e.target.value })}
                      placeholder="Minimal 6 karakter"
                      required
                      className="pr-10"
                    />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowNext(v => !v)}>
                      {showNext ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Konfirmasi Password Baru</label>
                  <div className="relative">
                    <Input
                      type={showConfirm ? 'text' : 'password'}
                      value={pwForm.confirm}
                      onChange={e => setPwForm({ ...pwForm, confirm: e.target.value })}
                      placeholder="Ulangi password baru"
                      required
                      className="pr-10"
                    />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowConfirm(v => !v)}>
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {pwForm.confirm && pwForm.next !== pwForm.confirm && (
                    <p className="text-xs text-destructive">Password tidak cocok.</p>
                  )}
                </div>
                <Button type="submit" disabled={pwLoading} className="gap-2">
                  <KeyRound className="w-4 h-4" />
                  {pwLoading ? 'Menyimpan...' : 'Simpan Password Baru'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'app' && user?.role === 'superuser' && (
        <Card>
          <CardHeader>
            <CardTitle>Konfigurasi Rumah Sakit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 max-w-md">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Nama Rumah Sakit</label>
              <Input value={appNameInput} onChange={e => setAppNameInput(e.target.value)} />
            </div>
            <Button onClick={handleSaveAppConfig} className="gap-2"><Save className="w-4 h-4"/> Simpan Konfigurasi</Button>
          </CardContent>
        </Card>
      )}

      {activeTab === 'users' && user?.role === 'superuser' && (
        <Card>
          <CardHeader className="flex flex-row justify-between items-center">
            <div>
              <CardTitle>Manajemen Pengguna</CardTitle>
              <CardDescription>Kelola akses officer admission.</CardDescription>
            </div>
            <Button onClick={() => setIsAddUserOpen(true)}>Tambah User</Button>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground text-left">
                <tr>
                  <th className="p-3">Username</th>
                  <th className="p-3">Nama Lengkap</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {usersList.map(u => (
                  <tr key={u.id} className="border-b border-border">
                    <td className="p-3 font-medium">{u.username}</td>
                    <td className="p-3">{u.namaLengkap}</td>
                    <td className="p-3 uppercase text-xs">{u.role}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded-md text-xs font-bold ${u.aktif ? 'bg-emerald-100 text-emerald-700' : 'bg-destructive/10 text-destructive'}`}>
                        {u.aktif ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <Button variant="outline" size="sm" onClick={() => handleToggleUserStatus(u)}>
                        {u.aktif ? 'Nonaktifkan' : 'Aktifkan'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {activeTab === 'backup' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Backup Data</CardTitle>
              <CardDescription>Export seluruh database ke file Excel.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleBackup} className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white" size="lg">
                <Download className="w-5 h-5"/> Download Backup (XLSX)
              </Button>
              <p className="text-xs text-muted-foreground mt-4 text-center">
                Disarankan melakukan backup manual seminggu sekali untuk keamanan data.
              </p>
            </CardContent>
          </Card>

          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="text-destructive">Restore Data</CardTitle>
              <CardDescription>Pulihkan data dari file backup (.xlsx). <strong className="text-destructive">PERHATIAN: Menimpa data saat ini.</strong></CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input type="file" accept=".xlsx" onChange={e => setRestoreFile(e.target.files?.[0] || null)} />
              <Button onClick={handleRestore} disabled={!restoreFile} variant="destructive" className="w-full gap-2" size="lg">
                <Upload className="w-5 h-5"/> Jalankan Restore
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add User Modal */}
      <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Pengguna Baru</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddUser} className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Username</label>
              <Input value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">Nama Lengkap</label>
              <Input value={newUser.namaLengkap} onChange={e => setNewUser({...newUser, namaLengkap: e.target.value})} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">Password</label>
              <Input type="password" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">Role</label>
              <select className="w-full h-10 px-3 rounded-md border border-input bg-background" value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})}>
                <option value="officer">Officer</option>
                <option value="superuser">Superuser / Admin</option>
              </select>
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setIsAddUserOpen(false)}>Batal</Button>
              <Button type="submit">Simpan User</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }: any) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-2 px-6 py-3 border-b-2 font-medium transition-colors ${active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30'}`}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
}
