import { useState } from 'react';
import { updateDoc, deleteDoc } from 'firebase/firestore';
import { Users, RefreshCw, Trash2, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useMembers } from '../lib/hooks.js';
import { ref, invalidate } from '../lib/db.js';
import { ROLES } from '../lib/constants.js';
import { formatTimestamp } from '../lib/utils.js';
import { PageHeader, PageLoader, Empty, Badge, useAsync } from '../components/ui.jsx';

export default function Members() {
  const { isLeader, me } = useAuth();
  const { members, loading, reload } = useMembers({ includeAll: true });
  const [busy, run] = useAsync();
  const [editName, setEditName] = useState({});

  const pending = members.filter((m) => m.role === 'pending');
  const others = members.filter((m) => m.role !== 'pending');

  async function setRole(m, role) {
    if (m.id === me.uid && role !== 'leader' && !confirm('Bạn đang tự bỏ quyền Tổ trưởng của mình. Tiếp tục?')) return;
    await run(async () => {
      await updateDoc(ref('users', m.id), { role });
      invalidate('users');
      reload();
    }, 'Đã cập nhật vai trò.');
  }

  async function saveName(m) {
    const name = (editName[m.id] ?? '').trim();
    if (!name || name === m.name) return;
    await run(async () => {
      await updateDoc(ref('users', m.id), { name });
      reload();
    }, 'Đã đổi tên hiển thị.');
  }

  async function remove(m) {
    if (!confirm(`Xóa hồ sơ ${m.name}? (Tài khoản đăng nhập vẫn còn, nếu đăng nhập lại sẽ ở trạng thái chờ duyệt.)`)) return;
    await run(async () => {
      await deleteDoc(ref('users', m.id));
      reload();
    }, 'Đã xóa.');
  }

  if (loading) return <PageLoader />;
  return (
    <div>
      <PageHeader
        title="Thành viên tổ"
        subtitle={isLeader ? 'Duyệt tài khoản mới và phân quyền Giáo viên / Tổ phó / Tổ trưởng.' : 'Danh sách thành viên của tổ.'}
        actions={
          <button className="btn-secondary" onClick={reload}>
            <RefreshCw size={16} /> Tải lại
          </button>
        }
      />

      {isLeader && pending.length > 0 && (
        <div className="card mb-6 border-amber-300 p-4">
          <h2 className="mb-3 font-semibold text-amber-800">Tài khoản chờ duyệt ({pending.length})</h2>
          <div className="space-y-2">
            {pending.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-amber-50 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-slate-500">
                    {m.email} • {formatTimestamp(m.createdAt)}
                  </div>
                </div>
                <button className="btn-success" disabled={busy} onClick={() => setRole(m, 'teacher')}>
                  <Check size={16} /> Duyệt là Giáo viên
                </button>
                <button className="btn-secondary text-red-600" disabled={busy} onClick={() => remove(m)}>
                  Từ chối
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!others.length ? (
        <Empty icon={Users} title="Chưa có thành viên" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Họ tên</th>
                <th>Email</th>
                <th>Vai trò</th>
                {isLeader && <th />}
              </tr>
            </thead>
            <tbody>
              {others.map((m) => (
                <tr key={m.id}>
                  <td className="min-w-48">
                    {isLeader ? (
                      <input
                        className="input"
                        value={editName[m.id] ?? m.name}
                        onChange={(e) => setEditName({ ...editName, [m.id]: e.target.value })}
                        onBlur={() => saveName(m)}
                      />
                    ) : (
                      m.name
                    )}
                  </td>
                  <td className="text-slate-500">{m.email}</td>
                  <td>
                    {isLeader ? (
                      <select className="input w-36" value={m.role} disabled={busy} onChange={(e) => setRole(m, e.target.value)}>
                        {['teacher', 'deputy', 'leader', 'disabled'].map((r) => (
                          <option key={r} value={r}>
                            {ROLES[r].name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Badge className={ROLES[m.role]?.color}>{ROLES[m.role]?.name}</Badge>
                    )}
                  </td>
                  {isLeader && (
                    <td className="text-right">
                      {m.id !== me.uid && (
                        <button className="rounded-lg p-1.5 text-red-500 hover:bg-red-50" title="Xóa hồ sơ" onClick={() => remove(m)} disabled={busy}>
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Quyền hạn: <b>Giáo viên</b> đóng góp câu hỏi, khai báo hồ sơ; <b>Tổ phó</b> thêm quyền duyệt, trộn đề, ghi nhận thi đua; <b>Tổ trưởng</b> toàn quyền (phân quyền,
        cài đặt, sao lưu). Tài khoản <b>Đã khóa</b> không truy cập được dữ liệu.
      </p>
    </div>
  );
}
