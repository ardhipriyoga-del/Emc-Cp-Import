import React, { useEffect, useState } from 'react';
import { getDB } from '../lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Info, Sparkles, Code2, Database, FileText,
  Users, BedDouble, Clock, History, Wifi, WifiOff
} from 'lucide-react';

const VERSION = '1.0.0';
const DB_VERSION = '1';

export default function AboutPage() {
  const [stats, setStats] = useState({
    users: 0,
    activePasien: 0,
    activePending: 0,
    totalOperan: 0,
    lastBackup: '-',
  });
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline  = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const db = await getDB();
        const [users, patients, pendings, operans, settings] = await Promise.all([
          db.getAll('users'),
          db.getAll('patients'),
          db.getAll('pendings'),
          db.getAll('operanShifts'),
          db.getAll('settings'),
        ]);
        const lastBackupVal = settings.find(s => s.key === 'lastBackup')?.value;
        setStats({
          users: users.length,
          activePasien: patients.filter(p => p.status === 'aktif').length,
          activePending: pendings.filter(p => p.status === 'pending' || p.status === 'diproses').length,
          totalOperan: operans.length,
          lastBackup: lastBackupVal
            ? new Date(lastBackupVal).toLocaleString('id-ID')
            : 'Belum pernah',
        });
      } catch (_) { /* db not ready yet */ }
    })();
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Hero */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-8 pb-8 flex flex-col items-center text-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" className="w-9 h-9 text-primary" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary">EMC Admission Operan</h1>
            <p className="text-sm text-muted-foreground mt-1">Version {VERSION}</p>
          </div>
          <p className="text-sm text-muted-foreground max-w-xl leading-relaxed">
            Aplikasi operan pasien berbasis web offline yang dirancang untuk membantu petugas Admission RS EMC
            dalam mencatat, memantau, dan melakukan handover pending antar shift secara cepat, aman, dan terdokumentasi.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Fitur Utama */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="w-5 h-5 text-amber-500" /> Fitur Utama
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {[
                'Dashboard operan pasien',
                'Pending Confirmation',
                'Just Info',
                'Riwayat Operan',
                'Operan Shift dengan verifikasi Username & Password',
                'Export Laporan Operan ke PDF',
                'Backup & Restore seluruh data menggunakan file Excel',
                'Import data pasien dari TrakCare',
                'Pencarian berdasarkan No. RM dan Nama Pasien',
                'Penyimpanan data lokal (Offline)',
              ].map(f => (
                <li key={f} className="flex items-start gap-2">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {/* Developer */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Code2 className="w-5 h-5 text-violet-500" /> Developer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-semibold text-foreground">Dedi Supriadi</p>
              <div className="text-muted-foreground space-y-1">
                <p>📱 <a href="https://wa.me/6208190261688" className="hover:text-primary transition-colors">08190261688</a></p>
                <p>✉️ <a href="mailto:nuxarcodex@gmail.com" className="hover:text-primary transition-colors">nuxarcodex@gmail.com</a></p>
                <p className="pt-1 text-xs">Admission RS EMC Pekayon</p>
              </div>
            </CardContent>
          </Card>

          {/* Lisensi */}
          <Card className="border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-900/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="w-5 h-5 text-amber-600" /> Lisensi
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground leading-relaxed">
              Aplikasi ini dibuat khusus sebagai sistem operasional internal RS EMC Pekayon.
              <br /><br />
              <span className="font-semibold text-amber-700 dark:text-amber-400">
                Tidak diperkenankan untuk diperjualbelikan atau didistribusikan tanpa izin dari pengembang.
              </span>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Info Aplikasi */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="w-5 h-5 text-emerald-500" /> Informasi Aplikasi
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatItem icon={<Info className="w-4 h-4" />}    label="Versi Database"       value={`v${DB_VERSION}`} />
            <StatItem icon={<Users className="w-4 h-4" />}   label="Jumlah User"          value={String(stats.users)} />
            <StatItem icon={<BedDouble className="w-4 h-4" />} label="Pasien Aktif"       value={String(stats.activePasien)} />
            <StatItem icon={<Clock className="w-4 h-4" />}   label="Pending Aktif"        value={String(stats.activePending)} />
            <StatItem icon={<History className="w-4 h-4" />} label="Riwayat Operan"       value={String(stats.totalOperan)} />
            <StatItem
              icon={isOnline
                ? <Wifi className="w-4 h-4 text-emerald-500" />
                : <WifiOff className="w-4 h-4 text-amber-500" />}
              label="Status"
              value={isOnline ? 'Online' : 'Offline'}
              valueClass={isOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}
            />
          </div>
          <div className="mt-4 pt-4 border-t border-border text-xs text-muted-foreground">
            Backup terakhir: <span className="font-medium text-foreground">{stats.lastBackup}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatItem({
  icon, label, value, valueClass = ''
}: { icon: React.ReactNode; label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-sm font-semibold ${valueClass}`}>{value}</p>
      </div>
    </div>
  );
}
