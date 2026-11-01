// Xuất đề thi & đáp án ra Word
import { DocxBuilder, para, run, mathRuns, tab, headerTable, esc } from './docx.js';
import { plainLength } from './utils.js';

export const LETTERS = ['A', 'B', 'C', 'D'];
export const PART_ORDER = ['mcq', 'tf', 'short', 'essay'];
const ROMAN = ['I', 'II', 'III', 'IV'];

export const PART_TITLES = {
  mcq: (n) => `Câu trắc nghiệm nhiều phương án lựa chọn. Thí sinh trả lời từ câu 1 đến câu ${n}. Mỗi câu hỏi thí sinh chỉ chọn một phương án.`,
  tf: (n) => `Câu trắc nghiệm đúng sai. Thí sinh trả lời từ câu 1 đến câu ${n}. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.`,
  short: (n) => `Câu trắc nghiệm trả lời ngắn. Thí sinh trả lời từ câu 1 đến câu ${n}.`,
  essay: (n) => `Tự luận. Thí sinh trình bày lời giải từ câu 1 đến câu ${n}.`,
};

// Nhóm câu của một mã đề theo phần: [{type, items:[{q, perm, no}]}]
export function versionParts(version, qmap) {
  const parts = [];
  for (const type of PART_ORDER) {
    const items = version.items
      .map((it) => ({ ...it, q: qmap[it.id] }))
      .filter((it) => it.q && it.q.type === type)
      .map((it, i) => ({ ...it, no: i + 1 }));
    if (items.length) parts.push({ type, items });
  }
  return parts.map((p, i) => ({ ...p, roman: ROMAN[i] }));
}

// Phương án hiển thị theo hoán vị và đáp án đúng sau khi trộn
export function displayedOptions(q, perm) {
  const order = perm && perm.length === 4 ? perm : [0, 1, 2, 3];
  const options = order.map((k) => q.options?.[k] ?? '');
  const ansIdx = LETTERS.indexOf(q.answer);
  const correct = LETTERS[order.indexOf(ansIdx)] || '';
  return { options, correct };
}

// Câu Đúng/Sai sau khi trộn thứ tự ý a–d (perm[k] = ý gốc đứng ở vị trí k)
export function displayedStatements(q, perm) {
  const order = perm && perm.length === 4 ? perm : [0, 1, 2, 3];
  return { statements: order.map((k) => q.statements?.[k] ?? ''), answer: order.map((k) => q.answer?.[k]) };
}

export function tfAnswerText(q, perm) {
  return displayedStatements(q, perm).answer.map((v) => (v ? 'Đ' : 'S'));
}

function contentParagraphs(b, text, prefix, { indent = 0 } = {}) {
  const lines = String(text || '').split('\n');
  const out = [];
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    const isDisplay = /^\$\$[\s\S]+\$\$$/.test(trimmed) || /^\\\[[\s\S]+\\\]$/.test(trimmed);
    const runs = (i === 0 && prefix ? prefix : '') + mathRuns(line);
    out.push(para(runs, { align: isDisplay && !(i === 0 && prefix) ? 'center' : 'justify', indent, before: i === 0 ? 3 : 0 }));
  });
  return out;
}

function optionParagraphs(b, options) {
  const W = b.contentWidth;
  const maxLen = Math.max(...options.map(plainLength));
  const label = (j) => run(`${LETTERS[j]}. `, { bold: true });
  const cols = maxLen <= 22 ? 4 : maxLen <= 48 ? 2 : 1;
  const indent = 0.5;
  if (cols === 1) return options.map((o, j) => para(label(j) + mathRuns(o), { indent }));
  const step = (W - indent) / cols;
  // Vị trí tab trong Word tính từ lề trái trang
  const tabs = Array.from({ length: cols - 1 }, (_, k) => ({ pos: indent + step * (k + 1) }));
  const rows = [];
  for (let r = 0; r < 4 / cols; r++) {
    const cells = [];
    for (let c = 0; c < cols; c++) {
      const j = r * cols + c;
      cells.push((c ? tab() : '') + label(j) + mathRuns(options[j]));
    }
    rows.push(para(cells.join(''), { indent, tabs }));
  }
  return rows;
}

