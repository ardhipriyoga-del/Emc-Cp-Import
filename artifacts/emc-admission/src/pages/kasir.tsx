import React, { useState, useEffect, useCallback } from 'react';
import { getDB, Patient } from '../lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Search, Copy, MessageCircle, X, Phone, User2, CreditCard, ChevronDown } from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────────────────────
const getGreeting = () => {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return 'Pagi';
  if (h >= 12 && h < 15) return 'Siang';
  if (h >= 15 && h < 18) return 'Sore';
  return 'Malam';
};

const toRupiah = (val: string) => {
  const num = parseInt(val.replace(/\D/g, ''), 10);
  if (isNaN(num)) return '';
  return 'Rp ' + num.toLocaleString('id-ID');
};

const parseRupiah = (val: string) => val.replace(/\D/g, '');

const waLink = (hp: string, msg: string) => {
  let num = hp.replace(/\D/g, '');
  if (num.startsWith('0')) num = '62' + num.slice(1);
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
};

// ── Template definitions ──────────────────────────────────────────────────────
type TemplateId =
  | 'obat_pribadi'
  | 'periksa_pribadi'
  | 'obat_periksa_pribadi'
  | 'obat_asuransi_tidak_dijamin'
  | 'obat_asuransi_overlimit'
  | 'periksa_asuransi_tidak_dijamin'
  | 'selisih_jaminan';

interface TemplateInfo {
  id: TemplateId;
  label: string;
  color: string;
  fields: { key: string; label: string; type: 'textarea' | 'rupiah'; placeholder: string }[];
}

const TEMPLATES: TemplateInfo[] = [
  {
    id: 'obat_pribadi',
    label: 'Konfirmasi Obat — Pribadi',
    color: 'bg-emerald-50 border-emerald-300 dark:bg-emerald-900/20 dark:border-emerald-700',
    fields: [{ key: 'daftarObat', label: 'Daftar Obat & Estimasi', type: 'textarea', placeholder: '- Nama obat — Rp 150.000\n- Nama obat — Rp 75.000' }],
  },
  {
    id: 'periksa_pribadi',
    label: 'Konfirmasi Pemeriksaan — Pribadi',
    color: 'bg-blue-50 border-blue-300 dark:bg-blue-900/20 dark:border-blue-700',
    fields: [{ key: 'daftarPeriksa', label: 'Daftar Pemeriksaan & Estimasi', type: 'textarea', placeholder: '- Nama pemeriksaan — Rp 250.000\n- Nama pemeriksaan — Rp 180.000' }],
  },
  {
    id: 'obat_periksa_pribadi',
    label: 'Konfirmasi Obat & Pemeriksaan — Pribadi',
    color: 'bg-violet-50 border-violet-300 dark:bg-violet-900/20 dark:border-violet-700',
    fields: [{ key: 'daftarObatPeriksa', label: 'Daftar Obat & Pemeriksaan + Estimasi', type: 'textarea', placeholder: 'Pemeriksaan:\n- Nama pemeriksaan — Rp 250.000\n\nObat:\n- Nama obat — Rp 150.000' }],
  },
  {
    id: 'obat_asuransi_tidak_dijamin',
    label: 'Konfirmasi Obat — Asuransi Tidak Dijamin',
    color: 'bg-orange-50 border-orange-300 dark:bg-orange-900/20 dark:border-orange-700',
    fields: [{ key: 'daftarObat', label: 'Daftar Obat & Estimasi', type: 'textarea', placeholder: '- Nama obat — Rp 150.000\n- Nama obat — Rp 75.000' }],
  },
  {
    id: 'obat_asuransi_overlimit',
    label: 'Konfirmasi Obat — Asuransi Overlimit',
    color: 'bg-amber-50 border-amber-300 dark:bg-amber-900/20 dark:border-amber-700',
    fields: [{ key: 'daftarObat', label: 'Daftar Obat & Estimasi', type: 'textarea', placeholder: '- Nama obat — Rp 150.000\n- Nama obat — Rp 75.000' }],
  },
  {
    id: 'periksa_asuransi_tidak_dijamin',
    label: 'Konfirmasi Pemeriksaan — Asuransi Tidak Dijamin',
    color: 'bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-700',
    fields: [{ key: 'daftarPeriksa', label: 'Daftar Pemeriksaan & Estimasi', type: 'textarea', placeholder: '- Nama pemeriksaan — Rp 250.000\n- Nama pemeriksaan — Rp 180.000' }],
  },
  {
    id: 'selisih_jaminan',
    label: 'Selisih Jaminan Akhir Asuransi',
    color: 'bg-rose-50 border-rose-300 dark:bg-rose-900/20 dark:border-rose-700',
    fields: [
      { key: 'nominalBilling', label: 'Nominal Billing', type: 'rupiah', placeholder: '5000000' },
      { key: 'nominalJaminan', label: 'Nominal Jaminan Akhir Asuransi', type: 'rupiah', placeholder: '4200000' },
    ],
  },
];

