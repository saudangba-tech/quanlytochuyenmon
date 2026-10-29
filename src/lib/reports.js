// Biên bản họp tổ & phiếu dự giờ (Word) – trình bày theo thể thức văn bản hành chính (NĐ 30/2020)
import { DocxBuilder, para, run, headerTable } from './docx.js';
import { formatDate, fmtPoints } from './utils.js';

const NATION = [
  { text: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', bold: true, size: 12 },
  { text: 'Độc lập – Tự do – Hạnh phúc', bold: true, size: 13, underline: true },
];

function orgHeader(settings) {
  return [{ text: (settings.schoolName || '').toUpperCase(), size: 12 }, { text: (settings.groupName || '').toUpperCase(), bold: true, size: 12, underline: true }];
}

function dateLine(settings, iso) {
  const [y, m, d] = (iso || '').split('-');
  return `${settings.location ? settings.location + ', ' : ''}ngày ${d || '…'} tháng ${m || '…'} năm ${y || '……'}`;
}

const p13 = (text, opts = {}, style = {}) => para(run(text, { size: 13, ...style }), { align: 'justify', after: 3, line: 1.15, ...opts });
const heading = (text) => para(run(text, { size: 13, bold: true }), { before: 6, after: 3, keepNext: true });

function signatures(b, left, right) {
  const cell = (title, name) => ({
    xml: [
      para(run(title, { bold: true, size: 13 }), { align: 'center' }),
      para(run('(Ký, ghi rõ họ tên)', { italic: true, size: 12 }), { align: 'center' }),
      para('', { after: 50 }),
      para(run(name || '', { bold: true, size: 13 }), { align: 'center' }),
    ].join(''),
    vAlign: 'top',
  });
  b.table([[cell(left.title, left.name), cell(right.title, right.name)]], { borders: false });
}

/**
 * meeting: { date, time, endTime, place, chair, secretary, attendees, absent, periodLabel, workReview, planNext, opinions }
 * stats: [{label, value}] ; rows: [{name, role, points, rating}]
 */
export async function buildMeetingMinutesDocx({ settings, meeting, stats, rows }) {
  const b = new DocxBuilder({ fontSize: 13, margins: { top: 2, bottom: 2, left: 3, right: 1.5 } });
  headerTable(b, orgHeader(settings), NATION, [6, b.contentWidth - 6]);
  b.add(para(run(dateLine(settings, meeting.date), { italic: true, size: 13 }), { align: 'right', before: 6 }));
  b.add(para(run('BIÊN BẢN', { bold: true, size: 14 }), { align: 'center', before: 12 }));
  b.add(para(run(`Họp tổ chuyên môn ${meeting.periodLabel || ''}`.trim(), { bold: true, size: 14 }), { align: 'center', after: 12 }));

  b.add(p13(`Thời gian: ${meeting.time || '… giờ …'}, ngày ${formatDate(meeting.date)}.`, { firstLine: 1 }));
  b.add(p13(`Địa điểm: ${meeting.place || '…'}.`, { firstLine: 1 }));
  b.add(p13(`Thành phần: ${meeting.attendees || '…'}.`, { firstLine: 1 }));
  b.add(p13(`Vắng: ${meeting.absent || 'không'}.`, { firstLine: 1 }));
  b.add(p13(`Chủ trì: ${meeting.chair || '…'}. Thư ký: ${meeting.secretary || '…'}.`, { firstLine: 1 }));

  b.add(heading('NỘI DUNG'));
  b.add(heading('1. Đánh giá công tác chuyên môn của tổ'));
  for (const s of stats) b.add(p13(`- ${s.label}: ${s.value}.`, { firstLine: 1 }));
  if (meeting.workReview) for (const line of meeting.workReview.split('\n').filter(Boolean)) b.add(p13(line, { firstLine: 1 }));

  b.add(heading('2. Tổng hợp điểm thi đua và xếp loại'));
  b.table(
    [
      ['STT', 'Họ và tên', 'Chức vụ', 'Điểm', 'Xếp loại'],
      ...rows.map((r, i) => [
        { text: String(i + 1), align: 'center' },
        r.name,
        { text: r.role, align: 'center' },
        { text: fmtPoints(r.points), align: 'center' },
        { text: r.rating, align: 'center' },
      ]),
    ],
    { widths: [1.2, 6.3, 3, 2.2, 3.8], header: true, fontSize: 12 }
  );

  b.add(heading('3. Phương hướng, nhiệm vụ thời gian tới'));
  for (const line of (meeting.planNext || '…').split('\n').filter(Boolean)) b.add(p13(line, { firstLine: 1 }));

  b.add(heading('4. Ý kiến thảo luận'));
  for (const line of (meeting.opinions || 'Các thành viên nhất trí với nội dung cuộc họp.').split('\n').filter(Boolean)) b.add(p13(line, { firstLine: 1 }));

  b.add(p13(`Cuộc họp kết thúc lúc ${meeting.endTime || '… giờ …'} cùng ngày. Biên bản đã được thông qua trước toàn tổ và các thành viên nhất trí 100%.`, { firstLine: 1, before: 6 }));
  b.add(para('', { after: 6 }));
  signatures(b, { title: 'THƯ KÝ', name: meeting.secretary }, { title: 'CHỦ TRÌ', name: meeting.chair });
  return b.toBlob();
}

// Phiếu dự giờ / thao giảng
export async function buildObservationDocx(record, settings) {
  const d = record.details || {};
  const b = new DocxBuilder({ fontSize: 13, margins: { top: 2, bottom: 2, left: 3, right: 1.5 } });
  headerTable(b, orgHeader(settings), NATION, [6, b.contentWidth - 6]);
  b.add(para(run(record.category === 'thao_giang' ? 'PHIẾU ĐÁNH GIÁ TIẾT DẠY THAO GIẢNG' : 'PHIẾU DỰ GIỜ', { bold: true, size: 14 }), { align: 'center', before: 18, after: 12 }));
  const lines = [
    `Họ và tên người dạy: ${d.teacherName || ''}`,
    `Tên bài dạy: ${d.lesson || record.title || ''}`,
    `Lớp: ${d.className || ''}     Tiết: ${d.period || ''}     Ngày: ${formatDate(record.date)}`,
    `Người dự giờ: ${d.observerName || record.createdByName || ''}`,
  ];
  lines.forEach((l) => b.add(p13(l)));
  b.add(heading('I. Nhận xét tiết dạy'));
  b.add(p13('1. Ưu điểm:', {}, { bold: true }));
  (d.strengths || '……………………………………………').split('\n').forEach((l) => b.add(p13(l, { indent: 0.5 })));
  b.add(p13('2. Hạn chế:', {}, { bold: true }));
  (d.weaknesses || '……………………………………………').split('\n').forEach((l) => b.add(p13(l, { indent: 0.5 })));
  b.add(p13('3. Đề nghị, góp ý:', {}, { bold: true }));
  (d.suggestions || '……………………………………………').split('\n').forEach((l) => b.add(p13(l, { indent: 0.5 })));
  b.add(heading('II. Xếp loại tiết dạy'));
  b.add(p13(`Xếp loại: ${d.rating || '…………'}`, {}, { bold: true }));
  b.add(para('', { after: 6 }));
  signatures(b, { title: 'NGƯỜI DẠY', name: d.teacherName }, { title: 'NGƯỜI DỰ GIỜ', name: d.observerName || record.createdByName });
  return b.toBlob();
}