function imageParagraph(b, q, maxW = 7) {
  if (!q.image?.data) return [];
  const r = b.image(q.image.data, q.image.w, q.image.h, maxW);
  return r ? [para(r, { align: 'center', before: 2, after: 2 })] : [];
}

function examHeader(b, exam, settings, code) {
  headerTable(
    b,
    [
      { text: (settings.departmentName || '').toUpperCase() },
      { text: (settings.schoolName || '').toUpperCase(), bold: true },
      { text: '' },
      { text: exam.official ? 'ĐỀ CHÍNH THỨC' : '', bold: true },
    ],
    [
      { text: (exam.title || 'ĐỀ KIỂM TRA').toUpperCase(), bold: true },
      { text: `NĂM HỌC ${(exam.schoolYear || '').replace('-', ' – ')}`, bold: true },
      { text: `Môn: ${(settings.subject || 'Toán').toUpperCase()} – Lớp ${exam.grade}`, bold: true },
      { text: `Thời gian làm bài: ${exam.duration} phút, không kể thời gian phát đề`, italic: true },
    ]
  );
  const W = b.contentWidth;
  b.add(
    para(
      [run('Họ, tên thí sinh: ……………………………………………… Số báo danh: ……………'), tab(), run(code ? `Mã đề ${code}` : '', { bold: true })],
      { before: 8, after: 4, tabs: [{ pos: W, val: 'right' }] }
    )
  );
}

export async function buildExamDocx(exam, version, qmap, settings) {
  const b = new DocxBuilder({ fontSize: 12, footer: `Mã đề ${version.code}` });
  examHeader(b, exam, settings, version.code);
  for (const part of versionParts(version, qmap)) {
    b.add(para([run(`PHẦN ${part.roman}. `, { bold: true }), run(PART_TITLES[part.type](part.items.length))], { before: 6, after: 2, align: 'justify', keepNext: true }));
    for (const it of part.items) {
      const q = it.q;
      const prefix = run(`Câu ${it.no}. `, { bold: true });
      const pts = part.type === 'essay' && exam.points?.essay ? run(` (${String(exam.points.essay).replace('.', ',')} điểm)`, { italic: true }) : '';
      b.add(contentParagraphs(b, q.content, prefix));
      if (pts) b.add(para(pts, { align: 'right' }));
      b.add(imageParagraph(b, q));
      if (part.type === 'mcq') b.add(optionParagraphs(b, displayedOptions(q, it.perm).options));
      if (part.type === 'tf') displayedStatements(q, it.perm).statements.forEach((s, k) => b.add(para(run(`${'abcd'[k]}) `, { bold: true }) + mathRuns(s), { indent: 0.5 })));
    }
  }
  b.add(para(run('------ HẾT ------', { bold: true }), { align: 'center', before: 12 }));
  b.add(para(run('- Thí sinh không được sử dụng tài liệu;\n- Cán bộ coi thi không giải thích gì thêm.', { italic: true, size: 11 }), { before: 4 }));
  return b.toBlob();
}

