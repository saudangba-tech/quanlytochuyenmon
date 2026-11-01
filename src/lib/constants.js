export const ROLES = {
  pending: { name: 'Chờ duyệt', color: 'bg-amber-100 text-amber-800' },
  teacher: { name: 'Giáo viên', color: 'bg-blue-100 text-blue-800' },
  deputy: { name: 'Tổ phó', color: 'bg-violet-100 text-violet-800' },
  leader: { name: 'Tổ trưởng', color: 'bg-rose-100 text-rose-800' },
  disabled: { name: 'Đã khóa', color: 'bg-slate-200 text-slate-600' },
};
export const MEMBER_ROLES = ['teacher', 'deputy', 'leader'];
export const MANAGER_ROLES = ['deputy', 'leader'];

export const LEVELS = [
  { id: 'NB', name: 'Nhận biết', color: 'bg-emerald-100 text-emerald-800' },
  { id: 'TH', name: 'Thông hiểu', color: 'bg-sky-100 text-sky-800' },
  { id: 'VD', name: 'Vận dụng', color: 'bg-amber-100 text-amber-800' },
  { id: 'VDC', name: 'Vận dụng cao', color: 'bg-rose-100 text-rose-800' },
];

export const TYPES = [
  { id: 'mcq', name: 'Trắc nghiệm 4 lựa chọn', short: 'TN 4 lựa chọn', part: 'I' },
  { id: 'tf', name: 'Trắc nghiệm Đúng/Sai', short: 'Đúng/Sai', part: 'II' },
  { id: 'short', name: 'Trả lời ngắn', short: 'Trả lời ngắn', part: 'III' },
  { id: 'essay', name: 'Tự luận', short: 'Tự luận', part: 'IV' },
];

export const STATUS = {
  pending: { name: 'Chờ duyệt', color: 'bg-amber-100 text-amber-800' },
  approved: { name: 'Đã duyệt', color: 'bg-emerald-100 text-emerald-800' },
  rejected: { name: 'Cần sửa', color: 'bg-red-100 text-red-700' },
};

export const levelName = (id) => LEVELS.find((l) => l.id === id)?.name || id;
export const typeName = (id) => TYPES.find((t) => t.id === id)?.short || id;

// Chuyên đề Toán theo Chương trình GDPT 2018 (tổ trưởng sửa được trong Cài đặt)
export const DEFAULT_TOPICS = {
  10: [
    'Mệnh đề và tập hợp',
    'Bất phương trình và hệ bất phương trình bậc nhất hai ẩn',
    'Hệ thức lượng trong tam giác',
    'Vectơ',
    'Các số đặc trưng của mẫu số liệu không ghép nhóm',
    'Hàm số, đồ thị và ứng dụng',
    'Phương pháp tọa độ trong mặt phẳng',
    'Đại số tổ hợp',
    'Tính xác suất theo định nghĩa cổ điển',
  ],
  11: [
    'Hàm số lượng giác và phương trình lượng giác',
    'Dãy số, cấp số cộng và cấp số nhân',
    'Mẫu số liệu ghép nhóm – số đặc trưng đo xu thế trung tâm',
    'Quan hệ song song trong không gian',
    'Giới hạn, hàm số liên tục',
    'Hàm số mũ và hàm số lôgarit',
    'Quan hệ vuông góc trong không gian',
    'Các quy tắc tính xác suất',
    'Đạo hàm',
  ],
  12: [
    'Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số',
    'Vectơ và hệ trục tọa độ trong không gian',
    'Mẫu số liệu ghép nhóm – số đặc trưng đo mức độ phân tán',
    'Nguyên hàm và tích phân',
    'Phương pháp tọa độ trong không gian',
    'Xác suất có điều kiện',
  ],
};

// Điểm thi đua cộng tự động khi câu hỏi được duyệt (theo mức độ)
export const DEFAULT_QUESTION_POINTS = { NB: 0.5, TH: 1, VD: 1.5, VDC: 2 };

