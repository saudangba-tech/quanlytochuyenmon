import { useState } from 'react';
import { setDoc, getDocs, writeBatch, doc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { Save, Plus, Trash2, Download, Upload, RotateCcw } from 'lucide-react';
import { db } from '../firebase.js';
import { useAuth } from '../context/AuthContext.jsx';
import { col, ref, invalidate } from '../lib/db.js';
import { LEVELS, DEFAULT_TOPICS, DEFAULT_CRITERIA } from '../lib/constants.js';
import { todayISO, downloadBlob, schoolYearOf } from '../lib/utils.js';
import { PageHeader, Field, Spinner, useAsync, useToast } from '../components/ui.jsx';

const BACKUP_COLLECTIONS = ['settings', 'users', 'questions', 'records', 'exams'];
const FORMS = { achievement: 'Thành tích / chung', observation: 'Dự giờ / thao giảng', discipline: 'Nề nếp (Tổ trưởng ghi)' };

function Section({ title, children, desc }) {
  return (
    <section className="card p-5">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      {desc && <p className="mt-0.5 mb-3 text-sm text-slate-500">{desc}</p>}
      <div className={desc ? '' : 'mt-3'}>{children}</div>
    </section>
  );
}

// Firestore Timestamp ⇄ JSON
const toJSON = (v) => {
  if (v instanceof Timestamp) return { __ts: v.toMillis() };
  if (Array.isArray(v)) return v.map(toJSON);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toJSON(x)]));
  return v;
};
const fromJSON = (v) => {
  if (v && typeof v === 'object' && '__ts' in v) return Timestamp.fromMillis(v.__ts);
  if (Array.isArray(v)) return v.map(fromJSON);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fromJSON(x)]));
  return v;
};

