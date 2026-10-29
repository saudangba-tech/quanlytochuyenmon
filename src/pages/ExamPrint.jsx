import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getDoc } from 'firebase/firestore';
import { ArrowLeft, Printer } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { fetchByIds, ref } from '../lib/db.js';
import { versionParts, displayedOptions, tfAnswerText, PART_TITLES, LETTERS } from '../lib/examExport.js';
import { MathText } from '../lib/math.jsx';
import { plainLength } from '../lib/utils.js';
import { PageLoader } from '../components/ui.jsx';

// Trang in đề: dùng chức năng In của trình duyệt → chọn "Lưu dưới dạng PDF"
export default function ExamPrint() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { settings } = useAuth();
  const [exam, setExam] = useState(null);
  const [qmap, setQmap] = useState(null);
  const [err, setErr] = useState('');
  const withAnswers = params.get('da') === '1';

  useEffect(() => {
    (async () => {
      const s = await getDoc(ref('exams', id));
      if (!s.exists()) return setErr('Không tìm thấy đề.');
      const e = { id: s.id, ...s.data() };
      setExam(e);
      setQmap(await fetchByIds('questions', e.questionIds));
    })().catch((e) => setErr(e.message));
  }, [id]);

  if (err) return <p className="p-6 text-red-600">{err}</p>;
  if (!exam || !qmap) return <PageLoader />;
  const version = exam.versions.find((v) => v.code === params.get('ma')) || exam.versions[0];
  const parts = versionParts(version, qmap);
  const setParam = (k, v) => {
    const p = new URLSearchParams(params);
    p.set(k, v);
    setParams(p, { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-200 py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center gap-2 px-2">
        <Link to="/de-thi" className="btn-secondary">
          <ArrowLeft size={16} /> Quay lại
        </Link>
        <select className="input w-32" value={version.code} onChange={(e) => setParam('ma', e.target.value)}>
          {exam.versions.map((v) => (
            <option key={v.code} value={v.code}>
              Mã {v.code}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={withAnswers} onChange={(e) => setParam('da', e.target.checked ? '1' : '0')} /> Hiện đáp án & lời giải
        </label>
        <div className="flex-1" />
        <button className="btn-primary" onClick={() => window.print()}>
          <Printer size={16} /> In / Lưu PDF
        </button>
      </div>

      <div className="print-area mx-auto max-w-[210mm] bg-white px-[15mm] py-[12mm] text-[12pt] leading-snug text-black shadow">
        <div className="grid grid-cols-[42%_58%] text-center">
          <div>
            <div>{settings.departmentName?.toUpperCase()}</div>
            <div className="font-bold">{settings.schoolName?.toUpperCase()}</div>
            {exam.official && <div className="mt-2 inline-block border border-black px-2 font-bold">ĐỀ CHÍNH THỨC</div>}
          </div>
          <div>
            <div className="font-bold">{exam.title?.toUpperCase()}</div>
            <div className="font-bold">NĂM HỌC {exam.schoolYear?.replace('-', ' – ')}</div>
            <div className="font-bold">
              Môn: {settings.subject?.toUpperCase()} – Lớp {exam.grade}
            </div>
            <div className="italic">Thời gian làm bài: {exam.duration} phút, không kể thời gian phát đề</div>
          </div>
        </div>
        <div className="mt-3 flex justify-between">
          <span>Họ, tên thí sinh: ……………………………………… Số báo danh: …………</span>
          <b className="border border-black px-2">Mã đề {version.code}</b>
        </div>

        {parts.map((part) => (
          <section key={part.type} className="mt-3">
            <p className="text-justify">
              <b>PHẦN {part.roman}.</b> {PART_TITLES[part.type](part.items.length)}
            </p>
            {part.items.map((it) => {
              const q = it.q;
              const d = part.type === 'mcq' ? displayedOptions(q, it.perm) : null;
              const maxLen = d ? Math.max(...d.options.map(plainLength)) : 0;
              const cols = maxLen <= 22 ? 'grid-cols-4' : maxLen <= 48 ? 'grid-cols-2' : 'grid-cols-1';
              return (
                <div key={it.id} className="avoid-break mt-1.5">
                  <div className="flex gap-1">
                    <b className="shrink-0">Câu {it.no}.</b>
                    <MathText text={q.content} className="flex-1 text-justify" />
                  </div>
                  {q.image?.data && <img src={q.image.data} alt="" className="mx-auto my-1 max-h-60" />}
                  {d && (
                    <div className={`grid ${cols} gap-x-3 pl-4`}>
                      {d.options.map((o, j) => (
                        <div key={j} className={`flex gap-1 ${withAnswers && d.correct === LETTERS[j] ? 'font-semibold text-red-700' : ''}`}>
                          <b>{LETTERS[j]}.</b> <MathText text={o} as="span" />
                        </div>
                      ))}
                    </div>
                  )}
                  {part.type === 'tf' &&
                    (q.statements || []).map((s, k) => (
                      <div key={k} className="flex gap-1 pl-4">
                        <b>{'abcd'[k]})</b> <MathText text={s} as="span" className="flex-1" />
                        {withAnswers && <b className="text-red-700">{tfAnswerText(q)[k] === 'Đ' ? 'Đúng' : 'Sai'}</b>}
                      </div>
                    ))}
                  {withAnswers && part.type === 'short' && <div className="pl-4 font-semibold text-red-700">Đáp án: {q.answer}</div>}
                  {withAnswers && q.solution && (
                    <div className="mt-1 border-l-2 border-red-300 pl-3 text-[11pt]">
                      <i>Lời giải:</i> <MathText text={q.solution} />
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        ))}
        <p className="mt-6 text-center font-bold">------ HẾT ------</p>
      </div>
    </div>
  );
}
