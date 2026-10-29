# HƯỚNG DẪN CÀI ĐẶT TỪNG BƯỚC
## Phần mềm Tổ chuyên môn: Firebase + GitHub + Vercel (miễn phí, dùng lâu dài)

> **Mục tiêu:** app chạy online **ổn định nhiều năm**, không bị khóa sau 30 ngày như khi tạo Firestore ở "chế độ thử nghiệm" (test mode).
> Toàn bộ dùng gói **miễn phí** và **không cần thẻ ngân hàng**.
>
> Thời gian làm: khoảng 30–45 phút. Làm lần lượt từ Bước 1 đến Bước 11, **không bỏ bước 5 và bước 9**.

---

## Tại sao làm theo hướng dẫn này thì chạy được lâu dài?

| Vấn đề thường gặp | Nguyên nhân | Cách app này xử lý |
|---|---|---|
| App "chết" sau 1 tháng | Tạo Firestore ở **test mode**: luật có hạn `request.time < ...` sau 30 ngày thì chặn toàn bộ | Tạo ở **production mode** + dán bộ luật `firestore.rules` **không có ngày hết hạn**, có phân quyền thật |
| Bị bắt nâng cấp trả phí | Firebase **Storage** (lưu file/ảnh) từ 30/10/2024 bắt buộc gói Blaze (trả phí) cho bucket mới | App **không dùng Storage**: ảnh hình vẽ được nén ≤ 300 KB và lưu ngay trong Firestore; minh chứng dùng link Google Drive |
| Hết hạn mức miễn phí | Mỗi lần mở trang đọc quá nhiều dữ liệu | App đã tối ưu: đếm bằng `count()`, gom điểm theo tháng, lọc theo chuyên đề, bộ nhớ đệm |
| Mất dữ liệu | Xóa nhầm, đổi tài khoản | Có nút **Sao lưu (.json)** và **Khôi phục** trong Cài đặt |

**Hạn mức miễn phí (gói Spark) của Firestore — tính theo ngày, tự làm mới khoảng 14–15 giờ chiều giờ Việt Nam:**
50.000 lượt đọc · 20.000 lượt ghi · 20.000 lượt xóa · 1 GB dữ liệu.
Với một tổ 10–25 giáo viên dùng hằng ngày, app chỉ dùng khoảng **5.000–15.000 lượt đọc/ngày** và vài trăm MB dữ liệu sau nhiều năm (≈ 10.000 câu hỏi có hình). Đăng nhập (Authentication) miễn phí tới 50.000 người dùng/tháng.

---

## Chuẩn bị

1. **Một tài khoản Google** dùng lâu dài (nên là Gmail của tổ, ví dụ `totoan.thptabc@gmail.com`, để bàn giao khi đổi tổ trưởng). Tài khoản này sẽ sở hữu dự án Firebase.
2. **Tài khoản GitHub**: đăng ký miễn phí tại https://github.com/signup
3. **Tài khoản Vercel**: vào https://vercel.com/signup → chọn **Continue with GitHub** (gói Hobby miễn phí).
4. *(Chỉ cần nếu muốn chạy thử trên máy)* **Node.js 20 trở lên**: https://nodejs.org (chọn bản LTS).

---

## Bước 1. Tạo dự án Firebase

1. Mở https://console.firebase.google.com và đăng nhập bằng tài khoản Google ở phần Chuẩn bị.
2. Bấm **Create a project** (hoặc **Tạo dự án** / **Get started with a Firebase project**).
3. Đặt tên dự án, ví dụ `to-toan-thpt-abc` → **Continue**.
4. Màn hình hỏi **Gemini in Firebase** / **Google Analytics**: có thể **tắt** cả hai (không cần cho app này) → **Create project**.
5. Đợi khoảng 30 giây → **Continue**. Bạn đang ở trang tổng quan dự án.

> Dự án mới mặc định ở gói **Spark (miễn phí)**. **Không** bấm "Upgrade" để giữ miễn phí hoàn toàn.

## Bước 2. Đăng ký ứng dụng Web và lấy cấu hình

1. Tại trang tổng quan, bấm biểu tượng **`</>`** (Web) — hoặc **Add app → Web**.
2. Đặt **App nickname**: `to-chuyen-mon-web`. **Không** tick "Firebase Hosting" (ta dùng Vercel) → **Register app**.
3. Firebase hiện đoạn mã có `const firebaseConfig = { ... }`. **Sao chép 6 giá trị** vào Notepad:

   | Trong firebaseConfig | Đặt tên biến môi trường |
   |---|---|
   | `apiKey` | `VITE_FIREBASE_API_KEY` |
   | `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` |
   | `projectId` | `VITE_FIREBASE_PROJECT_ID` |
   | `storageBucket` | `VITE_FIREBASE_STORAGE_BUCKET` |
   | `messagingSenderId` | `VITE_FIREBASE_MESSAGING_SENDER_ID` |
   | `appId` | `VITE_FIREBASE_APP_ID` |

