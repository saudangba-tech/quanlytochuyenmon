import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getDocs, query, where, documentId, limit as qLimit } from 'firebase/firestore';
import { Search, Library, Pencil, Trash2, Eye, EyeOff, RefreshCw, Plus, FolderOpen, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { fetchWhere, cached, invalidate, deleteQuestion, col } from '../lib/db.js';
import { useSources } from '../lib/hooks.js';
import { shortId } from '../lib/questionId.js';
import { LEVELS, TYPES, STATUS } from '../lib/constants.js';
import QuestionView, { QuestionMeta } from '../components/QuestionView.jsx';
import { PageHeader, PageLoader, Empty, useAsync } from '../components/ui.jsx';
import { formatTimestamp } from '../lib/utils.js';

const PAGE = 20;
const LIMIT = 300;

export default function QuestionBank() {
  const { settings, me, isManager } = useAuth();
  const [params, setParams] = useSearchParams();
  const { sources } = useSources();
  const [f, setF] = useState(() => {
    const src = params.get('nguon') || '';
    return { grade: src ? '' : settings.grades[settings.grades.length - 1], topic: '', level: '', type: '', status: src ? '' : 'approved', mine: false, source: src, text: '' };
  });
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAns, setShowAns] = useState(true);
  const [page, setPage] = useState(1);
  const [busy, run] = useAsync();
  const wide = f.mine || f.source; // chế độ tải theo người/nguồn: lọc khối, trạng thái trên máy

  // Chỉ lọc bằng phép so sánh "==" để không cần tạo chỉ mục (index) phức hợp trên Firestore
  // Khi chưa chọn chuyên đề chỉ tải tối đa LIMIT câu để tiết kiệm hạn mức đọc miễn phí
  async function load(force = false) {
    const key = f.mine
      ? `q:mine:${me.uid}`
      : f.source
        ? `q:src:${f.source}`
        : f.topic
          ? `q:grade:${f.grade}:${f.status}:${f.topic}`
          : `q:grade:${f.grade}:${f.status}:*`;
    if (force) invalidate(key);
    setLoading(true);
    await run(async () => {
      const filters = f.mine
        ? [['authorId', '==', me.uid]]
        : f.source
          ? [['sourceId', '==', f.source]]
          : [['grade', '==', Number(f.grade)], ['status', '==', f.status || 'approved'], ['topic', '==', f.topic]];
      const data = await cached(key, () => fetchWhere('questions', filters, wide || f.topic ? undefined : LIMIT));
      data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setList(data);
    });
    setLoading(false);
  }
  const loadKey = f.byId ? 'byId' : wide ? `w:${f.mine}:${f.source}` : `n:${f.grade}:${f.status}:${f.topic}`;
  useEffect(() => {
    if (f.byId) return;
    load();
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey]);

  // Tìm theo mã câu (#xxxxxxxx) trên toàn bộ ngân hàng
  async function findById() {
    const prefix = f.text.trim().replace(/^#/, '');
    await run(async () => {
      const snap = await getDocs(query(col('questions'), where(documentId(), '>=', prefix), where(documentId(), '<', prefix + ''), qLimit(5)));
      const found = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (!found.length) throw new Error(`Không có câu nào mang mã #${prefix}.`);
      setF({ ...f, byId: true, mine: false, source: '', grade: '', status: '', topic: '', text: '' });
      setList(found);
    });
  }

  const shown = useMemo(() => {
    const t = f.text.trim().toLowerCase().replace(/^#/, '');
    return list.filter(
      (q) =>
        (!f.grade || q.grade === Number(f.grade)) &&
        (!f.status || q.status === f.status) &&
        (!f.topic || q.topic === f.topic) &&
        (!f.level || q.level === f.level) &&
        (!f.type || q.type === f.type) &&
        (!t || `${q.id} ${q.idCode || ''} ${q.sourceName || ''} ${q.content} ${(q.options || []).join(' ')} ${q.authorName}`.toLowerCase().includes(t))
    );
  }, [list, f]);

  const counts = useMemo(() => {
    const c = {};
    for (const l of LEVELS) c[l.id] = shown.filter((q) => q.level === l.id).length;
    return c;
  }, [shown]);

  async function remove(q) {
    if (!confirm('Xóa câu hỏi này? Nếu câu đã được duyệt, điểm thi đua tương ứng sẽ bị trừ.')) return;
    await run(async () => {
      await deleteQuestion(q);
      setList((l) => l.filter((x) => x.id !== q.id));
      invalidate('q:');
    }, 'Đã xóa câu hỏi.');
  }

  const set = (k) => (e) => setF({ ...f, byId: k === 'text' ? f.byId : false, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const topics = settings.topics[f.grade] || [];
  const pageItems = shown.slice(0, page * PAGE);

  return (
    <div>
      <PageHeader
        title="Ngân hàng câu hỏi"
        subtitle={`${settings.subject} – kho câu hỏi chung của tổ`}
        actions={
          <>
            <button className="btn-secondary" onClick={() => setShowAns(!showAns)}>
              {showAns ? <EyeOff size={16} /> : <Eye size={16} />} {showAns ? 'Ẩn đáp án' : 'Hiện đáp án'}
            </button>
            <button className="btn-secondary" onClick={() => load(true)} title="Tải lại">
              <RefreshCw size={16} />
            </button>
            <Link to="/them-cau-hoi" className="btn-primary">
              <Plus size={16} /> Đóng góp câu hỏi
            </Link>
          </>
        }
      />

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <select className="input lg:col-span-2" value={f.source} onChange={(e) => {
          const v = e.target.value;
          setParams(v ? { nguon: v } : {}, { replace: true });
          setF({ ...f, byId: false, source: v, mine: false, grade: v ? '' : settings.grades[settings.grades.length - 1], status: v ? '' : 'approved', topic: '' });
        }}>
          <option value="">Mọi nguồn đề</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select className="input" value={f.grade} onChange={(e) => setF({ ...f, byId: false, grade: e.target.value, topic: '' })}>
          {wide && <option value="">Tất cả khối</option>}
          {settings.grades.map((g) => (
            <option key={g} value={g}>
              Lớp {g}
            </option>
          ))}
        </select>
        <select className="input lg:col-span-2" value={f.topic} onChange={set('topic')}>
          <option value="">Tất cả chuyên đề</option>
          {[...new Set([...topics, ...list.filter((q) => q.grade === Number(f.grade)).map((q) => q.topic)])].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select className="input" value={f.level} onChange={set('level')}>
          <option value="">Mọi mức độ</option>
          {LEVELS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select className="input" value={f.type} onChange={set('type')}>
          <option value="">Mọi dạng</option>
          {TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.short}
            </option>
          ))}
        </select>
        <select className="input" value={f.status} onChange={set('status')}>
          {wide && <option value="">Mọi trạng thái</option>}
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.name}
            </option>
          ))}
        </select>
        <div className="relative sm:col-span-2 lg:col-span-4">
          <Search size={16} className="absolute top-2.5 left-3 text-slate-400" />
          <input className="input pl-9" placeholder="Tìm theo nội dung, mã câu #…, mã ID 2D1-…, nguồn, người đóng góp…" value={f.text} onChange={set('text')} />
        </div>
        <label className="flex items-center gap-2 text-sm lg:col-span-2">
          <input
            type="checkbox"
            checked={f.mine}
            onChange={(e) => setF({ ...f, byId: false, mine: e.target.checked, source: '', grade: e.target.checked ? '' : settings.grades[settings.grades.length - 1], status: e.target.checked ? '' : 'approved' })}
          />
          Chỉ câu hỏi của tôi (mọi trạng thái)
        </label>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <span>
          Tìm thấy <b>{shown.length}</b> câu:
        </span>
        {LEVELS.map((l) => (
          <span key={l.id} className={`rounded-full px-2 py-0.5 text-xs ${l.color}`}>
            {l.id}: {counts[l.id]}
          </span>
        ))}
        {f.source && (
          <button className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-800" onClick={() => {
            setParams({}, { replace: true });
            setF({ ...f, byId: false, source: '', grade: settings.grades[settings.grades.length - 1], status: 'approved' });
          }}>
            Nguồn: {sources.find((s) => s.id === f.source)?.name || f.source} <X size={12} />
          </button>
        )}
        {!wide && !f.topic && list.length >= LIMIT && (
          <span className="text-xs text-amber-700">Đang hiển thị {LIMIT} câu đầu tiên – hãy chọn chuyên đề để xem đầy đủ.</span>
        )}
      </div>

      {loading ? (
        <PageLoader />
      ) : !shown.length ? (
        <Empty icon={Library} title="Chưa có câu hỏi phù hợp">
          {/^#?[A-Za-z0-9]{6,20}$/.test(f.text.trim()) ? (
            <button className="btn-secondary mt-2" onClick={findById} disabled={busy}>
              <Search size={16} /> Tìm mã câu #{f.text.trim().replace(/^#/, '')} trong toàn bộ ngân hàng
            </button>
          ) : (
            <>
              Thử đổi bộ lọc hoặc <Link to="/them-cau-hoi" className="text-blue-700 underline">đóng góp câu hỏi mới</Link>.
            </>
          )}
        </Empty>
      ) : (
        <div className="space-y-3">
          {pageItems.map((q, i) => {
            const canEdit = isManager || (q.authorId === me.uid && q.status !== 'approved');
            const canDelete = isManager || (q.authorId === me.uid && q.status !== 'approved');
            return (
              <div key={q.id} className="card p-4">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-400">#{i + 1}</span>
                    <QuestionMeta q={q} />
                  </div>
                  <div className="flex items-center gap-1">
                    {canEdit && (
                      <Link to={`/sua-cau-hoi/${q.id}`} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Sửa">
                        <Pencil size={16} />
                      </Link>
                    )}
                    {canDelete && (
                      <button className="rounded-lg p-1.5 text-red-500 hover:bg-red-50" title="Xóa" onClick={() => remove(q)} disabled={busy}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
                <QuestionView q={q} showAnswer={showAns} showSolution={showAns} />
                {q.status === 'rejected' && q.reviewNote && <div className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">Góp ý: {q.reviewNote}</div>}
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                  <button
                    className="rounded bg-slate-100 px-1.5 font-mono text-slate-600 hover:bg-slate-200"
                    title="Mã câu – bấm để sao chép"
                    onClick={() => navigator.clipboard?.writeText(shortId(q.id))}
                  >
                    #{shortId(q.id)}
                  </button>
                  {q.sourceName && (
                    <button className="inline-flex items-center gap-1 text-blue-700 hover:underline" onClick={() => q.sourceId && setF({ ...f, byId: false, source: q.sourceId, mine: false, grade: '', status: '', topic: '' })}>
                      <FolderOpen size={12} /> {q.sourceName}
                    </button>
                  )}
                  <span>
                    Đóng góp: {q.authorName} • {formatTimestamp(q.createdAt)}
                    {q.reviewedByName && ` • Duyệt: ${q.reviewedByName}`}
                  </span>
                  {q.usedCount > 0 && <span className="rounded bg-violet-50 px-1.5 text-violet-700">Đã dùng trong {q.usedCount} đề</span>}
                </div>
              </div>
            );
          })}
          {pageItems.length < shown.length && (
            <div className="text-center">
              <button className="btn-secondary" onClick={() => setPage(page + 1)}>
                Xem thêm ({shown.length - pageItems.length} câu)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
