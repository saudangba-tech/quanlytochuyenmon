import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Library,
  PlusCircle,
  ClipboardCheck,
  FileText,
  Trophy,
  NotebookPen,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLES } from '../lib/constants.js';
import { Badge } from './ui.jsx';

export default function Layout() {
  const { profile, settings, isManager, isLeader, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const nav = [
    { to: '/', label: 'Tổng quan', icon: LayoutDashboard, end: true },
    { section: 'Ngân hàng đề' },
    { to: '/ngan-hang', label: 'Ngân hàng câu hỏi', icon: Library },
    { to: '/them-cau-hoi', label: 'Đóng góp câu hỏi', icon: PlusCircle },
    isManager && { to: '/duyet', label: 'Duyệt & phê duyệt', icon: ClipboardCheck },
    isManager && { to: '/de-thi', label: 'Trộn & xuất đề', icon: FileText },
    { section: 'Thi đua' },
    { to: '/ho-so', label: 'Hồ sơ chuyên môn', icon: NotebookPen },
    { to: '/thi-dua', label: 'Xếp hạng & báo cáo', icon: Trophy },
    { section: 'Quản trị' },
    { to: '/thanh-vien', label: 'Thành viên tổ', icon: Users },
    isLeader && { to: '/cai-dat', label: 'Cài đặt', icon: Settings },
  ].filter(Boolean);

  const linkCls = ({ isActive }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
      isActive ? 'bg-blue-700 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
    }`;

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-4 py-4">
        <div className="text-xs font-semibold tracking-wide text-blue-700 uppercase">{settings.schoolName}</div>
        <div className="text-base font-bold text-slate-900">{settings.groupName}</div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {nav.map((n, i) =>
          n.section ? (
            <div key={i} className="px-3 pt-4 pb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">
              {n.section}
            </div>
          ) : (
            <NavLink key={n.to} to={n.to} end={n.end} className={linkCls} onClick={() => setOpen(false)}>
              <n.icon size={18} /> {n.label}
            </NavLink>
          )
        )}
      </nav>
      <div className="border-t border-slate-200 p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          {profile?.photoURL ? (
            <img src={profile.photoURL} alt="" className="h-9 w-9 rounded-full" referrerPolicy="no-referrer" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-700">
              {(profile?.name || '?').slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{profile?.name}</div>
            <Badge className={ROLES[profile?.role]?.color}>{ROLES[profile?.role]?.name}</Badge>
          </div>
        </div>
        <button className="btn-secondary mt-2 w-full" onClick={logout}>
          <LogOut size={16} /> Đăng xuất
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className="no-print hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:block">{sidebar}</aside>
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">
            <button className="absolute top-3 right-3 rounded-lg p-1.5 hover:bg-slate-100" onClick={() => setOpen(false)} aria-label="Đóng menu">
              <X size={20} />
            </button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="flex-1 lg:pl-64">
        <header className="no-print sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <button className="rounded-lg p-1.5 hover:bg-slate-100" onClick={() => setOpen(true)} aria-label="Mở menu">
            <Menu size={22} />
          </button>
          <span className="truncate font-semibold">{settings.groupName}</span>
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
