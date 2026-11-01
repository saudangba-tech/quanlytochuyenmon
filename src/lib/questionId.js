// Mã ID câu hỏi theo quy ước phổ biến của các nhóm Toán: [2D1-1.2-3]
//   2  : khối (0 = lớp 10, 1 = lớp 11, 2 = lớp 12)
//   D  : phân môn (D = Đại số/Giải tích, H = Hình học, X = Xác suất – Thống kê …)
//   1  : chương        → "2D1" là mã chuyên đề
//   1.2: bài 1, dạng 2
//   3  : mức độ (1 NB, 2 TH, 3 VD, 4 VDC)

export const ID_PATTERN = /([0-2])([A-Za-z])(\d{1,2})-(\d{1,2})(?:\.(\d{1,2}))?-([1-4])/;
const ID_IN_TEXT = new RegExp(`[[(]\\s*(?:ID\\s*[:.]?\\s*)?(${ID_PATTERN.source})\\s*[\\])]`, 'i');
const LEVEL_BY_DIGIT = { 1: 'NB', 2: 'TH', 3: 'VD', 4: 'VDC' };

export function parseIdCode(code) {
  const m = ID_PATTERN.exec((code || '').trim());
  if (!m) return null;
  return {
    code: m[0].toUpperCase(),
    grade: 10 + Number(m[1]),
    chapter: `${m[1]}${m[2].toUpperCase()}${m[3]}`,
    lesson: Number(m[4]),
    form: m[5] ? Number(m[5]) : null,
    level: LEVEL_BY_DIGIT[m[6]],
  };
}

// Tìm và bóc mã ID nằm trong ngoặc ở nội dung câu: "[2D1-1.2-3] Cho hàm số…"
export function extractIdCode(text) {
  const m = ID_IN_TEXT.exec(text || '');
  if (!m) return { idCode: '', text };
  return { idCode: m[1].toUpperCase(), text: (text.slice(0, m.index) + text.slice(m.index + m[0].length)).replace(/^\s+/, '') };
}

// Mã câu ngắn để tra cứu: 8 ký tự đầu của mã tài liệu Firestore
export const shortId = (id) => (id || '').slice(0, 8);

// Dấu vân tay nội dung để phát hiện câu trùng (bỏ khoảng trắng, dấu câu, $ và chữ hoa/thường)
export function questionHash(q) {
  const norm = [q.content, ...(q.options || []), ...(q.statements || [])]
    .join('|')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\\(dfrac|tfrac)/g, '\\frac')
    .replace(/[\s$.,;:!?"'“”‘’()[\]{}]/g, '');
  // FNV-1a 64-bit (hai nửa 32-bit) → chuỗi hex 16 ký tự
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < norm.length; i++) {
    const c = norm.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

// Dòng chuyên đề trong Cài đặt có thể kèm mã: "2D1 | Ứng dụng đạo hàm…"
export function splitTopicLine(line) {
  const m = /^\s*([0-2][A-Za-z]\d{1,2})\s*[|:–-]\s*(.+)$/.exec(line);
  return m ? { code: m[1].toUpperCase(), name: m[2].trim() } : { code: '', name: line.trim() };
}
