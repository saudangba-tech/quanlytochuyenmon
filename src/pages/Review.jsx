import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { serverTimestamp, updateDoc } from 'firebase/firestore';
import { Check, X, Pencil, ClipboardCheck, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { fetchWhere, reviewQuestions, invalidate, ref } from '../lib/db.js';
import QuestionView, { QuestionMeta } from '../components/QuestionView.jsx';
import { PageHeader, PageLoader, Empty, Modal, Field, Badge, useAsync } from '../components/ui.jsx';
import { formatDate, formatTimestamp, fmtPoints } from '../lib/utils.js';
import { RecordDetails, criterionName } from './Records.jsx';

export default function Review() {
  const [tab, setTab] = useState('questions');
  return (
    <div>
      <PageHeader title="Duyệt & phê duyệt" subtitle="Câu hỏi và hồ sơ được duyệt sẽ tự động cộng điểm thi đua cho người đóng góp." />
      <div className="mb-5 inline-flex rounded-lg border border-slate-200 bg-white p-1">
        {[
          ['questions', 'Câu hỏi chờ duyệt'],
          ['records', 'Hồ sơ, thành tích chờ duyệt'],
        ].map(([k, label]) => (
          <button key={k} className={`btn ${tab === k ? 'bg-blue-700 text-white' : 'text-slate-600'}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'questions' ? <PendingQuestions /> : <PendingRecords />}
    </div>
  );
}

function RejectModal({ open, onClose, onConfirm, busy }) {
  const [note, setNote] = useState('');
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Yêu cầu chỉnh sửa"
      size="max-w-lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Hủy
          </button>
          <button className="btn-danger" disabled={busy} onClick={() => onConfirm(note)}>
            Gửi yêu cầu sửa
          </button>
        </>
      }
    >
      <Field label="Góp ý cho người gửi" hint="Người gửi sẽ thấy góp ý này và sửa lại để gửi duyệt lần nữa.">
        <textarea className="input min-h-24" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ví dụ: Phương án C trùng với phương án A, cần sửa lại." />
      </Field>
    </Modal>
  );
}

function PendingQuestions() {
  const { me, settings } = useAuth();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(new Set());
  const [rejecting, setRejecting] = useState(null); // mảng câu hỏi
  const [busy, run] = useAsync();

  async function load() {
    setLoading(true);
    await run(async () => {
      const data = await fetchWhere('questions', [['status', '==', 'pending']]);
      data.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      setList(data);
      setSel(new Set());
    });
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function decide(qs, decision, note = '') {
    await run(async () => {
      await reviewQuestions(qs, decision, me, settings, note);
      const ids = new Set(qs.map((q) => q.id));
      setList((l) => l.filter((q) => !ids.has(q.id)));
      setSel(new Set());
      setRejecting(null);
      invalidate('q:');
      invalidate('rec:');
    }, decision === 'approved' ? `Đã duyệt ${qs.length} câu hỏi.` : 'Đã gửi yêu cầu sửa.');
  }

  const toggle = (id) => setSel((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const selected = list.filter((q) => sel.has(q.id));

  if (loading) return <PageLoader />;
  if (!list.length) return <Empty icon={ClipboardCheck} title="Không có câu hỏi nào đang chờ duyệt" />;
  return (
    <div>
      <div className="sticky top-14 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/95 p-3 backdrop-blur lg:top-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={sel.size === list.length} onChange={(e) => setSel(e.target.checked ? new Set(list.map((q) => q.id)) : new Set())} />
          Chọn tất cả ({list.length})
        </label>
        <div className="flex-1" />
        <button className="btn-secondary" onClick={load} title="Tải lại">
          <RefreshCw size={16} />
        </button>
        <button className="btn-danger" disabled={!sel.size || busy} onClick={() => setRejecting(selected)}>
          <X size={16} /> Yêu cầu sửa ({sel.size})
        </button>
        <button className="btn-success" disabled={!sel.size || busy} onClick={() => decide(selected, 'approved')}>
          <Check size={16} /> Duyệt ({sel.size})
        </button>
      </div>
      <div className="space-y-3">
        {list.map((q) => (
          <div key={q.id} className={`card p-4 ${sel.has(q.id) ? 'ring-2 ring-blue-300' : ''}`}>
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={sel.has(q.id)} onChange={() => toggle(q.id)} />
                <QuestionMeta q={q} showStatus={false} />
              </label>
              <div className="flex gap-1">
                <Link to={`/sua-cau-hoi/${q.id}`} className="btn-secondary px-2 py-1" title="Sửa trước khi duyệt">
                  <Pencil size={15} />
                </Link>
                <button className="btn-secondary px-2 py-1 text-red-600" onClick={() => setRejecting([q])} disabled={busy}>
                  <X size={15} /> Sửa lại
                </button>
                <button className="btn-success px-2 py-1" onClick={() => decide([q], 'approved')} disabled={busy}>
                  <Check size={15} /> Duyệt (+{fmtPoints(settings.questionPoints[q.level])}đ)
                </button>
              </div>
            </div>
            <QuestionView q={q} showSolution />
            <div className="mt-2 text-xs text-slate-400">
              {q.authorName} • {formatTimestamp(q.createdAt)}
            </div>
          </div>
        ))}
      </div>
      <RejectModal key={rejecting ? rejecting.map((q) => q.id).join() : 'none'} open={Boolean(rejecting)} onClose={() => setRejecting(null)} busy={busy} onConfirm={(note) => decide(rejecting, 'rejected', note)} />
    </div>
  );
}

function PendingRecords() {
  const { me, settings } = useAuth();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState({});
  const [rejecting, setRejecting] = useState(null);
  const [busy, run] = useAsync();

  useEffect(() => {
    run(() =>
      fetchWhere('records', [['status', '==', 'pending']]).then((data) => {
        data.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        setList(data);
      })
    ).finally(() => setLoading(false));
  }, [run]);

  async function decide(r, status, note = '') {
    await run(async () => {
      const patch = { status, reviewedBy: me.uid, reviewedByName: me.name, reviewedAt: serverTimestamp(), reviewNote: note };
      if (status === 'approved') patch.points = Number(points[r.id] ?? r.points) || 0;
      await updateDoc(ref('records', r.id), patch);
      setList((l) => l.filter((x) => x.id !== r.id));
      setRejecting(null);
      invalidate('rec:');
    }, status === 'approved' ? 'Đã duyệt và cộng điểm.' : 'Đã gửi yêu cầu bổ sung.');
  }

  if (loading) return <PageLoader />;
  if (!list.length) return <Empty icon={ClipboardCheck} title="Không có hồ sơ nào đang chờ duyệt" />;
  return (
    <div className="space-y-3">
      {list.map((r) => (
        <div key={r.id} className="card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-indigo-50 text-indigo-700">{criterionName(settings, r.category)}</Badge>
                <span className="text-sm text-slate-500">{formatDate(r.date)}</span>
              </div>
              <div className="mt-1 font-semibold">{r.title}</div>
              <div className="text-sm text-slate-600">
                Tính điểm cho: <b>{r.userName}</b> • Người khai: {r.createdByName}
              </div>
              <RecordDetails r={r} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1 text-sm">
                Điểm
                <input type="number" step="0.5" className="input w-20" value={points[r.id] ?? r.points} onChange={(e) => setPoints({ ...points, [r.id]: e.target.value })} />
              </label>
              <button className="btn-secondary text-red-600" onClick={() => setRejecting(r)} disabled={busy}>
                <X size={15} /> Bổ sung
              </button>
              <button className="btn-success" onClick={() => decide(r, 'approved')} disabled={busy}>
                <Check size={15} /> Duyệt
              </button>
            </div>
          </div>
        </div>
      ))}
      <RejectModal key={rejecting?.id || 'none'} open={Boolean(rejecting)} onClose={() => setRejecting(null)} busy={busy} onConfirm={(note) => decide(rejecting, 'rejected', note)} />
    </div>
  );
}
