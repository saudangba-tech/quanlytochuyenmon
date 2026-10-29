import { useEffect, useMemo, useState } from 'react';
import { addDoc, deleteDoc, serverTimestamp, updateDoc, writeBatch, doc, collection } from 'firebase/firestore';
import { Plus, NotebookPen, Pencil, Trash2, FileDown, ExternalLink, RefreshCw, Users } from 'lucide-react';
import { db } from '../firebase.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useMembers } from '../lib/hooks.js';
import { col, ref, fetchWhere, cached, invalidate } from '../lib/db.js';
import { BANK_CRITERION, STATUS, LESSON_RATINGS, ACHIEVEMENT_LEVELS } from '../lib/constants.js';
import {
  currentSchoolYear,
  schoolYearOptions,
  monthsOfSchoolYear,
  formatMonth,
  formatDate,
  fmtPoints,
  periodFields,
  todayISO,
  downloadBlob,
  safeFileName,
} from '../lib/utils.js';
import { PageHeader, PageLoader, Empty, Modal, Field, Badge, Spinner, useAsync, useToast } from '../components/ui.jsx';

export const criterionName = (settings, id) =>
  id === BANK_CRITERION.id ? BANK_CRITERION.name : settings.criteria.find((c) => c.id === id)?.name || id;

export function RecordDetails({ r }) {
  const d = r.details || {};
  const rows = [
    d.className && `Lớp ${d.className}${d.period ? `, tiết ${d.period}` : ''}`,
    d.teacherName && `Người dạy: ${d.teacherName}`,
    d.observerName && `Người dự: ${d.observerName}`,
    d.rating && `Xếp loại: ${d.rating}`,
    d.level && `Cấp: ${d.level}`,
    d.result && `Kết quả: ${d.result}`,
    d.students && `Học sinh: ${d.students}`,
    r.count !== undefined && r.category === BANK_CRITERION.id && `Số câu được duyệt: ${r.count}`,
  ].filter(Boolean);
  return (
    <div className="mt-1 space-y-1 text-sm text-slate-600">
      {rows.length > 0 && <div>{rows.join(' • ')}</div>}
      {d.strengths && <div><b>Ưu điểm:</b> {d.strengths}</div>}
      {d.weaknesses && <div><b>Hạn chế:</b> {d.weaknesses}</div>}
      {d.suggestions && <div><b>Đề nghị:</b> {d.suggestions}</div>}
      {d.note && <div className="text-slate-500">{d.note}</div>}
      {d.evidenceUrl && /^https?:\/\//.test(d.evidenceUrl) && (
        <a href={d.evidenceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-700 hover:underline">
          <ExternalLink size={13} /> Minh chứng
        </a>
      )}
      {r.status === 'rejected' && r.reviewNote && <div className="rounded bg-red-50 px-2 py-1 text-xs text-red-700">Góp ý: {r.reviewNote}</div>}
    </div>
  );
}