// form: loại biểu mẫu nhập; managerOnly: chỉ tổ trưởng/tổ phó ghi nhận
export const DEFAULT_CRITERIA = [
  { id: 'de_thi', name: 'Đóng góp đề kiểm tra/đề thi hoàn chỉnh', points: 5, group: 'Chuyên môn', form: 'achievement' },
  { id: 'du_gio', name: 'Dự giờ đồng nghiệp (mỗi tiết)', points: 1, group: 'Dự giờ – thao giảng', form: 'observation' },
  { id: 'thao_giang', name: 'Dạy thao giảng / chuyên đề', points: 5, group: 'Dự giờ – thao giảng', form: 'observation' },
  { id: 'hsg', name: 'Bồi dưỡng HSG có học sinh đạt giải', points: 5, group: 'Thành tích', form: 'achievement' },
  { id: 'khkt', name: 'Hướng dẫn KHKT (ViSEF) có giải', points: 5, group: 'Thành tích', form: 'achievement' },
  { id: 'skkn', name: 'SKKN / biện pháp được công nhận', points: 5, group: 'Thành tích', form: 'achievement' },
  { id: 'gvg', name: 'Đạt giáo viên dạy giỏi các cấp', points: 5, group: 'Thành tích', form: 'achievement' },
  { id: 'khbd_dung_han', name: 'Nộp kế hoạch bài dạy đúng hạn', points: 2, group: 'Nề nếp – hồ sơ', form: 'discipline', managerOnly: true },
  { id: 'khbd_muon', name: 'Nộp kế hoạch bài dạy muộn/thiếu', points: -2, group: 'Nề nếp – hồ sơ', form: 'discipline', managerOnly: true },
  { id: 'ho_so_tot', name: 'Kiểm tra hồ sơ sổ sách: Tốt', points: 3, group: 'Nề nếp – hồ sơ', form: 'discipline', managerOnly: true },
  { id: 'ho_so_dat', name: 'Kiểm tra hồ sơ sổ sách: Đạt', points: 1, group: 'Nề nếp – hồ sơ', form: 'discipline', managerOnly: true },
  { id: 'vi_pham', name: 'Vi phạm nề nếp, quy chế chuyên môn', points: -3, group: 'Nề nếp – hồ sơ', form: 'discipline', managerOnly: true },
  { id: 'khac', name: 'Thành tích / công việc khác', points: 2, group: 'Khác', form: 'achievement' },
];

export const BANK_CRITERION = { id: 'nganhang', name: 'Câu hỏi được duyệt vào ngân hàng', group: 'Ngân hàng câu hỏi' };

// Ngưỡng xếp loại thi đua theo kỳ
export const DEFAULT_THRESHOLDS = {
  month: { tot: 10, kha: 6, dat: 3 },
  semester: { tot: 40, kha: 25, dat: 12 },
  year: { tot: 80, kha: 50, dat: 25 },
};

export const SOURCE_TYPES = ['Đề thi thử', 'Đề kiểm tra', 'Đề thi HSG', 'SGK – SBT', 'Tài liệu tham khảo', 'Tự soạn', 'Khác'];

export const LESSON_RATINGS = ['Tốt', 'Khá', 'Đạt', 'Chưa đạt'];
export const ACHIEVEMENT_LEVELS = ['Trường', 'Cụm', 'Tỉnh/Thành phố', 'Quốc gia'];

export const DEFAULT_SETTINGS = {
  departmentName: 'SỞ GIÁO DỤC VÀ ĐÀO TẠO',
  schoolName: 'TRƯỜNG THPT',
  groupName: 'TỔ TOÁN – TIN',
  subject: 'Toán',
  location: '',
  grades: [10, 11, 12],
  topics: DEFAULT_TOPICS,
  topicCodes: {}, // mã chuyên đề trong mã ID → tên chuyên đề, ví dụ { '2D1': 'Ứng dụng đạo hàm…' }
  questionPoints: DEFAULT_QUESTION_POINTS,
  criteria: DEFAULT_CRITERIA,
  thresholds: DEFAULT_THRESHOLDS,
  schoolYear: '',
};
