import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { CPEstimasi, CPItem } from './db';

const fmtRp = (n: number) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');

// ── Category mapping ──────────────────────────────────────────────────────────

const KATEGORI_ORDER = [
  'Visit Dokter', 'Konsultasi', 'Laboratorium', 'Radiologi',
  'Farmasi', 'Alkes', 'BHP', 'Tindakan',
  'Administrasi', 'Rehab', 'Hemodialisa', 'Gizi', 'Penunjang', 'Lainnya',
];

const KATEGORI_HEADER: Record<string, string> = {
  'Visit Dokter': 'JASA VISIT DOKTER',
  'Konsultasi': 'JASA KONSULTASI SPESIALIS',
  'Laboratorium': 'LABORATORIUM TOTAL',
  'Radiologi': 'RADIOLOGI',
  'Farmasi': 'OBAT RAWAT INAP',
  'Alkes': 'ALAT KESEHATAN',
  'BHP': 'BAHAN HABIS PAKAI',
  'Tindakan': 'TINDAKAN MEDIS',
  'Administrasi': 'BIAYA ADMINISTRASI',
  'Rehab': 'REHAB MEDIK',
  'Hemodialisa': 'HEMODIALISA',
  'Gizi': 'GIZI',
  'Penunjang': 'PENUNJANG DIAGNOSTIK',
  'Lainnya': 'Lain-Lain',
};

const groupByKategori = (items: CPItem[]) => {
  const grouped: Record<string, CPItem[]> = {};
  for (const it of items.filter(it => it.kategori !== 'Kamar')) {
    if (!grouped[it.kategori]) grouped[it.kategori] = [];
    grouped[it.kategori].push(it);
  }
  return grouped;
};

const orderedKats = (grouped: Record<string, CPItem[]>) => [
  ...KATEGORI_ORDER.filter(k => grouped[k]?.length),
  ...Object.keys(grouped).filter(k => !KATEGORI_ORDER.includes(k) && grouped[k]?.length),
];

// ── PDF Export ────────────────────────────────────────────────────────────────

