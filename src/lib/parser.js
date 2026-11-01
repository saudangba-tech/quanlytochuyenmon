// Nhập nhanh nhiều câu hỏi từ văn bản (gõ tay, dán, hoặc đọc từ file Word/PDF). Mẫu:
//
// Câu 1: Nội dung có công thức $x^2$
// A. ...      B. ...      C. ...      D. ...
// Đáp án: B
// Lời giải: ...
//
// Câu 2: Cho hàm số ... (Đúng/Sai)
// a) ...
// b) ...
// c) ...
// d) ...
// Đáp án: Đ S Đ S
//
// Câu 3: ... (Trả lời ngắn)
// Đáp án: 2,5
//
// Ngoài ra nhận được:
//  - "Câu 1 (NB):" hoặc dòng "Mức độ: TH" để ghi mức độ
//  - Phương án được gạch chân / tô đỏ (từ file Word) là đáp án đúng
//  - "Chọn B" trong lời giải; bảng "ĐÁP ÁN" ở cuối đề (1.A 2.C … hoặc bảng 2 hàng)
//  - Bỏ qua các dòng "PHẦN I…", "--- HẾT ---", "Mã đề…", "Trang 1/4"

import { extractIdCode, parseIdCode } from './questionId.js';

export const MARK_OPEN = '';
export const MARK_CLOSE = '';
const M = '[\\uE000\\uE001]*';
const strip = (s) => (s || '').replace(/[]/g, '');

const Q_START = new RegExp(`^\\s*${M}\\s*câu\\s*(\\d+)\\s*(?:[([]\\s*(NB|TH|VDC|VD)\\s*[)\\]]\\s*)?[.:)]\\s*(?:[([]\\s*(NB|TH|VDC|VD)\\s*[)\\]]\\s*[.:]?)?${M}\\s*`, 'i');
const PART = /^\s*PHẦN\s+([IVX]+|\d+)\b/i;
const THE_END = /^\s*[-–—_.*\s]*HẾT[-–—_.*\s]*$/i;
const NOISE = /^\s*(Trang\s*\d+(\s*\/\s*\d+)?\s*$|Mã\s*đề\b|Họ,?\s*(và\s*)?tên\b|Số\s*báo\s*danh\b|Thời\s*gian\s*làm\s*bài\b)/i;
const KEY_HEAD = /^\s*(bảng\s+)?đáp\s*án(\s+(và\s+)?(hướng\s*dẫn|lời\s*giải)[^:]*|\s+(trắc\s*nghiệm|phần\s+\S+)[^:]*)?\s*[:.]?\s*$/i;
const STMT = new RegExp(`^\\s*${M}([a-d])${M}\\s*[).]\\s*(.*)$`);
const ANSWER = /^\s*(đáp\s*án(\s*đúng)?|đa|answer)\s*[:.]\s*(.*)$/i;
const ANSWER_LINE = /^\s*(đáp\s*án|chọn)\s*[:.]?\s*([A-D])\s*\.?\s*$/i;
// "Giải phương trình…" là nội dung câu hỏi, chỉ "Giải:" (có dấu hai chấm) mới là lời giải
const SOLUTION = /^\s*(?:(?:lời\s*giải(?:\s*chi\s*tiết)?|hướng\s*dẫn(?:\s*giải)?)\s*[:.]?|giải\s*[:.])\s*(.*)$/i;
const LEVEL = /^\s*mức\s*độ\s*[:.]\s*(NB|TH|VDC|VD)\b/i;

function splitBlocks(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks = [];
  const keyLines = [];
  let cur = null;
  let inKey = false;
  const close = () => {
    if (cur) blocks.push(cur);
    cur = null;
  };
  for (const raw of lines) {
    // "Câu 1 [2D1-1.2-3]: …" → "Câu 1: [2D1-1.2-3] …"
    const line = raw.replace(/^(\s*[]*\s*câu\s*\d+)\s*([[(][^\])\n]{3,30}[\])])\s*([.:)])/i, '$1$3 $2');
    const plain = strip(line);
    const q = Q_START.exec(plain);
    if (q) {
      if (inKey && !/[a-zà-ỹ]{3,}/i.test(plain.replace(Q_START, ''))) {
        keyLines.push(plain);
        continue;
      }
      inKey = false;
      close();
      const first = extractIdCode(line.replace(new RegExp(Q_START.source, 'i'), ''));
      cur = { number: Number(q[1]), level: (q[2] || q[3] || '').toUpperCase(), idCode: first.idCode, lines: [first.text] };
      continue;
    }
    if (KEY_HEAD.test(plain) && !/[:.]\s*\S/.test(plain)) {
      close();
      inKey = true;
      continue;
    }
    if (inKey) {
      keyLines.push(plain);
      continue;
    }
    if (PART.test(plain) || THE_END.test(plain)) {
      close();
      continue;
    }
    if (NOISE.test(plain)) continue;
    if (cur) cur.lines.push(line);
  }
  close();
  return { blocks, key: parseKey(keyLines) };
}