4. Bấm **Continue to console**.

> Lỡ đóng mất? Vào ⚙️ **Project settings** → tab **General** → kéo xuống **Your apps** → mục **SDK setup and configuration** → chọn **Config**.
>
> Các giá trị này **không phải mật khẩu** (Firebase thiết kế để nằm trong trang web); dữ liệu được bảo vệ bằng **luật bảo mật** ở Bước 5.

## Bước 3. Bật đăng nhập (Authentication)

1. Menu trái: **Build → Authentication** (hoặc **Security → Authentication**) → **Get started**.
2. Tab **Sign-in method**:
   - Chọn **Google** → bật **Enable** → chọn **Project support email** (email của bạn) → **Save**.
   - Chọn **Add new provider → Email/Password** → bật **Email/Password** (dòng đầu, *không cần* bật Email link) → **Save**.

## Bước 4. Tạo Firestore Database — CHỌN PRODUCTION MODE

1. Menu trái: **Build → Firestore Database** → **Create database**.
2. Nếu được hỏi **Edition**: chọn **Standard edition**. Database ID giữ mặc định **(default)**.
3. **Location**: chọn **`asia-southeast1 (Singapore)`** (gần Việt Nam nhất, nhanh nhất). *Lưu ý: không đổi được sau khi tạo.*
4. Màn hình **Secure rules**: chọn **Start in production mode** ✅
   **KHÔNG chọn "Start in test mode"** ❌ — test mode tự khóa dữ liệu sau 30 ngày.
5. Bấm **Create**.

## Bước 5. Dán luật bảo mật (Rules) — BƯỚC QUAN TRỌNG NHẤT

1. Trong **Firestore Database**, mở tab **Rules**.
2. Xóa hết nội dung đang có.
3. Mở file **`firestore.rules`** trong thư mục app (bằng Notepad) → **Ctrl+A**, **Ctrl+C** → dán vào ô Rules.
4. Bấm **Publish**. Thấy dòng "Rules published" là xong.

Kiểm tra: trong nội dung Rules **không được có** dòng nào dạng `request.time < timestamp.date(...)`. Nếu có → bạn đang dùng luật test mode, hãy dán lại.

> **Đã lỡ tạo ở test mode?** Không cần tạo lại: chỉ cần làm Bước 5 (dán đè luật mới và Publish) là hết hạn 30 ngày.
>
> Bộ luật này: người mới đăng nhập chỉ ở trạng thái *chờ duyệt*, không xem được gì; không ai tự nâng quyền được; giáo viên chỉ sửa được câu hỏi/hồ sơ của mình khi chưa duyệt; chỉ Tổ trưởng/Tổ phó duyệt, chấm điểm, trộn đề; chỉ Tổ trưởng phân quyền và sửa cài đặt.

## Bước 6 (tùy chọn). Chạy thử trên máy tính

Mở **Command Prompt** / **PowerShell** trong thư mục `to-chuyen-mon`:

```bash
npm install
```

Sao chép file `.env.example` thành `.env.local`, mở bằng Notepad và điền 6 giá trị ở Bước 2, ví dụ:

```
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=to-toan-thpt-abc.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=to-toan-thpt-abc
VITE_FIREBASE_STORAGE_BUCKET=to-toan-thpt-abc.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef
```

Chạy:

```bash
npm run dev
```

Mở http://localhost:5173 (tên miền `localhost` đã được Firebase cho phép sẵn).

> File `.env.local` **không** được đưa lên GitHub (đã khai báo trong `.gitignore`).

## Bước 7. Đưa mã nguồn lên GitHub

**Cách A — kéo thả trên web (không cần cài gì):**

1. Vào https://github.com/new → **Repository name**: `to-chuyen-mon` → chọn **Private** (khuyên dùng) → **Create repository**.
2. Bấm liên kết **uploading an existing file**.
3. Mở thư mục `to-chuyen-mon` trên máy, chọn **tất cả** file và thư mục **TRỪ** `node_modules`, `dist`, `.env.local` → kéo thả vào trang GitHub.
   Cần có đủ: `src/`, `public/`, `index.html`, `package.json`, `package-lock.json`, `vite.config.js`, `vercel.json`, `firestore.rules`, `.gitignore`, `.env.example`, các file `.md`.
   *(Windows có thể ẩn file bắt đầu bằng dấu chấm: trong File Explorer chọn View → Show → Hidden items.)*
