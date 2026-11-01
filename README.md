# Phần mềm Tổ chuyên môn – Ngân hàng đề & Thi đua

Web app nội bộ "2 trong 1" cho tổ chuyên môn trường THPT (mặc định môn Toán, đổi được trong Cài đặt):

- **Phân hệ 1 – Ngân hàng câu hỏi & đề thi**
  - Giáo viên đóng góp câu hỏi theo ma trận **Nhận biết – Thông hiểu – Vận dụng – Vận dụng cao**, 4 dạng: Trắc nghiệm 4 lựa chọn, **Đúng/Sai**, **Trả lời ngắn**, Tự luận.
  - Công thức **LaTeX** (`$...$`, `$$...$$`) hiển thị bằng **KaTeX**; chèn hình vẽ (tự nén, lưu trong Firestore).
  - **Tải lên file Word (.docx)**: đọc được công thức **MathType** (giải mã MTEF trong đối tượng OLE) và **Equation** (OMML) → LaTeX, hình vẽ, đánh số tự động, đáp án gạch chân/tô đỏ, "Chọn B", bảng đáp án cuối đề.
  - **Tải lên PDF** (đọc chữ bằng pdf.js; công thức cần kiểm tra lại) hoặc dán văn bản ("Câu 1: … A. … B. … Đáp án: …").
  - Mỗi câu có **mã câu** duy nhất, **mã ID** kiểu `2D1-1.2-3` (tự suy ra khối, chuyên đề, mức độ), **nguồn đề**, số lần đã dùng; **chống nhập trùng** bằng dấu vân tay nội dung; trang **Nguồn đề** quản lý theo lô.
  - Tổ trưởng/Tổ phó **duyệt** câu hỏi → **tự động cộng điểm thi đua** cho người đóng góp.
  - **Bốc đề theo ma trận** chuyên đề × mức độ: **ma trận mẫu**, **phân bổ tự động**, ưu tiên/loại câu đã dùng; **trộn nhiều mã đề** (đảo câu, đảo phương án, đảo ý Đúng/Sai, mã đề ngẫu nhiên); **lưu bản chụp đề**; xuất **Word (.docx) với công thức Equation gốc của Word**, **In/PDF**, đáp án + lời giải (Word), bảng đáp án (Excel), **ma trận + bảng đặc tả**, tải trọn bộ (.zip).
- **Phân hệ 2 – Thi đua & hồ sơ chuyên môn**
  - Khai báo **dự giờ, thao giảng** (biểu mẫu nhận xét, xuất **phiếu dự giờ Word**), **HSG, KHKT (ViSEF), SKKN, GVG**, đóng góp đề… kèm link minh chứng.
  - Ghi nhận **nề nếp nộp KHBD, kiểm tra hồ sơ** cho nhiều giáo viên một lần (điểm cộng/trừ).
  - **Bảng xếp hạng** theo tháng/học kỳ/năm, xếp loại **Tốt – Khá – Đạt** theo ngưỡng; xuất **Excel** và **Biên bản họp tổ (Word)** 1 chạm.
- **Quản trị**: phân quyền Giáo viên / Tổ phó / Tổ trưởng, cài đặt tiêu chí – điểm – ngưỡng – chuyên đề, **sao lưu/khôi phục JSON**.

## Công nghệ

| Thành phần | Dùng |
|---|---|
| Giao diện | React 18 + Vite 6 + Tailwind CSS 4, chạy tốt trên điện thoại |
| Đăng nhập | Firebase Authentication (Google, Email/Mật khẩu) |
| Dữ liệu | Cloud Firestore (gói Spark miễn phí), **không dùng Firebase Storage** |
| Công thức | KaTeX (hiển thị), KaTeX MathML → mathml2omml (xuất Word) |
| Xuất file | JSZip (tự tạo .docx), ExcelJS (.xlsx), in trình duyệt (PDF) |
| Triển khai | GitHub + Vercel |

## Cài đặt

Xem **[HUONG_DAN_CAI_DAT.md](HUONG_DAN_CAI_DAT.md)** — hướng dẫn từng bước tạo Firebase (production mode, chạy lâu dài), đưa lên GitHub, deploy Vercel.

Chạy trên máy:

```bash
npm install
cp .env.example .env.local   # rồi điền cấu hình Firebase
npm run dev
```

## Cấu trúc dữ liệu Firestore

| Collection | Nội dung chính |
|---|---|
| `settings/app` | Tên trường/tổ, môn, khối, chuyên đề, điểm theo mức độ, tiêu chí thi đua, ngưỡng xếp loại |
| `users/{uid}` | `name`, `email`, `role`: `pending` · `teacher` · `deputy` · `leader` · `disabled` |
| `questions` | `type` (mcq/tf/short/essay), `grade`, `topic`, `level`, `content`, `options[4]`, `statements[4]`, `answer`, `solution`, `image{data,w,h}`, `idCode`, `sourceId`, `sourceName`, `hash` (chống trùng), `usedCount`, `authorId`, `status` (pending/approved/rejected), `points`, `approvedMonth` |
| `sources` | Nguồn đề: `name`, `type`, `year`, `note`, `createdBy` |
| `matrices` | Ma trận mẫu: `name`, `grade`, `matrix{"chuyên đề‖dạng‖mức": số câu}`, `points`, `duration` |
| `records` | Hồ sơ & điểm thi đua: `category` (mã tiêu chí), `userId`, `title`, `details{}`, `points`, `date`, `month`, `semester`, `schoolYear`, `status`. Điểm ngân hàng câu hỏi gộp theo người × tháng tại `records/nh_{uid}_{yyyy-mm}` |
| `exams` | Đề đã trộn: thông tin đề, `questionIds`, `versions[{code, items[{id, perm}]}]` (perm: hoán vị A–D hoặc ý a–d); bản chụp câu hỏi ở `exams/{id}/items/{questionId}` |

Mọi truy vấn chỉ dùng phép so sánh `==` nên **không cần tạo chỉ mục (index)** thủ công.

## Cấu trúc mã nguồn

```
src/
  firebase.js              Khởi tạo Firebase (đọc biến VITE_FIREBASE_*)
  context/AuthContext.jsx  Đăng nhập, hồ sơ, vai trò, cài đặt, khởi tạo lần đầu
  lib/import/              docxImport (Word), mtef (MathType → LaTeX), ommlToLatex (Equation → LaTeX),
                           pdfImport (PDF), latexSymbols
  lib/                     constants, utils, db (duyệt + cộng điểm), parser (tách câu, đáp án),
                           math (KaTeX), omml + docx + examExport + reports (Word), excel, image
  components/              Layout, ui, QuestionEditor, QuestionView
  pages/                   Dashboard, QuestionBank, AddQuestions, Review, ExamBuilder, Exams,
                           ExamPrint, Records, Leaderboard, Members, Settings, Login, Gate
firestore.rules            Luật bảo mật (dán vào Firebase Console)
vercel.json                Cấu hình SPA cho Vercel
```
