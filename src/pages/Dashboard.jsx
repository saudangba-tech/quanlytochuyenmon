import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCountFromServer, query, where } from 'firebase/firestore';
import { Library, Star, ClipboardCheck, PenLine, PlusCircle, NotebookPen, FileText, Trophy } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { col, cached } from '../lib/db.js';
import { LEVELS } from '../lib/constants.js';
import { currentSchoolYear, monthOf, todayISO, formatMonth, fmtPoints, RATING_COLORS } from '../lib/utils.js';
import { StatCard, Badge } from '../components/ui.jsx';
import { useLeaderboard } from './Leaderboard.jsx';

const count = (...conds) => getCountFromServer(query(col('questions'), ...conds.map(([f, o, v]) => where(f, o, v)))).then((s) => s.data().count);

export default function Dashboard() {
  const { profile, settings, me, isManager } = useAuth();
  const sy = currentSchoolYear(settings);
  const month = monthOf(todayISO());
  const { rows, loading } = useLeaderboard(sy, { type: 'month', month });
  const [c, setC] = useState(null);

  useEffect(() => {
    // Phép đếm (count) của Firestore: mỗi lần đếm chỉ tính ~1 lượt đọc
    cached(
      `dash:${me.uid}`,
      async () => {
        const [approved, mine, pending, ...matrix] = await Promise.all([
          count(['status', '==', 'approved']),
          count(['authorId', '==', me.uid]),
          isManager ? count(['status', '==', 'pending']) : Promise.resolve(0),
          ...settings.grades.flatMap((g) => LEVELS.map((l) => count(['grade', '==', Number(g)], ['level', '==', l.id], ['status', '==', 'approved']))),
        ]);
        return { approved, mine, pending, matrix };
      },
      2 * 60 * 1000
    )
      .then(setC)
      .catch(() => setC({ approved: '–', mine: '–', pending: '–', matrix: [] }));
  }, [me.uid, isManager, settings.grades]);

  const myRow = rows.find((r) => r.id === me.uid);
  const myRank = rows.findIndex((r) => r.id === me.uid) + 1;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Xin chào, {profile?.name} 👋</h1>
        <p className="text-sm text-slate-500">
          {settings.groupName} – {settings.schoolName} • Năm học {sy.replace('-', ' – ')}
        </p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Library} label="Câu hỏi đã duyệt trong ngân hàng" value={c?.approved ?? '…'} />
        <StatCard icon={PenLine} label="Câu hỏi tôi đã đóng góp" value={c?.mine ?? '…'} color="text-violet-700 bg-violet-50" />
        <StatCard
          icon={Star}
          label={`Điểm thi đua ${formatMonth(month).toLowerCase()}`}
          value={loading ? '…' : fmtPoints(myRow?.points || 0)}
          sub={myRank ? `Xếp thứ ${myRank}/${rows.length}` : ''}
          color="text-amber-700 bg-amber-50"
        />
        {isManager ? (
          <Link to="/duyet">
            <StatCard icon={ClipboardCheck} label="Câu hỏi đang chờ duyệt" value={c?.pending ?? '…'} color="text-rose-700 bg-rose-50" />
          </Link>
        ) : (
          <StatCard icon={Trophy} label="Xếp loại tháng này" value={loading ? '…' : myRow?.rating || '–'} color="text-emerald-700 bg-emerald-50" />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="card p-4 lg:col-span-3">
          <h2 className="mb-3 font-semibold">Độ phủ ngân hàng câu hỏi (đã duyệt)</h2>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Khối</th>
                  {LEVELS.map((l) => (
                    <th key={l.id} className="text-center">
                      {l.name}
                    </th>
                  ))}
                  <th className="text-center">Cộng</th>
                </tr>
              </thead>
              <tbody>
                {settings.grades.map((g, gi) => {
                  const vals = LEVELS.map((_, li) => c?.matrix?.[gi * LEVELS.length + li] ?? 0);
                  const maxV = Math.max(1, ...(c?.matrix || [1]));
                  return (
                    <tr key={g}>
                      <td className="font-medium whitespace-nowrap">Lớp {g}</td>
                      {vals.map((v, li) => (
                        <td key={li} className="text-center">
                          <span className="inline-block min-w-10 rounded px-2 py-0.5" style={{ background: `rgba(29,78,216,${0.08 + (0.5 * v) / maxV})` }}>
                            {c ? v : '…'}
                          </span>
                        </td>
                      ))}
                      <td className="text-center font-semibold">{c ? vals.reduce((a, b) => a + b, 0) : '…'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <Link to="/them-cau-hoi" className="btn-primary">
              <PlusCircle size={16} /> Đóng góp câu hỏi
            </Link>
            <Link to="/ho-so" className="btn-secondary">
              <NotebookPen size={16} /> Khai báo hồ sơ
            </Link>
            {isManager ? (
              <Link to="/de-thi/tao" className="btn-secondary">
                <FileText size={16} /> Tạo đề mới
              </Link>
            ) : (
              <Link to="/ngan-hang" className="btn-secondary">
                <Library size={16} /> Xem ngân hàng
              </Link>
            )}
          </div>
        </div>

        <div className="card p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Bảng vàng {formatMonth(month).toLowerCase()}</h2>
            <Link to="/thi-dua" className="text-sm text-blue-700 hover:underline">
              Xem tất cả
            </Link>
          </div>
          {loading ? (
            <p className="text-sm text-slate-400">Đang tải…</p>
          ) : (
            <ol className="space-y-2">
              {rows.slice(0, 6).map((r, i) => (
                <li key={r.id} className={`flex items-center gap-3 rounded-lg px-2 py-1.5 ${r.id === me.uid ? 'bg-blue-50' : ''}`}>
                  <span className="w-6 text-center">{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
                  <span className="flex-1 truncate">{r.name}</span>
                  <Badge className={RATING_COLORS[r.rating]}>{r.rating}</Badge>
                  <b className="w-12 text-right">{fmtPoints(r.points)}</b>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