// ── Message generators ────────────────────────────────────────────────────────
function buildMessage(id: TemplateId, namaPasien: string, fields: Record<string, string>): string {
  const salam = `Selamat ${getGreeting()}\nSalam Sehat.\n\nKami dari bagian kasir rawat inap RS EMC Pekayon.`;

  switch (id) {
    case 'obat_pribadi':
      return `${salam}\nKonfirmasi untuk pasien *${namaPasien}* dari dokter diresepkan obat :\n\n${fields.daftarObat || '(daftar obat)'}\n\nApakah dari pihak keluarga bersedia untuk acc pribadi dilakukan/diberikan?\n\nTerimakasih.`;

    case 'periksa_pribadi':
      return `${salam}\nKonfirmasi untuk pasien *${namaPasien}* dari dokter disarankan pemeriksaan :\n\n${fields.daftarPeriksa || '(daftar pemeriksaan)'}\n\nApakah dari pihak keluarga bersedia untuk acc pribadi untuk dilakukan?\n\nTerimakasih.`;

    case 'obat_periksa_pribadi':
      return `${salam}\nKonfirmasi untuk pasien *${namaPasien}* dari dokter disarankan pemeriksaan dan diresepkan obat :\n\n${fields.daftarObatPeriksa || '(daftar obat & pemeriksaan)'}\n\nApakah dari pihak keluarga bersedia untuk acc pribadi untuk dilakukan/diberikan?\n\nTerimakasih.`;

    case 'obat_asuransi_tidak_dijamin':
      return `${salam}\nKonfirmasi untuk pasien *${namaPasien}* dari dokter diresepkan obat :\n\n${fields.daftarObat || '(daftar obat)'}\n\nKarena dari asuransi, obat tersebut tidak dijaminkan.\n\nApakah dari pihak keluarga bersedia untuk acc pribadi untuk diberikan?\n\nTerimakasih.`;

    case 'obat_asuransi_overlimit':
      return `${salam}\nKonfirmasi untuk pasien *${namaPasien}* dari dokter diresepkan obat :\n\n${fields.daftarObat || '(daftar obat)'}\n\nDikarenakan manfaat asuransi peserta telah mencapai batas limit yang ditentukan, tindakan/obat tersebut kemungkinan masih dapat diproses melalui asuransi, namun berpotensi menimbulkan selisih/ekses yang perlu dibayarkan secara pribadi oleh peserta.\n\nApakah dari pihak keluarga bersedia untuk acc pribadi untuk diberikan?\n\nTerimakasih.`;

    case 'periksa_asuransi_tidak_dijamin':
      return `${salam}\nKonfirmasi untuk pasien *${namaPasien}* dari dokter disarankan untuk pemeriksaan :\n\n${fields.daftarPeriksa || '(daftar pemeriksaan)'}\n\nKarena dari asuransi, tindakan/pemeriksaan tersebut tidak dijaminkan.\n\nApakah dari pihak keluarga bersedia untuk acc pribadi untuk dilakukan?\n\nTerimakasih.`;

    case 'selisih_jaminan': {
      const billing  = parseInt(fields.nominalBilling  || '0', 10);
      const jaminan  = parseInt(fields.nominalJaminan  || '0', 10);
      const selisih  = billing - jaminan;
      const fmt = (n: number) => 'Rp ' + Math.max(0, n).toLocaleString('id-ID');
      return `${salam}\nMenginfokan terkait jaminan akhir asuransi pasien *${namaPasien}* telah terbit.\nBiaya yang kami ajukan ke asuransi adalah ${fmt(billing)} dan yang dijaminkan asuransi ${fmt(jaminan)}.\nTerdapat selisih ${fmt(selisih)} yang harus dibayarkan oleh peserta. Rincian/jaminan akhir kami lampirkan.\n\nPembayarannya dapat melalui transfer ke no rekening:\nBCA 6042 87 9998\nBNI 0717 40 1635\na/n PT Kurnia Sejahtera Utama\n\nTerimakasih.`;
    }

    default:
      return '';
  }
}