// Bảng đáp án cuối đề: "1.A 2.B …" hoặc bảng 2 hàng (Câu | 1 | 2 …) / (Đáp án | A | B …)
function parseKey(lines) {
  const key = {};
  let numRow = null;
  for (const line of lines) {
    const cells = line.split(/\t+/).map((c) => c.trim()).filter(Boolean);
    if (cells.length >= 3) {
      const nums = cells.filter((c) => /^\d+$/.test(c));
      const lets = cells.filter((c) => /^[A-D]$/i.test(c));
      if (nums.length >= cells.length - 1 && nums.length >= 2) {
        numRow = nums.map(Number);
        continue;
      }
      if (numRow && lets.length >= cells.length - 1) {
        lets.forEach((l, i) => numRow[i] && (key[numRow[i]] = l.toUpperCase()));
        numRow = null;
        continue;
      }
    }
    for (const m of line.matchAll(/(?:câu\s*)?(\d+)\s*[.:\-)]?\s*([A-D])\b/gi)) key[Number(m[1])] = m[2].toUpperCase();
  }
  return key;
}

// Tách các phương án A. B. C. D. (có thể cùng dòng); phương án gạch chân/tô đỏ → đáp án
function extractOptions(lines) {
  const joined = lines.join('\n');
  const idxA = joined.search(new RegExp(`(^|\\n)[\\s\\uE000\\uE001]*A${M}\\s*[.)]`));
  if (idxA < 0) return null;
  const head = joined.slice(0, idxA);
  const tail = joined.slice(idxA);
  // Che các công thức để không nhầm chữ cái trong công thức
  const masked = tail.replace(/\$[^$]*\$/g, (s) => '#'.repeat(s.length));
  const re = new RegExp(`(^|[\\s\\uE001])(${M})([A-D])(${M})\\s*[.)]`, 'g');
  const marks = [];
  let m;
  while ((m = re.exec(masked))) marks.push({ letter: m[3], start: m.index + m[1].length, end: re.lastIndex });
  const seq = [];
  for (const mk of marks) if (mk.letter === 'ABCD'[seq.length]) seq.push(mk);
  if (seq.length !== 4) return null;
  const raw = seq.map((mk, i) => tail.slice(mk.start, i < 3 ? seq[i + 1].start : undefined));
  const emphasized = raw.map((r) => r.includes(MARK_OPEN));
  const options = seq.map((mk, i) => strip(tail.slice(mk.end, i < 3 ? seq[i + 1].start : undefined)).trim());
  const marked = emphasized.filter(Boolean).length === 1 ? 'ABCD'[emphasized.indexOf(true)] : '';
  return { head: head.trim(), options, marked };
}

function parseTF(ans) {
  const tokens = strip(ans)
    .toUpperCase()
    .replace(/[,;|/-]/g, ' ')
    .replace(/\b[A-D]\)/g, ' ') // bỏ nhãn "a)" nếu có: a) Đ b) S ...
    .split(/\s+/)
    .filter(Boolean);
  const vals = tokens.map((t) => (/^(Đ|D|ĐÚNG|DUNG|T|TRUE)$/.test(t) ? true : /^(S|SAI|F|FALSE)$/.test(t) ? false : null));
  return vals.length === 4 && vals.every((v) => v !== null) ? vals : null;
}

// Đúng/Sai ghi trong lời giải: "a) Đúng … b) Sai …"
function tfFromSolution(sol) {
  const vals = ['a', 'b', 'c', 'd'].map((l) => {
    const m = new RegExp(`(?:^|\\s)${l}\\)\\s*(Đúng|Sai)\\b`, 'i').exec(sol);
    return m ? /đúng/i.test(m[1]) : null;
  });
  return vals.every((v) => v !== null) ? vals : null;
}

