import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useLocation } from 'wouter';
import { Download, ShieldAlert, FileCode2, HardDrive, Info, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function DownloadPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  if (user?.role !== 'superuser') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <ShieldAlert className="w-12 h-12 text-destructive mx-auto" />
          <h2 className="text-lg font-semibold">Akses Ditolak</h2>
          <p className="text-muted-foreground text-sm">Halaman ini hanya untuk Superuser.</p>
          <Button variant="outline" size="sm" onClick={() => setLocation('/')}>Kembali ke Dashboard</Button>
        </div>
      </div>
    );
  }

  const fileUrl = `${import.meta.env.BASE_URL}emc-admission-app.html`;

  const steps = [
    'Klik tombol Download di bawah — file HTML (~2.3 MB) akan tersimpan ke perangkat Anda.',
    'Pindahkan file ke komputer offline menggunakan flashdisk.',
    'Di komputer offline, klik dua kali file HTML untuk membukanya di Google Chrome.',
    'Aplikasi langsung berjalan — tidak memerlukan internet maupun instalasi apapun.',
  ];

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <FileCode2 className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Download Aplikasi</h1>
          <Badge variant="secondary" className="ml-1">Superuser Only</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          Unduh file HTML mandiri yang dapat dijalankan secara penuh tanpa internet.
        </p>
      </div>

      {/* Download Card */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-6 flex flex-col sm:flex-row items-center gap-4">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-primary" />
              <span className="font-semibold text-base">emc-admission-app.html</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Satu file HTML · Semua fitur lengkap · Berjalan 100% offline
            </p>
            <p className="text-xs text-muted-foreground">Ukuran: ± 2.3 MB</p>
          </div>
          <a href={fileUrl} download="emc-admission-app.html">
            <Button size="lg" className="gap-2 w-full sm:w-auto">
              <Download className="w-5 h-5" />
              Download Sekarang
            </Button>
          </a>
        </CardContent>
      </Card>

      {/* Cara Pakai */}
      <Card className="shadow-none border-border">
        <CardHeader className="py-3 px-4 bg-muted/40 border-b border-border rounded-t-lg">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Info className="w-4 h-4" /> Cara Menggunakan File yang Diunduh
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </div>
              <p className="text-sm">{step}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Catatan */}
      <Card className="shadow-none border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
        <CardContent className="p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
            <Info className="w-4 h-4" /> Catatan Penting
          </p>
          <ul className="text-sm text-amber-700 dark:text-amber-400 space-y-1.5 list-none">
            {[
              'Gunakan Google Chrome atau Microsoft Edge — jangan Internet Explorer.',
              'Data pasien tersimpan di browser komputer tersebut (IndexedDB), tidak ikut di file HTML.',
              'Gunakan fitur Backup & Restore di menu Pengaturan untuk memindahkan data antar komputer.',
              'Jika aplikasi diperbarui, download ulang file ini dan ganti file lama dengan yang baru.',
            ].map((note, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