// ── Page component ────────────────────────────────────────────────────────────
export default function KasirPage() {
  const [patients, setPatients]             = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm]         = useState('');
  const [searchResults, setSearchResults]   = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId | null>(null);
  const [namaPasienManual, setNamaPasienManual]   = useState('');
  const [fields, setFields]                 = useState<Record<string, string>>({});
  const [rawRupiah, setRawRupiah]           = useState<Record<string, string>>({});
  const [message, setMessage]               = useState('');

  // Load patients
  const loadPatients = useCallback(async () => {
    const db = await getDB();
    const all = await db.getAll('patients');
    setPatients(all.filter(p => p.status === 'aktif'));
  }, []);

  useEffect(() => { loadPatients(); }, [loadPatients]);

  // Patient search
  useEffect(() => {
    if (!searchTerm.trim()) { setSearchResults([]); return; }
    const q = searchTerm.toLowerCase();
    setSearchResults(
      patients.filter(p =>
        p.noRM.toLowerCase().includes(q) ||
        p.namaPasien.toLowerCase().includes(q)
      ).slice(0, 8)
    );
  }, [searchTerm, patients]);

  // Auto-generate message on any change
  useEffect(() => {
    if (!selectedTemplate || !namaPasienManual.trim()) { setMessage(''); return; }
    setMessage(buildMessage(selectedTemplate, namaPasienManual.trim(), fields));
  }, [selectedTemplate, namaPasienManual, fields]);

  const selectPatient = (p: Patient) => {
    setSelectedPatient(p);
    setNamaPasienManual(p.namaPasien);
    setSearchTerm('');
    setSearchResults([]);
    setSelectedTemplate(null);
    setFields({});
    setRawRupiah({});
    setMessage('');
  };

  const clearPatient = () => {
    setSelectedPatient(null);
    setNamaPasienManual('');
    setSelectedTemplate(null);
    setFields({});
    setRawRupiah({});
    setMessage('');
  };

  const selectTemplate = (id: TemplateId) => {
    setSelectedTemplate(id);
    setFields({});
    setRawRupiah({});
  };

  const setField = (key: string, val: string) => setFields(f => ({ ...f, [key]: val }));

  const handleRupiahInput = (key: string, raw: string) => {
    const digits = raw.replace(/\D/g, '');
    setRawRupiah(r => ({ ...r, [key]: digits }));
    setField(key, digits);
  };

  const copyMessage = () => {
    if (!message) return;
    navigator.clipboard.writeText(message).then(() => toast.success('Pesan disalin ke clipboard!'));
  };

  const openWhatsApp = () => {
    if (!message) return;
    const hp = selectedPatient?.noHpPJ || '';
    if (!hp) { toast.error('No HP Penanggung Jawab belum diisi di data pasien.'); return; }
    window.open(waLink(hp, message), '_blank');
  };

  const tplInfo = TEMPLATES.find(t => t.id === selectedTemplate);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pesan Kasir</h1>
        <p className="text-muted-foreground mt-1">Generate pesan konfirmasi WhatsApp untuk penanggung jawab pasien.</p>
      </div>

      {/* ── Patient selector ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><User2 className="w-4 h-4" /> Pilih Pasien</CardTitle>
        </CardHeader>
        <CardContent>
          {selectedPatient ? (
            <div className="flex items-start justify-between gap-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 dark:border-emerald-700 rounded-lg p-4">
              <div className="space-y-1 min-w-0">
                <p className="font-bold text-emerald-800 dark:text-emerald-300 text-base">{selectedPatient.namaPasien}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1"><User2 className="w-3 h-3" /> {selectedPatient.noRM}</span>
                  <span className="flex items-center gap-1"><CreditCard className="w-3 h-3" /> {selectedPatient.payor || '-'}</span>
                  {selectedPatient.noHpPJ && (
                    <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                      <Phone className="w-3 h-3" /> {selectedPatient.noHpPJ}
                    </span>
                  )}
                  {!selectedPatient.noHpPJ && (
                    <span className="flex items-center gap-1 text-amber-600 font-medium">
                      <Phone className="w-3 h-3" /> No HP PJ belum diisi
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{selectedPatient.ward || selectedPatient.roomName} · Dr. {selectedPatient.dpjp}</p>
              </div>
              <button onClick={clearPatient} className="text-muted-foreground hover:text-destructive shrink-0 mt-0.5">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari No RM atau nama pasien aktif..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-10"
                autoComplete="off"
              />
              {searchResults.length > 0 && (
                <div className="absolute z-50 w-full bg-popover border border-border rounded-lg shadow-lg mt-1 max-h-56 overflow-y-auto">
                  {searchResults.map(p => (
                    <button
                      key={p.noRM}
                      type="button"
                      className="w-full text-left px-4 py-3 hover:bg-accent transition-colors border-b border-border/50 last:border-0"
                      onClick={() => selectPatient(p)}
                    >
                      <p className="font-semibold text-sm">{p.namaPasien}</p>
                      <p className="text-xs text-muted-foreground">{p.noRM} · {p.ward || p.roomName} · {p.payor}</p>
                    </button>
                  ))}
                </div>
              )}
              {searchTerm.length > 1 && searchResults.length === 0 && (
                <div className="absolute z-50 w-full bg-popover border border-border rounded-lg shadow-lg mt-1 p-4 text-center text-sm text-muted-foreground">
                  Pasien tidak ditemukan
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Template picker ── */}
      {selectedPatient && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageCircle className="w-4 h-4" /> Pilih Jenis Pesan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {TEMPLATES.map(t => (
                <button
                  key={t.id}
                  onClick={() => selectTemplate(t.id)}
                  className={`text-left px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                    selectedTemplate === t.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-primary/40 hover:bg-muted/50'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Form & preview ── */}
      {selectedTemplate && tplInfo && selectedPatient && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Detail Pesan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Nama pasien (editable) */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Nama Pasien <span className="text-xs font-normal text-muted-foreground">(dapat diedit)</span></label>
                <Input
                  value={namaPasienManual}
                  onChange={e => setNamaPasienManual(e.target.value)}
                  placeholder="Nama pasien..."
                />
              </div>

              {/* Dynamic fields */}
              {tplInfo.fields.map(f => (
                <div key={f.key} className="space-y-1.5">
                  <label className="text-sm font-semibold">{f.label}</label>
                  {f.type === 'textarea' ? (
                    <textarea
                      className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                      placeholder={f.placeholder}
                      value={fields[f.key] || ''}
                      onChange={e => setField(f.key, e.target.value)}
                    />
                  ) : (
                    <div className="space-y-1">
                      <Input
                        placeholder={f.placeholder}
                        value={rawRupiah[f.key] || ''}
                        onChange={e => handleRupiahInput(f.key, e.target.value)}
                        inputMode="numeric"
                      />
                      {rawRupiah[f.key] && (
                        <p className="text-xs text-muted-foreground pl-1">{toRupiah(rawRupiah[f.key])}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Selisih preview for selisih_jaminan */}
              {selectedTemplate === 'selisih_jaminan' && fields.nominalBilling && fields.nominalJaminan && (
                <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Selisih (otomatis)</p>
                  <p className="font-bold text-rose-700 dark:text-rose-400 text-base">
                    {toRupiah(String(Math.max(0, parseInt(fields.nominalBilling || '0', 10) - parseInt(fields.nominalJaminan || '0', 10))))}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Preview */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Preview Pesan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className={`rounded-lg border p-4 ${tplInfo.color}`}>
                <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed text-foreground">
                  {message || <span className="text-muted-foreground italic">Isi form di kiri untuk melihat preview pesan...</span>}
                </pre>
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  onClick={copyMessage}
                  disabled={!message}
                  variant="outline"
                  className="flex-1 gap-2"
                >
                  <Copy className="w-4 h-4" /> Salin Pesan
                </Button>
                <Button
                  onClick={openWhatsApp}
                  disabled={!message}
                  className="flex-1 gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white"
                >
                  <MessageCircle className="w-4 h-4" /> Kirim WhatsApp
                </Button>
              </div>

              {!selectedPatient.noHpPJ && (
                <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
                  ⚠️ Tombol WhatsApp perlu No HP PJ — isi di detail pasien terlebih dahulu.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
