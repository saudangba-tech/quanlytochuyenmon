// Xuất Excel (.xlsx) – thư viện exceljs được tải khi cần để app mở nhanh
import { downloadBlob } from './utils.js';

const border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

function styleTable(ws, fromRow, toRow, cols) {
  for (let r = fromRow; r <= toRow; r++) {
    for (let c = 1; c <= cols; c++) {
      const cell = ws.getCell(r, c);
      cell.border = border;
      cell.alignment = { vertical: 'middle', wrapText: true, ...(cell.alignment || {}) };
      if (r === fromRow) {
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      }
    }
  }
}

/**
 * sheets: [{ name, title, subtitle, columns: [{header, width, key}], rows: [obj] }]
 */
export async function exportXlsx(fileName, sheets) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Tổ chuyên môn';
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31));
    const n = s.columns.length;
    let row = 1;
    if (s.title) {
      ws.mergeCells(row, 1, row, n);
      const c = ws.getCell(row, 1);
      c.value = s.title;
      c.font = { bold: true, size: 14 };
      c.alignment = { horizontal: 'center' };
      row++;
    }
    if (s.subtitle) {
      ws.mergeCells(row, 1, row, n);
      const c = ws.getCell(row, 1);
      c.value = s.subtitle;
      c.font = { italic: true };
      c.alignment = { horizontal: 'center' };
      row++;
    }
    if (s.title || s.subtitle) row++;
    const header = row;
    s.columns.forEach((col, i) => {
      ws.getCell(row, i + 1).value = col.header;
      ws.getColumn(i + 1).width = col.width || 14;
    });
    for (const r of s.rows) {
      row++;
      s.columns.forEach((col, i) => {
        ws.getCell(row, i + 1).value = r[col.key] ?? '';
      });
    }
    styleTable(ws, header, row, n);
    ws.views = [{ state: 'frozen', ySplit: header }];
  }
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
}
