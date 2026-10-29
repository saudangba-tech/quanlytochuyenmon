import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDoc, serverTimestamp } from 'firebase/firestore';
import { Shuffle, Save, RefreshCw, X, Wand2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { col, fetchWhere, cached } from '../lib/db.js';
import { LEVELS, TYPES } from '../lib/constants.js';
import { PART_ORDER } from '../lib/examExport.js';
import { currentSchoolYear, shuffle } from '../lib/utils.js';
import QuestionView, { QuestionMeta } from '../components/QuestionView.jsx';
import { PageHeader, PageLoader, Field, Spinner, useAsync, useToast } from '../components/ui.jsx';

const cellKey = (topic, type, level) => `${topic}||${type}||${level}`;

// Sinh các mã đề: trộn thứ tự câu trong từng phần và trộn phương án A–D
export function makeVersions(questions, { count, startCode, shuffleQuestions, shuffleOptions }) {
  const byType = PART_ORDER.map((t) => questions.filter((q) => q.type === t));
  return Array.from({ length: count }, (_, i) => {
    const items = [];
    byType.forEach((list) => {
      const ordered = shuffleQuestions ? shuffle(list) : list;
      ordered.forEach((q) => items.push({ id: q.id, perm: q.type === 'mcq' && shuffleOptions ? shuffle([0, 1, 2, 3]) : [0, 1, 2, 3] }));
    });
    return { code: String(Number(startCode) + i), items };
  });
}

export default function ExamBuilder() {
  const { settings, me } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [info, setInfo] = useState({
    title: 'Đề kiểm tra giữa học kỳ I',
    grade: settings.grades[settings.grades.length - 1],
    duration: 90,
    versions: 4,
    startCode: 101,
    shuffleQuestions: true,
    shuffleOptions: true,
    official: true,
    points: { mcq: 0.25, short: 0.5, essay: 1 },
  });
  const [pool, setPool] = useState([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('mcq');
  const [matrix, setMatrix] = useState({});
  const [picked, setPicked] = useState([]);
  const [busy, run] = useAsync();

  useEffect(() => {
    setLoading(true);
    const g = Number(info.grade);
    run(() => cached(`q:grade:${g}:approved`, () => fetchWhere('questions', [['grade', '==', g], ['status', '==', 'approved']])).then(setPool)).finally(() =>
      setLoading(false)
    );
    setMatrix({});
    setPicked([]);
  }, [info.grade]);

  const topics = useMemo(() => {
    const fromPool = [...new Set(pool.map((q) => q.topic))];
    const ordered = (settings.topics[info.grade] || []).filter((t) => fromPool.includes(t));
    return [...ordered, ...fromPool.filter((t) => !ordered.includes(t))];
  }, [pool, settings.topics, info.grade]);

  const available = useMemo(() => {
    const m = {};
    for (const q of pool) {
      const k = cellKey(q.topic, q.type, q.level);
      m[k] = (m[k] || 0) + 1;
    }
    return m;
  }, [pool]);

  const totals = useMemo(() => {
    const t = {};
    for (const [k, n] of Object.entries(matrix)) {
      const [, ty, lv] = k.split('||');
      t[ty] = (t[ty] || 0) + n;
      t[`${ty}|${lv}`] = (t[`${ty}|${lv}`] || 0) + n;
    }
    return t;
  }, [matrix]);

  const setCell = (k, v) => setMatrix((m) => ({ ...m, [k]: Math.max(0, Math.min(Number(v) || 0, available[k] || 0)) }));

  function generate() {
    const chosen = [];
    for (const [k, n] of Object.entries(matrix)) {
      if (!n) continue;
      const [topic, ty, lv] = k.split('||');
      const candidates = pool.filter((q) => q.topic === topic && q.type === ty && q.level === lv);
      if (candidates.length < n) return toast(`Không đủ câu: ${topic} – ${ty} – ${lv}`, 'error');
      chosen.push(...shuffle(candidates).slice(0, n));
    }
    if (!chosen.length) return toast('Hãy nhập số câu vào ma trận.', 'error');
    // Sắp theo phần, trong mỗi phần theo mức độ tăng dần
    const lvIdx = (l) => LEVELS.findIndex((x) => x.id === l);
    chosen.sort((a, b) => PART_ORDER.indexOf(a.type) - PART_ORDER.indexOf(b.type) || lvIdx(a.level) - lvIdx(b.level));
    setPicked(chosen);
  }

  function swap(q) {
    const used = new Set(picked.map((x) => x.id));
    const alt = shuffle(pool.filter((x) => !used.has(x.id) && x.topic === q.topic && x.type === q.type && x.level === q.level))[0];
    if (!alt) return toast('Không còn câu khác cùng chuyên đề, dạng và mức độ.', 'info');
    setPicked((l) => l.map((x) => (x.id === q.id ? alt : x)));
  }

  async function save() {
    if (!picked.length) return toast('Chưa có câu hỏi nào trong đề.', 'error');
    await run(async () => {
      const versions = makeVersions(picked, { count: Number(info.versions) || 1, startCode: info.startCode, shuffleQuestions: info.shuffleQuestions, shuffleOptions: info.shuffleOptions });
      const r = await addDoc(col('exams'), {
        title: info.title.trim(),
        grade: Number(info.grade),
        duration: Number(info.duration),
        official: info.official,
        points: info.points,
        schoolYear: currentSchoolYear(settings),
        matrix,
        questionIds: picked.map((q) => q.id),
        versions,
        createdBy: me.uid,
        createdByName: me.name,
        createdAt: serverTimestamp(),
      });
      nav(`/de-thi?moi=${r.id}`);
    }, 'Đã lưu đề và sinh các mã đề.');
  }

  const set = (k) => (e) => setInfo({ ...info, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const setPts = (k) => (e) => setInfo({ ...info, points: { ...info.points, [k]: Number(e.target.value) } });
  const scoreTotal = (totals.mcq || 0) * info.points.mcq + (totals.tf || 0) * 1 + (totals.short || 0) * info.points.short + (totals.essay || 0) * info.points.essay;

  return (
    <div>
      <PageHeader title="Tạo đề theo ma trận" subtitle="Chọn số câu theo chuyên đề × mức độ, hệ thống bốc ngẫu nhiên từ các câu đã duyệt rồi trộn thành nhiều mã đề." />

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <Field label="Tên đề" className="sm:col-span-2">
          <input className="input" value={info.title} onChange={set('title')} />
        </Field>
        <Field label="Khối">
          <select className="input" value={info.grade} onChange={set('grade')}>
            {settings.grades.map((g) => (
              <option key={g} value={g}>
                Lớp {g}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Thời gian (phút)">
          <input type="number" className="input" value={info.duration} onChange={set('duration')} />
        </Field>
        <Field label="Số mã đề">
          <input type="number" min="1" max="24" className="input" value={info.versions} onChange={set('versions')} />
        </Field>
        <Field label="Mã đề bắt đầu">
          <input type="number" className="input" value={info.startCode} onChange={set('startCode')} />
        </Field>
        <Field label="Điểm/câu Phần I (TN)">
          <input type="number" step="0.05" className="input" value={info.points.mcq} onChange={setPts('mcq')} />
        </Field>
        <Field label="Điểm/câu trả lời ngắn">
          <input type="number" step="0.05" className="input" value={info.points.short} onChange={setPts('short')} />
        </Field>
        <Field label="Điểm/câu tự luận">
          <input type="number" step="0.25" className="input" value={info.points.essay} onChange={setPts('essay')} />
        </Field>
        <div className="flex flex-col justify-end gap-1 text-sm sm:col-span-2 lg:col-span-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={info.shuffleQuestions} onChange={set('shuffleQuestions')} /> Trộn thứ tự câu trong từng phần
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={info.shuffleOptions} onChange={set('shuffleOptions')} /> Trộn phương án A, B, C, D
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={info.official} onChange={set('official')} /> Ghi “ĐỀ CHÍNH THỨC”
          </label>
        </div>
      </div>

      {loading ? (
        <PageLoader text="Đang tải câu hỏi đã duyệt…" />
      ) : !pool.length ? (
        <div className="card p-6 text-center text-slate-500">Khối {info.grade} chưa có câu hỏi nào được duyệt.</div>
      ) : (
        <div className="card mb-4 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {TYPES.map((t) => (
              <button key={t.id} className={`btn ${type === t.id ? 'bg-blue-700 text-white' : 'border border-slate-300 bg-white text-slate-700'}`} onClick={() => setType(t.id)}>
                {t.short} <span className="rounded bg-white/20 px-1.5 text-xs">{totals[t.id] || 0}</span>
              </button>
            ))}
            <div className="flex-1" />
            <span className="text-sm text-slate-600">
              Tổng điểm dự kiến: <b>{String(Math.round(scoreTotal * 100) / 100).replace('.', ',')}</b>
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Chuyên đề</th>
                  {LEVELS.map((l) => (
                    <th key={l.id} className="text-center">
                      {l.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topics.map((t) => (
                  <tr key={t}>
                    <td className="min-w-56">{t}</td>
                    {LEVELS.map((l) => {
                      const k = cellKey(t, type, l.id);
                      const av = available[k] || 0;
                      return (
                        <td key={l.id} className="text-center">
                          <div className="inline-flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              max={av}
                              disabled={!av}
                              className="input w-16 text-center"
                              value={matrix[k] || ''}
                              onChange={(e) => setCell(k, e.target.value)}
                            />
                            <span className="w-8 text-left text-xs text-slate-400">/{av}</span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold">
                  <td>Cộng</td>
                  {LEVELS.map((l) => (
                    <td key={l.id} className="text-center">
                      {totals[`${type}|${l.id}`] || 0}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Gợi ý cấu trúc đề tốt nghiệp THPT môn Toán: 12 câu TN 4 lựa chọn (3 điểm) + 4 câu Đúng/Sai (4 điểm) + 6 câu trả lời ngắn (3 điểm).
          </p>
          <div className="mt-3 flex justify-end">
            <button className="btn-primary" onClick={generate}>
              <Wand2 size={16} /> Bốc câu hỏi ngẫu nhiên
            </button>
          </div>
        </div>
      )}

      {picked.length > 0 && (
        <div className="card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Đề gốc gồm {picked.length} câu</h2>
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={generate}>
                <Shuffle size={16} /> Bốc lại
              </button>
              <button className="btn-primary" onClick={save} disabled={busy}>
                {busy ? <Spinner /> : <Save size={16} />} Lưu & sinh {info.versions} mã đề
              </button>
            </div>
          </div>
          <div className="space-y-3">
            {PART_ORDER.map((ty) => {
              const list = picked.filter((q) => q.type === ty);
              if (!list.length) return null;
              return (
                <div key={ty}>
                  <div className="mb-2 font-semibold text-blue-800">{TYPES.find((t) => t.id === ty).name}</div>
                  <div className="space-y-2">
                    {list.map((q, i) => (
                      <div key={q.id} className="rounded-lg border border-slate-200 p-3">
                        <div className="mb-1 flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <b>Câu {i + 1}.</b> <QuestionMeta q={q} showStatus={false} />
                          </div>
                          <div className="flex gap-1">
                            <button className="rounded p-1 text-slate-500 hover:bg-slate-100" title="Đổi câu khác" onClick={() => swap(q)}>
                              <RefreshCw size={15} />
                            </button>
                            <button className="rounded p-1 text-red-500 hover:bg-red-50" title="Bỏ câu này" onClick={() => setPicked((l) => l.filter((x) => x.id !== q.id))}>
                              <X size={15} />
                            </button>
                          </div>
                        </div>
                        <QuestionView q={q} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
