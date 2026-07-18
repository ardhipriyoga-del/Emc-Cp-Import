import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRoute, useLocation } from 'wouter';
import { getDB, Patient, MasterTarifItem, CPEstimasi, CPItem, CPTemplate } from '../lib/db';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';
import { generateCPPDF, exportCPToExcel } from '../lib/cpExport';
import { generateUUID } from '../lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Search, Plus, Trash2, Pencil, ChevronDown, ArrowLeft,
  FileText, Download, Save, Copy, FileSpreadsheet, Layers,
  AlertCircle, Star, X, RefreshCw, ClipboardList, List, Users
} from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────

const KELAS_KAMAR = ['Kelas III', 'Kelas II', 'Kelas I', 'VIP', 'Suite', 'ICU', 'HCU', 'Isolasi'];

const CP_KATEGORI = [
  'Kamar', 'Laboratorium', 'Radiologi', 'Farmasi', 'Alkes', 'BHP',
  'Tindakan', 'Visit Dokter', 'Konsultasi', 'Administrasi',
  'Rehab', 'Hemodialisa', 'Gizi', 'Penunjang', 'Lainnya',
];

const SUB_KATEGORI: Record<string, string[]> = {
  Laboratorium: ['Hematologi', 'Kimia Klinik', 'Imunologi', 'Urinalisis', 'Mikrobiologi', 'Parasitologi'],
  Radiologi: ['X-Ray', 'CT Scan', 'MRI', 'USG', 'Fluoroskopi'],
  Farmasi: ['Obat Oral', 'Obat Injeksi', 'Antibiotik', 'Analgetik', 'Infus/Cairan'],
  Alkes: ['Disposable', 'Implant', 'Set Tindakan'],
  BHP: ['Bahan Habis Pakai', 'Sarung Tangan', 'Kassa & Plester'],
  Tindakan: ['Operasi', 'Tindakan Medis', 'Perawatan Luka', 'Fisioterapi'],
  'Visit Dokter': ['DPJP', 'Konsultan', 'Anestesi', 'Asisten'],
  Konsultasi: ['Interna', 'Bedah', 'Anak', 'Kebidanan', 'Lainnya'],
  Administrasi: ['Biaya Admin', 'Biaya Pendamping', 'Sewa Alat'],
  Rehab: ['Fisioterapi', 'Terapi Wicara', 'Okupasi Terapi'],
  Hemodialisa: ['HD Reguler', 'HD Cito', 'CAPD'],
  Gizi: ['Makanan Biasa', 'Diet Khusus', 'Enteral'],
  Penunjang: ['EKG', 'Spirometri', 'Endoskopi'],
};

const fmtRp = (n: number) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');

const emptyCustomForm = () => ({
  kategori: CP_KATEGORI[1],
  subKategori: '',
  namaItem: '',
  qty: 1,
  hargaSatuan: 0,
  keterangan: '',
});

// ── Kelas Kamar → Master Tarif mapping (single source of truth) ──────────────
//
// Patient data uses:  "Kelas III" | "Kelas II" | "Kelas I" | "VIP" | "Suite" | "ICU" | "HCU" | "Isolasi"
// Master Tarif uses:  "Class III" | "Class II" | "Class I" | "VIP" | "Suite" | "Premium" | "ICU" | "HCU" | "Isolasi"
//
// Add/update entries here only — no other place needs to change.
const KELAS_MAP: Record<string, string> = {
  'Kelas III': 'Class III',
  'Kelas II':  'Class II',
  'Kelas I':   'Class I',
  'VIP':       'VIP',
  'Suite':     'Suite',
  'Premium':   'Premium',
  'ICU':       'ICU',
  'HCU':       'HCU',
  'Isolasi':   'Isolasi',
};

/**
 * Returns the Master Tarif class string that corresponds to the patient's
 * room class. Falls back to the raw value if the kelas is not in the map.
 */
const toMasterTarifKelas = (kelasKamar: string): string =>
  KELAS_MAP[kelasKamar] ?? kelasKamar;

/**
 * True if a Master Tarif kelasTarif value matches the patient's room class.
 * Comparison is case-insensitive and ignores leading/trailing whitespace.
 */
const matchesKelas = (kelasTarif: string, kelasKamar: string): boolean =>
  kelasTarif.trim().toLowerCase() === toMasterTarifKelas(kelasKamar).trim().toLowerCase();

/**
 * Keywords that indicate a Master Tarif item is a ward/room accommodation charge.
 * An item must match at least one INCLUDE keyword and zero EXCLUDE keywords.
 *
 * EXCLUDE takes priority — e.g. "Kamar Operasi" contains "kamar" (include)
 * but also "operasi" (exclude), so it is correctly rejected.
 */
const KAMAR_INCLUDE_KEYWORDS = [
  'akomodasi', 'kamar', 'rawat inap', 'room', 'perawatan kamar',
  'icu', 'hcu', 'isolasi', 'intensif', 'intermediate',
];
const KAMAR_EXCLUDE_KEYWORDS = [
  'operasi', 'kamar ok', 'ok besar', 'ok kecil', 'operating', 'bedah sentral',
];
const isKamarItem = (name: string) => {
  const lower = name.toLowerCase();
  if (KAMAR_EXCLUDE_KEYWORDS.some(k => lower.includes(k))) return false;
  return KAMAR_INCLUDE_KEYWORDS.some(k => lower.includes(k));
};

/** Keywords that flag a tarif item as a doctor visit fee. */
const VD_KEYWORDS = ['visit', 'visite', 'dokter', 'dpjp', 'jasa dokter'];
const isVisitDokterItem = (name: string) =>
  VD_KEYWORDS.some(k => name.toLowerCase().includes(k));

