import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { LEVELS, TYPES } from '../lib/constants.js';
import { compressImage } from '../lib/image.js';
import { Field, useToast } from './ui.jsx';
import QuestionView from './QuestionView.jsx';
import { parseIdCode, questionHash } from '../lib/questionId.js';

const SNIPPETS = [
  ['$…$', '$x$'],
  ['Phân số', '\\dfrac{a}{b}'],
  ['Căn', '\\sqrt{x}'],
  ['Mũ', 'x^{2}'],
  ['Chỉ số', 'x_{1}'],
  ['Tích phân', '\\displaystyle\\int_{a}^{b} f(x)\\,dx'],
  ['Giới hạn', '\\lim\\limits_{x \\to +\\infty}'],
  ['Vectơ', '\\overrightarrow{AB}'],
  ['Góc', '\\widehat{ABC}'],
  ['Hệ PT', '\\begin{cases} x+y=1 \\\\ x-y=3 \\end{cases}'],
  ['log', '\\log_{a} b'],
  ['≤ ≥ ≠', '\\le \\ge \\ne'],
  ['∞', '\\infty'],
  ['ℝ', '\\mathbb{R}'],
];

export const emptyQuestion = (base = {}) => ({
  grade: base.grade || 12,
  topic: base.topic || '',
  level: base.level || 'NB',
  type: base.type || 'mcq',
  content: '',
  options: ['', '', '', ''],
  statements: ['', '', '', ''],
  answer: base.type === 'tf' ? [true, true, true, true] : base.type === 'mcq' || !base.type ? 'A' : '',
  solution: '',
  image: null,
  idCode: '',
  sourceId: base.sourceId || '',
  sourceName: base.sourceName || '',
});

export function validateQuestion(q) {
  if (!q.topic?.trim()) return 'Vui lòng chọn/nhập chuyên đề.';
  if (!q.content?.trim()) return 'Vui lòng nhập nội dung câu hỏi.';
  if (q.type === 'mcq') {
    if (q.options.some((o) => !o.trim())) return 'Vui lòng nhập đủ 4 phương án A, B, C, D.';
    if (!'ABCD'.includes(q.answer) || !q.answer) return 'Vui lòng chọn đáp án đúng.';
  }
  if (q.type === 'tf') {
    if (q.statements.some((s) => !s.trim())) return 'Vui lòng nhập đủ 4 ý a, b, c, d.';
    if (!Array.isArray(q.answer) || q.answer.length !== 4) return 'Vui lòng chọn Đúng/Sai cho 4 ý.';
  }
  if (q.type === 'short' && !String(q.answer || '').trim()) return 'Vui lòng nhập đáp án trả lời ngắn.';
  return '';
}

// Chuẩn hóa dữ liệu trước khi lưu: bỏ trường không dùng theo dạng câu
export function cleanQuestion(q) {
  const out = {
    grade: Number(q.grade),
    topic: q.topic.trim(),
    level: q.level,
    type: q.type,
    content: q.content.trim(),
    solution: (q.solution || '').trim(),
    image: q.image || null,
    options: [],
    statements: [],
    answer: '',
  };
  if (q.type === 'mcq') {
    out.options = q.options.map((o) => o.trim());
    out.answer = q.answer;
  } else if (q.type === 'tf') {
    out.statements = q.statements.map((s) => s.trim());
    out.answer = q.answer.map(Boolean);
  } else if (q.type === 'short') out.answer = String(q.answer).trim();
  out.idCode = (q.idCode || '').trim().toUpperCase();
  out.sourceId = q.sourceId || '';
  out.sourceName = (q.sourceName || '').trim();
  out.hash = questionHash(out);
  return out;
}

