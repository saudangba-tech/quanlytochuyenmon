import { Fragment, useEffect, useMemo, useState } from 'react';
import { Trophy, FileSpreadsheet, FileText, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useMembers } from '../lib/hooks.js';
import { fetchWhere, cached, invalidate } from '../lib/db.js';
import { BANK_CRITERION, ROLES } from '../lib/constants.js';
import {
  currentSchoolYear,
  schoolYearOptions,
  monthsOfSchoolYear,
  formatMonth,
  formatDate,
  fmtPoints,
  classify,
  RATING_COLORS,
  todayISO,
  monthOf,
  downloadBlob,
  safeFileName,
} from '../lib/utils.js';
import { PageHeader, PageLoader, Empty, Modal, Field, Badge, Spinner, useAsync } from '../components/ui.jsx';
import { criterionName } from './Records.jsx';

const SEMESTERS = { HK1: 'Học kỳ I', HK2: 'Học kỳ II' };

export function useLeaderboard(sy, period) {
  const { settings } = useAuth();
  const { members, loading: lm } = useMembers();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    cached(`rec:${sy}`, () => fetchWhere('records', [['schoolYear', '==', sy]]))
      .then((d) => alive && setRecords(d))
      .catch(console.error)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [sy, tick]);

  const result = useMemo(() => {
    const groupOf = (cat) => (cat === BANK_CRITERION.id ? BANK_CRITERION.group : settings.criteria.find((c) => c.id === cat)?.group || 'Khác');
    const groups = [BANK_CRITERION.group, ...new Set(settings.criteria.map((c) => c.group))].filter((g, i, a) => a.indexOf(g) === i);
    const inPeriod = records.filter(
      (r) =>
        r.status === 'approved' &&
        (period.type === 'year' || (period.type === 'month' && r.month === period.month) || (period.type === 'semester' && r.semester === period.semester))
    );
    const th = settings.thresholds[period.type] || settings.thresholds.month;
    const byUser = new Map(members.map((m) => [m.id, { id: m.id, name: m.name, role: ROLES[m.role]?.name || '', groups: {}, points: 0, items: [] }]));
    for (const r of inPeriod) {
      if (!byUser.has(r.userId)) byUser.set(r.userId, { id: r.userId, name: r.userName, role: '', groups: {}, points: 0, items: [] });
      const u = byUser.get(r.userId);
      const g = groupOf(r.category);
      const p = Number(r.points) || 0;
      u.groups[g] = (u.groups[g] || 0) + p;
      u.points += p;
      u.items.push(r);
    }
    const rows = [...byUser.values()]
      .map((u) => ({ ...u, rating: classify(u.points, th) }))
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'vi'));
    const count = (cat) => inPeriod.filter((r) => r.category === cat).length;
    const stats = [
      { label: 'Số câu hỏi được duyệt vào ngân hàng', value: inPeriod.filter((r) => r.category === BANK_CRITERION.id).reduce((s, r) => s + (r.count || 0), 0) },
      { label: 'Số tiết dự giờ', value: count('du_gio') },
      { label: 'Số tiết thao giảng / chuyên đề', value: count('thao_giang') },
      { label: 'Số đề kiểm tra được đóng góp', value: count('de_thi') },
      { label: 'Thành tích (HSG, KHKT, SKKN, GVG…)', value: ['hsg', 'khkt', 'skkn', 'gvg'].reduce((s, c) => s + count(c), 0) },
    ];
    return { rows, groups, stats, thresholds: th, inPeriod };
  }, [records, members, period, settings]);

  return { ...result, loading: loading || lm, members, reload: () => (invalidate(`rec:${sy}`), setTick((t) => t + 1)) };
}

export function periodLabel(period, sy) {
  if (period.type === 'month') return `${formatMonth(period.month).toLowerCase()}`;
  if (period.type === 'semester') return `${SEMESTERS[period.semester].toLowerCase()} năm học ${sy.replace('-', ' – ')}`;
  return `năm học ${sy.replace('-', ' – ')}`;
}

