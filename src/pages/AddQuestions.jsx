import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { addDoc, getDoc, serverTimestamp, updateDoc, writeBatch, doc, collection } from 'firebase/firestore';
import { Save, ListPlus, PenLine, FileUp, AlertTriangle } from 'lucide-react';
import { db } from '../firebase.js';
import { useAuth } from '../context/AuthContext.jsx';
import { col, ref, invalidate } from '../lib/db.js';
import { parseQuestions, IMPORT_SAMPLE } from '../lib/parser.js';
import { LEVELS } from '../lib/constants.js';
import QuestionEditor, { emptyQuestion, validateQuestion, cleanQuestion } from '../components/QuestionEditor.jsx';
import QuestionView, { QuestionMeta } from '../components/QuestionView.jsx';
import { PageHeader, PageLoader, Field, Spinner, useAsync, useToast } from '../components/ui.jsx';

export default function AddQuestions() {
  const { id } = useParams();
  const [tab, setTab] = useState('single');
  return (
    <div>
      <PageHeader
        title={id ? 'Sửa câu hỏi' : 'Đóng góp câu hỏi'}
        subtitle="Câu hỏi gửi lên sẽ chờ Tổ trưởng/Tổ phó duyệt. Khi được duyệt, điểm thi đua được cộng tự động."
      />
      {!id && (
        <div className="mb-5 inline-flex rounded-lg border border-slate-200 bg-white p-1">
          {[
            ['single', 'Soạn từng câu', PenLine],
            ['bulk', 'Nhập nhanh nhiều câu', ListPlus],
          ].map(([k, label, Icon]) => (
            <button key={k} className={`btn ${tab === k ? 'bg-blue-700 text-white' : 'text-slate-600'}`} onClick={() => setTab(k)}>
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>
      )}
      {id ? <SingleForm id={id} /> : tab === 'single' ? <SingleForm /> : <BulkImport />}
    </div>
  );
}

function SingleForm({ id }) {
  const { settings, me, isManager } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState(() => emptyQuestion({ grade: settings.grades[settings.grades.length - 1] }));
  const [orig, setOrig] = useState(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [err, setErr] = useState('');
  const [busy, run] = useAsync();

  useEffect(() => {
    if (!id) return;
    getDoc(ref('questions', id)).then((s) => {
      if (s.exists()) {
        const d = { id: s.id, ...s.data() };
        setOrig(d);
        setQ({
          ...emptyQuestion(d),
          ...d,
          options: d.options?.length === 4 ? d.options : ['', '', '', ''],
          statements: d.statements?.length === 4 ? d.statements : ['', '', '', ''],
        });
      }
      setLoading(false);
    });
  }, [id]);

  async function save() {
    const v = validateQuestion(q);
    setErr(v);
    if (v) return;
    const data = cleanQuestion(q);
    await run(async () => {
      if (id) {
        const patch = { ...data, updatedAt: serverTimestamp() };
        // Giáo viên sửa câu của mình → gửi duyệt lại
        if (!isManager) Object.assign(patch, { status: 'pending', reviewNote: '' });
        await updateDoc(ref('questions', id), patch);
        invalidate('q:');
        nav(-1);
      } else {
        await addDoc(col('questions'), {
          ...data,
          authorId: me.uid,
          authorName: me.name,
          status: 'pending',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        invalidate('q:');
        setQ({ ...emptyQuestion(q), grade: q.grade, topic: q.topic, level: q.level, type: q.type, answer: emptyQuestion(q).answer });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, id ? 'Đã lưu thay đổi.' : 'Đã gửi câu hỏi, chờ duyệt. Bạn có thể nhập tiếp câu khác.');
  }

  if (loading) return <PageLoader />;
  if (id && !orig) return <p className="text-slate-500">Không tìm thấy câu hỏi.</p>;
  return (
    <div className="space-y-4">
      {orig?.status === 'rejected' && orig.reviewNote && (
        <div className="flex gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle size={18} className="shrink-0" /> <span>Góp ý của người duyệt: {orig.reviewNote}</span>
        </div>
      )}
      <QuestionEditor value={q} onChange={setQ} settings={settings} />
      {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      <div className="flex justify-end gap-2">
        {id && (
          <button className="btn-secondary" onClick={() => nav(-1)}>
            Hủy
          </button>
        )}
        <button className="btn-primary" onClick={save} disabled={busy}>
          {busy ? <Spinner /> : <Save size={16} />} {id ? 'Lưu thay đổi' : 'Gửi câu hỏi'}
        </button>
      </div>
    </div>
  );
}

function BulkImport() {
  const { settings, me } = useAuth();
  const toast = useToast();
  const [text, setText] = useState('');
  const [grade, setGrade] = useState(settings.grades[settings.grades.length - 1]);
  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState('NB');
  const [busy, run] = useAsync();
  const parsed = useMemo(() => (text.trim() ? parseQuestions(text) : []), [text]);
  const valid = parsed.filter((q) => !q.errors.length);

  async function loadFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setText(await f.text());
  }

  async function submit() {
    if (!topic.trim()) return toast('Vui lòng chọn chuyên đề cho các câu hỏi.', 'error');
    if (!valid.length) return toast('Chưa có câu hợp lệ để gửi.', 'error');
    await run(async () => {
      for (let i = 0; i < valid.length; i += 400) {
        const batch = writeBatch(db);
        for (const p of valid.slice(i, i + 400)) {
          const data = cleanQuestion({
            ...emptyQuestion(),
            ...p,
            grade,
            topic,
            level: p.level || level,
            options: p.options || ['', '', '', ''],
            statements: p.statements || ['', '', '', ''],
          });
          batch.set(doc(collection(db, 'questions')), {
            ...data,
            authorId: me.uid,
            authorName: me.name,
            status: 'pending',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
      }
      invalidate('q:');
      setText('');
    }, `Đã gửi ${valid.length} câu hỏi, chờ duyệt.`);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Khối lớp">
            <select className="input" value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
              {settings.grades.map((g) => (
                <option key={g} value={g}>
                  Lớp {g}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mức độ mặc định">
            <select className="input" value={level} onChange={(e) => setLevel(e.target.value)}>
              {LEVELS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Chuyên đề" className="col-span-2">
            <input className="input" list="bulk-topics" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Chọn hoặc gõ" />
            <datalist id="bulk-topics">
              {(settings.topics[grade] || []).map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="label mb-0">Dán nội dung (định dạng như mẫu)</span>
            <div className="flex gap-2">
              <button className="text-xs text-blue-700 hover:underline" onClick={() => setText(IMPORT_SAMPLE)}>
                Xem mẫu
              </button>
              <label className="cursor-pointer text-xs text-blue-700 hover:underline">
                <FileUp size={12} className="inline" /> Mở file .txt / .tex
                <input type="file" accept=".txt,.tex,.md" className="hidden" onChange={loadFile} />
              </label>
            </div>
          </div>
          <textarea className="input min-h-[420px] font-mono text-[13px]" value={text} onChange={(e) => setText(e.target.value)} placeholder={IMPORT_SAMPLE} />
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-slate-500">
            <li>Mỗi câu bắt đầu bằng “Câu 1:”, “Câu 2.”…; trắc nghiệm có A. B. C. D. (được phép cùng dòng).</li>
            <li>Đúng/Sai: 4 dòng a) b) c) d) và “Đáp án: Đ S Đ S”. Trả lời ngắn: chỉ cần “Đáp án: …”. Không có đáp án → Tự luận.</li>
            <li>Từ file Word: lưu công thức dạng LaTeX (MathType → Toggle TeX) rồi sao chép vào đây.</li>
          </ul>
        </div>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-600">
            Nhận diện <b>{parsed.length}</b> câu, hợp lệ <b className="text-emerald-700">{valid.length}</b>
          </div>
          <button className="btn-primary" onClick={submit} disabled={busy || !valid.length}>
            {busy ? <Spinner /> : <Save size={16} />} Gửi {valid.length} câu
          </button>
        </div>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          {parsed.map((p) => (
            <div key={p.index} className={`card p-3 ${p.errors.length ? 'border-red-300' : ''}`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <b className="text-sm">Câu {p.index}</b>
                <QuestionMeta q={{ ...p, grade, topic, level: p.level || level }} showStatus={false} />
              </div>
              <QuestionView q={p} showSolution />
              {p.errors.map((e) => (
                <div key={e} className="mt-2 text-xs text-red-600">
                  ⚠ {e}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
