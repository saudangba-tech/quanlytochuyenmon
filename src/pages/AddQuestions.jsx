import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { addDoc, getDoc, serverTimestamp, updateDoc, writeBatch, doc, collection } from 'firebase/firestore';
import { Save, ListPlus, PenLine, FileUp, AlertTriangle } from 'lucide-react';
import { db } from '../firebase.js';
import { useAuth } from '../context/AuthContext.jsx';
import { col, ref, invalidate, findDuplicates, ensureSource, createSource } from '../lib/db.js';
import { useSources } from '../lib/hooks.js';
import { questionHash, shortId } from '../lib/questionId.js';
import { parseQuestions, attachImages, IMPORT_SAMPLE } from '../lib/parser.js';
import { compressImage } from '../lib/image.js';
import { LEVELS, SOURCE_TYPES } from '../lib/constants.js';
import { currentSchoolYear } from '../lib/utils.js';
import QuestionEditor, { emptyQuestion, validateQuestion, cleanQuestion } from '../components/QuestionEditor.jsx';
import QuestionView, { QuestionMeta } from '../components/QuestionView.jsx';
import { PageHeader, PageLoader, Field, Spinner, useAsync, useToast } from '../components/ui.jsx';

export default function AddQuestions() {
  const { id } = useParams();
  const [tab, setTab] = useState('bulk');
  return (
    <div>
      <PageHeader
        title={id ? 'Sửa câu hỏi' : 'Đóng góp câu hỏi'}
        subtitle="Câu hỏi gửi lên sẽ chờ Tổ trưởng/Tổ phó duyệt. Khi được duyệt, điểm thi đua được cộng tự động."
      />
      {!id && (
        <div className="mb-5 inline-flex rounded-lg border border-slate-200 bg-white p-1">
          {[
            ['bulk', 'Tải file Word / PDF, dán nhiều câu', ListPlus],
            ['single', 'Soạn từng câu', PenLine],
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
  const { sources, reload: reloadSources } = useSources();

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
      // Kiểm tra câu trùng với ngân hàng
      const dup = (await findDuplicates([data.hash]))[data.hash]?.filter((d) => d.id !== id);
      if (dup?.length && !confirm(`Câu này trùng nội dung với câu #${shortId(dup[0].id)} (lớp ${dup[0].grade}, ${dup[0].authorName}) đã có trong ngân hàng. Vẫn lưu?`)) return;
      if (data.sourceName && !data.sourceId) {
        const src = await ensureSource(data.sourceName, sources, me);
        data.sourceId = src.id;
        data.sourceName = src.name;
        reloadSources();
      }
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
        setQ({ ...emptyQuestion({ ...q, sourceId: data.sourceId, sourceName: data.sourceName }), grade: q.grade, topic: q.topic, level: q.level });
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
      <QuestionEditor value={q} onChange={setQ} settings={settings} sources={sources} />
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
  const [images, setImages] = useState({}); // hình đọc từ file Word: n → {data,w,h} | null
  const [fileInfo, setFileInfo] = useState(null); // { name, notes: [] }
  const [reading, setReading] = useState('');
  const [levels, setLevels] = useState({}); // chỉnh mức độ từng câu
  const [skipped, setSkipped] = useState(new Set());
  const [src, setSrc] = useState({ name: '', type: 'Đề thi thử', year: currentSchoolYear(settings), note: '' });
  const [dups, setDups] = useState({}); // index → mô tả trùng
  const [busy, run] = useAsync();
  const parsed = useMemo(() => {
    if (!text.trim()) return [];
    return attachImages(parseQuestions(text), images).map((p) => ({ ...p, hash: questionHash(p) }));
  }, [text, images]);
  const levelOf = (p) => levels[p.index] || p.level || level;
  const gradeOf = (p) => (p.grade && settings.grades.includes(p.grade) ? p.grade : grade);
  const topicOf = (p) => settings.topicCodes?.[p.chapterCode] || topic;
  const valid = parsed.filter((q) => !q.errors.length && !skipped.has(q.index));

  // Phát hiện câu trùng: trùng trong cùng file và trùng với ngân hàng (tự đánh dấu "bỏ qua")
  useEffect(() => {
    if (!parsed.length) {
      setDups({});
      return;
    }
    const t = setTimeout(async () => {
      const result = {};
      const seen = {};
      for (const p of parsed) {
        if (seen[p.hash]) result[p.index] = `Trùng với câu ${seen[p.hash]} trong file này`;
        else seen[p.hash] = p.index;
      }
      try {
        const found = await findDuplicates(parsed.map((p) => p.hash));
        for (const p of parsed) {
          const f = found[p.hash];
          if (f && !result[p.index]) result[p.index] = `Đã có trong ngân hàng: câu #${shortId(f[0].id)} (lớp ${f[0].grade}, ${f[0].authorName || ''})`;
        }
      } catch (e) {
        console.warn('Không kiểm tra được câu trùng', e);
      }
      setDups(result);
      setSkipped((s) => new Set([...s, ...Object.keys(result).map(Number)]));
    }, 800);
    return () => clearTimeout(t);
  }, [parsed]);

  async function loadFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    setLevels({});
    setSkipped(new Set());
    setSrc((s) => ({ ...s, name: f.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() }));
    try {
      if (ext === 'doc') throw new Error('File .doc (Word 97-2003) chưa đọc được. Hãy mở bằng Word → File → Save As → chọn "Word Document (*.docx)" rồi tải lại.');
      if (ext === 'docx') {
        setReading('Đang đọc file Word và giải mã công thức…');
        const { readDocx } = await import('../lib/import/docxImport.js');
        const r = await readDocx(f);
        setReading('Đang nén hình…');
        const imgs = {};
        for (const [n, im] of Object.entries(r.images)) {
          if (!im) imgs[n] = null;
          else {
            const type = `image/${im.ext === 'jpg' ? 'jpeg' : im.ext}`;
            imgs[n] = await compressImage(new File([im.blob], `hinh.${im.ext}`, { type })).catch(() => null);
          }
        }
        const s = r.stats;
        const notes = [];
        if (s.mathtype) notes.push(`Đã chuyển ${s.mathtype - s.mathtypeFailed}/${s.mathtype} công thức MathType sang LaTeX.`);
        if (s.omml) notes.push(`Đã chuyển ${s.omml} công thức Equation sang LaTeX.`);
        if (s.mathtypeFailed) notes.push(`${s.mathtypeFailed} công thức MathType không đọc được (hiện “[MathType lỗi]”), cần gõ lại.`);
        if (s.badImages) notes.push(`${s.badImages} hình dạng WMF/EMF (hình vẽ cũ) không hiển thị được trên web, cần thêm lại hình.`);
        setImages(imgs);
        setText(r.text);
        setFileInfo({ name: f.name, notes });
      } else if (ext === 'pdf') {
        setReading('Đang đọc file PDF…');
        const { readPdf } = await import('../lib/import/pdfImport.js');
        const r = await readPdf(f);
        setImages({});
        setText(r.text);
        setFileInfo({
          name: f.name,
          warn: true,
          notes: r.scanned
            ? ['PDF này là ảnh chụp/scan, không có chữ để đọc. Hãy dùng file Word gốc.']
            : [
                `Đã đọc ${r.pages} trang. PDF không lưu cấu trúc công thức: phân số, căn, tích phân và ký hiệu của MathType (∀, ∃, ℝ, ≥…) có thể bị mất – hãy kiểm tra và sửa từng câu bên dưới.`,
                'Hình vẽ trong PDF không được nhập. Nếu có file Word gốc, nên dùng file Word để giữ nguyên công thức và hình.',
              ],
        });
      } else {
        setImages({});
        setText(await f.text());
        setFileInfo(null);
      }
    } catch (err) {
      toast(err.message || 'Không đọc được file.', 'error');
      console.error(err);
    } finally {
      setReading('');
    }
  }

  async function submit() {
    if (!valid.length) return toast('Chưa có câu hợp lệ để gửi.', 'error');
    if (valid.some((p) => !topicOf(p).trim())) return toast('Vui lòng chọn chuyên đề cho các câu hỏi.', 'error');
    await run(async () => {
      // Mỗi file nhập = một nguồn đề, các câu gắn mã nguồn để tra cứu, thống kê, xóa cả lô khi cần
      const source = src.name.trim() ? await createSource(src, me) : { id: '', name: '' };
      // Mỗi lần ghi (batch) giới hạn ~10 MB và 500 thao tác → chia nhỏ theo dung lượng (câu có hình nặng hơn)
      let batch = writeBatch(db);
      let ops = 0;
      let bytes = 0;
      for (const p of valid) {
        const data = cleanQuestion({
          ...emptyQuestion(),
          ...p,
          grade: gradeOf(p),
          topic: topicOf(p),
          sourceId: source.id,
          sourceName: source.name,
          level: levelOf(p),
          image: p.image || null,
          options: p.options || ['', '', '', ''],
          statements: p.statements || ['', '', '', ''],
        });
        const size = JSON.stringify(data).length;
        if (ops && (ops >= 400 || bytes + size > 3_500_000)) {
          await batch.commit();
          batch = writeBatch(db);
          ops = 0;
          bytes = 0;
        }
        batch.set(doc(collection(db, 'questions')), {
          ...data,
          authorId: me.uid,
          authorName: me.name,
          status: 'pending',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        ops++;
        bytes += size;
      }
      if (ops) await batch.commit();
      invalidate('q:');
      setText('');
      setImages({});
      setFileInfo(null);
      setSrc((s) => ({ ...s, name: '', note: '' }));
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
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 text-sm font-semibold text-slate-700">Nguồn đề (lưu kèm từng câu để tra cứu, thống kê)</div>
          <div className="grid gap-2 sm:grid-cols-4">
            <input className="input sm:col-span-2" value={src.name} onChange={(e) => setSrc({ ...src, name: e.target.value })} placeholder="Tên nguồn, ví dụ: Đề thi thử TN 2025 – Sở Hà Nội" />
            <select className="input" value={src.type} onChange={(e) => setSrc({ ...src, type: e.target.value })}>
              {SOURCE_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <input className="input" value={src.year} onChange={(e) => setSrc({ ...src, year: e.target.value })} placeholder="Năm học / năm" />
          </div>
          <p className="mt-1 text-xs text-slate-500">Câu có mã ID (vd. [2D1-1.2-3]) sẽ tự lấy khối, mức độ và chuyên đề theo mã (nếu Cài đặt đã gán mã chuyên đề).</p>
        </div>
        <label
          className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/60 px-4 py-5 text-center hover:bg-blue-50"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) loadFile({ target: { files: [f], value: '' } });
          }}
        >
          {reading ? <Spinner className="text-blue-700" /> : <FileUp className="text-blue-700" size={26} />}
          <span className="font-semibold text-blue-800">{reading || 'Tải lên file Word (.docx) hoặc PDF'}</span>
          <span className="text-xs text-slate-500">Bấm để chọn hoặc kéo thả file vào đây • Word giữ được công thức MathType/Equation và hình vẽ</span>
          <input type="file" accept=".docx,.doc,.pdf,.txt,.tex,.md" className="hidden" onChange={loadFile} disabled={Boolean(reading)} />
        </label>
        {fileInfo && (
          <div className={`rounded-lg px-3 py-2 text-sm ${fileInfo.warn ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
            <b>{fileInfo.name}</b>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {fileInfo.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="label mb-0">Nội dung (sửa trực tiếp nếu cần)</span>
            <button className="text-xs text-blue-700 hover:underline" onClick={() => setText(IMPORT_SAMPLE)}>
              Xem mẫu
            </button>
          </div>
          <textarea className="input min-h-[420px] font-mono text-[13px]" value={text} onChange={(e) => setText(e.target.value)} placeholder={IMPORT_SAMPLE} />
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-slate-500">
            <li>Mỗi câu bắt đầu bằng “Câu 1:”, “Câu 2.”…; trắc nghiệm có A. B. C. D. (được phép cùng dòng hoặc trong bảng).</li>
            <li>
              Đáp án nhận từ: dòng “Đáp án: B”, phương án <u>gạch chân</u>/tô đỏ trong Word, “Chọn B” trong lời giải, hoặc bảng đáp án cuối đề.
            </li>
            <li>Đúng/Sai: 4 ý a) b) c) d) và “Đáp án: Đ S Đ S”. Trả lời ngắn: chỉ cần “Đáp án: …”. Không có đáp án → Tự luận.</li>
            <li>Ký hiệu [[HINH:n]] là vị trí hình vẽ, hình được gắn vào câu chứa nó.</li>
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
        {parsed.length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            {parsed.some((p) => p.errors.length) && <span className="text-red-600">{parsed.filter((p) => p.errors.length).length} câu có lỗi sẽ không được gửi.</span>}
            {skipped.size > 0 && <span>{skipped.size} câu đã bỏ qua.</span>}
          </div>
        )}
        <div className="max-h-[75vh] space-y-3 overflow-y-auto pr-1">
          {parsed.map((p) => {
            const off = skipped.has(p.index);
            return (
              <div key={p.index} className={`card p-3 ${p.errors.length ? 'border-red-300' : ''} ${off ? 'opacity-50' : ''}`}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <b className="text-sm">Câu {p.index}</b>
                    <QuestionMeta q={{ ...p, grade: gradeOf(p), topic: p.chapterCode && topicOf(p) !== topic ? topicOf(p) : '', level: levelOf(p) }} showStatus={false} />
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className="rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                      value={levelOf(p)}
                      onChange={(e) => setLevels({ ...levels, [p.index]: e.target.value })}
                      title="Mức độ của câu này"
                    >
                      {LEVELS.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.id}
                        </option>
                      ))}
                    </select>
                    <button
                      className="text-xs text-slate-500 hover:text-red-600"
                      onClick={() => {
                        const n = new Set(skipped);
                        n.has(p.index) ? n.delete(p.index) : n.add(p.index);
                        setSkipped(n);
                      }}
                    >
                      {off ? 'Lấy lại' : 'Bỏ câu này'}
                    </button>
                  </div>
                </div>
                <QuestionView q={p} showSolution />
                {p.errors.map((e) => (
                  <div key={e} className="mt-2 text-xs text-red-600">
                    ⚠ {e}
                  </div>
                ))}
                {p.warnings?.map((w) => (
                  <div key={w} className="mt-2 text-xs text-amber-700">
                    ⚠ {w}
                  </div>
                ))}
                {dups[p.index] && <div className="mt-2 text-xs font-medium text-violet-700">⧉ {dups[p.index]} – đã tự bỏ qua, bấm “Lấy lại” nếu vẫn muốn gửi.</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
