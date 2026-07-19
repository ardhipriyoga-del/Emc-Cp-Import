import * as XLSX from 'xlsx';
import { getDB } from './db';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Safely parse a field that should be an array.
 *  Excel flattens arrays to JSON strings; empty arrays become undefined cells. */
const parseArr = (val: any): any[] => {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val.trim().startsWith('[')) {
    try { return JSON.parse(val); } catch (_) {}
  }
  return [];
};

/** Safely parse a field that should be an object/array (stored as JSON string). */
const parseJson = (val: any, fallback: any = null): any => {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'object') return val;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch (_) {}
  }
  return fallback;
};

// ── Backup ─────────────────────────────────────────────────────────────────────

export const backupData = async () => {
  const db = await getDB();
  const workbook = XLSX.utils.book_new();

  // Fetch all stores in parallel
  const [
    users, patients, episodes, pendings,
    justInfos, operanShifts, importLogs, activityLogs, settings,
    masterTarifs, masterTarifItems, cpEstimasis, cpTemplates,
  ] = await Promise.all([
    db.getAll('users'),
    db.getAll('patients'),
    db.getAll('episodes'),
    db.getAll('pendings'),
    db.getAll('justInfos'),
    db.getAll('operanShifts'),
    db.getAll('importLogs'),
    db.getAll('activityLogs'),
    db.getAll('settings'),
    db.getAll('masterTarifs'),
    db.getAll('masterTarifItems'),
    db.getAll('cpEstimasis'),
    db.getAll('cpTemplates'),
  ]);

  // ── AppInfo sheet (checksum + metadata) ────────────────────────────────────
  const appInfo = [
    { key: 'AppName',    value: 'IP Admission Workspace' },
    { key: 'Version',    value: '2.0.0' },
    { key: 'BackupDate', value: new Date().toISOString() },
    { key: 'Checksum',   value: 'IPAW_VALID' },
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(appInfo), 'AppInfo');

  // ── Core operational stores ────────────────────────────────────────────────
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(settings),     'Settings');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(users),         'Users');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(
    patients.filter(p => p.status === 'aktif')),   'PatientsAktif');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(
    patients.filter(p => p.status === 'pulang')),  'PatientsPulang');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(episodes),      'Episodes');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(pendings.map(p => ({
    ...p,
    komentar:         JSON.stringify(p.komentar         ?? []),
    auditLog:         JSON.stringify(p.auditLog         ?? []),
  }))),                                                                            'Pendings');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(justInfos),     'JustInfos');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(operanShifts.map(o => ({
    ...o,
    ringkasanPending: JSON.stringify(o.ringkasanPending ?? []),
  }))),                                                                            'OperanShifts');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(importLogs.map(l => ({
    ...l,
    errors: JSON.stringify(l.errors ?? []),
  }))),                                                                            'ImportLogs');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(activityLogs),  'ActivityLogs');

  // ── Master Tarif (v2) ──────────────────────────────────────────────────────
  // MasterTarif header rows (metadata per tarif)
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(masterTarifs),     'MasterTarifs');
  // MasterTarifItems — potentially large; no nested arrays needed
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(masterTarifItems), 'MasterTarifItems');

  // ── CP Estimasi Biaya (v2) ─────────────────────────────────────────────────
  // items (CPItem[]) is a nested array — serialise to JSON string for Excel
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(cpEstimasis.map(cp => ({
    ...cp,
    items: JSON.stringify(cp.items ?? []),
  }))),                                                                            'CPEstimasis');

  // CPTemplate items also serialised
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(cpTemplates.map(t => ({
    ...t,
    items: JSON.stringify(t.items ?? []),
  }))),                                                                            'CPTemplates');

  const filename = `IPAW_Backup_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`;
  XLSX.writeFile(workbook, filename);
};

// ── Restore ────────────────────────────────────────────────────────────────────

export const restoreData = async (file: File) => {
  return new Promise<void>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        // ── Validate ─────────────────────────────────────────────────────────
        if (!workbook.SheetNames.includes('AppInfo')) {
          throw new Error('File backup tidak valid: sheet AppInfo tidak ditemukan.');
        }
        const appInfoSheet = XLSX.utils.sheet_to_json<any>(workbook.Sheets['AppInfo']);
        const checksum = appInfoSheet.find(r => r.key === 'Checksum')?.value;
        if (checksum !== 'IPAW_VALID' && checksum !== 'EMC_VALID') {
          throw new Error('File backup tidak valid: checksum tidak cocok.');
        }

        const db = await getDB();

        // Determine which stores exist in this backup version
        const hasV2 = workbook.SheetNames.includes('MasterTarifs');

        const storeNames: Array<keyof typeof db['objectStoreNames'] extends string ? any : any> = [
          'users', 'patients', 'episodes', 'pendings',
          'justInfos', 'operanShifts', 'importLogs', 'activityLogs', 'settings',
          ...(hasV2 ? ['masterTarifs', 'masterTarifItems', 'cpEstimasis', 'cpTemplates'] : []),
        ];

        const tx = db.transaction(storeNames, 'readwrite');

        // ── Generic sheet restorer ────────────────────────────────────────────
        const restoreSheet = async (
          sheetName: string,
          storeName: any,
          transform?: (row: any) => any,
        ) => {
          if (!workbook.SheetNames.includes(sheetName)) return;
          const items = XLSX.utils.sheet_to_json<any>(workbook.Sheets[sheetName]);
          await tx.objectStore(storeName).clear();
          for (const raw of items) {
            const row = transform ? transform(raw) : raw;
            await tx.objectStore(storeName).put(row);
          }
        };

        // ── Core stores ───────────────────────────────────────────────────────
        await restoreSheet('Settings',      'settings');
        await restoreSheet('Users',         'users');

        // Patients split across two sheets
        await tx.objectStore('patients').clear();
        for (const sheet of ['PatientsAktif', 'PatientsPulang']) {
          if (workbook.SheetNames.includes(sheet)) {
            const rows = XLSX.utils.sheet_to_json<any>(workbook.Sheets[sheet]);
            for (const p of rows) await tx.objectStore('patients').put(p);
          }
        }

        await restoreSheet('Episodes',      'episodes');
        await restoreSheet('Pendings',      'pendings', row => ({
          ...row,
          komentar:         parseArr(row.komentar),
          auditLog:         parseArr(row.auditLog),
        }));
        await restoreSheet('JustInfos',     'justInfos');
        await restoreSheet('OperanShifts',  'operanShifts', row => ({
          ...row,
          ringkasanPending: parseArr(row.ringkasanPending),
        }));
        await restoreSheet('ImportLogs',    'importLogs', row => ({
          ...row,
          errors: parseArr(row.errors),
        }));
        await restoreSheet('ActivityLogs',  'activityLogs');

        // ── v2 stores (Master Tarif + CP) — only if present in backup ─────────
        if (hasV2) {
          await restoreSheet('MasterTarifs',     'masterTarifs');
          await restoreSheet('MasterTarifItems', 'masterTarifItems');
          await restoreSheet('CPEstimasis',      'cpEstimasis', row => ({
            ...row,
            items: parseJson(row.items, []),
          }));
          await restoreSheet('CPTemplates',      'cpTemplates', row => ({
            ...row,
            items: parseJson(row.items, []),
          }));
        }

        await tx.done;
        resolve();
      } catch (err: any) {
        reject(err);
      }
    };
    reader.onerror = (e) => reject(e);
    reader.readAsArrayBuffer(file);
  });
};
