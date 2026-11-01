import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteDoc, getCountFromServer, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { FolderOpen, Plus, Pencil, Trash2, RefreshCw, Library } from 'lucide-react';
import { db } from '../firebase.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSources } from '../lib/hooks.js';
import { col, ref, createSource, fetchWhere, deleteQuestion, invalidate } from '../lib/db.js';
import { SOURCE_TYPES } from '../lib/constants.js';
import { formatTimestamp, currentSchoolYear } from '../lib/utils.js';
import { PageHeader, PageLoader, Empty, Modal, Field, Badge, Spinner, useAsync } from '../components/ui.jsx';

export default function Sources() {
  const { me, isManager, settings } = useAuth();
  const { sources, loading, reload } = useSources();
  const [counts, setCounts] = useState({});
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState({ type: '', text: '' });
  const [busy, run] = useAsync();

  // Đếm số câu theo từng nguồn (mỗi phép đếm ~1 lượt đọc)
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const s of sources) {
        if (!alive) return;
        try {
          const [all, approved] = await Promise.all([
            getCountFromServer(query(col('questions'), where('sourceId', '==', s.id))),
            getCountFromServer(query(col('questions'), where('sourceId', '==', s.id), where('status', '==', 'approved'))),
          ]);
          if (alive) setCounts((c) => ({ ...c, [s.id]: { all: all.data().count, approved: approved.data().count } }));
        } catch {
          /* bỏ qua */
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [sources]);

  async function save(data) {
    await run(async () => {
      if (data.id) {
        const old = sources.find((s) => s.id === data.id);
        await updateDoc(ref('sources', data.id), { name: data.name.trim(), type: data.type, year: data.year, note: data.note });
        // Đổi tên → cập nhật tên nguồn lưu kèm trong từng câu (chỉ TT/TP có quyền sửa câu đã duyệt)
        if (isManager && old && old.name !== data.name.trim()) {
          const qs = await fetchWhere('questions', [['sourceId', '==', data.id]]);
          for (let i = 0; i < qs.length; i += 400) {
            const batch = writeBatch(db);
            qs.slice(i, i + 400).forEach((q) => batch.update(ref('questions', q.id), { sourceName: data.name.trim() }));
            await batch.commit();
          }
          invalidate('q:');
        }
      } else await createSource(data, me);
      setEditing(null);
      reload();
    }, 'Đã lưu nguồn đề.');
  }

  async function remove(s, withQuestions) {
    const msg = withQuestions
      ? `Xóa nguồn "${s.name}" VÀ toàn bộ câu hỏi thuộc nguồn này? Điểm thi đua của các câu đã duyệt sẽ bị trừ. Không thể hoàn tác.`
      : `Xóa nguồn "${s.name}"? Các câu hỏi vẫn được giữ lại trong ngân hàng.`;
    if (!confirm(msg)) return;
    await run(async () => {
      if (withQuestions) {
        const qs = await fetchWhere('questions', [['sourceId', '==', s.id]]);
        if (!isManager && qs.some((q) => q.authorId !== me.uid || q.status === 'approved'))
          throw new Error('Nguồn này có câu đã được duyệt hoặc của người khác – chỉ Tổ trưởng/Tổ phó xóa được.');
        for (const q of qs) await deleteQuestion(q);
        invalidate('q:');
      }
      await deleteDoc(ref('sources', s.id));
      reload();
    }, 'Đã xóa.');
  }

  const t = filter.text.trim().toLowerCase();
  const shown = sources.filter((s) => (!filter.type || s.type === filter.type) && (!t || `${s.name} ${s.note} ${s.year}`.toLowerCase().includes(t)));

  return (
    <div>
      <PageHeader
        title="Nguồn đề"
        subtitle="Mỗi file đề nhập vào là một nguồn. Câu hỏi lưu kèm mã nguồn để tra cứu, thống kê và xóa cả lô khi nhập nhầm."
        actions={
          <>
            <button className="btn-secondary" onClick={reload} title="Tải lại">
              <RefreshCw size={16} />
            </button>
            <button className="btn-primary" onClick={() => setEditing({ name: '', type: 'Đề thi thử', year: currentSchoolYear(settings), note: '' })}>
              <Plus size={16} /> Thêm nguồn
            </button>
          </>
        }
      />
      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-3">
        <input className="input sm:col-span-2" placeholder="Tìm theo tên nguồn, năm, ghi chú…" value={filter.text} onChange={(e) => setFilter({ ...filter, text: e.target.value })} />
        <select className="input" value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })}>
          <option value="">Mọi loại nguồn</option>
          {SOURCE_TYPES.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </div>
      {loading ? (
        <PageLoader />
      ) : !shown.length ? (
        <Empty icon={FolderOpen} title="Chưa có nguồn đề">
          Nguồn được tạo tự động khi tải file Word/PDF ở mục Đóng góp câu hỏi.
        </Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Nguồn</th>
                <th>Loại</th>
                <th className="text-right">Số câu</th>
                <th>Người nhập</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => {
                const c = counts[s.id];
                const mine = s.createdBy === me.uid;
                return (
                  <tr key={s.id}>
                    <td className="min-w-64">
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-slate-500">
                        {s.year && `${s.year} • `}
                        {s.note}
                      </div>
                    </td>
                    <td>
                      <Badge className="bg-slate-100 text-slate-700">{s.type}</Badge>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      {c ? (
                        <>
                          <b>{c.all}</b> <span className="text-xs text-emerald-700">({c.approved} đã duyệt)</span>
                        </>
                      ) : (
                        '…'
                      )}
                    </td>
                    <td className="whitespace-nowrap text-slate-500">
                      {s.createdByName}
                      <div className="text-xs">{formatTimestamp(s.createdAt)}</div>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      <Link to={`/ngan-hang?nguon=${s.id}`} className="rounded-lg p-1.5 text-blue-700 hover:bg-blue-50" title="Xem câu hỏi của nguồn">
                        <Library size={16} className="inline" />
                      </Link>
                      {(isManager || mine) && (
                        <>
                          <button className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Sửa" onClick={() => setEditing(s)}>
                            <Pencil size={16} />
                          </button>
                          <button className="rounded-lg p-1.5 text-red-500 hover:bg-red-50" title="Xóa nguồn và các câu hỏi" onClick={() => remove(s, true)} disabled={busy}>
                            <Trash2 size={16} />
                          </button>
                          {isManager && (
                            <button className="text-xs text-slate-500 hover:text-red-600" onClick={() => remove(s, false)} disabled={busy}>
                              Chỉ xóa nguồn
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && <SourceForm value={editing} busy={busy} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function SourceForm({ value, onClose, onSave, busy }) {
  const [s, setS] = useState(value);
  return (
    <Modal
      open
      onClose={onClose}
      title={s.id ? 'Sửa nguồn đề' : 'Thêm nguồn đề'}
      size="max-w-lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Hủy
          </button>
          <button className="btn-primary" disabled={busy || !s.name.trim()} onClick={() => onSave(s)}>
            {busy && <Spinner />} Lưu
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Tên nguồn">
          <input className="input" value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} placeholder="Đề thi thử TN 2025 – Sở GD&ĐT Hà Nội" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Loại">
            <select className="input" value={s.type} onChange={(e) => setS({ ...s, type: e.target.value })}>
              {SOURCE_TYPES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="Năm học / năm">
            <input className="input" value={s.year || ''} onChange={(e) => setS({ ...s, year: e.target.value })} />
          </Field>
        </div>
        <Field label="Ghi chú">
          <textarea className="input min-h-16" value={s.note || ''} onChange={(e) => setS({ ...s, note: e.target.value })} placeholder="Trường, tác giả, link đề gốc trên Google Drive…" />
        </Field>
      </div>
    </Modal>
  );
}
