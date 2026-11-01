import { MathText } from '../lib/math.jsx';
import { LEVELS, STATUS, typeName } from '../lib/constants.js';
import { Badge } from './ui.jsx';

export function QuestionMeta({ q, showStatus = true }) {
  const lv = LEVELS.find((l) => l.id === q.level);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge className="bg-slate-100 text-slate-700">Lớp {q.grade}</Badge>
      <Badge className="bg-indigo-50 text-indigo-700">{typeName(q.type)}</Badge>
      {lv && <Badge className={lv.color}>{lv.name}</Badge>}
      {showStatus && q.status && <Badge className={STATUS[q.status]?.color}>{STATUS[q.status]?.name}</Badge>}
      {q.idCode && <Badge className="bg-amber-50 font-mono text-amber-800">{q.idCode}</Badge>}
      {q.topic && <span className="truncate text-xs text-slate-500">• {q.topic}</span>}
    </div>
  );
}

// Hiển thị nội dung câu hỏi (kèm đáp án nếu showAnswer)
export default function QuestionView({ q, showAnswer = true, showSolution = false }) {
  return (
    <div className="space-y-2">
      <MathText text={q.content} />
      {q.image?.data && <img src={q.image.data} alt="Hình minh họa" className="max-h-72 rounded border border-slate-200" />}
      {q.type === 'mcq' && (
        <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
          {(q.options || []).map((o, i) => {
            const L = 'ABCD'[i];
            const correct = showAnswer && q.answer === L;
            return (
              <div key={i} className={`flex gap-1.5 rounded px-1.5 py-0.5 ${correct ? 'bg-emerald-50 ring-1 ring-emerald-300' : ''}`}>
                <b className={correct ? 'text-emerald-700' : 'text-blue-700'}>{L}.</b>
                <MathText text={o} as="span" />
              </div>
            );
          })}
        </div>
      )}
      {q.type === 'tf' && (
        <div className="space-y-1">
          {(q.statements || []).map((s, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <b className="text-blue-700">{'abcd'[i]})</b>
              <MathText text={s} as="span" className="flex-1" />
              {showAnswer && q.answer && (
                <Badge className={q.answer[i] ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}>{q.answer[i] ? 'Đúng' : 'Sai'}</Badge>
              )}
            </div>
          ))}
        </div>
      )}
      {q.type === 'short' && showAnswer && (
        <div className="text-sm">
          <b className="text-emerald-700">Đáp án:</b> <MathText text={String(q.answer ?? '')} as="span" />
        </div>
      )}
      {showSolution && q.solution && (
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <div className="mb-1 font-semibold text-slate-600">Lời giải</div>
          <MathText text={q.solution} />
        </div>
      )}
    </div>
  );
}
