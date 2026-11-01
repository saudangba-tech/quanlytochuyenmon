import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { collection, deleteDoc, getDocs, writeBatch } from 'firebase/firestore';
import { FilePlus2, FileText, FileDown, Printer, Trash2, KeyRound, Archive, Grid3x3 } from 'lucide-react';
import { db } from '../firebase.js';
import { useAuth } from '../context/AuthContext.jsx';
import { fetchWhere, loadExamQuestions, ref } from '../lib/db.js';
import { formatTimestamp, downloadBlob, safeFileName } from '../lib/utils.js';
import { PageHeader, PageLoader, Empty, Badge, Spinner, useAsync } from '../components/ui.jsx';

export default function Exams() {
  const { settings } = useAuth();
  const [params] = useSearchParams();
  const fresh = params.get('moi');
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState({});
  const [busyId, setBusyId] = useState('');
  const [, run] = useAsync();

  useEffect(() => {
    run(() =>
      fetchWhere('exams').then((d) => {
        d.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setList(d);
      })
    ).finally(() => setLoading(false));
  }, [run]);

  async function withQuestions(exam, fn, msg) {
    setBusyId(exam.id);
    await run(async () => {
      const qmap = await loadExamQuestions(exam);
      const missing = exam.questionIds.filter((id) => !qmap[id]).length;
      if (missing) throw new Error(`${missing} câu hỏi trong đề đã bị xóa khỏi ngân hàng, không thể xuất đầy đủ.`);
      await fn(qmap);
    }, msg);
    setBusyId('');
  }

  const base = (exam) => safeFileName(`${exam.title}_lop${exam.grade}`);

  const exportMatrix = (exam) =>
    withQuestions(
      exam,
      async (qmap) => {
        const { buildMatrixDocx } = await import('../lib/examExport.js');
        downloadBlob(await buildMatrixDocx(exam, qmap, settings), `${base(exam)}_MA_TRAN_DAC_TA.docx`);
      },
      'Đã tải ma trận và bảng đặc tả.'
    );

  const exportOne = (exam) =>
    withQuestions(
      exam,
      async (qmap) => {
        const { buildExamDocx } = await import('../lib/examExport.js');
        const v = exam.versions.find((x) => x.code === (code[exam.id] || exam.versions[0].code));
        downloadBlob(await buildExamDocx(exam, v, qmap, settings), `${base(exam)}_ma${v.code}.docx`);
      },
      'Đã tải đề.'
    );

  const exportAll = (exam) =>
    withQuestions(
      exam,
      async (qmap) => {
        const [{ buildExamDocx, buildAnswerDocx, buildMatrixDocx }, { default: JSZip }] = await Promise.all([import('../lib/examExport.js'), import('jszip')]);
        const zip = new JSZip();
        for (const v of exam.versions) zip.file(`${base(exam)}_ma${v.code}.docx`, await buildExamDocx(exam, v, qmap, settings));
        zip.file(`${base(exam)}_DAP_AN.docx`, await buildAnswerDocx(exam, exam.versions, qmap, settings, { solutionVersion: exam.versions[0].code }));
        zip.file(`${base(exam)}_MA_TRAN_DAC_TA.docx`, await buildMatrixDocx(exam, qmap, settings));
        downloadBlob(await zip.generateAsync({ type: 'blob' }), `${base(exam)}_tat_ca_ma_de.zip`);
      },
      'Đã tải trọn bộ đề và đáp án.'
    );

  const exportKey = (exam) =>
    withQuestions(
      exam,
      async (qmap) => {
        const { buildAnswerDocx } = await import('../lib/examExport.js');
        downloadBlob(
          await buildAnswerDocx(exam, exam.versions, qmap, settings, { solutionVersion: code[exam.id] || exam.versions[0].code }),
          `${base(exam)}_DAP_AN.docx`
        );
      },
      'Đã tải đáp án.'
    );

  const exportKeyExcel = (exam) =>
    withQuestions(exam, async (qmap) => {
      const [{ exportXlsx }, { versionParts, displayedOptions, tfAnswerText }] = await Promise.all([import('../lib/excel.js'), import('../lib/examExport.js')]);
      const rows = [];
      for (const v of exam.versions)
        for (const part of versionParts(v, qmap))
          for (const it of part.items) {
            let ans = '';
            if (part.type === 'mcq') ans = displayedOptions(it.q, it.perm).correct;
            if (part.type === 'tf') ans = tfAnswerText(it.q, it.perm).join('');
            if (part.type === 'short') ans = it.q.answer;
            rows.push({ code: v.code, part: part.roman, no: it.no, ans });
          }
      await exportXlsx(`${base(exam)}_dap_an.xlsx`, [
        {
          name: 'Đáp án',
          title: `ĐÁP ÁN – ${exam.title.toUpperCase()}`,
          columns: [
            { header: 'Mã đề', key: 'code', width: 10 },
            { header: 'Phần', key: 'part', width: 8 },
            { header: 'Câu', key: 'no', width: 8 },
            { header: 'Đáp án', key: 'ans', width: 14 },
          ],
          rows,
        },
      ]);
    }, 'Đã xuất bảng đáp án Excel.');

  async function remove(exam) {
    if (!confirm(`Xóa đề "${exam.title}"? Câu hỏi trong ngân hàng không bị ảnh hưởng.`)) return;
    await run(async () => {
      if (exam.snapshot) {
        const items = await getDocs(collection(db, 'exams', exam.id, 'items'));
        const batch = writeBatch(db);
        items.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      await deleteDoc(ref('exams', exam.id));
      setList((l) => l.filter((x) => x.id !== exam.id));
    }, 'Đã xóa đề.');
  }

  return (
    <div>
      <PageHeader
        title="Trộn & xuất đề"
        subtitle="Đề được tạo từ các câu hỏi đã duyệt; xuất Word (công thức Equation chỉnh sửa được) hoặc in/lưu PDF."
        actions={
          <Link to="/de-thi/tao" className="btn-primary">
            <FilePlus2 size={16} /> Tạo đề mới
          </Link>
        }
      />
      {loading ? (
        <PageLoader />
      ) : !list.length ? (
        <Empty icon={FileText} title="Chưa có đề nào">
          Bấm “Tạo đề mới” để bốc câu hỏi theo ma trận.
        </Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.map((e) => {
            const busy = busyId === e.id;
            const sel = code[e.id] || e.versions[0]?.code;
            return (
              <div key={e.id} className={`card p-4 ${fresh === e.id ? 'ring-2 ring-emerald-400' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{e.title}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                      <Badge className="bg-slate-100 text-slate-700">Lớp {e.grade}</Badge>
                      <Badge className="bg-slate-100 text-slate-700">{e.duration} phút</Badge>
                      <Badge className="bg-blue-50 text-blue-700">{e.questionIds.length} câu</Badge>
                      <Badge className="bg-violet-50 text-violet-700">{e.versions.length} mã đề</Badge>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {e.createdByName} • {formatTimestamp(e.createdAt)}
                    </div>
                  </div>
                  <button className="rounded-lg p-1.5 text-red-500 hover:bg-red-50" onClick={() => remove(e)} title="Xóa đề">
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select className="input w-32" value={sel} onChange={(ev) => setCode({ ...code, [e.id]: ev.target.value })}>
                    {e.versions.map((v) => (
                      <option key={v.code} value={v.code}>
                        Mã {v.code}
                      </option>
                    ))}
                  </select>
                  <button className="btn-secondary" disabled={busy} onClick={() => exportOne(e)}>
                    {busy ? <Spinner /> : <FileDown size={16} className="text-blue-700" />} Word
                  </button>
                  <Link to={`/de-thi/${e.id}/in?ma=${sel}`} className="btn-secondary">
                    <Printer size={16} /> In / PDF
                  </Link>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className="btn-secondary" disabled={busy} onClick={() => exportKey(e)}>
                    <KeyRound size={16} className="text-amber-600" /> Đáp án + lời giải (Word)
                  </button>
                  <button className="btn-secondary" disabled={busy} onClick={() => exportKeyExcel(e)}>
                    Đáp án (Excel)
                  </button>
                  <button className="btn-secondary" disabled={busy} onClick={() => exportMatrix(e)}>
                    <Grid3x3 size={16} className="text-violet-600" /> Ma trận + đặc tả (Word)
                  </button>
                  <button className="btn-primary" disabled={busy} onClick={() => exportAll(e)}>
                    <Archive size={16} /> Tải trọn bộ (.zip)
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