function keyTables(b, exam, version, qmap) {
  const parts = versionParts(version, qmap);
  for (const part of parts) {
    if (part.type === 'essay') continue;
    b.add(para(run(`Phần ${part.roman}. ${{ mcq: 'Trắc nghiệm nhiều phương án', tf: 'Trắc nghiệm đúng sai', short: 'Trả lời ngắn' }[part.type]}`, { bold: true, italic: true }), { before: 4, after: 2 }));
    if (part.type === 'mcq') {
      const per = 10;
      for (let s = 0; s < part.items.length; s += per) {
        const chunk = part.items.slice(s, s + per);
        const w = b.contentWidth;
        const first = 2.2;
        const cw = (w - first) / per;
        b.table(
          [
            [{ text: 'Câu', bold: true, align: 'center' }, ...chunk.map((it) => ({ text: String(it.no), bold: true, align: 'center' })), ...Array(per - chunk.length).fill('')],
            [{ text: 'Đáp án', bold: true, align: 'center' }, ...chunk.map((it) => ({ text: displayedOptions(it.q, it.perm).correct, align: 'center' })), ...Array(per - chunk.length).fill('')],
          ],
          { widths: [first, ...Array(per).fill(cw)] }
        );
        b.add(para('', { after: 2 }));
      }
    }
    if (part.type === 'tf') {
      const w = b.contentWidth;
      b.table(
        [
          ['Câu', 'Ý a)', 'Ý b)', 'Ý c)', 'Ý d)'].map((t) => ({ text: t, bold: true, align: 'center' })),
          ...part.items.map((it) => [{ text: String(it.no), align: 'center' }, ...tfAnswerText(it.q, it.perm).map((t) => ({ text: t, align: 'center' }))]),
        ],
        { widths: [2.2, ...Array(4).fill((w - 2.2) / 4)] }
      );
      b.add(para('', { after: 2 }));
    }
    if (part.type === 'short') {
      const w = b.contentWidth;
      b.table(
        [
          [{ text: 'Câu', bold: true, align: 'center' }, { text: 'Đáp án', bold: true, align: 'center' }],
          ...part.items.map((it) => [{ text: String(it.no), align: 'center' }, { text: it.q.answer || '', align: 'center' }]),
        ],
        { widths: [2.2, Math.min(8, w - 2.2)], align: 'left' }
      );
      b.add(para('', { after: 2 }));
    }
  }
}

export async function buildAnswerDocx(exam, versions, qmap, settings, { solutionVersion } = {}) {
  const b = new DocxBuilder({ fontSize: 12 });
  headerTable(
    b,
    [{ text: (settings.departmentName || '').toUpperCase() }, { text: (settings.schoolName || '').toUpperCase(), bold: true }],
    [
      { text: 'ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM', bold: true },
      { text: (exam.title || '').toUpperCase(), bold: true },
      { text: `Môn: ${settings.subject || 'Toán'} – Lớp ${exam.grade} – Năm học ${(exam.schoolYear || '').replace('-', ' – ')}`, italic: true },
    ]
  );
  const p = exam.points || {};
  const notes = [];
  if (p.mcq) notes.push(`Phần I: mỗi câu trả lời đúng được ${String(p.mcq).replace('.', ',')} điểm.`);
  notes.push('Phần II: mỗi câu đúng 1 ý được 0,1 điểm; 2 ý: 0,25 điểm; 3 ý: 0,5 điểm; cả 4 ý: 1 điểm.');
  if (p.short) notes.push(`Phần III: mỗi câu trả lời đúng được ${String(p.short).replace('.', ',')} điểm.`);
  b.add(para(run(notes.join('\n'), { italic: true }), { before: 8, after: 4 }));

  for (const v of versions) {
    b.add(para(run(`MÃ ĐỀ ${v.code}`, { bold: true, size: 13 }), { before: 8, after: 2, keepNext: true }));
    keyTables(b, exam, v, qmap);
  }

  const sv = solutionVersion ? versions.find((v) => v.code === solutionVersion) : null;
  if (sv) {
    b.add(para(run(`LỜI GIẢI CHI TIẾT (theo mã đề ${sv.code})`, { bold: true, size: 13 }), { align: 'center', before: 12, after: 4 }));
    for (const part of versionParts(sv, qmap)) {
      b.add(para(run(`PHẦN ${part.roman}`, { bold: true }), { before: 6, keepNext: true }));
      for (const it of part.items) {
        const q = it.q;
        b.add(contentParagraphs(b, q.content, run(`Câu ${it.no}. `, { bold: true })));
        b.add(imageParagraph(b, q, 6));
        if (part.type === 'mcq') {
          const d = displayedOptions(q, it.perm);
          b.add(optionParagraphs(b, d.options));
          b.add(para(run(`Đáp án: ${d.correct}`, { bold: true, color: 'C00000' }), { before: 2 }));
        }
        if (part.type === 'tf') {
          const ans = tfAnswerText(q, it.perm);
          displayedStatements(q, it.perm).statements.forEach((s, k) =>
            b.add(para(run(`${'abcd'[k]}) `, { bold: true }) + mathRuns(s) + run(`  → ${ans[k] === 'Đ' ? 'Đúng' : 'Sai'}`, { bold: true, color: 'C00000' }), { indent: 0.5 }))
          );
        }
        if (part.type === 'short') b.add(para(run(`Đáp án: ${q.answer || ''}`, { bold: true, color: 'C00000' }), { before: 2 }));
        if (q.solution) {
          b.add(para(run('Lời giải:', { bold: true, italic: true }), { before: 2 }));
          b.add(contentParagraphs(b, q.solution, ''));
        }
      }
    }
  }
  return b.toBlob();
}