export const generateCPPDF = (cp: CPEstimasi, rsName: string): void => {
  const doc = new jsPDF('p', 'pt', 'a4');
  const pageW = doc.internal.pageSize.width;

  // Header
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(rsName, 40, 42);
  doc.setFontSize(11);
  doc.text('ESTIMASI BIAYA RAWAT INAP', 40, 58);

  const patientInfo = [
    [`No. RM`, cp.noRM, `Episode`, cp.episodeNo],
    [`Nama Pasien`, cp.namaPasien, `Tgl Masuk`, cp.tanggalMasuk],
    [`Dokter DPJP`, cp.dpjp, `Penjamin`, cp.penjamin],
    [`Diagnosa`, cp.diagnosaPrimer, `Kelas`, cp.kelasKamar],
    [`Lama Rawat`, `${cp.lamaRawat} hari`, ``, ``],
  ];

  doc.setFontSize(8);
  let y = 72;
  for (const row of patientInfo) {
    doc.setFont('helvetica', 'bold');
    doc.text(row[0] + ':', 40, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(row[1] || '-'), 110, y);
    if (row[2]) {
      doc.setFont('helvetica', 'bold');
      doc.text(row[2] + ':', 320, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(row[3] || '-'), 390, y);
    }
    y += 13;
  }
  y += 6;

  const grouped = groupByKategori(cp.items);
  const kats = orderedKats(grouped);

  const bodyRows: any[] = [];
  if (cp.tarifKamar > 0) {
    bodyRows.push([{ content: 'TARIF KAMAR RAWAT', styles: { fontStyle: 'bold' } }, cp.lamaRawat, fmtRp(cp.tarifKamar), fmtRp(cp.tarifKamar * cp.lamaRawat)]);
  }
  for (const kat of kats) {
    bodyRows.push([{
      content: KATEGORI_HEADER[kat] || kat.toUpperCase(),
      colSpan: 4,
      styles: { fontStyle: 'bold', fillColor: [30, 64, 175], textColor: 255 }
    }]);
    for (const it of grouped[kat]) {
      bodyRows.push([it.namaItem, it.qty, fmtRp(it.hargaSatuan), fmtRp(it.subtotal)]);
    }
  }

  const totalKamar = cp.tarifKamar * cp.lamaRawat;
  const totalItems = cp.items.reduce((s, it) => s + it.subtotal, 0);
  const totalSebelumAdmin = totalKamar + totalItems;
  const admin6 = Math.round(totalSebelumAdmin * 0.06);
  const grandTotal = totalSebelumAdmin + admin6;

  bodyRows.push([
    { content: 'TOTAL BIAYA SEBELUM ADMIN', colSpan: 3, styles: { fontStyle: 'bold' } },
    { content: fmtRp(totalSebelumAdmin), styles: { fontStyle: 'bold', halign: 'right' } }
  ]);
  bodyRows.push([
    { content: 'Admin 6%', colSpan: 3, styles: { fontStyle: 'bold' } },
    { content: fmtRp(admin6), styles: { fontStyle: 'bold', halign: 'right' } }
  ]);
  bodyRows.push([
    {
      content: 'ESTIMASI BIAYA RAWAT INAP',
      colSpan: 3,
      styles: { fontStyle: 'bold', fillColor: [15, 118, 110], textColor: 255 }
    },
    {
      content: fmtRp(grandTotal),
      styles: { fontStyle: 'bold', fillColor: [15, 118, 110], textColor: 255, halign: 'right' }
    }
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Keterangan', 'QTY', 'BIAYA', 'TOTAL BIAYA']],
    body: bodyRows,
    styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [15, 118, 110], textColor: 255, fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 28, halign: 'center' },
      2: { cellWidth: 72, halign: 'right' },
      3: { cellWidth: 80, halign: 'right' },
    },
    margin: { left: 40, right: 40 },
  });

  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Dicetak: ${new Date().toLocaleString('id-ID')} | EMC Admission Operan | Hal ${i}/${pageCount}`,
      40, doc.internal.pageSize.height - 20
    );
  }

  doc.save(`CP_${cp.namaPasien.replace(/\s+/g, '_')}_${cp.noRM}.pdf`);
};

// ── Excel Export (matches template structure) ─────────────────────────────────

export const exportCPToExcel = (cp: CPEstimasi, rsName: string = ''): void => {
  const data: any[][] = [];
  const merges: XLSX.Range[] = [];
  const sectionHeaderRows: number[] = [];

  // ── Header section ──
  data.push([`DIAGNOSA UTAMA : ${cp.diagnosaPrimer}`, '', '', '']);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } });

  data.push([rsName || 'Rumah Sakit', '', '', '']);
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 3 } });

  data.push([`Lama rawat : ${cp.lamaRawat} hari (${cp.tanggalMasuk})`, '', '', '']);
  merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: 3 } });

  data.push([`Nama Pasien : ${cp.namaPasien}`, '', `KELAS ${cp.kelasKamar.toUpperCase()}`, '']);
  merges.push({ s: { r: 3, c: 0 }, e: { r: 3, c: 1 } });
  merges.push({ s: { r: 3, c: 2 }, e: { r: 3, c: 3 } });

  data.push(['', '', '', '']);

  // ── Column headers (row 5) ──
  data.push(['Keterangan', 'QTY', 'BIAYA', 'TOTAL BIAYA']);
  const colHeaderRow = 5;

  let r = 6;

  // ── Tarif Kamar row ──
  if (cp.tarifKamar > 0) {
    data.push(['TARIF KAMAR RAWAT', cp.lamaRawat, cp.tarifKamar, cp.tarifKamar * cp.lamaRawat]);
    r++;
  }

  // ── Category sections ──
  const grouped = groupByKategori(cp.items);
  for (const kat of orderedKats(grouped)) {
    const headerName = KATEGORI_HEADER[kat] || kat.toUpperCase();
    data.push([headerName, '', '', '']);
    sectionHeaderRows.push(r);
    merges.push({ s: { r, c: 0 }, e: { r, c: 3 } });
    r++;

    for (const it of grouped[kat]) {
      data.push([it.namaItem, it.qty, it.hargaSatuan, it.subtotal]);
      r++;
    }
  }

  // ── Summary rows ──
  data.push(['', '', '', '']);
  r++;

  const totalKamar = cp.tarifKamar * cp.lamaRawat;
  const totalItems = cp.items.reduce((s, it) => s + it.subtotal, 0);
  const totalSebelumAdmin = totalKamar + totalItems;
  const admin6 = Math.round(totalSebelumAdmin * 0.06);
  const grandTotal = totalSebelumAdmin + admin6;

  data.push(['TOTAL BIAYA SEBELUM ADMIN', '', '', totalSebelumAdmin]);
  merges.push({ s: { r, c: 0 }, e: { r, c: 2 } });
  const totalRow = r; r++;

  data.push(['Admin', '6%', '', admin6]);
  const adminRow = r; r++;

  data.push(['ESTIMASI BIAYA RAWAT INAP', '', '', grandTotal]);
  merges.push({ s: { r, c: 0 }, e: { r, c: 2 } });
  const grandTotalRow = r; r++;

  // ── Build worksheet ──
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!merges'] = merges;
  ws['!cols'] = [
    { wch: 45 },  // Keterangan
    { wch: 8 },   // QTY
    { wch: 16 },  // BIAYA
    { wch: 18 },  // TOTAL BIAYA
  ];

  // Apply number format to numeric cells
  for (let i = 5; i < r; i++) {
    for (const col of [2, 3]) {
      const addr = XLSX.utils.encode_cell({ r: i, c: col });
      if (ws[addr] && typeof ws[addr].v === 'number') {
        ws[addr].z = '#,##0';
      }
    }
    const qtyAddr = XLSX.utils.encode_cell({ r: i, c: 1 });
    if (ws[qtyAddr] && typeof ws[qtyAddr].v === 'number') {
      ws[qtyAddr].z = '#,##0';
    }
  }

  // Cell styles (written via xlsx s property — works in xlsx community for .xlsx)
  const bold = (extra?: any) => ({ font: { bold: true }, ...(extra || {}) });
  const centered = { alignment: { horizontal: 'center', vertical: 'center' } };
  const right = { alignment: { horizontal: 'right' } };
  const solidFill = (rgb: string) => ({ fill: { fgColor: { rgb }, patternType: 'solid' } });

  const setStyle = (row: number, col: number, style: any) => {
    const addr = XLSX.utils.encode_cell({ r: row, c: col });
    if (!ws[addr]) ws[addr] = { v: '', t: 's' };
    ws[addr].s = style;
  };

  // Title rows
  [0, 1, 2].forEach(row => setStyle(row, 0, bold({ font: { bold: row === 0, sz: row === 0 ? 11 : 9 } })));

  // Kelas header (row 3 col 2)
  setStyle(3, 2, { ...bold(), ...centered, ...solidFill('DBEAFE'), font: { bold: true, color: { rgb: '1E3A8A' } } });

  // Column headers (row 5)
  ['Keterangan', 'QTY', 'BIAYA', 'TOTAL BIAYA'].forEach((_, c) => {
    setStyle(colHeaderRow, c, {
      ...bold(),
      ...centered,
      ...solidFill('1E3A8A'),
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      border: {
        top: { style: 'thin', color: { rgb: '000000' } },
        bottom: { style: 'thin', color: { rgb: '000000' } },
        left: { style: 'thin', color: { rgb: '000000' } },
        right: { style: 'thin', color: { rgb: '000000' } },
      }
    });
  });

  // Section header rows
  sectionHeaderRows.forEach(row => {
    setStyle(row, 0, {
      ...bold(),
      ...solidFill('1D4ED8'),
      font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'left', vertical: 'center' },
    });
  });

  // Summary rows
  [0, 1, 2, 3].forEach(c => {
    setStyle(totalRow, c, { ...bold(), ...(c === 3 ? { ...right, z: '#,##0' } : {}) });
  });
  setStyle(adminRow, 0, bold());
  setStyle(adminRow, 1, { ...centered });
  setStyle(adminRow, 3, { ...bold(), ...right });

  // Grand total row
  [0, 1, 2, 3].forEach(c => {
    setStyle(grandTotalRow, c, {
      ...bold(),
      ...solidFill('0F766E'),
      font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
      ...(c === 3 ? right : {}),
    });
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'CP Estimasi Biaya');
  XLSX.writeFile(wb, `CP_${cp.namaPasien.replace(/\s+/g, '_')}_${cp.noRM}.xlsx`);
};