4. Bấm **Commit changes**.

**Cách B — dùng Git (nếu đã cài Git):**

```bash
git init
git add .
git commit -m "Phan mem to chuyen mon"
git branch -M main
git remote add origin https://github.com/<tai-khoan-cua-ban>/to-chuyen-mon.git
git push -u origin main
```

## Bước 8. Deploy lên Vercel

1. Vào https://vercel.com/new → mục **Import Git Repository** → chọn repo `to-chuyen-mon` → **Import**.
   (Lần đầu Vercel sẽ xin quyền truy cập GitHub: chọn **All repositories** hoặc chỉ repo này → **Install**.)
2. **Framework Preset**: Vercel tự nhận **Vite**. Build Command `npm run build`, Output Directory `dist` (để mặc định).
3. Mở mục **Environment Variables**, thêm **đủ 6 biến** ở Bước 2 (Key = tên biến, Value = giá trị, không có dấu ngoặc kép).
   Mẹo: có thể dán nguyên nội dung file `.env.local` vào ô Key, Vercel tự tách thành 6 dòng.
4. Bấm **Deploy**, đợi 1–2 phút → **Continue to Dashboard**.
5. Ghi lại tên miền chính trong mục **Domains**, ví dụ: `to-chuyen-mon.vercel.app`.

> Có thể đổi tên miền dễ nhớ hơn: **Settings → Domains → Edit** (ví dụ `totoan-thptabc.vercel.app`). Đổi xong phải thêm tên mới vào Firebase ở Bước 9.

## Bước 9. Cho phép tên miền Vercel đăng nhập Firebase — KHÔNG ĐƯỢC BỎ

1. Firebase Console → **Authentication** → tab **Settings** → **Authorized domains**.
2. **Add domain** → nhập `to-chuyen-mon.vercel.app` (chỉ tên miền, **không** có `https://`, không có dấu `/` cuối) → **Add**.

Nếu bỏ bước này, khi đăng nhập Google sẽ báo lỗi `auth/unauthorized-domain`.

## Bước 10. Khởi tạo hệ thống (Tổ trưởng làm đầu tiên)

1. Mở `https://to-chuyen-mon.vercel.app` → **Đăng nhập bằng Google** bằng tài khoản của **Tổ trưởng**.
2. Vì đây là người đầu tiên, app hiện màn hình **Khởi tạo phần mềm tổ chuyên môn**: nhập tên trường, tên tổ, môn → **Bắt đầu sử dụng**.
   Tài khoản này trở thành **Tổ trưởng** (quản trị cao nhất).
3. Vào **Cài đặt** để rà soát: danh sách chuyên đề từng khối, điểm cộng theo mức độ câu hỏi, tiêu chí thi đua, ngưỡng xếp loại Tốt/Khá/Đạt, địa danh dùng trong biên bản → **Lưu cài đặt**.

> ⚠️ Hãy làm Bước 10 **ngay sau khi deploy**, trước khi gửi link cho người khác — người đăng nhập đầu tiên sẽ thành Tổ trưởng.

## Bước 11. Mời giáo viên trong tổ

1. Gửi link app vào nhóm Zalo của tổ. Giáo viên đăng nhập bằng Google (hoặc tạo tài khoản email/mật khẩu).
2. Họ sẽ thấy màn hình "Đang chờ Tổ trưởng phê duyệt".
3. Tổ trưởng vào **Thành viên tổ** → **Duyệt là Giáo viên**; đổi vai trò **Tổ phó** cho người phụ trách duyệt câu hỏi/trộn đề.

---

## Sử dụng hằng ngày (tóm tắt)

| Ai | Việc | Ở đâu |
|---|---|---|
| Giáo viên | Soạn từng câu hoặc dán nhiều câu cùng lúc (định dạng "Câu 1: … A. … Đáp án: …") | Đóng góp câu hỏi |
| Giáo viên | Khai báo dự giờ, thao giảng, HSG, KHKT, SKKN… (kèm link minh chứng Google Drive) | Hồ sơ chuyên môn |
| TT/TP | Duyệt câu hỏi (cộng điểm tự động theo mức độ), duyệt hồ sơ | Duyệt & phê duyệt |
| TT/TP | Ghi nhận nộp KHBD đúng hạn/muộn, kiểm tra hồ sơ cho cả tổ một lần | Hồ sơ chuyên môn → Ghi nhận nề nếp hàng loạt |
| TT/TP | Bốc đề theo ma trận, trộn nhiều mã, tải Word (công thức Equation) / In – PDF / đáp án Excel | Trộn & xuất đề |
| Mọi người | Xem xếp hạng tháng/học kỳ/năm; TT/TP xuất Excel và **Biên bản họp tổ (Word)** | Xếp hạng & báo cáo |