export default function SettingsPage() {
  const { settings } = useAuth();
  const toast = useToast();
  const [s, setS] = useState(() => ({
    ...settings,
    gradesText: settings.grades.join(', '),
    topicsText: Object.fromEntries(settings.grades.map((g) => [g, (settings.topics[g] || []).join('\n')])),
  }));
  const [busy, run] = useAsync();
  const set = (k) => (e) => setS({ ...s, [k]: e.target.value });
  const grades = s.gradesText
    .split(/[,;\s]+/)
    .map(Number)
    .filter((n) => n >= 1 && n <= 12);

  async function save() {
    if (!grades.length) return toast('Danh sách khối lớp không hợp lệ.', 'error');
    const topics = Object.fromEntries(
      grades.map((g) => [
        g,
        (s.topicsText[g] ?? (DEFAULT_TOPICS[g] || []).join('\n'))
          .split('\n')
          .map((t) => t.trim())
          .filter(Boolean),
      ])
    );
    const criteria = s.criteria
      .filter((c) => c.name.trim())
      .map((c) => ({ ...c, name: c.name.trim(), group: (c.group || 'Khác').trim(), points: Number(c.points) || 0 }));
    const data = {
      departmentName: s.departmentName.trim(),
      schoolName: s.schoolName.trim(),
      groupName: s.groupName.trim(),
      subject: s.subject.trim(),
      location: (s.location || '').trim(),
      schoolYear: (s.schoolYear || '').trim(),
      grades,
      topics,
      questionPoints: Object.fromEntries(LEVELS.map((l) => [l.id, Number(s.questionPoints[l.id]) || 0])),
      criteria,
      thresholds: Object.fromEntries(
        ['month', 'semester', 'year'].map((k) => [k, Object.fromEntries(['tot', 'kha', 'dat'].map((r) => [r, Number(s.thresholds[k][r]) || 0]))])
      ),
      updatedAt: serverTimestamp(),
    };
    await run(() => setDoc(ref('settings', 'app'), data, { merge: true }), 'Đã lưu cài đặt.');
  }

  const setCrit = (i, patch) => setS({ ...s, criteria: s.criteria.map((c, k) => (k === i ? { ...c, ...patch } : c)) });

  async function backup() {
    await run(async () => {
      const out = { app: 'to-chuyen-mon', version: 1, exportedAt: new Date().toISOString(), data: {} };
      for (const name of BACKUP_COLLECTIONS) {
        const snap = await getDocs(col(name));
        out.data[name] = snap.docs.map((d) => ({ id: d.id, ...toJSON(d.data()) }));
      }
      downloadBlob(new Blob([JSON.stringify(out)], { type: 'application/json' }), `sao-luu-to-chuyen-mon-${todayISO()}.json`);
    }, 'Đã tải file sao lưu.');
  }

  async function restore(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!confirm('Khôi phục sẽ GHI ĐÈ các bản ghi trùng mã trong file sao lưu. Tiếp tục?')) return;
    await run(async () => {
      const json = JSON.parse(await file.text());
      if (json.app !== 'to-chuyen-mon') throw new Error('File không phải bản sao lưu của phần mềm này.');
      let n = 0;
      for (const name of BACKUP_COLLECTIONS) {
        const docs = json.data?.[name] || [];
        for (let i = 0; i < docs.length; i += 400) {
          const batch = writeBatch(db);
          for (const { id, ...rest } of docs.slice(i, i + 400)) {
            batch.set(doc(db, name, id), fromJSON(rest));
            n++;
          }
          await batch.commit();
        }
      }
      invalidate('');
      toast(`Đã khôi phục ${n} bản ghi.`);
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cài đặt"
        subtitle="Chỉ Tổ trưởng chỉnh sửa được trang này."
        actions={
          <button className="btn-primary" onClick={save} disabled={busy}>
            {busy ? <Spinner /> : <Save size={16} />} Lưu cài đặt
          </button>
        }
      />

      <Section title="Thông tin chung">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Cơ quan chủ quản">
            <input className="input" value={s.departmentName} onChange={set('departmentName')} />
          </Field>
          <Field label="Tên trường">
            <input className="input" value={s.schoolName} onChange={set('schoolName')} />
          </Field>
          <Field label="Tên tổ">
            <input className="input" value={s.groupName} onChange={set('groupName')} />
          </Field>
          <Field label="Môn học">
            <input className="input" value={s.subject} onChange={set('subject')} />
          </Field>
          <Field label="Địa danh (dùng trong biên bản)" hint="Ví dụ: Hà Nội">
            <input className="input" value={s.location || ''} onChange={set('location')} />
          </Field>
          <Field label="Năm học hiện tại" hint={`Để trống = tự động (${schoolYearOf(todayISO())})`}>
            <input className="input" value={s.schoolYear || ''} onChange={set('schoolYear')} placeholder="2026-2027" />
          </Field>
          <Field label="Các khối lớp" hint="Cách nhau bởi dấu phẩy, ví dụ: 10, 11, 12">
            <input className="input" value={s.gradesText} onChange={set('gradesText')} />
          </Field>
        </div>
      </Section>

      <Section title="Chuyên đề theo khối" desc="Mỗi dòng một chuyên đề. Giáo viên chọn chuyên đề khi nhập câu hỏi; ma trận đề dùng danh sách này.">
        <div className="grid gap-3 lg:grid-cols-3">
          {grades.map((g) => (
            <Field key={g} label={`Lớp ${g}`}>
              <textarea
                className="input min-h-48 text-[13px]"
                value={s.topicsText[g] ?? (DEFAULT_TOPICS[g] || []).join('\n')}
                onChange={(e) => setS({ ...s, topicsText: { ...s.topicsText, [g]: e.target.value } })}
              />
            </Field>
          ))}
        </div>
      </Section>

      <Section title="Điểm thi đua khi câu hỏi được duyệt" desc="Cộng tự động cho người đóng góp, theo mức độ của câu hỏi.">
        <div className="grid gap-3 sm:grid-cols-4">
          {LEVELS.map((l) => (
            <Field key={l.id} label={l.name}>
              <input
                type="number"
                step="0.25"
                className="input"
                value={s.questionPoints[l.id]}
                onChange={(e) => setS({ ...s, questionPoints: { ...s.questionPoints, [l.id]: e.target.value } })}
              />
            </Field>
          ))}
        </div>
      </Section>

      <Section title="Tiêu chí thi đua" desc="Điểm âm dùng cho vi phạm. “Chỉ TT/TP ghi” nghĩa là giáo viên không tự khai báo được.">
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Tên tiêu chí</th>
                <th>Nhóm</th>
                <th>Điểm</th>
                <th>Biểu mẫu</th>
                <th>Chỉ TT/TP ghi</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {s.criteria.map((c, i) => (
                <tr key={c.id}>
                  <td className="min-w-64">
                    <input className="input" value={c.name} onChange={(e) => setCrit(i, { name: e.target.value })} />
                  </td>
                  <td className="min-w-40">
                    <input className="input" value={c.group} onChange={(e) => setCrit(i, { group: e.target.value })} />
                  </td>
                  <td>
                    <input type="number" step="0.5" className="input w-20" value={c.points} onChange={(e) => setCrit(i, { points: e.target.value })} />
                  </td>
                  <td>
                    <select className="input w-44" value={c.form} onChange={(e) => setCrit(i, { form: e.target.value })}>
                      {Object.entries(FORMS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="text-center">
                    <input type="checkbox" checked={Boolean(c.managerOnly)} onChange={(e) => setCrit(i, { managerOnly: e.target.checked })} />
                  </td>
                  <td>
                    <button
                      className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                      title="Xóa tiêu chí"
                      onClick={() => confirm('Xóa tiêu chí này? Hồ sơ cũ vẫn giữ điểm.') && setS({ ...s, criteria: s.criteria.filter((_, k) => k !== i) })}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            className="btn-secondary"
            onClick={() => setS({ ...s, criteria: [...s.criteria, { id: `tc_${Date.now().toString(36)}`, name: '', group: 'Khác', points: 1, form: 'achievement' }] })}
          >
            <Plus size={16} /> Thêm tiêu chí
          </button>
          <button className="btn-secondary" onClick={() => confirm('Khôi phục bộ tiêu chí mặc định?') && setS({ ...s, criteria: DEFAULT_CRITERIA })}>
            <RotateCcw size={16} /> Mặc định
          </button>
        </div>
      </Section>

      <Section title="Ngưỡng xếp loại thi đua" desc="Tổng điểm trong kỳ đạt từ ngưỡng trở lên.">
        <div className="overflow-x-auto">
          <table className="table-base max-w-xl">
            <thead>
              <tr>
                <th>Kỳ</th>
                <th>Tốt</th>
                <th>Khá</th>
                <th>Đạt</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['month', 'Tháng'],
                ['semester', 'Học kỳ'],
                ['year', 'Năm học'],
              ].map(([k, label]) => (
                <tr key={k}>
                  <td className="font-medium">{label}</td>
                  {['tot', 'kha', 'dat'].map((r) => (
                    <td key={r}>
                      <input
                        type="number"
                        className="input w-24"
                        value={s.thresholds[k][r]}
                        onChange={(e) => setS({ ...s, thresholds: { ...s.thresholds, [k]: { ...s.thresholds[k], [r]: e.target.value } } })}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Sao lưu & khôi phục dữ liệu" desc="Nên tải bản sao lưu định kỳ (cuối mỗi tháng) và cất vào Google Drive của tổ.">
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={backup} disabled={busy}>
            <Download size={16} /> Tải bản sao lưu (.json)
          </button>
          <label className="btn-secondary cursor-pointer">
            <Upload size={16} /> Khôi phục từ file
            <input type="file" accept="application/json,.json" className="hidden" onChange={restore} />
          </label>
        </div>
      </Section>
    </div>
  );
}