export default function QuestionEditor({ value: q, onChange, settings, sources = [] }) {
  const toast = useToast();
  const contentRef = useRef(null);
  const [focusField, setFocusField] = useState('content');
  const set = (patch) => onChange({ ...q, ...patch });
  const topics = settings.topics?.[q.grade] || [];
  const idInfo = parseIdCode(q.idCode);

  // Nhập mã ID hợp lệ → tự điền khối, mức độ, chuyên đề (nếu Cài đặt có mã chuyên đề)
  function changeId(value) {
    const info = parseIdCode(value);
    const patch = { idCode: value };
    if (info) {
      if (settings.grades.includes(info.grade)) patch.grade = info.grade;
      patch.level = info.level;
      if (settings.topicCodes?.[info.chapter]) patch.topic = settings.topicCodes[info.chapter];
    }
    set(patch);
  }

  function changeType(type) {
    let answer = q.answer;
    if (type === 'mcq' && !'ABCD'.includes(answer || 'x')) answer = 'A';
    if (type === 'tf' && !Array.isArray(answer)) answer = [true, true, true, true];
    if ((type === 'short' || type === 'essay') && typeof answer !== 'string') answer = '';
    if (type === 'short' && 'ABCD'.includes(answer) && answer.length === 1) answer = '';
    set({ type, answer });
  }

  // Chèn đoạn LaTeX vào ô nội dung tại vị trí con trỏ
  function insert(snippet) {
    const el = contentRef.current;
    if (!el || focusField !== 'content') {
      navigator.clipboard?.writeText(snippet);
      toast('Đã sao chép công thức, hãy dán vào ô cần nhập.', 'info');
      return;
    }
    const s = el.selectionStart ?? q.content.length;
    const e = el.selectionEnd ?? s;
    const inside = /\$[^$]*$/.test(q.content.slice(0, s)) && (q.content.slice(0, s).match(/\$/g) || []).length % 2 === 1;
    const text = snippet.startsWith('$') || inside ? snippet : `$${snippet}$`;
    const next = q.content.slice(0, s) + text + q.content.slice(e);
    set({ content: next });
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = s + text.length;
    });
  }

  async function pickImage(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      set({ image: await compressImage(file) });
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Khối lớp">
            <select className="input" value={q.grade} onChange={(e) => set({ grade: Number(e.target.value), topic: '' })}>
              {settings.grades.map((g) => (
                <option key={g} value={g}>
                  Lớp {g}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mức độ">
            <select className="input" value={q.level} onChange={(e) => set({ level: e.target.value })}>
              {LEVELS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Dạng câu hỏi" className="col-span-2">
            <select className="input" value={q.type} onChange={(e) => changeType(e.target.value)}>
              {TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Chuyên đề">
          <input className="input" list={`topics-${q.grade}`} value={q.topic} onChange={(e) => set({ topic: e.target.value })} placeholder="Chọn hoặc gõ tên chuyên đề" />
          <datalist id={`topics-${q.grade}`}>
            {topics.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Mã ID (không bắt buộc)"
            hint={
              idInfo
                ? `Lớp ${idInfo.grade} • chuyên đề ${idInfo.chapter} • bài ${idInfo.lesson}${idInfo.form ? `, dạng ${idInfo.form}` : ''} • ${idInfo.level}`
                : 'Ví dụ 2D1-1.2-3: lớp 12, chương 1, bài 1 dạng 2, mức 3 (VD)'
            }
          >
            <input className="input font-mono uppercase" value={q.idCode || ''} onChange={(e) => changeId(e.target.value)} placeholder="2D1-1.2-3" />
          </Field>
          <Field label="Nguồn câu hỏi" hint="Đề thi thử, đề kiểm tra, sách… Gõ tên mới để tạo nguồn mới.">
            <input
              className="input"
              list="source-list"
              value={q.sourceName || ''}
              onChange={(e) => {
                const s = sources.find((x) => x.name === e.target.value);
                set({ sourceName: e.target.value, sourceId: s?.id || '' });
              }}
              placeholder="Ví dụ: Đề thi thử TN 2025 – Sở GD Hà Nội"
            />
            <datalist id="source-list">
              {sources.map((s) => (
                <option key={s.id} value={s.name} />
              ))}
            </datalist>
          </Field>
        </div>

        <div>
          <span className="label">Nội dung câu hỏi</span>
          <div className="mb-1.5 flex flex-wrap gap-1">
            {SNIPPETS.map(([label, s]) => (
              <button key={label} type="button" className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs hover:bg-blue-50" onClick={() => insert(s)}>
                {label}
              </button>
            ))}
          </div>
          <textarea
            ref={contentRef}
            className="input min-h-28 font-mono text-[13px]"
            value={q.content}
            onFocus={() => setFocusField('content')}
            onChange={(e) => set({ content: e.target.value })}
            placeholder="Ví dụ: Cho hàm số $y=x^3-3x+1$. Hàm số đồng biến trên khoảng nào?"
          />
          <p className="mt-1 text-xs text-slate-500">
            Công thức đặt giữa <code>$...$</code> (cùng dòng) hoặc <code>$$...$$</code> (dòng riêng, căn giữa).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="btn-secondary cursor-pointer">
            <ImagePlus size={16} /> {q.image ? 'Đổi hình' : 'Thêm hình vẽ'}
            <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={pickImage} />
          </label>
          {q.image && (
            <button type="button" className="btn-secondary text-red-600" onClick={() => set({ image: null })}>
              <Trash2 size={16} /> Bỏ hình
            </button>
          )}
          <span className="text-xs text-slate-500">PNG/JPG, tự nén ≤ 300 KB</span>
        </div>

        {q.type === 'mcq' && (
          <div className="space-y-2">
            <span className="label">Các phương án (chọn đáp án đúng)</span>
            {q.options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <label className={`flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border font-bold ${q.answer === 'ABCD'[i] ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 text-slate-600'}`}>
                  <input type="radio" className="hidden" checked={q.answer === 'ABCD'[i]} onChange={() => set({ answer: 'ABCD'[i] })} />
                  {'ABCD'[i]}
                </label>
                <input
                  className="input font-mono text-[13px]"
                  value={o}
                  onFocus={() => setFocusField('option')}
                  onChange={(e) => set({ options: q.options.map((x, k) => (k === i ? e.target.value : x)) })}
                  placeholder={`Phương án ${'ABCD'[i]}`}
                />
              </div>
            ))}
          </div>
        )}

        {q.type === 'tf' && (
          <div className="space-y-2">
            <span className="label">Bốn ý a, b, c, d và tính Đúng/Sai</span>
            {q.statements.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <b className="w-5 text-blue-700">{'abcd'[i]})</b>
                <input
                  className="input font-mono text-[13px]"
                  value={s}
                  onFocus={() => setFocusField('statement')}
                  onChange={(e) => set({ statements: q.statements.map((x, k) => (k === i ? e.target.value : x)) })}
                />
                <button
                  type="button"
                  className={`w-16 shrink-0 rounded-lg px-2 py-2 text-xs font-bold ${q.answer?.[i] ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}
                  onClick={() => set({ answer: q.answer.map((v, k) => (k === i ? !v : v)) })}
                >
                  {q.answer?.[i] ? 'ĐÚNG' : 'SAI'}
                </button>
              </div>
            ))}
          </div>
        )}

        {q.type === 'short' && (
          <Field label="Đáp án" hint="Đề thi tốt nghiệp: đáp án tối đa 4 ký tự (kể cả dấu “-” và dấu phẩy), ví dụ: -1,5">
            <input className="input" value={q.answer} onChange={(e) => set({ answer: e.target.value })} />
          </Field>
        )}

        <Field label="Lời giải / hướng dẫn chấm (không bắt buộc)">
          <textarea className="input min-h-20 font-mono text-[13px]" value={q.solution} onFocus={() => setFocusField('solution')} onChange={(e) => set({ solution: e.target.value })} />
        </Field>
      </div>

      <div className="xl:sticky xl:top-4 xl:self-start">
        <div className="card p-4">
          <div className="mb-2 text-sm font-semibold text-slate-500">Xem trước</div>
          {q.content ? <QuestionView q={q} showSolution /> : <p className="text-sm text-slate-400">Nội dung câu hỏi sẽ hiển thị ở đây…</p>}
        </div>
      </div>
    </div>
  );
}