export default function Records() {
  const { settings, me, isManager } = useAuth();
  const { members } = useMembers();
  const [sy, setSy] = useState(currentSchoolYear(settings));
  const [scope, setScope] = useState('mine');
  const [filter, setFilter] = useState({ category: '', month: '', user: '' });
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // record hoặc {} để tạo mới
  const [bulkOpen, setBulkOpen] = useState(false);
  const [busy, run] = useAsync();

  async function load(force = false) {
    const key = `rec:${sy}`;
    if (force) invalidate(key);
    setLoading(true);
    await run(async () => {
      const data = await cached(key, () => fetchWhere('records', [['schoolYear', '==', sy]]));
      data.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setList(data);
    });
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sy]);

  const shown = useMemo(
    () =>
      list.filter(
        (r) =>
          (scope === 'all' || r.userId === me.uid || r.createdBy === me.uid) &&
          (!filter.category || r.category === filter.category) &&
          (!filter.month || r.month === filter.month) &&
          (!filter.user || r.userId === filter.user)
      ),
    [list, scope, filter, me.uid]
  );

  async function remove(r) {
    if (!confirm('Xóa hồ sơ này? Điểm thi đua tương ứng (nếu có) sẽ bị trừ.')) return;
    await run(async () => {
      await deleteDoc(ref('records', r.id));
      setList((l) => l.filter((x) => x.id !== r.id));
      invalidate('rec:');
    }, 'Đã xóa.');
  }

  async function exportObservation(r) {
    await run(async () => {
      const { buildObservationDocx } = await import('../lib/reports.js');
      const blob = await buildObservationDocx(r, settings);
      downloadBlob(blob, `Phieu_du_gio_${safeFileName(r.details?.teacherName)}_${r.date}.docx`);
    });
  }

  const totalMine = list.filter((r) => r.userId === me.uid && r.status === 'approved').reduce((s, r) => s + (Number(r.points) || 0), 0);

  return (
    <div>
      <PageHeader
        title="Hồ sơ chuyên môn"
        subtitle={`Dự giờ, thao giảng, thành tích, nề nếp – năm học ${sy.replace('-', ' – ')}. Điểm của tôi (đã duyệt): ${fmtPoints(totalMine)}`}
        actions={
          <>
            {isManager && (
              <button className="btn-secondary" onClick={() => setBulkOpen(true)}>
                <Users size={16} /> Ghi nhận nề nếp hàng loạt
              </button>
            )}
            <button className="btn-primary" onClick={() => setEditing({})}>
              <Plus size={16} /> Khai báo mới
            </button>
          </>
        }
      />

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <select className="input" value={sy} onChange={(e) => setSy(e.target.value)}>
          {schoolYearOptions().map((y) => (
            <option key={y} value={y}>
              Năm học {y}
            </option>
          ))}
        </select>
        <select className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="mine">Hồ sơ của tôi</option>
          <option value="all">Toàn tổ</option>
        </select>
        <select className="input lg:col-span-2" value={filter.category} onChange={(e) => setFilter({ ...filter, category: e.target.value })}>
          <option value="">Mọi loại hồ sơ</option>
          <option value={BANK_CRITERION.id}>{BANK_CRITERION.name}</option>
          {settings.criteria.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="input" value={filter.month} onChange={(e) => setFilter({ ...filter, month: e.target.value })}>
          <option value="">Cả năm</option>
          {monthsOfSchoolYear(sy).map((m) => (
            <option key={m} value={m}>
              {formatMonth(m)}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <select className="input" value={filter.user} onChange={(e) => setFilter({ ...filter, user: e.target.value })} disabled={scope === 'mine'}>
            <option value="">Mọi thành viên</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <button className="btn-secondary" onClick={() => load(true)} title="Tải lại">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <PageLoader />
      ) : !shown.length ? (
        <Empty icon={NotebookPen} title="Chưa có hồ sơ">
          Bấm “Khai báo mới” để ghi nhận dự giờ, thao giảng, thành tích…
        </Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Loại / nội dung</th>
                <th>Giáo viên</th>
                <th className="text-right">Điểm</th>
                <th>Trạng thái</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const isBank = r.category === BANK_CRITERION.id;
                const canEdit = !isBank && (isManager || (r.createdBy === me.uid && r.status !== 'approved'));
                const isObs = ['du_gio', 'thao_giang'].includes(r.category);
                return (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{isBank ? formatMonth(r.month) : formatDate(r.date)}</td>
                    <td className="min-w-64">
                      <div className="text-xs font-medium text-indigo-700">{criterionName(settings, r.category)}</div>
                      <div className="font-medium">{r.title}</div>
                      <RecordDetails r={r} />
                    </td>
                    <td className="whitespace-nowrap">{r.userName}</td>
                    <td className={`text-right font-semibold ${r.points < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{fmtPoints(r.points)}</td>
                    <td>
                      <Badge className={STATUS[r.status]?.color}>{STATUS[r.status]?.name}</Badge>
                    </td>
                    <td className="whitespace-nowrap text-right">
                      {isObs && (
                        <button className="rounded-lg p-1.5 text-blue-700 hover:bg-blue-50" title="Xuất phiếu dự giờ (Word)" onClick={() => exportObservation(r)} disabled={busy}>
                          <FileDown size={16} />
                        </button>
                      )}
                      {canEdit && (
                        <>
                          <button className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Sửa" onClick={() => setEditing(r)}>
                            <Pencil size={16} />
                          </button>
                          <button className="rounded-lg p-1.5 text-red-500 hover:bg-red-50" title="Xóa" onClick={() => remove(r)} disabled={busy}>
                            <Trash2 size={16} />
                          </button>
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

      {editing && (
        <RecordForm
          record={editing}
          members={members}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load(true);
          }}
        />
      )}
      {bulkOpen && (
        <BulkDiscipline
          members={members}
          onClose={() => setBulkOpen(false)}
          onSaved={() => {
            setBulkOpen(false);
            load(true);
          }}
        />
      )}
    </div>
  );
}

function RecordForm({ record, members, onClose, onSaved }) {
  const { settings, me, isManager } = useAuth();
  const toast = useToast();
  const isNew = !record.id;
  const allowed = settings.criteria.filter((c) => isManager || !c.managerOnly);
  const [f, setF] = useState(() => ({
    category: record.category || allowed[0]?.id,
    date: record.date || todayISO(),
    title: record.title || '',
    userId: record.userId || me.uid,
    points: record.points ?? allowed[0]?.points ?? 0,
    details: { observerId: me.uid, rating: 'Tốt', ...(record.details || {}) },
  }));
  const [busy, run] = useAsync();
  const crit = settings.criteria.find((c) => c.id === f.category);
  const form = crit?.form || 'achievement';
  const set = (patch) => setF({ ...f, ...patch });
  const setD = (patch) => setF({ ...f, details: { ...f.details, ...patch } });
  const nameOf = (uid) => members.find((m) => m.id === uid)?.name || (uid === me.uid ? me.name : '');

  async function save() {
    const details = { ...f.details };
    let userId = f.userId;
    let title = f.title.trim();
    if (form === 'observation') {
      details.teacherName = nameOf(details.teacherId);
      details.observerName = nameOf(details.observerId);
      if (!details.teacherId || !details.lesson?.trim()) return toast('Vui lòng chọn người dạy và nhập tên bài.', 'error');
      userId = f.category === 'du_gio' ? details.observerId : details.teacherId;
      title = title || `${f.category === 'du_gio' ? 'Dự giờ' : 'Thao giảng'}: ${details.lesson.trim()}`;
    }
    if (!title) return toast('Vui lòng nhập nội dung/tên thành tích.', 'error');
    if (!isManager) userId = form === 'observation' ? userId : me.uid;
    if (!isManager && form === 'observation' && userId !== me.uid && details.observerId !== me.uid)
      return toast('Thầy/cô chỉ khai báo được hồ sơ có mình tham gia.', 'error');
    const data = {
      category: f.category,
      title,
      userId,
      userName: nameOf(userId),
      points: isManager ? Number(f.points) || 0 : Number(crit?.points) || 0,
      details,
      ...periodFields(f.date),
      updatedAt: serverTimestamp(),
    };
    await run(async () => {
      if (isNew) {
        await addDoc(col('records'), {
          ...data,
          status: isManager ? 'approved' : 'pending',
          createdBy: me.uid,
          createdByName: me.name,
          createdAt: serverTimestamp(),
          ...(isManager ? { reviewedBy: me.uid, reviewedByName: me.name } : {}),
        });
      } else {
        await updateDoc(ref('records', record.id), { ...data, ...(isManager ? {} : { status: 'pending', reviewNote: '' }) });
      }
      invalidate('rec:');
      onSaved();
    }, isManager ? 'Đã ghi nhận.' : 'Đã gửi, chờ Tổ trưởng/Tổ phó duyệt.');
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Khai báo hồ sơ chuyên môn' : 'Sửa hồ sơ'}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Hủy
          </button>
          <button className="btn-primary" onClick={save} disabled={busy}>
            {busy && <Spinner />} {isManager ? 'Lưu' : 'Gửi duyệt'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Loại hồ sơ" className="sm:col-span-2">
            <select
              className="input"
              value={f.category}
              onChange={(e) => {
                const c = settings.criteria.find((x) => x.id === e.target.value);
                set({ category: e.target.value, points: c?.points ?? 0 });
              }}
            >
              {allowed.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.points > 0 ? '+' : ''}
                  {fmtPoints(c.points)}đ)
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ngày">
            <input type="date" className="input" value={f.date} onChange={(e) => set({ date: e.target.value })} />
          </Field>
        </div>

        {form === 'observation' ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Người dạy">
                <select className="input" value={f.details.teacherId || ''} onChange={(e) => setD({ teacherId: e.target.value })}>
                  <option value="">— Chọn —</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Người dự giờ">
                <select className="input" value={f.details.observerId || ''} onChange={(e) => setD({ observerId: e.target.value })} disabled={!isManager}>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Tên bài dạy" className="sm:col-span-2">
                <input className="input" value={f.details.lesson || ''} onChange={(e) => setD({ lesson: e.target.value })} />
              </Field>
              <Field label="Lớp">
                <input className="input" value={f.details.className || ''} onChange={(e) => setD({ className: e.target.value })} placeholder="12A1" />
              </Field>
              <Field label="Tiết">
                <input className="input" value={f.details.period || ''} onChange={(e) => setD({ period: e.target.value })} placeholder="3" />
              </Field>
            </div>
            <Field label="Xếp loại tiết dạy">
              <div className="flex flex-wrap gap-2">
                {LESSON_RATINGS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`btn ${f.details.rating === r ? 'bg-blue-700 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}
                    onClick={() => setD({ rating: r })}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Ưu điểm">
              <textarea className="input min-h-16" value={f.details.strengths || ''} onChange={(e) => setD({ strengths: e.target.value })} />
            </Field>
            <Field label="Hạn chế">
              <textarea className="input min-h-16" value={f.details.weaknesses || ''} onChange={(e) => setD({ weaknesses: e.target.value })} />
            </Field>
            <Field label="Đề nghị, góp ý">
              <textarea className="input min-h-16" value={f.details.suggestions || ''} onChange={(e) => setD({ suggestions: e.target.value })} />
            </Field>
          </>
        ) : (
          <>
            {isManager && (
              <Field label="Tính điểm cho giáo viên">
                <select className="input" value={f.userId} onChange={(e) => set({ userId: e.target.value })}>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Nội dung / tên thành tích">
              <input className="input" value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="Ví dụ: Bồi dưỡng HSG cấp tỉnh môn Toán 12" />
            </Field>
            {form === 'achievement' && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Cấp">
                    <select className="input" value={f.details.level || ''} onChange={(e) => setD({ level: e.target.value })}>
                      <option value="">—</option>
                      {ACHIEVEMENT_LEVELS.map((l) => (
                        <option key={l}>{l}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Kết quả / giải / xếp loại">
                    <input className="input" value={f.details.result || ''} onChange={(e) => setD({ result: e.target.value })} placeholder="Giải Nhì, Loại A…" />
                  </Field>
                </div>
                <Field label="Học sinh (nếu có)">
                  <input className="input" value={f.details.students || ''} onChange={(e) => setD({ students: e.target.value })} placeholder="Nguyễn Văn A (12A1) – Giải Ba" />
                </Field>
                <Field label="Link minh chứng (Google Drive…)" hint="Tải file minh chứng lên Google Drive, chia sẻ “Bất kỳ ai có đường liên kết” rồi dán link vào đây.">
                  <input className="input" value={f.details.evidenceUrl || ''} onChange={(e) => setD({ evidenceUrl: e.target.value })} placeholder="https://drive.google.com/…" />
                </Field>
              </>
            )}
            <Field label="Ghi chú">
              <textarea className="input min-h-16" value={f.details.note || ''} onChange={(e) => setD({ note: e.target.value })} />
            </Field>
          </>
        )}
        <Field label="Điểm thi đua" hint={isManager ? 'Tổ trưởng/Tổ phó có thể điều chỉnh điểm.' : 'Điểm mặc định theo tiêu chí; người duyệt có thể điều chỉnh.'}>
          <input type="number" step="0.5" className="input w-32" value={isManager ? f.points : crit?.points ?? 0} disabled={!isManager} onChange={(e) => set({ points: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

// Tổ trưởng/Tổ phó ghi nhận nề nếp (nộp KHBD, kiểm tra hồ sơ…) cho nhiều giáo viên một lúc
function BulkDiscipline({ members, onClose, onSaved }) {
  const { settings, me } = useAuth();
  const toast = useToast();
  const crits = settings.criteria;
  const [critId, setCritId] = useState(crits.find((c) => c.form === 'discipline')?.id || crits[0].id);
  const [date, setDate] = useState(todayISO());
  const [title, setTitle] = useState('');
  const [sel, setSel] = useState(new Set());
  const [busy, run] = useAsync();
  const crit = crits.find((c) => c.id === critId);
  const [points, setPoints] = useState(crit?.points ?? 0);

  async function save() {
    if (!sel.size) return toast('Chọn ít nhất một giáo viên.', 'error');
    await run(async () => {
      const batch = writeBatch(db);
      const p = periodFields(date);
      for (const uid of sel) {
        batch.set(doc(collection(db, 'records')), {
          category: critId,
          title: title.trim() || `${crit.name} – ${formatMonth(p.month)}`,
          userId: uid,
          userName: members.find((m) => m.id === uid)?.name || '',
          points: Number(points) || 0,
          details: {},
          ...p,
          status: 'approved',
          createdBy: me.uid,
          createdByName: me.name,
          reviewedBy: me.uid,
          reviewedByName: me.name,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      invalidate('rec:');
      onSaved();
    }, `Đã ghi nhận cho ${sel.size} giáo viên.`);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Ghi nhận nề nếp hàng loạt"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Hủy
          </button>
          <button className="btn-primary" onClick={save} disabled={busy}>
            {busy && <Spinner />} Ghi nhận ({sel.size})
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Tiêu chí" className="sm:col-span-2">
            <select
              className="input"
              value={critId}
              onChange={(e) => {
                setCritId(e.target.value);
                setPoints(crits.find((c) => c.id === e.target.value)?.points ?? 0);
              }}
            >
              {crits.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Điểm mỗi người">
            <input type="number" step="0.5" className="input" value={points} onChange={(e) => setPoints(e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Ngày ghi nhận">
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Nội dung (không bắt buộc)" className="sm:col-span-2">
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ví dụ: Kiểm tra KHBD tuần 1–4 tháng 10" />
          </Field>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="label mb-0">Giáo viên</span>
            <button className="text-sm text-blue-700" onClick={() => setSel(sel.size === members.length ? new Set() : new Set(members.map((m) => m.id)))}>
              {sel.size === members.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {members.map((m) => (
              <label key={m.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${sel.has(m.id) ? 'border-blue-400 bg-blue-50' : 'border-slate-200'}`}>
                <input
                  type="checkbox"
                  checked={sel.has(m.id)}
                  onChange={() => {
                    const n = new Set(sel);
                    n.has(m.id) ? n.delete(m.id) : n.add(m.id);
                    setSel(n);
                  }}
                />
                {m.name}
              </label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
