import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface User {
  id?: number;
  username: string;
  namaLengkap: string;
  role: 'superuser' | 'officer';
  passwordHash: string;
  aktif: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Patient {
  noRM: string;
  namaPasien: string;
  episodeNo: string;
  ward: string;
  roomName: string;
  roomType: string;
  bedCode: string;
  dpjp: string;
  dob: string;
  agama: string;
  sexDesc: string;
  admissionDate: string;
  dischargeDate: string | null;
  medicalDischarge: string | null;
  payor: string;
  statusBPJS: string;
  diagnosaMasuk: string;
  diagnosakUtama: string;
  diagnosaTambahan: string;
  alertVIP: string;
  noHpPJ?: string;
  status: 'aktif' | 'pulang';
  bookmarked: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Episode {
  id?: number;
  noRM: string;
  episodeNo: string;
  namaPasien: string;
  admissionDate: string;
  dischargeDate: string | null;
  status: 'aktif' | 'pulang';
  archivedAt: number;
}

export interface Pending {
  id: string;
  noRM: string;
  episodeNo: string;
  namaPasien: string;
  ruangan: string;
  kelas: string;
  dpjp: string;
  payor: string;
  kategori: string;
  isiPending: string;
  prioritas: 'normal' | 'urgent' | 'critical';
  status: 'pending' | 'diproses' | 'selesai';
  deadline: string | null;
  fotoBase64?: string;
  shift: 'pagi' | 'sore' | 'malam';
  userId: number;
  userName: string;
  komentar: Array<{
    text: string;
    userId: number;
    userName: string;
    timestamp: number;
  }>;
  auditLog: Array<{
    action: string;
    userId: number;
    userName: string;
    timestamp: number;
  }>;
  createdAt: number;
  updatedAt: number;
}

export interface JustInfo {
  id: string;
  noRM: string;
  episodeNo: string;
  isi: string;
  shift: string;
  userId: number;
  userName: string;
  createdAt: number;
}

export interface OperanShift {
  id: string;
  tanggal: string;
  shiftSerah: string;
  shiftTerima: string;
  userSerahId: number;
  userSerahNama: string;
  userTerimaId: number;
  userTerimaNama: string;
  jamOperan: string;
  totalPasien: number;
  totalPending: number;
  totalPendingSelesai: number;
  totalPendingBerlanjut: number;
  ringkasanPending: any[];
  pdfBase64: string;
  createdAt: number;
}

export interface ImportLog {
  id?: number;
  tanggal: string;
  userNama: string;
  totalRows: number;
  newPatients: number;
  updatedPatients: number;
  archivedPatients: number;
  errors: string[];
  createdAt: number;
}

export interface ActivityLog {
  id?: number;
  userId: number;
  userName: string;
  action: string;
  entityType: string;
  entityId: string | number;
  detail: string;
  timestamp: number;
}

export interface Setting {
  key: string;
  value: any;
}

// ── Master Tarif ──────────────────────────────────────────────────────────────

export interface MasterTarif {
  id?: number;
  nama: string;
  rumahSakit: string;
  jenisTarif: string;
  tanggalBerlaku: string;
  tanggalImport: string;
  jumlahItem: number;
  status: 'aktif' | 'nonaktif';
  importedBy: string;
  createdAt: number;
}

export interface MasterTarifItem {
  id?: number;
  masterTarifId: number;
  hospitals: string;
  jenisTarif: string;
  fromDateTarif: string;
  itpRowId: string;
  orderItem: string;
  orderItemCode: string;
  kelasTarif: string;
  price: number;
}

// ── CP Estimasi Biaya ─────────────────────────────────────────────────────────

export interface CPItem {
  id: string;
  sumber: 'master_tarif' | 'custom';
  masterTarifItemId?: number;
  kategori: string;
  subKategori: string;
  namaItem: string;
  qty: number;
  hargaSatuan: number;
  subtotal: number;
  keterangan: string;
}

export interface CPEstimasi {
  id: string;
  noRM: string;
  episodeNo: string;
  namaPasien: string;
  dpjp: string;
  penjamin: string;
  diagnosaPrimer: string;
  tanggalMasuk: string;
  kelasKamar: string;
  lamaRawat: number;
  tarifKamar: number;
  items: CPItem[];
  grandTotal: number;
  catatan: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface CPTemplate {
  id?: number;
  nama: string;
  deskripsi: string;
  kelasKamar: string;
  lamaRawat: number;
  tarifKamar: number;
  items: CPItem[];
  createdBy: string;
  createdAt: number;
}

// ── DB Schema ─────────────────────────────────────────────────────────────────

interface EMCDBSchema extends DBSchema {
  users: {
    key: number;
    value: User;
  };
  patients: {
    key: string;
    value: Patient;
  };
  episodes: {
    key: number;
    value: Episode;
    indexes: {
      'noRM': string;
      'episodeNo': string;
    };
  };
  pendings: {
    key: string;
    value: Pending;
    indexes: {
      'noRM': string;
      'episodeNo': string;
      'status': string;
    };
  };
  justInfos: {
    key: string;
    value: JustInfo;
    indexes: {
      'noRM': string;
    };
  };
  operanShifts: {
    key: string;
    value: OperanShift;
    indexes: {
      'tanggal': string;
    };
  };
  importLogs: {
    key: number;
    value: ImportLog;
  };
  activityLogs: {
    key: number;
    value: ActivityLog;
  };
  settings: {
    key: string;
    value: Setting;
  };
  // v2 stores
  masterTarifs: {
    key: number;
    value: MasterTarif;
  };
  masterTarifItems: {
    key: number;
    value: MasterTarifItem;
    indexes: {
      'masterTarifId': number;
    };
  };
  cpEstimasis: {
    key: string;
    value: CPEstimasi;
    indexes: {
      'noRM': string;
    };
  };
  cpTemplates: {
    key: number;
    value: CPTemplate;
  };
}

let dbPromise: Promise<IDBPDatabase<EMCDBSchema>> | null = null;

export const initDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<EMCDBSchema>('emc_admission_db', 2, {
      upgrade(db) {
        // v1 stores
        if (!db.objectStoreNames.contains('users')) {
          db.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('patients')) {
          db.createObjectStore('patients', { keyPath: 'noRM' });
        }
        if (!db.objectStoreNames.contains('episodes')) {
          const epStore = db.createObjectStore('episodes', { keyPath: 'id', autoIncrement: true });
          epStore.createIndex('noRM', 'noRM');
          epStore.createIndex('episodeNo', 'episodeNo');
        }
        if (!db.objectStoreNames.contains('pendings')) {
          const pendStore = db.createObjectStore('pendings', { keyPath: 'id' });
          pendStore.createIndex('noRM', 'noRM');
          pendStore.createIndex('episodeNo', 'episodeNo');
          pendStore.createIndex('status', 'status');
        }
        if (!db.objectStoreNames.contains('justInfos')) {
          const jiStore = db.createObjectStore('justInfos', { keyPath: 'id' });
          jiStore.createIndex('noRM', 'noRM');
        }
        if (!db.objectStoreNames.contains('operanShifts')) {
          const osStore = db.createObjectStore('operanShifts', { keyPath: 'id' });
          osStore.createIndex('tanggal', 'tanggal');
        }
        if (!db.objectStoreNames.contains('importLogs')) {
          db.createObjectStore('importLogs', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('activityLogs')) {
          db.createObjectStore('activityLogs', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        // v2 stores
        if (!db.objectStoreNames.contains('masterTarifs')) {
          db.createObjectStore('masterTarifs', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('masterTarifItems')) {
          const mtiStore = db.createObjectStore('masterTarifItems', { keyPath: 'id', autoIncrement: true });
          mtiStore.createIndex('masterTarifId', 'masterTarifId');
        }
        if (!db.objectStoreNames.contains('cpEstimasis')) {
          const cpStore = db.createObjectStore('cpEstimasis', { keyPath: 'id' });
          cpStore.createIndex('noRM', 'noRM');
        }
        if (!db.objectStoreNames.contains('cpTemplates')) {
          db.createObjectStore('cpTemplates', { keyPath: 'id', autoIncrement: true });
        }
      },
    });
  }
  return dbPromise;
};

export const getDB = async () => {
  return await initDB();
};
