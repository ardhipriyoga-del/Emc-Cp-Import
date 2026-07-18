import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { getDB, Patient, Pending, JustInfo } from '../lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Search, Star, Clock, Info, FileText, Plus, X, Upload,
  Calendar, ChevronRight, User2, BedDouble, Stethoscope,
  CreditCard, AlertCircle, CheckCircle2, Phone, Save, ClipboardList
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { getCurrentShift, generateUUID } from '../lib/auth';

const KATEGORI_LIST = [
  'Konfirmasi Billing',
  'Konfirmasi DPJP',
  'Konfirmasi Ruangan',
  'Konfirmasi Penjamin',
  'Konfirmasi Tindakan',
  'Administrasi',
  'Lainnya',
];

export default function Patients() {
  const { user } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [pendings, setPendings] = useState<Pending[]>([]);
  const [justInfos, setJustInfos] = useState<JustInfo[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterRuangan, setFilterRuangan] = useState('all');

  // Detail modal
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Tambah Pending modal (dari detail pasien)
  const [isAddPendingOpen, setIsAddPendingOpen] = useState(false);
  const [pendingForm, setPendingForm] = useState({
    kategori: 'Konfirmasi Billing',
    isiPending: '',
    prioritas: 'normal' as 'normal' | 'urgent' | 'critical',
    shift: getCurrentShift(),
    deadline: '',
    fotoBase64: '',
  });
  const [savingPending, setSavingPending] = useState(false);
  const [, navigate] = useLocation();

  // Tambah Just Info modal
  const [isAddInfoOpen, setIsAddInfoOpen] = useState(false);
  const [infoText, setInfoText] = useState('');
  const [savingInfo, setSavingInfo] = useState(false);

  // No HP Penanggung Jawab
  const [noHpPJ, setNoHpPJ] = useState('');
  const [savingHp, setSavingHp] = useState(false);

  const loadData = useCallback(async () => {
    const db = await getDB();
    const [allPatients, allPendings, allJustInfos] = await Promise.all([
      db.getAll('patients'),
      db.getAll('pendings'),
      db.getAll('justInfos'),
    ]);
    setPatients(allPatients.filter(p => p.status === 'aktif'));
    setPendings(allPendings);
    setJustInfos(allJustInfos);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleBookmark = async (patient: Patient, e: React.MouseEvent) => {
    e.stopPropagation();
    const db = await getDB();
    await db.put('patients', { ...patient, bookmarked: !patient.bookmarked });
    loadData();
  };

  const handleSaveNoHpPJ = async () => {
    if (!selectedPatient) return;
    setSavingHp(true);
    try {
      const db = await getDB();
      const updated = { ...selectedPatient, noHpPJ: noHpPJ.trim(), updatedAt: Date.now() };
      await db.put('patients', updated);
      setSelectedPatient(updated);
      toast.success('No HP Penanggung Jawab berhasil disimpan.');
      loadData();
    } catch {
      toast.error('Gagal menyimpan.');
    } finally {
      setSavingHp(false);
    }
  };

  const openDetail = (patient: Patient) => {
    setSelectedPatient(patient);
    setNoHpPJ(patient.noHpPJ || '');
    setIsDetailOpen(true);
  };

  const getPatientPendings = (noRM: string) =>
    pendings.filter(p => p.noRM === noRM && p.status !== 'selesai');
  const getPatientJustInfos = (noRM: string) =>
    justInfos.filter(j => j.noRM === noRM);

  // Unique ruangan list for filter
  const ruanganList = Array.from(new Set(patients.map(p => p.ward || p.roomName).filter(Boolean)));

  const filtered = patients.filter(p => {
    const q = searchTerm.toLowerCase();
    const matchSearch = !q ||
      p.namaPasien.toLowerCase().includes(q) ||
      p.noRM.toLowerCase().includes(q) ||
      (p.dpjp || '').toLowerCase().includes(q);
    const matchRuangan = filterRuangan === 'all' || (p.ward || p.roomName) === filterRuangan;
    return matchSearch && matchRuangan;
  });

  // ── Tambah Pending ──────────────────────────────────────────────
  const openAddPending = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingForm({
      kategori: 'Konfirmasi Billing',
      isiPending: '',
      prioritas: 'normal',
      shift: getCurrentShift(),
      deadline: '',
      fotoBase64: '',
    });
    setIsAddPendingOpen(true);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Foto maksimal 2MB'); return; }
    const reader = new FileReader();
    reader.onload = ev => setPendingForm(f => ({ ...f, fotoBase64: ev.target?.result as string }));
    reader.readAsDataURL(file);
  };

  const handleSavePending = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedPatient) return;
    if (!pendingForm.isiPending.trim()) { toast.error('Isi pending tidak boleh kosong'); return; }
    setSavingPending(true);
    try {
      const db = await getDB();
      const now = Date.now();
      const pending: Pending = {
        id: generateUUID(),
        noRM: selectedPatient.noRM,
        episodeNo: selectedPatient.episodeNo,
        namaPasien: selectedPatient.namaPasien,
        ruangan: selectedPatient.ward || selectedPatient.roomName || '-',
        kelas: selectedPatient.roomType || '-',
        dpjp: selectedPatient.dpjp || '-',
        payor: selectedPatient.payor || '-',
        kategori: pendingForm.kategori,
        isiPending: pendingForm.isiPending.trim(),
        prioritas: pendingForm.prioritas,
        status: 'pending',
        deadline: pendingForm.deadline || null,
        fotoBase64: pendingForm.fotoBase64 || undefined,
        shift: pendingForm.shift,
        userId: user.id,
        userName: user.namaLengkap,
        komentar: [],
        auditLog: [{ action: 'Dibuat', userId: user.id, userName: user.namaLengkap, timestamp: now }],
        createdAt: now,
        updatedAt: now,
      };
      await db.put('pendings', pending);
      toast.success('Pending berhasil ditambahkan');
      setIsAddPendingOpen(false);
      loadData();
    } catch {
      toast.error('Gagal menyimpan pending');
    } finally {
      setSavingPending(false);
    }
  };

  // ── Tambah Just Info ────────────────────────────────────────────
  const openAddInfo = (e: React.MouseEvent) => {
    e.stopPropagation();
    setInfoText('');
    setIsAddInfoOpen(true);
  };

  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedPatient) return;
    if (!infoText.trim()) { toast.error('Isi informasi tidak boleh kosong'); return; }
    setSavingInfo(true);
    try {
      const db = await getDB();
      const info: JustInfo = {
        id: generateUUID(),
        noRM: selectedPatient.noRM,
        episodeNo: selectedPatient.episodeNo,
        isi: infoText.trim(),
        shift: getCurrentShift(),
        userId: user.id,
        userName: user.namaLengkap,
        createdAt: Date.now(),
      };
      await db.put('justInfos', info);
      toast.success('Info berhasil ditambahkan');
      setIsAddInfoOpen(false);
      loadData();
    } catch {
      toast.error('Gagal menyimpan info');
    } finally {
      setSavingInfo(false);
    }
  };

  const prioritasColor = (p: string) =>
    p === 'critical' ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400' :
    p === 'urgent'   ? 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400' :
                       'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400';

  const statusColor = (s: string) =>
    s === 'selesai'  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30' :
    s === 'diproses' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30' :
                       'bg-amber-100 text-amber-700 dark:bg-amber-900/30';

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pasien Rawat Inap</h1>
        <p className="text-muted-foreground mt-1">
          {patients.length} pasien aktif — klik kartu untuk detail, tambah pending, atau just info.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 bg-card p-4 rounded-xl border border-border shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari No RM, nama pasien, atau DPJP..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10 h-10 bg-background"
          />
        </div>
        <select
          value={filterRuangan}
          onChange={e => setFilterRuangan(e.target.value)}
          className="h-10 px-3 border border-input rounded-md bg-background text-sm min-w-[160px]"
        >
          <option value="all">Semua Ruangan</option>
          {ruanganList.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        {(searchTerm || filterRuangan !== 'all') && (
          <Button variant="ghost" size="icon" onClick={() => { setSearchTerm(''); setFilterRuangan('all'); }}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Patient Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {filtered.map(patient => {
          const ptPendings = getPatientPendings(patient.noRM);
          const critical = ptPendings.filter(p => p.prioritas === 'critical').length;
          const urgent   = ptPendings.filter(p => p.prioritas === 'urgent').length;
          const normal   = ptPendings.filter(p => p.prioritas === 'normal').length;
          const infoCount = getPatientJustInfos(patient.noRM).length;
          const sideColor = critical > 0 ? 'bg-red-500' : urgent > 0 ? 'bg-orange-500' : 'bg-emerald-500';

          return (
            <Card
              key={patient.noRM}
              className="cursor-pointer hover:border-primary/60 hover:shadow-md transition-all relative overflow-hidden group"
              onClick={() => openDetail(patient)}
            >
              <div className={`absolute top-0 left-0 w-1 h-full ${sideColor}`} />
              <CardContent className="p-5 pl-6">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-mono text-xs text-muted-foreground">{patient.noRM}</span>
                  <button
                    onClick={e => toggleBookmark(patient, e)}
                    className="text-muted-foreground hover:text-amber-500 transition-colors -mt-0.5"
                  >
                    <Star className={`w-4 h-4 ${patient.bookmarked ? 'fill-amber-500 text-amber-500' : ''}`} />
                  </button>
                </div>

                <h3 className="font-bold text-base leading-snug mb-0.5 group-hover:text-primary transition-colors line-clamp-2">
                  {patient.namaPasien}
                </h3>
                <p className="text-xs text-muted-foreground mb-3 line-clamp-1">
                  {patient.ward || patient.roomName} · {patient.bedCode} · {patient.roomType}
                </p>
                <p className="text-xs text-muted-foreground mb-3 truncate">Dr. {patient.dpjp}</p>

                <div className="flex gap-1.5 flex-wrap items-center">
                  {critical > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      <AlertCircle className="w-3 h-3" /> {critical} Critical
                    </span>
                  )}
                  {urgent > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                      <Clock className="w-3 h-3" /> {urgent} Urgent
                    </span>
                  )}
                  {normal > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                      <Clock className="w-3 h-3" /> {normal} Normal
                    </span>
                  )}
                  {infoCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      <Info className="w-3 h-3" /> {infoCount} Info
                    </span>
                  )}
                  {ptPendings.length === 0 && infoCount === 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-muted-foreground bg-muted">
                      <CheckCircle2 className="w-3 h-3" /> Clear
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-20 text-muted-foreground bg-card rounded-xl border border-border">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-semibold">Tidak ada pasien ditemukan</p>
          <p className="text-sm mt-1">
            {patients.length === 0
              ? 'Belum ada data pasien. Import data dari halaman Import.'
              : 'Coba ubah filter atau kata kunci pencarian.'}
          </p>
        </div>
      )}

      {/* ───── DETAIL MODAL ───────────────────────────────── */}
      {selectedPatient && (
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl flex items-center gap-2 flex-wrap">
                <span>{selectedPatient.namaPasien}</span>
                <span className="font-mono text-sm bg-muted px-2 py-0.5 rounded">{selectedPatient.noRM}</span>
                {selectedPatient.bookmarked && <Star className="w-4 h-4 fill-amber-500 text-amber-500" />}
                <div className="ml-auto">
                  <Button
                    size="sm"
                    className="gap-1.5 h-8 bg-teal-700 hover:bg-teal-800 text-white"
                    onClick={() => { setIsDetailOpen(false); navigate(`/cp/${selectedPatient.noRM}`); }}
                  >
                    <ClipboardList className="w-3.5 h-3.5" /> Buat / Lihat CP
                  </Button>
                </div>
              </DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-5 mt-2">
              {/* Info Pasien (kiri) */}
              <div className="md:col-span-2 space-y-4">
                <Card className="shadow-none border-border">
                  <CardHeader className="py-2.5 px-4 bg-muted/40 border-b border-border rounded-t-lg">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <User2 className="w-4 h-4" /> Informasi Pasien
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3 text-sm">
                    {[
                      { label: 'No Episode', value: selectedPatient.episodeNo },
                      { label: 'Tgl Masuk', value: selectedPatient.admissionDate },
                      { label: 'Jenis Kelamin', value: selectedPatient.sexDesc },
                      { label: 'Agama', value: selectedPatient.agama },
                    ].map(row => (
                      <div key={row.label}>
                        <span className="text-xs text-muted-foreground">{row.label}</span>
                        <p className="font-medium">{row.value || '-'}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="shadow-none border-border">
                  <CardHeader className="py-2.5 px-4 bg-muted/40 border-b border-border rounded-t-lg">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <BedDouble className="w-4 h-4" /> Ruang & Dokter
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3 text-sm">
                    {[
                      { label: 'Ruangan', value: `${selectedPatient.ward || selectedPatient.roomName} — ${selectedPatient.roomType}` },
                      { label: 'Bed', value: selectedPatient.bedCode },
                      { label: 'DPJP', value: selectedPatient.dpjp },
                    ].map(row => (
                      <div key={row.label}>
                        <span className="text-xs text-muted-foreground">{row.label}</span>
                        <p className="font-medium">{row.value || '-'}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="shadow-none border-border">
                  <CardHeader className="py-2.5 px-4 bg-muted/40 border-b border-border rounded-t-lg">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <CreditCard className="w-4 h-4" /> Penjaminan
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3 text-sm">
                    {[
                      { label: 'Penjamin', value: selectedPatient.payor },
                      { label: 'Status BPJS', value: selectedPatient.statusBPJS },
                      { label: 'Alert VIP', value: selectedPatient.alertVIP },
                    ].map(row => (
                      <div key={row.label}>
                        <span className="text-xs text-muted-foreground">{row.label}</span>
                        <p className="font-medium">{row.value || '-'}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="shadow-none border-primary/30 bg-primary/5">
                  <CardHeader className="py-2.5 px-4 bg-primary/10 border-b border-primary/20 rounded-t-lg">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Phone className="w-4 h-4 text-primary" /> No HP Penanggung Jawab
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-2">
                    <p className="text-xs text-muted-foreground">Digunakan untuk generate Pesan Kasir via WhatsApp.</p>
                    <div className="flex gap-2">
                      <Input
                        value={noHpPJ}
                        onChange={e => setNoHpPJ(e.target.value)}
                        placeholder="cth: 08123456789"
                        inputMode="tel"
                        className="flex-1 h-9 text-sm"
                      />
                      <Button
                        size="sm"
                        onClick={handleSaveNoHpPJ}
                        disabled={savingHp}
                        className="gap-1.5 h-9 shrink-0"
                      >
                        <Save className="w-3.5 h-3.5" />
                        {savingHp ? 'Menyimpan...' : 'Simpan'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {(selectedPatient.diagnosaMasuk || selectedPatient.diagnosakUtama) && (
                  <Card className="shadow-none border-border">
                    <CardHeader className="py-2.5 px-4 bg-muted/40 border-b border-border rounded-t-lg">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Stethoscope className="w-4 h-4" /> Diagnosa
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 space-y-2 text-sm">
                      {selectedPatient.diagnosaMasuk && (
                        <div>
                          <span className="text-xs text-muted-foreground">Diagnosa Masuk</span>
                          <p className="font-medium">{selectedPatient.diagnosaMasuk}</p>
                        </div>
                      )}
                      {selectedPatient.diagnosakUtama && (
                        <div>
                          <span className="text-xs text-muted-foreground">Diagnosa Utama</span>
                          <p className="font-medium">{selectedPatient.diagnosakUtama}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Pending & Just Info (kanan) */}
              <div className="md:col-span-3 space-y-5">

                {/* Daftar Pending */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="font-bold text-base">
                      Daftar Pending
                      {getPatientPendings(selectedPatient.noRM).length > 0 && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          ({getPatientPendings(selectedPatient.noRM).length} aktif)
                        </span>
                      )}
                    </h3>
                    <Button
                      size="sm"
                      className="gap-1.5 h-8"
                      onClick={openAddPending}
                    >
                      <Plus className="w-3.5 h-3.5" /> Tambah Pending
                    </Button>
                  </div>

                  <div className="space-y-2.5">
                    {getPatientPendings(selectedPatient.noRM).length === 0 ? (
                      <div className="text-center py-8 border border-dashed border-border rounded-lg text-muted-foreground text-sm">
                        <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        Belum ada pending aktif untuk pasien ini
                      </div>
                    ) : (
                      getPatientPendings(selectedPatient.noRM).map(p => (
                        <div key={p.id} className={`p-3 rounded-lg border-l-4 bg-card border border-border ${
                          p.prioritas === 'critical' ? 'border-l-red-500' :
                          p.prioritas === 'urgent'   ? 'border-l-orange-500' :
                                                       'border-l-emerald-500'
                        }`}>
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold border ${prioritasColor(p.prioritas)}`}>
                              {p.prioritas.toUpperCase()}
                            </span>
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${statusColor(p.status)}`}>
                              {p.status.toUpperCase()}
                            </span>
                            <span className="text-xs text-muted-foreground">{p.kategori}</span>
                          </div>
                          <p className="text-sm leading-snug">{p.isiPending}</p>
                          <p className="text-xs text-muted-foreground mt-1.5">
                            {new Date(p.createdAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })} · {p.userName}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Just Info */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="font-bold text-base">
                      Just Info
                      {getPatientJustInfos(selectedPatient.noRM).length > 0 && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          ({getPatientJustInfos(selectedPatient.noRM).length})
                        </span>
                      )}
                    </h3>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 h-8"
                      onClick={openAddInfo}
                    >
                      <Plus className="w-3.5 h-3.5" /> Tambah Info
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {getPatientJustInfos(selectedPatient.noRM).length === 0 ? (
                      <div className="text-center py-8 border border-dashed border-border rounded-lg text-muted-foreground text-sm">
                        <Info className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        Belum ada just info untuk pasien ini
                      </div>
                    ) : (
                      getPatientJustInfos(selectedPatient.noRM).map(j => (
                        <div key={j.id} className="flex gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                          <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm leading-snug">{j.isi}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(j.createdAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })} · {j.userName}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ───── MODAL TAMBAH PENDING ──────────────────────── */}
      <Dialog open={isAddPendingOpen} onOpenChange={v => setIsAddPendingOpen(v)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-col gap-0.5">
              <span>Tambah Pending</span>
              {selectedPatient && (
                <span className="text-sm font-normal text-muted-foreground">
                  {selectedPatient.namaPasien} · {selectedPatient.noRM}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedPatient && (
            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground flex gap-4 flex-wrap mb-1">
              <span>Ruangan: <b className="text-foreground">{selectedPatient.ward || selectedPatient.roomName}</b></span>
              <span>Kelas: <b className="text-foreground">{selectedPatient.roomType}</b></span>
              <span>DPJP: <b className="text-foreground">{selectedPatient.dpjp}</b></span>
              <span>Penjamin: <b className="text-foreground">{selectedPatient.payor}</b></span>
            </div>
          )}

          <form onSubmit={handleSavePending} className="space-y-4 pt-1">
            {/* Kategori + Shift */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Kategori <span className="text-red-500">*</span></label>
                <select
                  value={pendingForm.kategori}
                  onChange={e => setPendingForm(f => ({ ...f, kategori: e.target.value }))}
                  className="h-10 w-full px-3 border border-input rounded-md bg-background text-sm"
                  required
                >
                  {KATEGORI_LIST.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Shift</label>
                <select
                  value={pendingForm.shift}
                  onChange={e => setPendingForm(f => ({ ...f, shift: e.target.value as any }))}
                  className="h-10 w-full px-3 border border-input rounded-md bg-background text-sm"
                >
                  <option value="pagi">Pagi (07–14)</option>
                  <option value="sore">Sore (14–21)</option>
                  <option value="malam">Malam (21–07)</option>
                </select>
              </div>
            </div>

            {/* Isi Pending */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Isi Pending <span className="text-red-500">*</span></label>
              <textarea
                className="w-full min-h-[110px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                placeholder="Jelaskan tugas yang perlu ditindaklanjuti oleh shift berikutnya..."
                value={pendingForm.isiPending}
                onChange={e => setPendingForm(f => ({ ...f, isiPending: e.target.value }))}
                required
                autoFocus
              />
            </div>

            {/* Prioritas */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Prioritas <span className="text-red-500">*</span></label>
              <div className="grid grid-cols-3 gap-2">
                {(['normal', 'urgent', 'critical'] as const).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPendingForm(f => ({ ...f, prioritas: p }))}
                    className={`py-2.5 rounded-lg border-2 text-sm font-semibold transition-all ${
                      pendingForm.prioritas === p
                        ? p === 'critical' ? 'bg-red-500 border-red-500 text-white shadow-sm'
                          : p === 'urgent' ? 'bg-orange-500 border-orange-500 text-white shadow-sm'
                          : 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
                        : 'bg-background border-border text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Deadline + Foto */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" /> Deadline <span className="font-normal text-muted-foreground">(opsional)</span>
                </label>
                <Input
                  type="datetime-local"
                  value={pendingForm.deadline}
                  onChange={e => setPendingForm(f => ({ ...f, deadline: e.target.value }))}
                  className="h-10 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold flex items-center gap-1">
                  <Upload className="w-3.5 h-3.5" /> Foto <span className="font-normal text-muted-foreground">(opsional)</span>
                </label>
                <label className="flex items-center gap-2 h-10 px-3 border border-input rounded-md bg-background cursor-pointer hover:bg-accent transition-colors text-sm">
                  <span className="text-muted-foreground truncate">
                    {pendingForm.fotoBase64 ? '✓ Foto dipilih' : 'Pilih foto...'}
                  </span>
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                </label>
              </div>
            </div>

            {pendingForm.fotoBase64 && (
              <div className="relative inline-block">
                <img src={pendingForm.fotoBase64} alt="Preview" className="h-20 w-auto rounded-lg border border-border object-cover" />
                <button
                  type="button"
                  onClick={() => setPendingForm(f => ({ ...f, fotoBase64: '' }))}
                  className="absolute -top-2 -right-2 bg-destructive text-white rounded-full w-5 h-5 flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            <DialogFooter className="pt-1">
              <Button type="button" variant="outline" onClick={() => setIsAddPendingOpen(false)}>Batal</Button>
              <Button type="submit" disabled={savingPending} className="min-w-[130px]">
                {savingPending ? 'Menyimpan...' : 'Simpan Pending'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ───── MODAL TAMBAH JUST INFO ────────────────────── */}
      <Dialog open={isAddInfoOpen} onOpenChange={v => setIsAddInfoOpen(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex flex-col gap-0.5">
              <span>Tambah Just Info</span>
              {selectedPatient && (
                <span className="text-sm font-normal text-muted-foreground">
                  {selectedPatient.namaPasien} · {selectedPatient.noRM}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveInfo} className="space-y-4 pt-1">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-400">
              <b>Just Info</b> adalah catatan informasi penting yang perlu diketahui shift berikutnya, namun tidak memerlukan tindak lanjut khusus.
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Isi Informasi <span className="text-red-500">*</span></label>
              <textarea
                className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                placeholder="Contoh: Pasien meminta dipindah ke ruang VIP, sudah dikonfirmasi ke keluarga. Menunggu konfirmasi kamar dari housekeeping."
                value={infoText}
                onChange={e => setInfoText(e.target.value)}
                required
                autoFocus
              />
              <p className="text-xs text-muted-foreground text-right">{infoText.length} karakter</p>
            </div>

            <div className="bg-muted/50 rounded-lg p-2.5 text-xs text-muted-foreground flex gap-3">
              <span>Shift: <b className="text-foreground capitalize">{getCurrentShift()}</b></span>
              <span>Dicatat oleh: <b className="text-foreground">{user?.namaLengkap}</b></span>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddInfoOpen(false)}>Batal</Button>
              <Button
                type="submit"
                disabled={savingInfo || !infoText.trim()}
                className="min-w-[130px] bg-blue-600 hover:bg-blue-700 text-white"
              >
                {savingInfo ? 'Menyimpan...' : 'Simpan Info'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
