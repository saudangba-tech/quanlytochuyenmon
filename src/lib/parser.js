// Nhập nhanh nhiều câu hỏi từ văn bản. Mẫu:
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
// Có thể ghi thêm dòng "Mức độ: NB|TH|VD|VDC" trong từng câu để ghi đè mức độ chung.

const Q_START = /^\s*câu\s*\d+\s*[.:)]\s*/i;
const OPT = /(^|\s)([A-D])\s*[.)]\s+/g;
const STMT = /^\s*([a-d])\s*\)\s*(.*)$/;
const ANSWER = /^\s*(đáp\s*án|đa|answer)\s*[:.]\s*(.*)$/i;
const SOLUTION = /^\s*(lời\s*giải|hướng\s*dẫn(\s*giải)?|giải)\s*[:.]\s*(.*)$/i;
const LEVEL = /^\s*mức\s*độ\s*[:.]\s*(NB|TH|VDC|VD)\b/i;

function splitBlocks(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks = [];
  let cur = null;
  for (const line of lines) {
    if (Q_START.test(line)) {
      if (cur) blocks.push(cur);
      cur = [line.replace(Q_START, '')];
    } else if (cur) cur.push(line);
  }
  if (cur) blocks.push(cur);
  return blocks;
}

// Tách các phương án A. B. C. D. có thể nằm trên cùng một dòng
function extractOptions(lines) {
  const joined = lines.join('\n');
  const idxA = joined.search(/(^|\n)\s*A\s*[.)]\s+/);
  if (idxA < 0) return null;
  const head = joined.slice(0, idxA);
  const tail = joined.slice(idxA);
  const marks = [];
  let m;
  OPT.lastIndex = 0;
  // Bỏ qua chữ cái nằm trong công thức $...$
  const masked = tail.replace(/\$[^$]*\$/g, (s) => '#'.repeat(s.length));
  while ((m = OPT.exec(masked))) marks.push({ letter: m[2], start: m.index + m[1].length, end: OPT.lastIndex });
  const seq = [];
  for (const mk of marks) if (mk.letter === 'ABCD'[seq.length]) seq.push(mk);
  if (seq.length !== 4) return null;
  const options = seq.map((mk, i) => tail.slice(mk.end, i < 3 ? seq[i + 1].start : undefined).trim());
  return { head: head.trim(), options };
}

function parseTF(ans) {
  const tokens = ans
    .toUpperCase()
    .replace(/[,;|/-]/g, ' ')
    .replace(/\b[A-D]\)/g, ' ') // bỏ nhãn "a)" nếu có: a) Đ b) S ...
    .split(/\s+/)
    .filter(Boolean);
  const vals = tokens.map((t) => (/^(Đ|D|ĐÚNG|DUNG|T|TRUE)$/.test(t) ? true : /^(S|SAI|F|FALSE)$/.test(t) ? false : null));
  return vals.length === 4 && vals.every((v) => v !== null) ? vals : null;
}

export function parseQuestions(text) {
  const results = [];
  splitBlocks(text).forEach((block, bi) => {
    let answer = '';
    let solution = [];
    let level = '';
    const body = [];
    let inSolution = false;
    for (const line of block) {
      const a = ANSWER.exec(line);
      const s = SOLUTION.exec(line);
      const l = LEVEL.exec(line);
      if (l) level = l[1].toUpperCase();
      else if (a && !inSolution) answer = a[2].trim();
      else if (s) {
        inSolution = true;
        if (s[3]) solution.push(s[3]);
      } else if (inSolution) solution.push(line);
      else body.push(line);
    }
    const q = { solution: solution.join('\n').trim(), level, errors: [], index: bi + 1 };
    const statements = [];
    const rest = [];
    for (const line of body) {
      const st = STMT.exec(line);
      if (st && 'abcd'[statements.length] === st[1]) statements.push(st[2].trim());
      else if (statements.length && statements.length < 4 && line.trim()) statements[statements.length - 1] += '\n' + line.trim();
      else rest.push(line);
    }
    const opt = statements.length === 4 ? null : extractOptions(body);
    if (opt) {
      q.type = 'mcq';
      q.content = opt.head;
      q.options = opt.options;
      const letter = answer.toUpperCase().match(/[A-D]/)?.[0] || '';
      q.answer = letter;
      if (!letter) q.errors.push('Thiếu đáp án (A/B/C/D)');
    } else if (statements.length === 4) {
      q.type = 'tf';
      q.content = rest.join('\n').trim();
      q.statements = statements;
      q.answer = parseTF(answer);
      if (!q.answer) q.errors.push('Đáp án Đúng/Sai cần 4 giá trị, ví dụ: Đ S Đ S');
    } else if (answer) {
      q.type = 'short';
      q.content = body.join('\n').trim();
      q.answer = answer;
    } else {
      q.type = 'essay';
      q.content = body.join('\n').trim();
      q.answer = '';
    }
    if (!q.content) q.errors.push('Thiếu nội dung câu hỏi');
    results.push(q);
  });
  return results;
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
