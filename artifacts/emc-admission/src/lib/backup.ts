import * as XLSX from 'xlsx';
import { getDB } from './db';

export const backupData = async () => {
  const db = await getDB();
  const workbook = XLSX.utils.book_new();

  const [
    users, patients, episodes, pendings, 
    justInfos, operanShifts, importLogs, activityLogs, settings
  ] = await Promise.all([
    db.getAll('users'),
    db.getAll('patients'),
    db.getAll('episodes'),
    db.getAll('pendings'),
    db.getAll('justInfos'),
    db.getAll('operanShifts'),
    db.getAll('importLogs'),
    db.getAll('activityLogs'),
    db.getAll('settings')
  ]);

  // App Info Sheet
  const appInfo = [
    { key: 'AppName', value: 'IP Admission Workspace' },
    { key: 'Version', value: '1.0.0' },
    { key: 'BackupDate', value: new Date().toISOString() },
    { key: 'Checksum', value: 'IPAW_VALID' }
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(appInfo), 'AppInfo');
  
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(settings), 'Settings');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(users), 'Users');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(patients.filter(p => p.status === 'aktif')), 'PatientsAktif');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(patients.filter(p => p.status === 'pulang')), 'PatientsPulang');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(episodes), 'Episodes');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(pendings), 'Pendings');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(justInfos), 'JustInfos');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(operanShifts), 'OperanShifts');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(importLogs), 'ImportLogs');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(activityLogs), 'ActivityLogs');

  const filename = `IPAW_Backup_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`;
  XLSX.writeFile(workbook, filename);
};

export const restoreData = async (file: File) => {
  return new Promise<void>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Validate
        if (!workbook.SheetNames.includes('AppInfo')) throw new Error("Invalid backup file: Missing AppInfo");
        const appInfoSheet = XLSX.utils.sheet_to_json<any>(workbook.Sheets['AppInfo']);
        const checksum = appInfoSheet.find(r => r.key === 'Checksum')?.value;
        if (checksum !== 'IPAW_VALID' && checksum !== 'EMC_VALID') throw new Error("Invalid backup file: Bad Checksum");

        const db = await getDB();
        const tx = db.transaction(
          ['users', 'patients', 'episodes', 'pendings', 'justInfos', 'operanShifts', 'importLogs', 'activityLogs', 'settings'],
          'readwrite'
        );

        // Safely parse a field that should be an array.
        // Excel flattens arrays to JSON strings; empty arrays become undefined cells.
        const parseArr = (val: any): any[] => {
          if (Array.isArray(val)) return val;
          if (typeof val === 'string' && val.trim().startsWith('[')) {
            try { return JSON.parse(val); } catch(_) {}
          }
          return [];
        };

        const restoreSheet = async (sheetName: string, storeName: any) => {
          if (workbook.SheetNames.includes(sheetName)) {
            const items = XLSX.utils.sheet_to_json<any>(workbook.Sheets[sheetName]);
            await tx.objectStore(storeName).clear();
            for (const item of items) {
              // Always restore array fields — even if Excel stored them as undefined
              item.komentar        = parseArr(item.komentar);
              item.auditLog        = parseArr(item.auditLog);
              item.ringkasanPending = parseArr(item.ringkasanPending);
              item.errors          = parseArr(item.errors);
              await tx.objectStore(storeName).put(item);
            }
          }
        };

        await restoreSheet('Settings', 'settings');
        await restoreSheet('Users', 'users');
        
        // Patients are split in backup
        await tx.objectStore('patients').clear();
        if (workbook.SheetNames.includes('PatientsAktif')) {
          const pAct = XLSX.utils.sheet_to_json<any>(workbook.Sheets['PatientsAktif']);
          for(const p of pAct) await tx.objectStore('patients').put(p);
        }
        if (workbook.SheetNames.includes('PatientsPulang')) {
          const pPul = XLSX.utils.sheet_to_json<any>(workbook.Sheets['PatientsPulang']);
          for(const p of pPul) await tx.objectStore('patients').put(p);
        }

        await restoreSheet('Episodes', 'episodes');
        await restoreSheet('Pendings', 'pendings');
        await restoreSheet('JustInfos', 'justInfos');
        await restoreSheet('OperanShifts', 'operanShifts');
        await restoreSheet('ImportLogs', 'importLogs');
        await restoreSheet('ActivityLogs', 'activityLogs');

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