// ---------- Ma trận đề & bảng đặc tả câu hỏi (tính từ mã đề gốc) ----------
const LEVEL_IDS = ['NB', 'TH', 'VD', 'VDC'];
const LEVEL_NAMES = { NB: 'Biết', TH: 'Hiểu', VD: 'VD', VDC: 'VDC' };
const TYPE_TITLES = { mcq: 'TN nhiều lựa chọn', tf: 'TN Đúng/Sai', short: 'Trả lời ngắn', essay: 'Tự luận' };

export function examMatrix(exam, qmap) {
  const p = exam.points || {};
  const pointOf = (type) => ({ mcq: p.mcq ?? 0.25, tf: 1, short: p.short ?? 0.5, essay: p.essay ?? 1 })[type] || 0;
  const parts = versionParts(exam.versions[0], qmap);
  const types = parts.map((x) => x.type);
  const topics = [];
  const cells = {};
  for (const part of parts)
    for (const it of part.items) {
      const t = it.q.topic || '(Chưa phân chuyên đề)';
      if (!topics.includes(t)) topics.push(t);
      const k = `${t}|${part.type}|${it.q.level}`;
      cells[k] = (cells[k] || 0) + 1;
    }
  const total = parts.reduce((s, x) => s + x.items.reduce((a, it) => a + pointOf(x.type), 0), 0);
  return { parts, types, topics, cells, pointOf, total };
}

const fmt = (n) => String(Math.round(n * 100) / 100).replace('.', ',');