export function parseQuestions(text) {
  const { blocks, key } = splitBlocks(text || '');
  return blocks.map((block, bi) => {
    let answer = '';
    const solution = [];
    let level = block.level;
    const body = [];
    let inSolution = false;
    for (const line of block.lines) {
      const plain = strip(line);
      const a = ANSWER.exec(plain);
      const al = ANSWER_LINE.exec(plain);
      const s = SOLUTION.exec(plain);
      const l = LEVEL.exec(plain);
      if (l) level = l[1].toUpperCase();
      else if (a && !answer) answer = a[3].trim();
      else if (al && !answer) answer = al[2].toUpperCase();
      else if (s && !inSolution) {
        inSolution = true;
        if (s[1]) solution.push(s[1]);
      } else if (inSolution) solution.push(plain);
      else body.push(line);
    }
    // Mã ID (nếu có) cho biết khối, chuyên đề và mức độ của câu
    const id = parseIdCode(block.idCode);
    const q = {
      solution: solution.join('\n').trim(),
      level: level || id?.level || '',
      idCode: id?.code || '',
      grade: id?.grade,
      chapterCode: id?.chapter || '',
      errors: [],
      warnings: [],
      index: bi + 1,
      number: block.number,
    };
    const statements = [];
    const rest = [];
    for (const line of body) {
      const st = STMT.exec(line);
      if (st && 'abcd'[statements.length] === st[1]) statements.push(st[2].trim());
      else if (statements.length && statements.length < 4 && line.trim()) statements[statements.length - 1] += '\n' + line.trim();
      else rest.push(line);
    }
    // Có đủ A–D thì là trắc nghiệm (các dòng a) b) c) d) khi đó thuộc nội dung câu hỏi)
    const opt = extractOptions(body);
    const chosen = /\bchọn\s*(?:đáp\s*án\s*|phương\s*án\s*)?([A-D])\b/i.exec(q.solution);
    if (opt) {
      q.type = 'mcq';
      q.content = strip(opt.head);
      q.options = opt.options;
      q.answer = answer.toUpperCase().match(/[A-D]/)?.[0] || opt.marked || chosen?.[1]?.toUpperCase() || key[block.number] || '';
      if (!q.answer) q.errors.push('Thiếu đáp án (A/B/C/D)');
    } else if (statements.length === 4) {
      q.type = 'tf';
      q.content = strip(rest.join('\n')).trim();
      q.statements = statements.map((s) => strip(s).trim());
      q.answer = parseTF(answer) || tfFromSolution(q.solution);
      if (!q.answer) q.errors.push('Đáp án Đúng/Sai cần 4 giá trị, ví dụ: Đ S Đ S');
    } else if (answer) {
      q.type = 'short';
      q.content = strip(body.join('\n')).trim();
      q.answer = strip(answer);
      if (/^[A-D]$/i.test(q.answer.trim()) && /(^|\s)[A-D]\s*[.)]/.test(q.content))
        q.errors.push('Không tách được đủ 4 phương án A. B. C. D. (nhãn bị trùng hoặc thiếu dấu chấm) – hãy sửa trong ô bên trái');
    } else {
      q.type = 'essay';
      q.content = strip(body.join('\n')).trim();
      q.answer = '';
    }
    if (!q.content) q.errors.push('Thiếu nội dung câu hỏi');
    if (/\[MathType lỗi\]/.test(JSON.stringify(q))) q.warnings.push('Có công thức MathType không đọc được, hãy sửa lại');
    return q;
  });
}

const IMG_TOKEN = /\s*\[\[HINH:(\d+)\]\]\s*/g;

// Gắn hình (đọc từ file Word) vào câu hỏi: mỗi câu giữ hình đầu tiên, xóa ký hiệu [[HINH:n]]
export function attachImages(questions, images = {}) {
  return questions.map((q) => {
    const found = [];
    const clean = (s) =>
      (s || '').replace(IMG_TOKEN, (_, n) => {
        found.push(Number(n));
        return ' ';
      }).replace(/[ \t]{2,}/g, ' ').trim();
    const out = {
      ...q,
      warnings: [...(q.warnings || [])],
      content: clean(q.content),
      solution: clean(q.solution),
      options: q.options?.map(clean),
      statements: q.statements?.map(clean),
    };
    const ok = found.filter((n) => images[n]);
    if (ok.length) out.image = images[ok[0]];
    if (ok.length > 1) out.warnings.push(`Câu có ${ok.length} hình, chỉ giữ hình đầu tiên`);
    if (found.some((n) => images[n] === null)) out.warnings.push('Có hình dạng WMF/EMF không đọc được, hãy thêm lại hình');
    return out;
  });
}

export const IMPORT_SAMPLE = `Câu 1: Tập xác định của hàm số $y=\\log_2(x-1)$ là
A. $(1;+\\infty)$   B. $\\mathbb{R}$   C. $[1;+\\infty)$   D. $(-\\infty;1)$
Đáp án: A
Lời giải: Điều kiện $x-1>0 \\Leftrightarrow x>1$.

Câu 2: Cho hàm số $f(x)=x^3-3x$.
a) $f'(x)=3x^2-3$.
b) Hàm số đồng biến trên khoảng $(-1;1)$.
c) Hàm số đạt cực đại tại $x=-1$.
d) Giá trị nhỏ nhất của $f(x)$ trên $[0;2]$ bằng $-2$.
Đáp án: Đ S Đ Đ

Câu 3: Tính $\\displaystyle\\int_0^2 (2x+1)\\,dx$.
Đáp án: 6
Mức độ: TH`;
