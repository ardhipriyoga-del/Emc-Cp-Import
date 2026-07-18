import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getDB } from '../lib/db';
import { Users, Clock, CheckCircle2, AlertTriangle, AlertCircle, Share2, Eye, EyeOff, X } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { hashPassword, generateUUID, getCurrentShift } from '../lib/auth';
import { generateHandoverPDF } from '../lib/pdfExport';

export default function Dashboard() {
  const { user, login } = useAuth();
  const [stats, setStats] = useState({ activePatients: 0, totalPending: 0, pendingTodayCompleted: 0, pendingUnfinished: 0, pendingCritical: 0, operanToday: 0 });
  const [pendingByCategory, setPendingByCategory] = useState<any[]>([]);
  const [pendingStatusData, setPendingStatusData] = useState<any[]>([]);
  const [operanHistory, setOperanHistory] = useState<any[]>([]);
  const [recentPendings, setRecentPendings] = useState<any[]>([]);

  // Operan shift modal state
  const [isOperanOpen, setIsOperanOpen] = useState(false);
  const [operanStep, setOperanStep] = useState<1 | 2 | 3>(1);
  const [activePendings, setActivePendings] = useState<any[]>([]);
  const [activeJustInfos, setActiveJustInfos] = useState<any[]>([]);
  const [penerimaNama, setPenerimaNama] = useState('');
  const [penerimaPass, setPenerimaPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [operanLoading, setOperanLoading] = useState(false);
  const [operanResult, setOperanResult] = useState<any>(null);

  const loadDashboard = useCallback(async () => {
    const db = await getDB();
    const today = new Date().toISOString().split('T')[0];
    const patients = await db.getAll('patients');
    const pendings = await db.getAll('pendings');
    const operans = await db.getAll('operanShifts');

    const active = patients.filter(p => p.status === 'aktif');
    const activePend = pendings.filter(p => p.status !== 'selesai');
    const critical = activePend.filter(p => p.prioritas === 'critical');
    const todayDone = pendings.filter(p => p.status === 'selesai' && new Date(p.updatedAt).toISOString().split('T')[0] === today);
    const operanToday = operans.filter(o => o.tanggal.startsWith(today));

    setStats({
      activePatients: active.length,
      totalPending: activePend.length,
      pendingTodayCompleted: todayDone.length,
      pendingUnfinished: activePend.length,
      pendingCritical: critical.length,
      operanToday: operanToday.length,
    });

    const catMap: Record<string, number> = {};
    activePend.forEach(p => { catMap[p.kategori] = (catMap[p.kategori] || 0) + 1; });
    setPendingByCategory(Object.entries(catMap).map(([name, count]) => ({ name: name.replace('Konfirmasi ', ''), count })));

    let pc = 0, dc = 0, sc = 0;
    pendings.forEach(p => { if (p.status === 'pending') pc++; else if (p.status === 'diproses') dc++; else sc++; });
    setPendingStatusData([
      { name: 'Pending', value: pc, color: '#f59e0b' },
      { name: 'Diproses', value: dc, color: '#3b82f6' },
      { name: 'Selesai', value: sc, color: '#10b981' },
    ]);

    const last7 = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(); d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();
    setOperanHistory(last7.map(date => ({ date: date.substring(5), count: operans.filter(o => o.tanggal.startsWith(date)).length })));

    const sorted = [...activePend].sort((a, b) => {
      const pw = { critical: 1, urgent: 2, normal: 3 };
      return pw[a.prioritas as keyof typeof pw] - pw[b.prioritas as keyof typeof pw] || b.createdAt - a.createdAt;
    }).slice(0, 5);
    setRecentPendings(sorted);
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  // Open operan shift modal — load pending data
  const openOperan = async () => {
    const db = await getDB();
    const pendings = await db.getAll('pendings');
    const justInfos = await db.getAll('justInfos');
    const ap = pendings.filter(p => p.status !== 'selesai').sort((a, b) => {
      const pw = { critical: 1, urgent: 2, normal: 3 };
      return pw[a.prioritas as keyof typeof pw] - pw[b.prioritas as keyof typeof pw];
    });
    setActivePendings(ap);
    setActiveJustInfos(justInfos);
    setPenerimaNama('');
    setPenerimaPass('');
    setShowPass(false);
    setOperanStep(1);
    setOperanResult(null);
    setIsOperanOpen(true);
  };

  const handleOperanLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setOperanLoading(true);
    try {
      const db = await getDB();
      const users = await db.getAll('users');
      const hashed = hashPassword(penerimaPass);
      const penerima = users.find(u => u.username === penerimaNama && u.passwordHash === hashed);

      if (!penerima) { toast.error('Username atau password penerima salah'); setOperanLoading(false); return; }
      if (!penerima.aktif) { toast.error('Akun penerima tidak aktif'); setOperanLoading(false); return; }
      if (penerima.id === user.id) { toast.error('Penerima tidak boleh sama dengan penyerah'); setOperanLoading(false); return; }

      // Build operan record
      const now = Date.now();
      const tanggal = new Date().toISOString();
      const shiftSerah = getCurrentShift();
      const shiftTerima = shiftSerah === 'pagi' ? 'sore' : shiftSerah === 'sore' ? 'malam' : 'pagi';

      const patients = await db.getAll('patients');
      const totalPasien = patients.filter(p => p.status === 'aktif').length;
      const allPendings = await db.getAll('pendings');
      const totalPending = allPendings.filter(p => p.status !== 'selesai').length;
      const totalSelesai = allPendings.filter(p => p.status === 'selesai').length;

      // Generate PDF
      const operanId = generateUUID();
      let pdfBase64 = '';
      try {
        pdfBase64 = await generateHandoverPDF(operanId, user.namaLengkap, penerima.namaLengkap, activePendings, activeJustInfos);
      } catch { /* pdf generation non-critical */ }

      const operan = {
        id: operanId,
        tanggal,
        shiftSerah,
        shiftTerima,
        userSerahId: user.id,
        userSerahNama: user.namaLengkap,
        userTerimaId: penerima.id!,
        userTerimaNama: penerima.namaLengkap,
        jamOperan: new Date().toLocaleTimeString('id-ID'),
        totalPasien,
        totalPending,
        totalPendingSelesai: totalSelesai,
        totalPendingBerlanjut: totalPending,
        ringkasanPending: activePendings.map(p => ({ noRM: p.noRM, namaPasien: p.namaPasien, episodeNo: p.episodeNo, payor: p.payor, isiPending: p.isiPending, prioritas: p.prioritas, status: p.status })),
        pdfBase64,
        createdAt: now,
      };
      await db.put('operanShifts', operan);

      // Activity log
      await db.add('activityLogs', {
        userId: user.id, userName: user.namaLengkap,
        action: 'OPERAN_SHIFT', entityType: 'operanShifts', entityId: operanId,
        detail: `Operan dari ${user.namaLengkap} ke ${penerima.namaLengkap}`, timestamp: now,
      });

      // Auto-download PDF
      if (pdfBase64) {
        const link = document.createElement('a');
        link.href = pdfBase64;
        link.download = `Operan_${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`;
        link.click();
      }

      setOperanResult({ operan, penerima });
      setOperanStep(3);

      // Switch session to penerima
      login({ id: penerima.id!, username: penerima.username, namaLengkap: penerima.namaLengkap, role: penerima.role });
      toast.success(`Operan berhasil! Sesi beralih ke ${penerima.namaLengkap}`);
      loadDashboard();
    } catch (err) {
      toast.error('Terjadi kesalahan saat proses operan');
    } finally {
      setOperanLoading(false);
    }
  };

  const prioritasBadge = (p: string) =>
    p === 'critical' ? 'bg-red-100 text-red-700 border-red-300' :
    p === 'urgent'   ? 'bg-orange-100 text-orange-700 border-orange-300' :
                       'bg-emerald-100 text-emerald-700 border-emerald-300';

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Ringkasan aktivitas operan dan status pasien saat ini.</p>
        </div>
        <Button size="lg" className="gap-2 font-bold shadow-md bg-emerald-600 hover:bg-emerald-700 text-white" onClick={openOperan} data-testid="button-mulai-operan">
          <Share2 className="w-5 h-5" /> Mulai Operan Shift
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard title="Pasien Aktif" value={stats.activePatients} icon={Users} color="text-blue-500" bg="bg-blue-50 dark:bg-blue-950/30" />
        <StatCard title="Total Pending" value={stats.totalPending} icon={Clock} color="text-amber-500" bg="bg-amber-50 dark:bg-amber-950/30" />
        <StatCard title="Selesai Hari Ini" value={stats.pendingTodayCompleted} icon={CheckCircle2} color="text-emerald-500" bg="bg-emerald-50 dark:bg-emerald-950/30" />
        <StatCard title="Belum Selesai" value={stats.pendingUnfinished} icon={AlertTriangle} color="text-orange-500" bg="bg-orange-50 dark:bg-orange-950/30" />
        <StatCard title="Pending Critical" value={stats.pendingCritical} icon={AlertCircle} color="text-red-500" bg="bg-red-50 dark:bg-red-950/30" />
        <StatCard title="Operan Hari Ini" value={stats.operanToday} icon={Share2} color="text-primary" bg="bg-primary/10" />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-1 lg:col-span-2 shadow-sm">
          <CardHeader><CardTitle className="text-base">Pending Aktif per Kategori</CardTitle></CardHeader>
          <CardContent className="h-[260px]">
            {pendingByCategory.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pendingByCategory} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)' }} />
                  <Bar dataKey="count" fill="#059669" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Tidak ada pending aktif</div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-base">Distribusi Status Pending</CardTitle></CardHeader>
          <CardContent className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pendingStatusData} cx="50%" cy="45%" innerRadius={55} outerRadius={90} paddingAngle={4} dataKey="value">
                  {pendingStatusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)' }} />
                <Legend verticalAlign="bottom" height={30} iconSize={10} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-1 lg:col-span-2 shadow-sm">
          <CardHeader><CardTitle className="text-base">Tren Operan (7 Hari Terakhir)</CardTitle></CardHeader>
          <CardContent className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={operanHistory} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)' }} />
                <Line type="monotone" dataKey="count" stroke="#059669" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex justify-between items-center">
              Pending Mendesak
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentPendings.length === 0 && (
                <p className="text-center py-6 text-muted-foreground text-sm">Tidak ada pending mendesak</p>
              )}
              {recentPendings.map(p => (
                <div key={p.id} className="flex items-start gap-3 pb-3 border-b border-border last:border-0 last:pb-0">
                  <div className={`mt-0.5 p-1 rounded-full ${p.prioritas === 'critical' ? 'bg-red-100 text-red-600 dark:bg-red-900/30' : p.prioritas === 'urgent' ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30'}`}>
                    <AlertCircle className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{p.namaPasien}</p>
                    <p className="text-xs text-muted-foreground">{p.ruangan} | {p.kategori}</p>
                    <p className="text-xs mt-0.5 line-clamp-2 leading-snug">{p.isiPending}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ===== DIALOG OPERAN SHIFT ===== */}
      <Dialog open={isOperanOpen} onOpenChange={v => { if (!v && operanStep !== 3) setIsOperanOpen(false); if (operanStep === 3) setIsOperanOpen(false); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">

          {/* STEP 1: Ringkasan + Konfirmasi Mulai */}
          {operanStep === 1 && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-emerald-600" /> Mulai Operan Shift
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
                  <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Penyerah Operan</p>
                  <p className="text-base font-bold text-emerald-700 dark:text-emerald-400">{user?.namaLengkap} ({user?.username})</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-500">Shift: {getCurrentShift().toUpperCase()} | {new Date().toLocaleString('id-ID')}</p>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-2xl font-bold text-amber-600">{activePendings.filter(p => p.status === 'pending').length}</p>
                    <p className="text-xs text-muted-foreground mt-1">Menunggu</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-2xl font-bold text-blue-600">{activePendings.filter(p => p.status === 'diproses').length}</p>
                    <p className="text-xs text-muted-foreground mt-1">Diproses</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-2xl font-bold text-red-600">{activePendings.filter(p => p.prioritas === 'critical').length}</p>
                    <p className="text-xs text-muted-foreground mt-1">Critical</p>
                  </div>
                </div>

                {activePendings.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Pending yang akan dioperkan ({activePendings.length}):</p>
                    <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                      {activePendings.map(p => (
                        <div key={p.id} className="flex items-start gap-3 p-3 bg-card border border-border rounded-lg">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold border ${prioritasBadge(p.prioritas)}`}>
                            {p.prioritas.toUpperCase().slice(0,3)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{p.namaPasien} <span className="font-normal text-muted-foreground text-xs">({p.noRM})</span></p>
                            <p className="text-xs text-muted-foreground">{p.ruangan} | {p.kategori}</p>
                            <p className="text-xs mt-0.5 line-clamp-2">{p.isiPending}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activePendings.length === 0 && (
                  <div className="text-center py-4 text-muted-foreground bg-muted/30 rounded-lg">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                    <p className="text-sm font-medium">Tidak ada pending aktif</p>
                    <p className="text-xs">Semua tugas sudah diselesaikan</p>
                  </div>
                )}

                {activeJustInfos.length > 0 && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-sm font-semibold text-blue-700 dark:text-blue-400 mb-2">Just Info ({activeJustInfos.length})</p>
                    {activeJustInfos.slice(0, 3).map(j => (
                      <p key={j.id} className="text-xs text-blue-600 dark:text-blue-500">• {j.isi}</p>
                    ))}
                    {activeJustInfos.length > 3 && <p className="text-xs text-blue-500 mt-1">...dan {activeJustInfos.length - 3} lainnya</p>}
                  </div>
                )}
              </div>
              <DialogFooter className="pt-2">
                <Button variant="outline" onClick={() => setIsOperanOpen(false)}>Batal</Button>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2" onClick={() => setOperanStep(2)} data-testid="button-lanjut-operan">
                  Lanjutkan Operan
                </Button>
              </DialogFooter>
            </>
          )}

          {/* STEP 2: Login penerima */}
          {operanStep === 2 && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">Login Petugas Penerima</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleOperanLogin} className="space-y-5 pt-2">
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-sm">
                  <p className="font-semibold text-amber-800 dark:text-amber-300">Petugas penerima wajib login untuk mengkonfirmasi operan</p>
                  <p className="text-amber-700 dark:text-amber-400 text-xs mt-1">Penerima operan dari shift berikutnya harus memasukkan kredensialnya</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold">Username Penerima <span className="text-red-500">*</span></label>
                  <Input
                    value={penerimaNama}
                    onChange={e => setPenerimaNama(e.target.value)}
                    placeholder="Masukkan username penerima"
                    required
                    autoFocus
                    data-testid="input-penerima-username"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold">Password Penerima <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <Input
                      type={showPass ? 'text' : 'password'}
                      value={penerimaPass}
                      onChange={e => setPenerimaPass(e.target.value)}
                      placeholder="Masukkan password"
                      required
                      className="pr-10"
                      data-testid="input-penerima-password"
                    />
                    <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOperanStep(1)}>Kembali</Button>
                  <Button type="submit" disabled={operanLoading || !penerimaNama || !penerimaPass} className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[160px]" data-testid="button-konfirmasi-operan">
                    {operanLoading ? 'Memverifikasi...' : 'Konfirmasi Operan'}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}

          {/* STEP 3: Sukses */}
          {operanStep === 3 && operanResult && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl flex items-center gap-2">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600" /> Operan Berhasil!
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4 space-y-2">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Penyerah</p>
                      <p className="font-semibold">{operanResult.operan.userSerahNama}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Penerima</p>
                      <p className="font-semibold">{operanResult.operan.userTerimaNama}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Shift Serah</p>
                      <p className="font-semibold capitalize">{operanResult.operan.shiftSerah}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Jam Operan</p>
                      <p className="font-semibold">{operanResult.operan.jamOperan}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Total Pasien</p>
                      <p className="font-semibold">{operanResult.operan.totalPasien}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Pending Berlanjut</p>
                      <p className="font-semibold">{operanResult.operan.totalPendingBerlanjut}</p>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  {operanResult.operan.pdfBase64 ? 'PDF laporan operan telah diunduh otomatis.' : 'Laporan operan tersimpan dalam riwayat.'}
                </p>
              </div>
              <DialogFooter>
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setIsOperanOpen(false)} data-testid="button-tutup-operan">
                  Tutup & Mulai Shift Baru
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, bg }: any) {
  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4 flex flex-col justify-between h-full min-h-[110px]">
        <div className="flex justify-between items-start mb-3">
          <p className="text-xs font-medium text-muted-foreground leading-tight">{title}</p>
          <div className={`p-1.5 rounded-lg ${bg}`}><Icon className={`w-4 h-4 ${color}`} /></div>
        </div>
        <h3 className="text-3xl font-bold tracking-tight">{value}</h3>
      </CardContent>
    </Card>
  );
}
