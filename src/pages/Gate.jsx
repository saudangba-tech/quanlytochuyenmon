import { useState } from 'react';
import { Clock, LogOut, Settings2, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { errorMessage } from '../lib/utils.js';
import { Field, Spinner } from '../components/ui.jsx';

function Shell({ children }) {
  return <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">{children}</div>;
}

export function MissingConfig() {
  return (
    <Shell>
      <div className="card max-w-xl p-6">
        <div className="mb-3 flex items-center gap-2 text-amber-700">
          <ShieldAlert /> <h1 className="text-lg font-bold">Chưa cấu hình Firebase</h1>
        </div>
        <p className="text-sm text-slate-600">
          App chưa nhận được các biến môi trường <code>VITE_FIREBASE_*</code>. Hãy làm theo file <b>HUONG_DAN_CAI_DAT.md</b>:
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>Chạy trên máy: sao chép <code>.env.example</code> thành <code>.env.local</code> rồi điền giá trị, chạy lại <code>npm run dev</code>.</li>
          <li>
            Trên Vercel: vào <i>Settings → Environment Variables</i>, thêm đủ 6 biến rồi bấm <i>Redeploy</i>.
          </li>
        </ul>
      </div>
    </Shell>
  );
}

// Thường gặp khi chưa tạo Firestore Database hoặc chưa dán luật bảo mật (Rules)
export function DataError({ message }) {
  const { logout } = useAuth();
  return (
    <Shell>
      <div className="card max-w-xl p-6">
        <div className="mb-3 flex items-center gap-2 text-red-700">
          <ShieldAlert /> <h1 className="text-lg font-bold">Không đọc được dữ liệu</h1>
        </div>
        <p className="text-sm text-slate-600">Kiểm tra lại các bước trong HUONG_DAN_CAI_DAT.md:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>Đã tạo <b>Firestore Database</b> (Bước 4) chưa?</li>
          <li>
            Đã dán nội dung file <code>firestore.rules</code> vào tab <b>Rules</b> và bấm <b>Publish</b> (Bước 5) chưa?
          </li>
        </ul>
        <p className="mt-3 rounded bg-slate-100 px-3 py-2 font-mono text-xs text-slate-500">{message}</p>
        <button className="btn-secondary mt-4" onClick={logout}>
          <LogOut size={16} /> Đăng xuất
        </button>
      </div>
    </Shell>
  );
}

export function Pending() {
  const { profile, logout, settings } = useAuth();
  const disabled = profile?.role === 'disabled';
  return (
    <Shell>
      <div className="card max-w-md p-6 text-center">
        <Clock className="mx-auto mb-3 text-amber-500" size={44} />
        <h1 className="text-lg font-bold">{disabled ? 'Tài khoản đã bị khóa' : 'Đang chờ Tổ trưởng phê duyệt'}</h1>
        <p className="mt-2 text-sm text-slate-600">
          Xin chào <b>{profile?.name}</b> ({profile?.email}).{' '}
          {disabled
            ? 'Vui lòng liên hệ Tổ trưởng nếu cần mở lại.'
            : `Tài khoản của thầy/cô đã được ghi nhận vào ${settings.groupName}. Trang sẽ tự mở khi Tổ trưởng duyệt.`}
        </p>
        <button className="btn-secondary mt-5" onClick={logout}>
          <LogOut size={16} /> Đăng xuất
        </button>
      </div>
    </Shell>
  );
}

// Lần đầu tiên: người đăng nhập đầu tiên khai báo thông tin tổ và trở thành Tổ trưởng
export function Setup() {
  const { bootstrap, user, logout } = useAuth();
  const [f, setF] = useState({
    name: user?.displayName || '',
    departmentName: 'SỞ GIÁO DỤC VÀ ĐÀO TẠO ',
    schoolName: 'TRƯỜNG THPT ',
    groupName: 'TỔ TOÁN – TIN',
    subject: 'Toán',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await bootstrap(f);
    } catch (e2) {
      setErr(errorMessage(e2));
      setBusy(false);
    }
  }

  return (
    <Shell>
      <form onSubmit={submit} className="card w-full max-w-lg space-y-4 p-6">
        <div className="flex items-center gap-2 text-blue-700">
          <Settings2 /> <h1 className="text-lg font-bold">Khởi tạo phần mềm tổ chuyên môn</h1>
        </div>
        <p className="text-sm text-slate-600">
          Đây là lần đầu hệ thống được sử dụng. Tài khoản <b>{user?.email}</b> sẽ trở thành <b>Tổ trưởng</b> (quản trị cao nhất). Các thành viên khác đăng nhập sau sẽ chờ
          thầy/cô duyệt.
        </p>
        <Field label="Họ tên Tổ trưởng">
          <input className="input" value={f.name} onChange={set('name')} required />
        </Field>
        <Field label="Cơ quan chủ quản">
          <input className="input" value={f.departmentName} onChange={set('departmentName')} />
        </Field>
        <Field label="Tên trường">
          <input className="input" value={f.schoolName} onChange={set('schoolName')} required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tên tổ">
            <input className="input" value={f.groupName} onChange={set('groupName')} required />
          </Field>
          <Field label="Môn học của ngân hàng đề">
            <input className="input" value={f.subject} onChange={set('subject')} required />
          </Field>
        </div>
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
        <div className="flex justify-between gap-2">
          <button type="button" className="btn-secondary" onClick={logout}>
            Đăng xuất
          </button>
          <button className="btn-primary" disabled={busy}>
            {busy && <Spinner />} Bắt đầu sử dụng
          </button>
        </div>
      </form>
    </Shell>
  );
}
