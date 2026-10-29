export const pad2 = (n) => String(n).padStart(2, '0');

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Năm học bắt đầu từ tháng 8: 15/09/2026 → "2026-2027"; 10/03/2027 → "2026-2027"
export function schoolYearOf(iso) {
  const [y, m] = iso.split('-').map(Number);
  return m >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

// Học kỳ I: tháng 8 → tháng 1; Học kỳ II: tháng 2 → tháng 7
export function semesterOf(iso) {
  const m = Number(iso.split('-')[1]);
  return m >= 8 || m === 1 ? 'HK1' : 'HK2';
}

export const monthOf = (iso) => iso.slice(0, 7);

export function periodFields(iso) {
  return { date: iso, month: monthOf(iso), semester: semesterOf(iso), schoolYear: schoolYearOf(iso) };
}

export function currentSchoolYear(settings) {
  return settings?.schoolYear || schoolYearOf(todayISO());
}

// Các tháng trong một năm học, theo thứ tự 08 → 07
export function monthsOfSchoolYear(sy) {
  const start = Number(sy.split('-')[0]);
  const list = [];
  for (let i = 0; i < 12; i++) {
    const m = ((7 + i) % 12) + 1;
    const y = m >= 8 ? start : start + 1;
    list.push(`${y}-${pad2(m)}`);
  }
  return list;
}

export function schoolYearOptions() {
  const cur = Number(schoolYearOf(todayISO()).split('-')[0]);
  return [cur + 1, cur, cur - 1, cur - 2].map((y) => `${y}-${y + 1}`);
}

export const formatMonth = (ym) => {
  const [y, m] = ym.split('-');
  return `Tháng ${Number(m)}/${y}`;
};

export const formatDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

export function formatTimestamp(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export const fmtPoints = (n) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return String(v).replace('.', ',');
};

export function shuffle(arr, rand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function classify(points, thresholds) {
  if (points >= thresholds.tot) return 'Tốt';
  if (points >= thresholds.kha) return 'Khá';
  if (points >= thresholds.dat) return 'Đạt';
  return 'Chưa đạt';
}

export const RATING_COLORS = {
  Tốt: 'bg-emerald-100 text-emerald-800',
  Khá: 'bg-sky-100 text-sky-800',
  Đạt: 'bg-amber-100 text-amber-800',
  'Chưa đạt': 'bg-slate-200 text-slate-700',
};

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function safeFileName(s) {
  return (s || 'file')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9-_ ]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

// Bỏ ký hiệu LaTeX để ước lượng độ dài hiển thị của phương án
export function plainLength(s) {
  return (s || '')
    .replace(/\$\$?([^$]*)\$\$?/g, (_, m) => m.replace(/\\[a-zA-Z]+/g, 'x').replace(/[{}^_\\]/g, ''))
    .replace(/\s+/g, ' ').length;
}

export const errorMessage = (e) => {
  const code = e?.code || '';
  const map = {
    'permission-denied': 'Bạn không có quyền thực hiện thao tác này.',
    'auth/invalid-credential': 'Email hoặc mật khẩu không đúng.',
    'auth/wrong-password': 'Mật khẩu không đúng.',
    'auth/user-not-found': 'Không tìm thấy tài khoản.',
    'auth/email-already-in-use': 'Email này đã được đăng ký.',
    'auth/weak-password': 'Mật khẩu cần ít nhất 6 ký tự.',
    'auth/invalid-email': 'Email không hợp lệ.',
    'auth/popup-closed-by-user': 'Bạn đã đóng cửa sổ đăng nhập.',
    'auth/unauthorized-domain':
      'Tên miền này chưa được cho phép. Vào Firebase > Authentication > Settings > Authorized domains để thêm tên miền Vercel.',
    'auth/network-request-failed': 'Lỗi mạng, vui lòng kiểm tra kết nối.',
    'auth/too-many-requests': 'Thử quá nhiều lần, vui lòng đợi ít phút.',
    unavailable: 'Mất kết nối tới máy chủ, vui lòng thử lại.',
    'resource-exhausted': 'Đã hết hạn mức miễn phí trong ngày của Firebase, hạn mức được làm mới lúc khoảng 14–15 giờ chiều (giờ Việt Nam).',
  };
  return map[code] || e?.message || 'Đã có lỗi xảy ra.';
};
