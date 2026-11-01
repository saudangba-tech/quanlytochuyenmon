// Đọc chữ trong file PDF (PDF xuất từ Word/LaTeX, không phải PDF scan).
// PDF không lưu cấu trúc công thức: chỉ khôi phục được chỉ số trên/dưới (x², a₁) và các ký hiệu;
// phân số, căn, tích phân nhiều tầng giáo viên cần sửa lại trong bản xem trước.
import katex from 'katex';
import { mapSymbols } from './latexSymbols.js';

let pdfjsPromise = null;
async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      if (typeof window !== 'undefined') {
        const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      }
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-', 'ⁿ': 'n' };
const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };
const OPS = '=<>≤≥≠±+\\-−×÷*/^_(){}\\[\\];|∈∉⊂⊄⊆∪∩∅∞→⇒⇔√∫∑πΔ∆°′∀∃αβγλφωθ';
const MATH_TOKEN = new RegExp(`^([A-Za-z]|[\\d.,]+|[${OPS}]+|[A-Za-z\\d]*[${OPS}][A-Za-z\\d${OPS}.,]*|\\$[^$]+\\$)$`);
const HAS_OP = new RegExp(`[${OPS}]|\\$`);
// Nhãn ý/phương án và đường kẻ không phải công thức: a)  B.  (II)  ------
const LABEL = /^([a-dA-D][).]|\(?[IVX]+\)|[-_.…]{2,}|\d+[.)])$/;

function normalizeText(s) {
  return s
    .replace(/[\u{1D400}-\u{1D7FF}]/gu, (c) => c.normalize('NFKC'))
    .replace(/([A-Za-z0-9)\]])([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿ]+)/g, (_, b, sup) => `$${b}^{${[...sup].map((c) => SUP[c]).join('')}}$`)
    .replace(/([A-Za-z])([₀₁₂₃₄₅₆₇₈₉]+)/g, (_, b, sub) => `$${b}_{${[...sub].map((c) => SUB[c]).join('')}}$`);
}

function validTex(tex) {
  try {
    katex.renderToString(tex, { throwOnError: true, strict: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Gom các từ liên tiếp trông như công thức ("x = -2", "2 + 3 = 6") thành một cụm $...$
function wrapMath(line) {
  const tokens = line.split(/(\s+)/);
  const out = [];
  let group = [];
  const flush = () => {
    const words = group.filter((t) => t.trim());
    if (words.length && words.some((t) => HAS_OP.test(t))) {
      let expr = group.join('').trim();
      const tail = expr.match(/[.,;:]+$/)?.[0] || '';
      expr = expr.slice(0, expr.length - tail.length);
      const inner = expr
        .split(/(\$[^$]+\$)/)
        .map((p) => (p.startsWith('$') ? p.slice(1, -1) : mapSymbols(p)))
        .join('')
        .replace(/\s+/g, ' ')
        .trim();
      // Cụm không hợp lệ với KaTeX thì giữ nguyên dạng chữ để giáo viên tự sửa
      out.push(validTex(inner) ? `$${inner}$${tail}` : group.join('').replace(/\$/g, ''));
    } else out.push(group.join(''));
    group = [];
  };
  for (const t of tokens) {
    if (!t.trim()) {
      group.length ? group.push(t) : out.push(t);
      continue;
    }
    if (MATH_TOKEN.test(t) && !LABEL.test(t)) group.push(t);
    else {
      // tách khoảng trắng cuối nhóm ra ngoài
      const trailing = [];
      while (group.length && !group[group.length - 1].trim()) trailing.unshift(group.pop());
      flush();
      out.push(...trailing, t);
    }
  }
  flush();
  return out.join('');
}

export async function readPdf(file) {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
  const out = [];
  let chars = 0;
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const { items } = await page.getTextContent();
    const pieces = items
      .filter((it) => typeof it.str === 'string')
      .map((it) => ({ s: it.str, x: it.transform[4], y: it.transform[5], h: Math.abs(it.transform[3]) || it.height || 10, w: it.width || 0 }))
      .filter((pc) => pc.s.length);
    // Gom theo dòng; chữ nhỏ (chỉ số trên/dưới) được phép lệch tung độ nhiều hơn
    pieces.sort((a, b) => b.h - a.h);
    const lines = [];
    for (const pc of pieces) {
      const line = lines.find((l) => {
        const dy = Math.abs(l.y - pc.y);
        return pc.h < l.h * 0.85 ? dy < l.h * 0.75 : dy < Math.max(l.h, pc.h) * 0.5;
      });
      if (line) line.items.push(pc);
      else lines.push({ y: pc.y, h: pc.h, items: [pc] });
    }
    lines.sort((a, b) => b.y - a.y);
    for (const l of lines) {
      l.items.sort((a, b) => a.x - b.x);
      let s = '';
      let prevEnd = null;
      for (const it of l.items) {
        const small = it.h < l.h * 0.85;
        const raised = small && it.y - l.y > l.h * 0.2;
        const lowered = small && l.y - it.y > l.h * 0.1;
        const gap = prevEnd === null ? 0 : it.x - prevEnd;
        if ((raised || lowered) && it.s.trim()) {
          // Chỉ số trên/dưới: gắn vào ký tự đứng trước
          s = s.replace(/\s+$/, '');
          const m = s.match(/(\$[^$]+\$|[A-Za-z0-9)\]]+)$/);
          const base = m ? m[1] : '';
          const b = base.startsWith('$') ? base.slice(1, -1) : base;
          s = s.slice(0, s.length - base.length) + `$${b}${raised ? '^' : '_'}{${it.s.trim()}}$`;
        } else {
          if (gap > l.h * 0.18) s += ' ';
          s += it.s;
        }
        prevEnd = it.x + it.w;
      }
      s = s.replace(/\s+/g, ' ').trim();
      if (!s || /^Trang\s*\d+(\s*\/\s*\d+)?$/i.test(s) || /^\d+$/.test(s)) continue;
      chars += s.length;
      out.push(
        wrapMath(normalizeText(s))
          .replace(/\$\s*\$/g, '')
          .replace(/\$([^$]+)\$/g, (m, inner) => (validTex(inner) ? m : inner))
      );
    }
    out.push('');
  }
  return { text: out.join('\n').replace(/\n{3,}/g, '\n\n'), pages: pdf.numPages, scanned: chars < 30 * pdf.numPages };
}
