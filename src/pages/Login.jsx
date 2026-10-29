import { useState } from 'react';
import {
  signInWithPopup,
  signInWithRedirect,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { BookOpenCheck, Trophy, FileText } from 'lucide-react';
import { auth, googleProvider } from '../firebase.js';
import { errorMessage } from '../lib/utils.js';
import { Spinner } from '../components/ui.jsx';

export default function Login() {
  const [mode, setMode] = useState('login'); // login | register | reset
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function google() {
    setBusy(true);
    setMsg({});
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      setMsg({ type: 'error', text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg({});
    try {
      if (mode === 'login') await signInWithEmailAndPassword(auth, form.email.trim(), form.password);
      if (mode === 'register') {
        if (!form.name.trim()) throw new Error('Vui lòng nhập họ tên.');
        const cred = await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);
        await updateProfile(cred.user, { displayName: form.name.trim() });
      }
      if (mode === 'reset') {
        await sendPasswordResetEmail(auth, form.email.trim());
        setMsg({ type: 'ok', text: 'Đã gửi email đặt lại mật khẩu. Vui lòng kiểm tra hộp thư (cả mục Spam).' });
      }
    } catch (err) {
      setMsg({ type: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-blue-800 via-blue-700 to-indigo-700 lg:flex-row">
      <div className="flex flex-1 flex-col justify-center px-8 py-10 text-white lg:px-16">
        <div className="max-w-lg">
          <div className="mb-3 text-sm font-semibold tracking-widest text-blue-200 uppercase">Phần mềm tổ chuyên môn</div>
          <h1 className="text-3xl leading-tight font-bold sm:text-4xl">Ngân hàng đề thi & Quản lý thi đua</h1>
          <p className="mt-4 text-blue-100">Một nơi duy nhất để cả tổ đóng góp câu hỏi, trộn đề, ghi nhận hồ sơ chuyên môn và tổng hợp thi đua tự động.</p>
          <ul className="mt-8 hidden space-y-4 sm:block">
            {[
              [BookOpenCheck, 'Câu hỏi theo ma trận NB – TH – VD – VDC, công thức LaTeX hiển thị đẹp'],
              [FileText, 'Trộn nhiều mã đề, xuất Word có công thức Equation và đáp án'],
              [Trophy, 'Cộng điểm thi đua tự động, xuất biên bản họp tổ 1 chạm'],
            ].map(([Icon, t]) => (
              <li key={t} className="flex items-start gap-3">
                <Icon className="mt-0.5 shrink-0 text-yellow-300" size={20} /> <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
          <h2 className="text-xl font-bold text-slate-900">{mode === 'register' ? 'Tạo tài khoản' : mode === 'reset' ? 'Quên mật khẩu' : 'Đăng nhập'}</h2>
          <p className="mt-1 text-sm text-slate-500">Dùng tài khoản Google là nhanh nhất.</p>

          <button className="btn-secondary mt-5 w-full py-2.5" onClick={google} disabled={busy}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
            Đăng nhập bằng Google
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
            <div className="h-px flex-1 bg-slate-200" /> hoặc dùng email <div className="h-px flex-1 bg-slate-200" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === 'register' && <input className="input" placeholder="Họ và tên" value={form.name} onChange={set('name')} autoComplete="name" />}
            <input className="input" type="email" placeholder="Email" value={form.email} onChange={set('email')} required autoComplete="email" />
            {mode !== 'reset' && (
              <input
                className="input"
                type="password"
                placeholder="Mật khẩu (ít nhất 6 ký tự)"
                value={form.password}
                onChange={set('password')}
                required
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              />
            )}
            {msg.text && (
              <div className={`rounded-lg px-3 py-2 text-sm ${msg.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{msg.text}</div>
            )}
            <button className="btn-primary w-full py-2.5" disabled={busy}>
              {busy && <Spinner />}
              {mode === 'register' ? 'Đăng ký' : mode === 'reset' ? 'Gửi email đặt lại' : 'Đăng nhập'}
            </button>
          </form>

          <div className="mt-4 flex justify-between text-sm">
            {mode === 'login' ? (
              <>
                <button className="text-blue-700 hover:underline" onClick={() => setMode('register')}>
                  Tạo tài khoản mới
                </button>
                <button className="text-slate-500 hover:underline" onClick={() => setMode('reset')}>
                  Quên mật khẩu?
                </button>
              </>
            ) : (
              <button className="text-blue-700 hover:underline" onClick={() => setMode('login')}>
                ← Quay lại đăng nhập
              </button>
            )}
          </div>
          <p className="mt-6 text-xs text-slate-400">Tài khoản mới cần Tổ trưởng phê duyệt trước khi sử dụng.</p>
        </div>
      </div>
    </div>
  );
}