const emptyCP = (patient: Patient, user: any): CPEstimasi => ({
  id: generateUUID(),
  noRM: patient.noRM,
  episodeNo: patient.episodeNo,
  namaPasien: patient.namaPasien,
  dpjp: patient.dpjp,
  penjamin: patient.payor,
  diagnosaPrimer: patient.diagnosaMasuk || patient.diagnosakUtama || '',
  tanggalMasuk: patient.admissionDate,
  kelasKamar: patient.roomType || 'Kelas I',
  lamaRawat: 1,
  tarifKamar: 0,
  items: [],
  grandTotal: 0,
  catatan: '',
  createdBy: user?.namaLengkap || '-',
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

// ── Component ─────────────────────────────────────────────────────────────────

export default function CPPage() {
  const [, params] = useRoute('/cp/:noRM');
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { rsName } = useAppContext();
  const noRM = params?.noRM;

  // Patient & CP list
  const [patient, setPatient] = useState<Patient | null>(null);
  const [cpList, setCpList] = useState<CPEstimasi[]>([]);
  const [activeCpId, setActiveCpId] = useState<string>('new');

  // Working CP state
  const [diagnosaPrimer, setDiagnosaPrimer] = useState('');
  const [kelasKamar, setKelasKamar] = useState('Kelas I');
  const [lamaRawat, setLamaRawat] = useState(1);
  const [tarifKamar, setTarifKamar] = useState(0);
  const [dpjp, setDpjp] = useState('');
  const [penjamin, setPenjamin] = useState('');
  const [catatan, setCatatan] = useState('');
  const [items, setItems] = useState<CPItem[]>([]);
  const [currentCpId, setCurrentCpId] = useState<string>('');

  // Master tarif search
  const [masterItems, setMasterItems] = useState<MasterTarifItem[]>([]);
  const [hasMasterTarif, setHasMasterTarif] = useState(false);

  // Add item modal
  const [addMode, setAddMode] = useState<'master' | 'custom' | 'bulk' | null>(null);
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Master tarif search dialog
  const [masterSearch, setMasterSearch] = useState('');
  const [masterKatFilter, setMasterKatFilter] = useState('');

  // Inline editing states (allow blank before blur)
  const [editingQty, setEditingQty] = useState<Record<string, string>>({});
  const [customQtyStr, setCustomQtyStr] = useState('1');

  // Kelas-filtered master items (updates on kelas change)
  const [filteredMasterItems, setFilteredMasterItems] = useState<MasterTarifItem[]>([]);

  // Bulk import state
  const [bulkText, setBulkText] = useState('');
  const [bulkKategori, setBulkKategori] = useState('');
  const [bulkQtyStr, setBulkQtyStr] = useState('1');
  const [bulkHarga, setBulkHarga] = useState<number | ''>('');

  // Custom item dialog
  const [customForm, setCustomForm] = useState(emptyCustomForm());
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  // Template
  const [templates, setTemplates] = useState<CPTemplate[]>([]);
  const [isTemplateOpen, setIsTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [isSaveTemplateOpen, setIsSaveTemplateOpen] = useState(false);

  const [saving, setSaving] = useState(false);

  // Tarif kamar picker (shown when multiple kamar candidates exist for a kelas)
  const [kamarCandidates, setKamarCandidates] = useState<MasterTarifItem[]>([]);
  const [showKamarPicker, setShowKamarPicker] = useState(false);
  const [kamarWarning, setKamarWarning] = useState('');

  // Visit Dokter Spesialis quick-add dialog
  const [vdPickerOpen, setVdPickerOpen] = useState(false);
  const [vdSpesialis, setVdSpesialis] = useState('');
  const [vdSelectedItem, setVdSelectedItem] = useState<MasterTarifItem | null>(null);
  const [vdQtyStr, setVdQtyStr] = useState('');
  const [vdSearch, setVdSearch] = useState('');

  // ── Load patient + data ──────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!noRM) return;
    const db = await getDB();
    const p = await db.get('patients', noRM);
    if (!p) { toast.error('Pasien tidak ditemukan.'); navigate('/patients'); return; }
    setPatient(p);

    // Load existing CPs
    const cps = await db.getAllFromIndex('cpEstimasis', 'noRM', noRM);
    setCpList(cps.sort((a, b) => b.updatedAt - a.updatedAt));

    // Load active master tarif items
    const tarifs = await db.getAll('masterTarifs');
    const active = tarifs.find(t => t.status === 'aktif');
    if (active) {
      setHasMasterTarif(true);
      const items = await db.getAllFromIndex('masterTarifItems', 'masterTarifId', active.id!);
      setMasterItems(items);
      // filteredMasterItems + tarifKamar will be set by the kelas useEffect
    }

    // Load templates
    const tmpl = await db.getAll('cpTemplates');
    setTemplates(tmpl.sort((a, b) => b.createdAt - a.createdAt));

    // Init new CP
    if (cps.length === 0) {
      startNew(p);
    } else {
      loadCP(cps[0]);
    }
  }, [noRM]);

  useEffect(() => { loadData(); }, [loadData]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowAddDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Filter master tarif by kelas (via KELAS_MAP); handle kamar candidates + re-price items
  useEffect(() => {
    if (!hasMasterTarif || masterItems.length === 0) return;

    // Use the single mapping source
    const filtered = masterItems.filter(it => matchesKelas(it.kelasTarif, kelasKamar));
    setFilteredMasterItems(filtered);

    // Identify accommodation/room candidates
    const kamarItems = filtered.filter(it => isKamarItem(it.orderItem));
    if (kamarItems.length === 0) {
      const mappedKelas = toMasterTarifKelas(kelasKamar);
      setKamarWarning(`Tidak ada item Master Tarif untuk ${mappedKelas}.`);
      setKamarCandidates([]);
    } else if (kamarItems.length === 1) {
      setKamarWarning('');
      setKamarCandidates([]);
      setTarifKamar(kamarItems[0].price);
    } else {
      // Multiple candidates: auto-select first, let user swap via picker button
      setKamarWarning('');
      setKamarCandidates(kamarItems);
      setTarifKamar(prev => {
        // Keep existing price if it already belongs to a candidate, else take first
        return kamarItems.some(k => k.price === prev) ? prev : kamarItems[0].price;
      });
    }

    // Re-price existing master_tarif items when kelas changes
    setItems(prev => prev.map(it => {
      if (it.sumber !== 'master_tarif') return it;
      const match = filtered.find(m =>
        m.id === it.masterTarifItemId ||
        m.orderItem.toLowerCase() === it.namaItem.toLowerCase()
      );
      if (!match) return it;
      return { ...it, hargaSatuan: match.price, subtotal: it.qty * match.price };
    }));
  }, [kelasKamar, masterItems, hasMasterTarif]);

  // ── CP CRUD ───────────────────────────────────────────────────────────────

  const startNew = (p?: Patient) => {
    const pt = p || patient;
    if (!pt) return;
    const id = generateUUID();
    setCurrentCpId(id);
    setActiveCpId('new');
    setDiagnosaPrimer(pt.diagnosaMasuk || pt.diagnosakUtama || '');
    setKelasKamar(pt.roomType || 'Kelas I');
    setLamaRawat(1);
    setTarifKamar(0);
    setDpjp(pt.dpjp || '');
    setPenjamin(pt.payor || '');
    setCatatan('');
    setItems([]);
  };

  const loadCP = (cp: CPEstimasi) => {
    setCurrentCpId(cp.id);
    setActiveCpId(cp.id);
    setDiagnosaPrimer(cp.diagnosaPrimer);
    setKelasKamar(cp.kelasKamar);
    setLamaRawat(cp.lamaRawat);
    setTarifKamar(cp.tarifKamar);
    setDpjp(cp.dpjp);
    setPenjamin(cp.penjamin);
    setCatatan(cp.catatan);
    setItems(cp.items);
  };

  const buildCP = (): CPEstimasi => {
    const totalKamar = tarifKamar * lamaRawat;
    const totalItems = items.reduce((s, it) => s + it.subtotal, 0);
    return {
      id: currentCpId || generateUUID(),
      noRM: patient!.noRM,
      episodeNo: patient!.episodeNo,
      namaPasien: patient!.namaPasien,
      dpjp,
      penjamin,
      diagnosaPrimer,
      tanggalMasuk: patient!.admissionDate,
      kelasKamar,
      lamaRawat,
      tarifKamar,
      items,
      grandTotal: totalKamar + totalItems,
      catatan,
      createdBy: user?.namaLengkap || '-',
      createdAt: cpList.find(c => c.id === currentCpId)?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
  };

  const handleSave = async () => {
    if (!patient) return;
    setSaving(true);
    try {
      const db = await getDB();
      const cp = buildCP();
      if (!currentCpId) setCurrentCpId(cp.id);
      await db.put('cpEstimasis', cp);
      toast.success('CP berhasil disimpan.');
      const cps = await db.getAllFromIndex('cpEstimasis', 'noRM', patient.noRM);
      setCpList(cps.sort((a, b) => b.updatedAt - a.updatedAt));
      setActiveCpId(cp.id);
    } catch (err: any) {
      toast.error('Gagal menyimpan: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cpId: string) => {
    if (!confirm('Hapus CP ini?')) return;
    const db = await getDB();
    await db.delete('cpEstimasis', cpId);
    const cps = await db.getAllFromIndex('cpEstimasis', 'noRM', patient!.noRM);
    const sorted = cps.sort((a, b) => b.updatedAt - a.updatedAt);
    setCpList(sorted);
    if (sorted.length > 0) loadCP(sorted[0]);
    else startNew();
    toast.success('CP dihapus.');
  };

  const handleDuplicate = async () => {
    if (!patient) return;
    const cp = buildCP();
    const newCp: CPEstimasi = { ...cp, id: generateUUID(), createdAt: Date.now(), updatedAt: Date.now() };
    const db = await getDB();
    await db.put('cpEstimasis', newCp);
    const cps = await db.getAllFromIndex('cpEstimasis', 'noRM', patient.noRM);
    const sorted = cps.sort((a, b) => b.updatedAt - a.updatedAt);
    setCpList(sorted);
    loadCP(newCp);
    toast.success('CP berhasil diduplikasi.');
  };

  // ── Items ─────────────────────────────────────────────────────────────────

  const updateItem = (id: string, changes: Partial<CPItem>) => {
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      const updated = { ...it, ...changes };
      updated.subtotal = updated.qty * updated.hargaSatuan;
      return updated;
    }));
  };

  const deleteItem = (id: string) => {
    setItems(prev => prev.filter(it => it.id !== id));
  };

  const addFromMaster = (mItem: MasterTarifItem) => {
    if (items.some(it => it.masterTarifItemId === mItem.id)) {
      toast.error('Item ini sudah ada di dalam CP.');
      return;
    }
    const newItem: CPItem = {
      id: generateUUID(),
      sumber: 'master_tarif',
      masterTarifItemId: mItem.id,
      kategori: guessKategori(mItem.orderItem),
      subKategori: '',
      namaItem: mItem.orderItem,
      qty: 1,
      hargaSatuan: mItem.price,
      subtotal: mItem.price,
      keterangan: '',
    };
    setItems(prev => [...prev, newItem]);
    toast.success(`"${mItem.orderItem}" ditambahkan.`);
  };

  const guessKategori = (name: string): string => {
    const n = name.toLowerCase();
    if (n.includes('lab') || n.includes('hema') || n.includes('cbc') || n.includes('darah') || n.includes('urin') || n.includes('sgot') || n.includes('sgpt')) return 'Laboratorium';
    if (n.includes('rontgen') || n.includes('thorax') || n.includes('ct scan') || n.includes('mri') || n.includes('usg') || n.includes('x-ray') || n.includes('ro ')) return 'Radiologi';
    if (n.includes('obat') || n.includes('tablet') || n.includes('kapsul') || n.includes('sirup')) return 'Farmasi';
    if (n.includes('infus') || n.includes('cairan') || n.includes('injection') || n.includes('ampul') || n.includes('vial')) return 'Farmasi';
    if (n.includes('kamar') || n.includes('rawat')) return 'Kamar';
    if (n.includes('visit') || n.includes('dokter') || n.includes('dpjp') || n.includes('visite')) return 'Visit Dokter';
    if (n.includes('konsul')) return 'Konsultasi';
    if (n.includes('admin') || n.includes('pendamping')) return 'Administrasi';
    if (n.includes('alkes') || n.includes('set') || n.includes('kassa') || n.includes('spuit') || n.includes('kateter')) return 'Alkes';
    if (n.includes('tindakan') || n.includes('bedah') || n.includes('operasi') || n.includes('biopsi')) return 'Tindakan';
    if (n.includes('fisio') || n.includes('rehab')) return 'Rehab';
    if (n.includes('hd') || n.includes('dialisa')) return 'Hemodialisa';
    if (n.includes('gizi') || n.includes('diet') || n.includes('makan')) return 'Gizi';
    return 'Lainnya';
  };

  const openCustomForm = (item?: CPItem) => {
    if (item) {
      setEditingItemId(item.id);
      setCustomForm({
        kategori: item.kategori,
        subKategori: item.subKategori,
        namaItem: item.namaItem,
        qty: item.qty,
        hargaSatuan: item.hargaSatuan,
        keterangan: item.keterangan,
      });
      setCustomQtyStr(String(item.qty));
    } else {
      setEditingItemId(null);
      setCustomForm(emptyCustomForm());
      setCustomQtyStr('1');
    }
    setAddMode('custom');
  };

  const handleSaveCustom = () => {
    if (!customForm.namaItem.trim()) { toast.error('Nama item harus diisi.'); return; }
    if (customForm.hargaSatuan <= 0) { toast.error('Harga satuan harus diisi.'); return; }

    if (editingItemId) {
      // Edit existing
      updateItem(editingItemId, {
        kategori: customForm.kategori,
        subKategori: customForm.subKategori,
        namaItem: customForm.namaItem,
        qty: customForm.qty,
        hargaSatuan: customForm.hargaSatuan,
        subtotal: customForm.qty * customForm.hargaSatuan,
        keterangan: customForm.keterangan,
      });
      toast.success('Item Custom diperbarui.');
    } else {
      const newItem: CPItem = {
        id: generateUUID(),
        sumber: 'custom',
        kategori: customForm.kategori,
        subKategori: customForm.subKategori,
        namaItem: customForm.namaItem,
        qty: customForm.qty,
        hargaSatuan: customForm.hargaSatuan,
        subtotal: customForm.qty * customForm.hargaSatuan,
        keterangan: customForm.keterangan,
      };
      setItems(prev => [...prev, newItem]);
      toast.success('Item Custom ditambahkan.');
    }
    setAddMode(null);
    setEditingItemId(null);
  };

  const handleBulkImport = () => {
    const lines = bulkText.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) { toast.error('Masukkan minimal 1 nama item.'); return; }
    const qty = Math.max(1, parseInt(bulkQtyStr) || 1);
    const harga = typeof bulkHarga === 'number' ? bulkHarga : 0;
    const newItems: CPItem[] = lines.map(name => ({
      id: generateUUID(),
      sumber: 'custom' as const,
      masterTarifItemId: undefined,
      kategori: bulkKategori || 'Lainnya',
      subKategori: '',
      namaItem: name,
      qty,
      hargaSatuan: harga,
      subtotal: qty * harga,
      keterangan: '',
    }));
    setItems(prev => [...prev, ...newItems]);
    toast.success(`${newItems.length} item berhasil ditambahkan.`);
    setAddMode(null);
    setBulkText('');
    setBulkKategori('');
    setBulkQtyStr('1');
    setBulkHarga('');
  };

  const handleAddVisitDokter = () => {
    if (!vdSpesialis.trim()) { toast.error('Nama spesialis harus diisi.'); return; }
    const qty = Math.max(1, parseInt(vdQtyStr) || lamaRawat);
    const harga = vdSelectedItem?.price ?? 0;
    const newItem: CPItem = {
      id: generateUUID(),
      sumber: vdSelectedItem ? 'master_tarif' : 'custom',
      masterTarifItemId: vdSelectedItem?.id,
      kategori: 'Visit Dokter',
      subKategori: 'DPJP',
      namaItem: vdSpesialis.trim(),
      qty,
      hargaSatuan: harga,
      subtotal: qty * harga,
      keterangan: vdSelectedItem?.orderItem || '',
    };
    setItems(prev => [...prev, newItem]);
    toast.success(`Visit ${vdSpesialis.trim()} ditambahkan.`);
    setVdPickerOpen(false);
    setVdSpesialis('');
    setVdSelectedItem(null);
    setVdQtyStr('');
    setVdSearch('');
  };

  const openEditMaster = (item: CPItem) => {
    setEditingItemId(item.id);
    setCustomForm({
      kategori: item.kategori,
      subKategori: item.subKategori,
      namaItem: item.namaItem,
      qty: item.qty,
      hargaSatuan: item.hargaSatuan,
      keterangan: item.keterangan,
    });
    setAddMode('custom');
  };

  // ── Template ──────────────────────────────────────────────────────────────

  const handleSaveAsTemplate = async () => {
    if (!templateName.trim()) { toast.error('Nama template harus diisi.'); return; }
    const db = await getDB();
    const tmpl: CPTemplate = {
      nama: templateName.trim(),
      deskripsi: diagnosaPrimer,
      kelasKamar,
      lamaRawat,
      tarifKamar,
      items: items.map(it => ({ ...it, id: generateUUID() })),
      createdBy: user?.namaLengkap || '-',
      createdAt: Date.now(),
    };
    await db.add('cpTemplates', tmpl);
    const tmplAll = await db.getAll('cpTemplates');
    setTemplates(tmplAll.sort((a, b) => b.createdAt - a.createdAt));
    toast.success(`Template "${tmpl.nama}" berhasil disimpan.`);
    setIsSaveTemplateOpen(false);
    setTemplateName('');
  };

  const handleLoadTemplate = (tmpl: CPTemplate) => {
    setKelasKamar(tmpl.kelasKamar);
    setLamaRawat(tmpl.lamaRawat);
    setTarifKamar(tmpl.tarifKamar);
    setItems(tmpl.items.map(it => ({ ...it, id: generateUUID() })));
    setIsTemplateOpen(false);
    toast.success(`Template "${tmpl.nama}" dimuat. Anda dapat mengedit item sesuai kebutuhan.`);
  };

  const handleDeleteTemplate = async (id: number) => {
    if (!confirm('Hapus template ini?')) return;
    const db = await getDB();
    await db.delete('cpTemplates', id);
    setTemplates(prev => prev.filter(t => t.id !== id));
    toast.success('Template dihapus.');
  };

  // ── Totals ────────────────────────────────────────────────────────────────

  const totalKamar = tarifKamar * lamaRawat;
  const categoryTotals: Record<string, number> = {};
  for (const it of items) {
    categoryTotals[it.kategori] = (categoryTotals[it.kategori] || 0) + it.subtotal;
  }
  const totalItems = items.reduce((s, it) => s + it.subtotal, 0);
  const grandTotal = totalKamar + totalItems;

  // ── Export ────────────────────────────────────────────────────────────────

  const handleExportPDF = () => {
    const cp = buildCP();
    generateCPPDF(cp, rsName);
  };

  const handleExportExcel = () => {
    const cp = buildCP();
    exportCPToExcel(cp, rsName);
  };

  // ── Computed master search results (kelas-filtered + text/category search) ──

  const masterSearchResults = (() => {
    let list = filteredMasterItems;
    if (masterKatFilter) {
      list = list.filter(it => guessKategori(it.orderItem) === masterKatFilter);
    }
    if (masterSearch.length >= 2) {
      const q = masterSearch.toLowerCase();
      list = list.filter(it =>
        it.orderItem.toLowerCase().includes(q) ||
        it.orderItemCode.toLowerCase().includes(q)
      );
    } else if (!masterKatFilter) {
      return []; // Need either ≥2 chars or a category filter
    }
    return list.slice(0, 50);
  })();

  // ── Render ────────────────────────────────────────────────────────────────

  if (!patient) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/patients')} className="-ml-2">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-primary" />
              CP Estimasi Biaya
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {patient.namaPasien} · {patient.noRM} · {patient.episodeNo}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-1.5">
            <FileText className="w-3.5 h-3.5" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel} className="gap-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
            <Save className="w-3.5 h-3.5" /> {saving ? 'Menyimpan...' : 'Simpan CP'}
          </Button>
        </div>
      </div>

      {/* ── CP selector bar ── */}
      {(cpList.length > 0 || activeCpId !== 'new') && (
        <div className="flex gap-2 overflow-x-auto pb-1 flex-wrap">
          <button
            onClick={() => startNew()}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap ${
              activeCpId === 'new'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card border-border hover:border-primary/50'
            }`}
          >
            <Plus className="w-3 h-3" /> Buat CP Baru
          </button>
          {cpList.map((cp, i) => (
            <button
              key={cp.id}
              onClick={() => { loadCP(cp); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap ${
                activeCpId === cp.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border hover:border-primary/50'
              }`}
            >
              CP {i + 1} — {new Date(cp.updatedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
            </button>
          ))}
        </div>
      )}

      {!hasMasterTarif && (
        <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl p-4 text-sm">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-amber-800 dark:text-amber-300">Master Tarif belum aktif.</span>
            <span className="text-amber-700 dark:text-amber-400 ml-1">
              Fitur "Pilih dari Master Tarif" tidak tersedia. Hubungi Super User untuk mengupload Master Tarif.
              Anda tetap dapat menambahkan Item Custom.
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* ── LEFT: Form + Items ── */}
        <div className="xl:col-span-2 space-y-5">

          {/* Patient / CP info */}
          <Card>
            <CardHeader className="py-3 px-4 border-b border-border bg-muted/40">
              <CardTitle className="text-sm font-semibold">Informasi CP</CardTitle>
            </CardHeader>
            <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Diagnosa</label>
                <Input
                  value={diagnosaPrimer}
                  onChange={e => setDiagnosaPrimer(e.target.value)}
                  placeholder="Diagnosa primer..."
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dokter DPJP</label>
                <Input value={dpjp} onChange={e => setDpjp(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Penjamin</label>
                <Input value={penjamin} onChange={e => setPenjamin(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Kelas Kamar</label>
                <select
                  value={kelasKamar}
                  onChange={e => setKelasKamar(e.target.value)}
                  className="h-9 w-full px-3 rounded-md border border-input bg-background text-sm"
                >
                  {KELAS_KAMAR.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lama Rawat (hari)</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={lamaRawat === 0 ? '' : String(lamaRawat)}
                  onChange={e => {
                    const val = e.target.value.replace(/[^0-9]/g, '');
                    setLamaRawat(val === '' ? 0 : Math.max(0, parseInt(val) || 0));
                  }}
                  onBlur={() => { if (!lamaRawat || lamaRawat < 1) setLamaRawat(1); }}
                  placeholder="1"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Tarif Kamar/Hari
                  {hasMasterTarif && <span className="ml-1 text-primary font-normal">(auto)</span>}
                </label>
                {hasMasterTarif ? (
                  <div className="space-y-1">
                    <div className="flex gap-1.5 items-center">
                      <div className="h-9 flex-1 px-3 rounded-md border border-input bg-muted text-sm flex items-center font-medium text-muted-foreground">
                        {tarifKamar > 0
                          ? fmtRp(tarifKamar)
                          : <span className="text-orange-500 text-xs font-normal">Belum tersedia</span>}
                      </div>
                      {kamarCandidates.length > 1 && (
                        <Button
                          size="sm" variant="outline"
                          className="h-9 px-2.5 text-xs shrink-0"
                          onClick={() => setShowKamarPicker(true)}
                        >
                          Ganti
                        </Button>
                      )}
                    </div>
                    {kamarWarning && (
                      <p className="text-xs text-orange-600 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 shrink-0" />{kamarWarning}
                      </p>
                    )}
                  </div>
                ) : (
                  <Input
                    type="number" min={0}
                    value={tarifKamar}
                    onChange={e => setTarifKamar(Number(e.target.value) || 0)}
                    className="h-9 text-sm"
                  />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Items table */}
          <Card>
            <CardHeader className="py-3 px-4 border-b border-border bg-muted/40">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Item Clinical Pathway ({items.length})</CardTitle>
                {/* Tambah Item dropdown */}
                <div className="relative" ref={dropdownRef}>
                  <Button
                    size="sm"
                    className="gap-1.5 h-8"
                    onClick={() => setShowAddDropdown(v => !v)}
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah Item <ChevronDown className="w-3 h-3" />
                  </Button>
                  {showAddDropdown && (
                    <div className="absolute right-0 top-9 z-50 bg-popover border border-border rounded-lg shadow-lg min-w-[220px] py-1 overflow-hidden">
                      <button
                        disabled={!hasMasterTarif}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors flex items-center gap-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
                        onClick={() => { setAddMode('master'); setShowAddDropdown(false); setMasterSearch(''); setMasterKatFilter(''); }}
                      >
                        <Star className="w-3.5 h-3.5 text-emerald-600" />
                        <div>
                          <div className="font-medium">Pilih dari Master Tarif</div>
                          <div className="text-xs text-muted-foreground">Harga otomatis dari tarif aktif</div>
                        </div>
                      </button>
                      <div className="border-t border-border/60 my-1" />
                      <button
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors flex items-center gap-2.5"
                        onClick={() => { openCustomForm(); setShowAddDropdown(false); }}
                      >
                        <Plus className="w-3.5 h-3.5 text-orange-500" />
                        <div>
                          <div className="font-medium">Tambah Item Custom</div>
                          <div className="text-xs text-muted-foreground">Isi harga manual (1 item)</div>
                        </div>
                      </button>
                      <div className="border-t border-border/60 my-1" />
                      <button
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors flex items-center gap-2.5"
                        onClick={() => {
                          setAddMode('bulk');
                          setShowAddDropdown(false);
                          setBulkText('');
                          setBulkKategori('');
                          setBulkQtyStr('1');
                          setBulkHarga('');
                        }}
                      >
                        <List className="w-3.5 h-3.5 text-blue-500" />
                        <div>
                          <div className="font-medium">Tambah Item Manual (Bulk)</div>
                          <div className="text-xs text-muted-foreground">Input banyak item sekaligus</div>
                        </div>
                      </button>
                      <div className="border-t border-border/60 my-1" />
                      <button
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors flex items-center gap-2.5"
                        onClick={() => {
                          setVdPickerOpen(true);
                          setShowAddDropdown(false);
                          setVdSpesialis('');
                          setVdSelectedItem(null);
                          setVdQtyStr(String(lamaRawat));
                          setVdSearch('');
                        }}
                      >
                        <Users className="w-3.5 h-3.5 text-purple-600" />
                        <div>
                          <div className="font-medium">Visit Dokter Spesialis</div>
                          <div className="text-xs text-muted-foreground">Tambah visit & pilih tarif dari Master</div>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {items.length === 0 ? (
                <div className="text-center py-14 text-muted-foreground">
                  <Layers className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">Belum ada item</p>
                  <p className="text-sm mt-1">Klik "Tambah Item" untuk menambahkan item dari Master Tarif atau Item Custom.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      <tr>
                        <th className="px-3 py-2.5 text-left">Sumber</th>
                        <th className="px-3 py-2.5 text-left">Kategori</th>
                        <th className="px-3 py-2.5 text-left">Nama Item</th>
                        <th className="px-3 py-2.5 text-center w-16">Qty</th>
                        <th className="px-3 py-2.5 text-right">Harga/Satuan</th>
                        <th className="px-3 py-2.5 text-right">Subtotal</th>
                        <th className="px-3 py-2.5 text-left">Keterangan</th>
                        <th className="px-3 py-2.5 w-16"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(it => (
                        <tr key={it.id} className="border-b border-border/40 hover:bg-muted/20 group">
                          <td className="px-3 py-2">
                            {it.sumber === 'master_tarif' ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 whitespace-nowrap">
                                Master Tarif
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400 border border-orange-200 dark:border-orange-800">
                                Custom
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground text-xs">
                            {it.kategori}{it.subKategori ? ` / ${it.subKategori}` : ''}
                          </td>
                          <td className="px-3 py-2 font-medium max-w-[200px]">
                            <div className="truncate" title={it.namaItem}>{it.namaItem}</div>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={editingQty[it.id] !== undefined ? editingQty[it.id] : String(it.qty)}
                              onChange={e => {
                                const val = e.target.value.replace(/[^0-9]/g, '');
                                setEditingQty(prev => ({ ...prev, [it.id]: val }));
                                const num = parseInt(val);
                                if (num >= 1) {
                                  setItems(prev => prev.map(x => x.id === it.id
                                    ? { ...x, qty: num, subtotal: num * x.hargaSatuan }
                                    : x));
                                }
                              }}
                              onBlur={() => {
                                const val = Math.max(1, parseInt(editingQty[it.id] || '1') || 1);
                                setItems(prev => prev.map(x => x.id === it.id
                                  ? { ...x, qty: val, subtotal: val * x.hargaSatuan }
                                  : x));
                                setEditingQty(prev => { const n = { ...prev }; delete n[it.id]; return n; });
                              }}
                              className="w-14 h-7 text-center rounded border border-input bg-background text-sm px-1 focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number" min={0}
                              value={it.hargaSatuan || ''}
                              onChange={e => updateItem(it.id, { hargaSatuan: Number(e.target.value) || 0 })}
                              onBlur={e => { if (!e.target.value) updateItem(it.id, { hargaSatuan: 0 }); }}
                              className="w-28 h-7 text-right rounded border border-input bg-background text-sm px-1 focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-primary whitespace-nowrap">
                            {fmtRp(it.subtotal)}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground max-w-[120px]">
                            <div className="truncate" title={it.keterangan}>{it.keterangan || '-'}</div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => openEditMaster(it)}
                                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                                title="Edit"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => deleteItem(it.id)}
                                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                                title="Hapus"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader className="py-3 px-4 border-b border-border bg-muted/40">
              <CardTitle className="text-sm font-semibold">Catatan</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <textarea
                value={catatan}
                onChange={e => setCatatan(e.target.value)}
                placeholder="Catatan tambahan..."
                rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
            </CardContent>
          </Card>
        </div>

        {/* ── RIGHT: Summary + Actions ── */}
        <div className="space-y-5">
          {/* Summary */}
          <Card>
            <CardHeader className="py-3 px-4 border-b border-border bg-muted/40">
              <CardTitle className="text-sm font-semibold">Estimasi Biaya</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-2">
              {totalKamar > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Kamar ({lamaRawat}h)</span>
                  <span className="font-medium">{fmtRp(totalKamar)}</span>
                </div>
              )}
              {Object.entries(categoryTotals).map(([cat, total]) => (
                <div key={cat} className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">{cat}</span>
                  <span className="font-medium">{fmtRp(total)}</span>
                </div>
              ))}
              {totalKamar === 0 && items.length === 0 && (
                <p className="text-center text-muted-foreground text-xs py-4">Tambahkan item untuk melihat estimasi.</p>
              )}
              <div className="border-t border-border pt-3 mt-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-sm">Grand Total</span>
                  <span className="font-bold text-lg text-primary">{fmtRp(grandTotal)}</span>
                </div>
              </div>

              {/* Item count by source */}
              {items.length > 0 && (
                <div className="border-t border-border pt-3 flex gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                    {items.filter(i => i.sumber === 'master_tarif').length} Master Tarif
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
                    {items.filter(i => i.sumber === 'custom').length} Custom
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardHeader className="py-3 px-4 border-b border-border bg-muted/40">
              <CardTitle className="text-sm font-semibold">Aksi</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-2">
              <Button className="w-full gap-2 justify-start" onClick={handleSave} disabled={saving}>
                <Save className="w-4 h-4" /> {saving ? 'Menyimpan...' : 'Simpan CP'}
              </Button>
              <Button variant="outline" className="w-full gap-2 justify-start" onClick={() => { setTemplateName(''); setIsSaveTemplateOpen(true); }}>
                <Star className="w-4 h-4" /> Simpan Sebagai Template
              </Button>
              <Button variant="outline" className="w-full gap-2 justify-start" onClick={() => setIsTemplateOpen(true)}>
                <Layers className="w-4 h-4" /> Muat Template
              </Button>
              <Button variant="outline" className="w-full gap-2 justify-start" onClick={handleDuplicate}>
                <Copy className="w-4 h-4" /> Duplikasi CP
              </Button>
              {activeCpId !== 'new' && (
                <Button
                  variant="destructive" className="w-full gap-2 justify-start"
                  onClick={() => handleDelete(currentCpId)}
                >
                  <Trash2 className="w-4 h-4" /> Hapus CP Ini
                </Button>
              )}
              <div className="border-t border-border pt-2 mt-1 space-y-2">
                <Button variant="outline" className="w-full gap-2 justify-start" onClick={handleExportPDF}>
                  <FileText className="w-4 h-4" /> Cetak PDF
                </Button>
                <Button variant="outline" className="w-full gap-2 justify-start" onClick={handleExportExcel}>
                  <Download className="w-4 h-4" /> Export Excel
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Saved CPs for this patient */}
          {cpList.length > 0 && (
            <Card>
              <CardHeader className="py-3 px-4 border-b border-border bg-muted/40">
                <CardTitle className="text-sm font-semibold">CP Tersimpan ({cpList.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-2 space-y-1">
                {cpList.map((cp, i) => (
                  <button
                    key={cp.id}
                    onClick={() => loadCP(cp)}
                    className={`w-full text-left px-3 py-2.5 rounded-md text-sm transition-colors ${
                      activeCpId === cp.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted/50 text-muted-foreground'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>CP {i + 1}</span>
                      <span className="text-xs">{cp.items.length} item</span>
                    </div>
                    <div className="text-xs mt-0.5 opacity-70">
                      {new Date(cp.updatedAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ── Master Tarif Search Dialog ── */}
      <Dialog open={addMode === 'master'} onOpenChange={v => { if (!v) { setAddMode(null); setMasterSearch(''); setMasterKatFilter(''); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="w-4 h-4 text-emerald-600" /> Pilih dari Master Tarif
              <span className="ml-auto text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded">
                {kelasKamar} · {filteredMasterItems.length.toLocaleString()} item
              </span>
            </DialogTitle>
          </DialogHeader>

          {/* Filters */}
          <div className="flex gap-2 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Ketik nama item atau kode (min. 2 huruf)..."
                value={masterSearch}
                onChange={e => setMasterSearch(e.target.value)}
                className="pl-10 h-9 text-sm"
              />
            </div>
            <select
              value={masterKatFilter}
              onChange={e => setMasterKatFilter(e.target.value)}
              className="h-9 px-3 rounded-md border border-input bg-background text-sm min-w-[140px]"
            >
              <option value="">Semua Kategori</option>
              {CP_KATEGORI.filter(k => k !== 'Kamar').map(k => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>

          <div className="flex-1 overflow-y-auto border rounded-lg">
            {masterSearchResults.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm px-4">
                {!masterKatFilter && masterSearch.length < 2
                  ? 'Ketik nama item / kode, atau pilih kategori untuk mulai mencari.'
                  : 'Item tidak ditemukan. Coba kata kunci lain atau pilih Item Custom.'}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/60 sticky top-0 border-b border-border text-xs font-semibold text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Kode</th>
                    <th className="px-3 py-2 text-left">Nama Item</th>
                    <th className="px-3 py-2 text-left">Kategori</th>
                    <th className="px-3 py-2 text-right">Harga</th>
                    <th className="px-3 py-2 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {masterSearchResults.map(it => {
                    const isAdded = items.some(x => x.masterTarifItemId === it.id);
                    return (
                      <tr key={it.id} className={`border-b border-border/40 ${isAdded ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : 'hover:bg-muted/20'}`}>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{it.orderItemCode}</td>
                        <td className="px-3 py-2 font-medium">{it.orderItem}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{guessKategori(it.orderItem)}</td>
                        <td className="px-3 py-2 text-right font-semibold">{fmtRp(it.price)}</td>
                        <td className="px-3 py-2">
                          {isAdded ? (
                            <span className="text-xs text-emerald-600 font-medium">✓ Ada</span>
                          ) : (
                            <Button size="sm" className="h-7 text-xs gap-1" onClick={() => addFromMaster(it)}>
                              <Plus className="w-3 h-3" /> Tambah
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="text-xs text-muted-foreground shrink-0 flex justify-between items-center pt-1">
            <span>
              {masterSearchResults.length > 0 && `${masterSearchResults.length} hasil`}
              {masterSearchResults.length === 50 && ' (tampil maks 50)'}
            </span>
            <Button variant="outline" size="sm" onClick={() => { setAddMode(null); openCustomForm(); }}>
              Tidak ditemukan? Buat Item Custom
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Item Custom Dialog ── */}
      <Dialog open={addMode === 'custom'} onOpenChange={v => { if (!v) { setAddMode(null); setEditingItemId(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
                <Plus className="w-3 h-3 text-orange-600" />
              </span>
              {editingItemId ? 'Edit Item' : 'Tambah Item Custom'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <label className="text-sm font-semibold">Kategori <span className="text-red-500">*</span></label>
                <select
                  value={customForm.kategori}
                  onChange={e => setCustomForm(f => ({ ...f, kategori: e.target.value, subKategori: '' }))}
                  className="h-9 w-full px-3 rounded-md border border-input bg-background text-sm"
                >
                  {CP_KATEGORI.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <label className="text-sm font-semibold">Sub Kategori</label>
                {SUB_KATEGORI[customForm.kategori] ? (
                  <select
                    value={customForm.subKategori}
                    onChange={e => setCustomForm(f => ({ ...f, subKategori: e.target.value }))}
                    className="h-9 w-full px-3 rounded-md border border-input bg-background text-sm"
                  >
                    <option value="">— Pilih Sub Kategori —</option>
                    {SUB_KATEGORI[customForm.kategori].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                  <Input
                    value={customForm.subKategori}
                    onChange={e => setCustomForm(f => ({ ...f, subKategori: e.target.value }))}
                    placeholder="Opsional"
                    className="h-9 text-sm"
                  />
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Nama Item <span className="text-red-500">*</span></label>
              <Input
                autoFocus
                value={customForm.namaItem}
                onChange={e => setCustomForm(f => ({ ...f, namaItem: e.target.value }))}
                placeholder="Nama tindakan, obat, atau biaya lainnya..."
                className="h-9 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Qty</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={customQtyStr}
                  onChange={e => {
                    const val = e.target.value.replace(/[^0-9]/g, '');
                    setCustomQtyStr(val);
                    setCustomForm(f => ({ ...f, qty: parseInt(val) || 1 }));
                  }}
                  onBlur={() => {
                    const val = Math.max(1, parseInt(customQtyStr) || 1);
                    setCustomQtyStr(String(val));
                    setCustomForm(f => ({ ...f, qty: val }));
                  }}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Harga Satuan <span className="text-red-500">*</span></label>
                <Input
                  type="number" min={0}
                  value={customForm.hargaSatuan || ''}
                  onChange={e => setCustomForm(f => ({ ...f, hargaSatuan: Number(e.target.value) || 0 }))}
                  placeholder="0"
                  className="h-9 text-sm"
                />
              </div>
            </div>
            {customForm.hargaSatuan > 0 && (
              <div className="flex justify-between bg-muted/50 rounded-lg px-3 py-2 text-sm">
                <span className="text-muted-foreground">Subtotal ({customForm.qty} × {fmtRp(customForm.hargaSatuan)})</span>
                <span className="font-bold text-primary">{fmtRp(customForm.qty * customForm.hargaSatuan)}</span>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Keterangan <span className="text-xs font-normal text-muted-foreground">(opsional)</span></label>
              <Input
                value={customForm.keterangan}
                onChange={e => setCustomForm(f => ({ ...f, keterangan: e.target.value }))}
                placeholder="Catatan tambahan..."
                className="h-9 text-sm"
              />
            </div>
            <div className="flex items-center gap-2 bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800 rounded-lg px-3 py-2 text-xs text-orange-700 dark:text-orange-400">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Item Custom hanya tersimpan pada CP ini dan tidak mengubah Master Tarif.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddMode(null); setEditingItemId(null); }}>Batal</Button>
            <Button onClick={handleSaveCustom} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              {editingItemId ? 'Simpan Perubahan' : 'Tambah Item Custom'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Manual Import Dialog ── */}
      <Dialog open={addMode === 'bulk'} onOpenChange={v => { if (!v) setAddMode(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <List className="w-4 h-4 text-blue-500" /> Tambah Item Manual (Bulk)
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Textarea for item names */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Nama Item <span className="text-red-500">*</span></label>
              <p className="text-xs text-muted-foreground">Satu baris = satu item. Kosongkan baris untuk memisahkan.</p>
              <textarea
                autoFocus
                rows={8}
                placeholder={`USG Abdomen\nCT Scan Thorax\nInfus Set\nNasal Kanul\nAlbumin 20%\nVitamin C Inj\nNebulizer`}
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground resize-y focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {bulkText.trim() && (
                <p className="text-xs text-blue-600 font-medium">
                  {bulkText.split('\n').filter(l => l.trim()).length} item akan ditambahkan
                </p>
              )}
            </div>

            {/* Default settings */}
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pengaturan Default</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Kategori</label>
                  <select
                    value={bulkKategori}
                    onChange={e => setBulkKategori(e.target.value)}
                    className="w-full h-8 px-2 rounded-md border border-input bg-background text-xs"
                  >
                    <option value="">— Pilih —</option>
                    {CP_KATEGORI.filter(k => k !== 'Kamar').map(k => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Qty Default</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={bulkQtyStr}
                    onChange={e => setBulkQtyStr(e.target.value.replace(/[^0-9]/g, ''))}
                    onBlur={() => {
                      const v = Math.max(1, parseInt(bulkQtyStr) || 1);
                      setBulkQtyStr(String(v));
                    }}
                    className="w-full h-8 px-2 rounded-md border border-input bg-background text-xs text-center focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Harga Default</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={bulkHarga}
                    onChange={e => setBulkHarga(e.target.value === '' ? '' : Number(e.target.value))}
                    onBlur={() => { if (bulkHarga === '') setBulkHarga(0); }}
                    className="w-full h-8 px-2 rounded-md border border-input bg-background text-xs text-right focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Kategori default: <strong>{bulkKategori || 'Lainnya'}</strong>.
                Qty &amp; harga dapat diedit per item setelah ditambahkan.
              </p>
            </div>

            <div className="flex items-start gap-2 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Item yang ditambahkan tidak berasal dari Master Tarif dan akan ditandai label <strong>Custom</strong>.
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMode(null)}>Batal</Button>
            <Button
              onClick={handleBulkImport}
              disabled={!bulkText.trim()}
              className="gap-1.5"
            >
              <List className="w-3.5 h-3.5" />
              Proses {bulkText.trim() ? `(${bulkText.split('\n').filter(l => l.trim()).length} item)` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Save Template Dialog ── */}
      <Dialog open={isSaveTemplateOpen} onOpenChange={setIsSaveTemplateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Star className="w-4 h-4" /> Simpan Sebagai Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Nama Template <span className="text-red-500">*</span></label>
              <Input
                autoFocus
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                placeholder="cth: CP Pneumonia, CP Appendicitis..."
                className="h-9 text-sm"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Template akan menyimpan {items.length} item (termasuk Item Custom) dan dapat digunakan kembali pada CP lain.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSaveTemplateOpen(false)}>Batal</Button>
            <Button onClick={handleSaveAsTemplate} className="gap-1.5">
              <Star className="w-3.5 h-3.5" /> Simpan Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Load Template Dialog ── */}
      <Dialog open={isTemplateOpen} onOpenChange={setIsTemplateOpen}>
        <DialogContent className="max-w-xl max-h-[70vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Layers className="w-4 h-4" /> Muat Template CP</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-2">
            {templates.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Belum ada template tersimpan. Buat CP lalu simpan sebagai template.
              </div>
            ) : (
              templates.map(t => (
                <div key={t.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{t.nama}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t.items.length} item · {t.kelasKamar} · {t.lamaRawat}h
                    </p>
                    {t.deskripsi && <p className="text-xs text-muted-foreground truncate mt-0.5 italic">{t.deskripsi}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" onClick={() => handleLoadTemplate(t)} className="h-8 text-xs">Muat</Button>
                    {user?.role === 'superuser' && (
                      <Button size="sm" variant="ghost" className="h-8 text-destructive hover:bg-destructive/10" onClick={() => handleDeleteTemplate(t.id!)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Kamar Picker Dialog ── */}
      <Dialog open={showKamarPicker} onOpenChange={setShowKamarPicker}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pilih Tarif Kamar</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <p className="text-sm text-muted-foreground">
              Tersedia beberapa opsi tarif untuk <strong>{kelasKamar}</strong>. Pilih salah satu:
            </p>
            {kamarCandidates.map(it => (
              <button
                key={it.id}
                onClick={() => { setTarifKamar(it.price); setShowKamarPicker(false); }}
                className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                  it.price === tarifKamar
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border hover:border-primary/40 hover:bg-muted/40'
                }`}
              >
                <div className="font-medium text-sm">{it.orderItem}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{fmtRp(it.price)} / hari</div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Visit Dokter Spesialis Dialog ── */}
      <Dialog open={vdPickerOpen} onOpenChange={v => { if (!v) setVdPickerOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-4 h-4 text-purple-600" /> Visit Dokter Spesialis
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">

            {/* Nama spesialis (free text) */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">
                Nama Spesialis <span className="text-red-500">*</span>
              </label>
              <Input
                autoFocus
                value={vdSpesialis}
                onChange={e => setVdSpesialis(e.target.value)}
                placeholder="cth: Penyakit Dalam, Bedah, Anak, Saraf, Jantung..."
                className="h-9 text-sm"
              />
            </div>

            {/* Item dari Master Tarif (Visit Dokter category) */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Nama Item (Visit Fee dari Master Tarif)</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={vdSearch}
                  onChange={e => setVdSearch(e.target.value)}
                  placeholder="Cari tarif visit dokter..."
                  className="pl-10 h-9 text-sm"
                />
              </div>
              <div className="border rounded-lg max-h-44 overflow-y-auto">
                {(() => {
                  const vdItems = filteredMasterItems.filter(it => isVisitDokterItem(it.orderItem));
                  const shown = vdSearch.length >= 1
                    ? vdItems.filter(it => it.orderItem.toLowerCase().includes(vdSearch.toLowerCase()))
                    : vdItems;
                  if (!hasMasterTarif || vdItems.length === 0) {
                    return (
                      <p className="text-sm text-muted-foreground text-center py-6 px-3">
                        Tidak ada item Visit Dokter di Master Tarif untuk {kelasKamar}.
                        Item akan disimpan tanpa tarif dari Master Tarif.
                      </p>
                    );
                  }
                  if (shown.length === 0) {
                    return <p className="text-sm text-muted-foreground text-center py-6">Item tidak ditemukan.</p>;
                  }
                  return shown.slice(0, 30).map(it => (
                    <button
                      key={it.id}
                      onClick={() => setVdSelectedItem(prev => prev?.id === it.id ? null : it)}
                      className={`w-full text-left px-3 py-2.5 text-sm border-b last:border-0 flex justify-between items-center transition-colors ${
                        vdSelectedItem?.id === it.id
                          ? 'bg-primary/5 text-primary font-medium'
                          : 'hover:bg-muted/50'
                      }`}
                    >
                      <span className="truncate">{it.orderItem}</span>
                      <span className="text-xs text-muted-foreground ml-2 shrink-0">{fmtRp(it.price)}</span>
                    </button>
                  ));
                })()}
              </div>
              {vdSelectedItem && (
                <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{vdSelectedItem.orderItem}</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-500">{fmtRp(vdSelectedItem.price)} / kunjungan</p>
                  </div>
                  <button onClick={() => setVdSelectedItem(null)} className="text-muted-foreground hover:text-foreground ml-2 shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Qty */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Qty (Kunjungan)</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={vdQtyStr}
                  onChange={e => setVdQtyStr(e.target.value.replace(/[^0-9]/g, ''))}
                  onBlur={() => {
                    const v = Math.max(1, parseInt(vdQtyStr) || 1);
                    setVdQtyStr(String(v));
                  }}
                  placeholder={String(lamaRawat)}
                  className="h-9 text-sm"
                />
                <p className="text-xs text-muted-foreground">Default = lama rawat ({lamaRawat} hari)</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Harga / Kunjungan</label>
                <div className="h-9 px-3 rounded-md border border-input bg-muted text-sm flex items-center font-medium text-muted-foreground">
                  {vdSelectedItem ? fmtRp(vdSelectedItem.price) : <span className="text-xs font-normal">— pilih item —</span>}
                </div>
              </div>
            </div>

            {vdSelectedItem && (parseInt(vdQtyStr) || lamaRawat) > 0 && (
              <div className="flex justify-between bg-muted/50 rounded-lg px-3 py-2 text-sm">
                <span className="text-muted-foreground">
                  Subtotal ({parseInt(vdQtyStr) || lamaRawat} × {fmtRp(vdSelectedItem.price)})
                </span>
                <span className="font-bold text-primary">
                  {fmtRp((parseInt(vdQtyStr) || lamaRawat) * vdSelectedItem.price)}
                </span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setVdPickerOpen(false)}>Batal</Button>
            <Button
              onClick={handleAddVisitDokter}
              disabled={!vdSpesialis.trim()}
              className="gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Tambah Visit Dokter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