---

## Danh sách kiểm tra "chạy lâu dài" (nên in ra dán sổ)

- [ ] Firestore tạo ở **production mode**, Rules đã dán từ `firestore.rules` và **Publish** (không có `request.time <`).
- [ ] Dự án ở gói **Spark** (miễn phí). Không cần nâng cấp Blaze. *(Nếu sau này nâng Blaze, hãy đặt **Budget alert** 1–2 USD trong Google Cloud Billing.)*
- [ ] Đã thêm tên miền Vercel vào **Authorized domains**.
- [ ] Tài khoản Google sở hữu dự án được bảo vệ bằng xác minh 2 bước; ghi lại email này trong hồ sơ tổ.
- [ ] Thêm một người dự phòng làm chủ dự án: Firebase → ⚙️ **Users and permissions** → **Add member** → vai trò **Owner** (ví dụ Phó hiệu trưởng hoặc Tổ phó).
- [ ] **Cuối mỗi tháng**: Tổ trưởng vào **Cài đặt → Tải bản sao lưu (.json)** và cất vào Google Drive của tổ.
- [ ] **Đầu năm học** (tháng 8): kiểm tra Cài đặt → Năm học hiện tại (để trống = tự động theo ngày), cập nhật chuyên đề nếu đổi SGK.
- [ ] Không xóa dự án Firebase, không xóa repo GitHub/dự án Vercel. Đăng nhập Firebase Console ít nhất vài tháng một lần để đọc thông báo của Google.
- [ ] Theo dõi mức dùng: Firestore Database → tab **Usage**. Bình thường chỉ vài % hạn mức.

---

## Xử lý sự cố thường gặp

| Hiện tượng | Cách khắc phục |
|---|---|
| Trang báo **"Chưa cấu hình Firebase"** | Thiếu biến môi trường trên Vercel. Vào Vercel → Project → **Settings → Environment Variables** kiểm tra đủ 6 biến, đúng tên `VITE_FIREBASE_...` → tab **Deployments** → nút ⋯ ở bản mới nhất → **Redeploy**. *(Mỗi lần sửa biến môi trường đều phải Redeploy.)* |
| Đăng nhập báo `auth/unauthorized-domain` | Làm lại **Bước 9** với đúng tên miền đang mở trên thanh địa chỉ. |
| Báo **"Không đọc được dữ liệu"** / `Missing or insufficient permissions` | Chưa tạo Firestore (Bước 4) hoặc chưa **Publish** Rules (Bước 5). |
| Cửa sổ đăng nhập Google không hiện | Trình duyệt chặn popup: cho phép popup cho trang này, hoặc mở bằng Chrome/Edge thay vì trình duyệt trong Zalo (bấm ⋯ → *Mở bằng trình duyệt*). |
| Báo đã hết hạn mức miễn phí trong ngày | Đợi đến khoảng 14–15 giờ chiều để hạn mức làm mới. Nếu xảy ra thường xuyên, xem tab Usage và liên hệ người phụ trách kỹ thuật. |
| Tổ trưởng lỡ tự hạ quyền mình | Firebase Console → Firestore Database → **Data** → `users` → chọn tài liệu của mình → sửa trường `role` thành `leader`. |
| Muốn đổi Tổ trưởng | Tổ trưởng cũ vào **Thành viên tổ**, đặt người mới làm **Tổ trưởng**, rồi tự đổi mình thành Giáo viên. |
| Muốn làm lại từ đầu | Firestore → Data → xóa collection `settings` và tài liệu trong `users` của người sẽ làm Tổ trưởng → người đó đăng nhập lại sẽ thấy màn hình Khởi tạo. |

---

## Cập nhật app về sau

Sửa mã nguồn → đưa lên GitHub (Cách A: **Add file → Upload files** đè file cũ; Cách B: `git add . && git commit -m "..." && git push`) → Vercel **tự động build và cập nhật** sau 1–2 phút. Dữ liệu trong Firebase không bị ảnh hưởng.

Nếu file `firestore.rules` thay đổi, nhớ dán lại vào Firebase (Bước 5).