export async function buildMatrixDocx(exam, qmap, settings) {
  const b = new DocxBuilder({ fontSize: 11, landscape: true, margins: { top: 1.5, bottom: 1.5, left: 1.5, right: 1.5 } });
  const { parts, types, topics, cells, pointOf, total } = examMatrix(exam, qmap);
  headerTable(
    b,
    [{ text: (settings.schoolName || '').toUpperCase() }, { text: (settings.groupName || '').toUpperCase(), bold: true }],
    [
      { text: `MA TRẬN ${(exam.title || 'ĐỀ KIỂM TRA').toUpperCase()}`, bold: true },
      { text: `Môn: ${settings.subject || 'Toán'} – Lớp ${exam.grade} – Năm học ${(exam.schoolYear || '').replace('-', ' – ')}`, bold: true },
      { text: `Thời gian làm bài: ${exam.duration} phút`, italic: true },
    ],
    [8, b.contentWidth - 8]
  );
  b.add(para('', { after: 6 }));

  const W = b.contentWidth;
  const fixed = [0.9, 6.5];
  const tail = [1.6, 1.6, 1.5];
  const cw = (W - fixed.reduce((a, c) => a + c, 0) - tail.reduce((a, c) => a + c, 0)) / (types.length * 4);
  const widths = [...fixed, ...Array(types.length * 4).fill(cw), ...tail];
  const c = (text, o = {}) => ({ text: String(text), align: 'center', ...o });
  const head1 = [c('TT', { bold: true }), c('Chủ đề / Chuyên đề', { bold: true }), ...types.map((t) => c(TYPE_TITLES[t], { bold: true, span: 4 })), c('Tổng số câu', { bold: true }), c('Tổng điểm', { bold: true }), c('Tỉ lệ %', { bold: true })];
  const head2 = [c(''), c(''), ...types.flatMap(() => LEVEL_IDS.map((l) => c(LEVEL_NAMES[l], { bold: true }))), c(''), c(''), c('')];
  const rows = topics.map((t, i) => {
    let n = 0;
    let pts = 0;
    const vals = types.flatMap((ty) =>
      LEVEL_IDS.map((l) => {
        const v = cells[`${t}|${ty}|${l}`] || 0;
        n += v;
        pts += v * pointOf(ty);
        return c(v || '');
      })
    );
    return [c(i + 1), { text: t }, ...vals, c(n, { bold: true }), c(fmt(pts)), c(total ? `${fmt((pts / total) * 100)}%` : '')];
  });
  const colSum = (ty, l) => topics.reduce((s, t) => s + (cells[`${t}|${ty}|${l}`] || 0), 0);
  const allQ = parts.reduce((s, x) => s + x.items.length, 0);
  const sumRow = [c(''), { text: 'Tổng số câu', bold: true }, ...types.flatMap((ty) => LEVEL_IDS.map((l) => c(colSum(ty, l) || '', { bold: true }))), c(allQ, { bold: true }), c(fmt(total), { bold: true }), c('100%', { bold: true })];
  const ptRow = [c(''), { text: 'Tổng điểm', bold: true }, ...types.flatMap((ty) => LEVEL_IDS.map((l) => c(colSum(ty, l) ? fmt(colSum(ty, l) * pointOf(ty)) : ''))), c(''), c(''), c('')];
  const levelPts = LEVEL_IDS.map((l) => types.reduce((s, ty) => s + colSum(ty, l) * pointOf(ty), 0));
  b.table([head1, head2, ...rows, sumRow, ptRow], { widths, header: true, fontSize: 10 });
  b.add(
    para(
      run(
        `Tỉ lệ điểm theo mức độ: ${LEVEL_IDS.map((l, i) => `${LEVEL_NAMES[l]} ${total ? fmt((levelPts[i] / total) * 100) : 0}%`).join(' – ')}. ` +
          `Điểm mỗi câu: ${types.map((t) => `${TYPE_TITLES[t]} ${fmt(pointOf(t))}`).join('; ')}.`,
        { italic: true, size: 10 }
      ),
      { before: 4 }
    )
  );

  // Bảng đặc tả câu hỏi theo mã đề gốc
  b.add(para(run(`BẢNG ĐẶC TẢ CÂU HỎI (theo mã đề ${exam.versions[0].code})`, { bold: true, size: 12 }), { align: 'center', before: 14, after: 4 }));
  const spec = [['Câu', 'Chủ đề / Chuyên đề', 'Mức độ', 'Dạng câu', 'Mã ID', 'Mã câu', 'Nguồn', 'Yêu cầu cần đạt (GV bổ sung)'].map((t) => c(t, { bold: true }))];
  for (const part of parts)
    for (const it of part.items)
      spec.push([
        c(`${part.roman}.${it.no}`),
        { text: it.q.topic || '' },
        c(it.q.level),
        c(TYPE_TITLES[part.type]),
        c(it.q.idCode || ''),
        c((it.id || '').slice(0, 8)),
        { text: it.q.sourceName || '' },
        { text: '' },
      ]);
  const sw = [1.3, 6.5, 1.5, 2.8, 2.6, 2, 4.5];
  b.table(spec, { widths: [...sw, W - sw.reduce((a, x) => a + x, 0)], header: true, fontSize: 10 });
  return b.toBlob();
}

export { esc };