export default function Leaderboard() {
  const { settings, isManager } = useAuth();
  const [sy, setSy] = useState(currentSchoolYear(settings));
  const [period, setPeriod] = useState({ type: 'month', month: monthOf(todayISO()), semester: 'HK1' });
  const { rows, groups, stats, thresholds, inPeriod, loading, reload } = useLeaderboard(sy, period);
  const [open, setOpen] = useState(null);
  const [minutesOpen, setMinutesOpen] = useState(false);
  const [busy, run] = useAsync();
  const label = periodLabel(period, sy);
  const max = Math.max(1, ...rows.map((r) => r.points));

  async function exportExcel() {
    await run(async () => {
      const { exportXlsx } = await import('../lib/excel.js');
      const summaryCols = [
        { header: 'STT', key: 'stt', width: 6 },
        { header: 'Họ và tên', key: 'name', width: 28 },
        { header: 'Chức vụ', key: 'role', width: 12 },
        ...groups.map((g) => ({ header: g, key: g, width: 16 })),
        { header: 'Tổng điểm', key: 'points', width: 12 },
        { header: 'Xếp loại', key: 'rating', width: 12 },
      ];
      const summaryRows = rows.map((r, i) => ({ stt: i + 1, name: r.name, role: r.role, ...Object.fromEntries(groups.map((g) => [g, r.groups[g] || 0])), points: r.points, rating: r.rating }));
      const detailRows = [...inPeriod]
        .sort((a, b) => (a.userName || '').localeCompare(b.userName || '', 'vi') || (a.date || '').localeCompare(b.date || ''))
        .map((r) => ({
          date: r.category === BANK_CRITERION.id ? formatMonth(r.month) : formatDate(r.date),
          name: r.userName,
          crit: criterionName(settings, r.category),
          title: r.title,
          points: Number(r.points) || 0,
          by: r.reviewedByName || r.createdByName || '',
        }));
      await exportXlsx(`Thi_dua_${safeFileName(label)}.xlsx`, [
        {
          name: 'Tổng hợp',
          title: `BẢNG TỔNG HỢP ĐIỂM THI ĐUA ${settings.groupName.toUpperCase()}`,
          subtitle: `${settings.schoolName} – ${label}`,
          columns: summaryCols,
          rows: summaryRows,
        },
        {
          name: 'Chi tiết',
          title: 'CHI TIẾT HỒ SƠ ĐƯỢC GHI NHẬN',
          subtitle: label,
          columns: [
            { header: 'Thời gian', key: 'date', width: 14 },
            { header: 'Giáo viên', key: 'name', width: 26 },
            { header: 'Tiêu chí', key: 'crit', width: 34 },
            { header: 'Nội dung', key: 'title', width: 50 },
            { header: 'Điểm', key: 'points', width: 8 },
            { header: 'Người duyệt', key: 'by', width: 22 },
          ],
          rows: detailRows,
        },
      ]);
    }, 'Đã xuất file Excel.');
  }

  return (
    <div>
      <PageHeader
        title="Xếp hạng & báo cáo thi đua"
        subtitle={`Tổng hợp tự động từ câu hỏi được duyệt và hồ sơ chuyên môn – ${label}`}
        actions={
          <>
            <button className="btn-secondary" onClick={reload} title="Tải lại">
              <RefreshCw size={16} />
            </button>
            <button className="btn-secondary" onClick={exportExcel} disabled={busy || loading}>
              <FileSpreadsheet size={16} className="text-emerald-700" /> Xuất Excel
            </button>
            {isManager && (
              <button className="btn-primary" onClick={() => setMinutesOpen(true)} disabled={loading}>
                <FileText size={16} /> Biên bản họp tổ (Word)
              </button>
            )}
          </>
        }
      />

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-4">
        <select className="input" value={sy} onChange={(e) => setSy(e.target.value)}>
          {schoolYearOptions().map((y) => (
            <option key={y} value={y}>
              Năm học {y}
            </option>
          ))}
        </select>
        <select className="input" value={period.type} onChange={(e) => setPeriod({ ...period, type: e.target.value })}>
          <option value="month">Theo tháng</option>
          <option value="semester">Theo học kỳ</option>
          <option value="year">Cả năm học</option>
        </select>
        {period.type === 'month' && (
          <select className="input" value={period.month} onChange={(e) => setPeriod({ ...period, month: e.target.value })}>
            {monthsOfSchoolYear(sy).map((m) => (
              <option key={m} value={m}>
                {formatMonth(m)}
              </option>
            ))}
          </select>
        )}
        {period.type === 'semester' && (
          <select className="input" value={period.semester} onChange={(e) => setPeriod({ ...period, semester: e.target.value })}>
            {Object.entries(SEMESTERS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        )}
        <div className="flex items-center text-xs text-slate-500">
          Ngưỡng: Tốt ≥ {thresholds.tot} • Khá ≥ {thresholds.kha} • Đạt ≥ {thresholds.dat}
        </div>
      </div>

      {loading ? (
        <PageLoader />
      ) : !rows.length ? (
        <Empty icon={Trophy} title="Chưa có dữ liệu thi đua" />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {stats.map((s) => (
              <div key={s.label} className="card p-3">
                <div className="text-2xl font-bold text-blue-700">{s.value}</div>
                <div className="text-xs text-slate-500">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="card overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="w-10">#</th>
                  <th>Giáo viên</th>
                  {groups.map((g) => (
                    <th key={g} className="text-right">
                      {g}
                    </th>
                  ))}
                  <th className="text-right">Tổng</th>
                  <th>Xếp loại</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <Fragment key={r.id}>
                    <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(open === r.id ? null : r.id)}>
                      <td className="font-bold text-slate-400">{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td>
                      <td className="min-w-52">
                        <div className="flex items-center gap-1 font-medium">
                          {open === r.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {r.name}
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                          <div className="h-1.5 rounded-full bg-blue-600" style={{ width: `${Math.max(0, (r.points / max) * 100)}%` }} />
                        </div>
                      </td>
                      {groups.map((g) => (
                        <td key={g} className="text-right">
                          {r.groups[g] ? fmtPoints(r.groups[g]) : '–'}
                        </td>
                      ))}
                      <td className="text-right text-base font-bold">{fmtPoints(r.points)}</td>
                      <td>
                        <Badge className={RATING_COLORS[r.rating]}>{r.rating}</Badge>
                      </td>
                    </tr>
                    {open === r.id && (
                      <tr>
                        <td />
                        <td colSpan={groups.length + 3} className="bg-slate-50">
                          {r.items.length ? (
                            <ul className="space-y-1 text-sm">
                              {[...r.items]
                                .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
                                .map((it) => (
                                  <li key={it.id} className="flex justify-between gap-3">
                                    <span>
                                      <span className="text-slate-400">{it.category === BANK_CRITERION.id ? formatMonth(it.month) : formatDate(it.date)}</span> – {it.title}
                                    </span>
                                    <b className={it.points < 0 ? 'text-red-600' : 'text-emerald-700'}>{fmtPoints(it.points)}</b>
                                  </li>
                                ))}
                            </ul>
                          ) : (
                            <span className="text-sm text-slate-400">Chưa có hồ sơ trong kỳ này.</span>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {minutesOpen && <MinutesModal onClose={() => setMinutesOpen(false)} rows={rows} stats={stats} label={label} />}
    </div>
  );
}

function MinutesModal({ onClose, rows, stats, label }) {
  const { settings, me } = useAuth();
  const [busy, run] = useAsync();
  const [m, setM] = useState({
    date: todayISO(),
    time: '14 giờ 00',
    endTime: '16 giờ 30',
    place: `Phòng họp ${settings.groupName}`,
    chair: rows.find((r) => r.role === 'Tổ trưởng')?.name || me.name,
    secretary: '',
    attendees: `${rows.length}/${rows.length} thành viên của tổ`,
    absent: '',
    workReview: '',
    planNext: '',
    opinions: '',
  });
  const set = (k) => (e) => setM({ ...m, [k]: e.target.value });

  async function exportDoc() {
    await run(async () => {
      const { buildMeetingMinutesDocx } = await import('../lib/reports.js');
      const blob = await buildMeetingMinutesDocx({
        settings,
        meeting: { ...m, periodLabel: label },
        stats: stats.map((s) => ({ ...s, value: String(s.value) })),
        rows,
      });
      downloadBlob(blob, `Bien_ban_hop_to_${safeFileName(label)}.docx`);
    }, 'Đã xuất biên bản.');
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Biên bản họp tổ – ${label}`}
      size="max-w-3xl"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Đóng
          </button>
          <button className="btn-primary" onClick={exportDoc} disabled={busy}>
            {busy ? <Spinner /> : <FileText size={16} />} Xuất file Word
          </button>
        </>
      }
    >
      <p className="mb-4 text-sm text-slate-500">Phần thống kê công việc và bảng xếp loại thi đua được điền tự động. Thầy/cô bổ sung thông tin cuộc họp bên dưới.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Ngày họp">
          <input type="date" className="input" value={m.date} onChange={set('date')} />
        </Field>
        <Field label="Bắt đầu">
          <input className="input" value={m.time} onChange={set('time')} />
        </Field>
        <Field label="Kết thúc">
          <input className="input" value={m.endTime} onChange={set('endTime')} />
        </Field>
        <Field label="Địa điểm" className="sm:col-span-3">
          <input className="input" value={m.place} onChange={set('place')} />
        </Field>
        <Field label="Chủ trì">
          <input className="input" value={m.chair} onChange={set('chair')} />
        </Field>
        <Field label="Thư ký">
          <input className="input" value={m.secretary} onChange={set('secretary')} />
        </Field>
        <Field label="Thành phần">
          <input className="input" value={m.attendees} onChange={set('attendees')} />
        </Field>
        <Field label="Vắng (ghi rõ lý do)" className="sm:col-span-3">
          <input className="input" value={m.absent} onChange={set('absent')} placeholder="Không" />
        </Field>
      </div>
      <div className="mt-3 space-y-3">
        <Field label="Đánh giá thêm về công tác chuyên môn (mỗi ý một dòng)">
          <textarea className="input min-h-20" value={m.workReview} onChange={set('workReview')} placeholder="- Thực hiện đúng, đủ chương trình…" />
        </Field>
        <Field label="Phương hướng, nhiệm vụ thời gian tới">
          <textarea className="input min-h-20" value={m.planNext} onChange={set('planNext')} placeholder="- Tiếp tục xây dựng ngân hàng câu hỏi chuyên đề…" />
        </Field>
        <Field label="Ý kiến thảo luận">
          <textarea className="input min-h-16" value={m.opinions} onChange={set('opinions')} />
        </Field>
      </div>
    </Modal>
  );
}
