// Đọc file Word (.docx) → văn bản theo định dạng "Nhập nhanh" (công thức dạng $LaTeX$, hình dạng [[HINH:n]])
//  - Công thức Equation (OMML) → LaTeX
//  - Công thức MathType (OLE) → LaTeX (giải mã MTEF)
//  - Đánh số tự động của Word (Câu 1., A., B.…) được khôi phục
//  - Chữ gạch chân / tô đỏ / tô nền được đánh dấu để nhận đáp án đúng
import JSZip from 'jszip';
import { ommlToLatex } from './ommlToLatex.js';
import { mathTypeOleToLatex } from './mtef.js';

export const MARK_OPEN = '';
export const MARK_CLOSE = '';

const SYMBOL_FONT = {
  0xb3: '≥', 0xa3: '≤', 0xb9: '≠', 0xb1: '±', 0xb4: '×', 0xb8: '÷', 0xc6: '∅', 0xce: '∈', 0xcf: '∉', 0xde: '⇒', 0xdb: '⇔', 0xae: '→',
  0xa5: '∞', 0xd6: '√', 0x70: 'π', 0x61: 'α', 0x62: 'β', 0x67: 'γ', 0x6a: 'φ', 0x44: 'Δ', 0xb0: '°', 0xbb: '≈', 0xc7: '∩', 0xc8: '∪',
  0xcc: '⊂', 0xcd: '⊆', 0x5e: '⊥', 0xd0: '∠', 0x22: '∀', 0x24: '∃', 0xa2: '′', 0xbc: '…', 0x2d: '−', 0x2a: '∗', 0x77: 'ω', 0x6c: 'λ',
};

const kids = (n) => Array.from(n?.childNodes || []).filter((c) => c.nodeType === 1);
const first = (n, name) => {
  if (!n) return null;
  const list = n.getElementsByTagName(name);
  return list.length ? list[0] : null;
};
const attr = (n, name) => n?.getAttribute(name) ?? null;

function parseXml(text) {
  return new DOMParser().parseFromString(text, 'application/xml');
}

// ---------- Đánh số tự động ----------
function roman(n) {
  const map = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let s = '';
  for (const [v, r] of map) while (n >= v) (s += r), (n -= v);
  return s;
}
function fmtNum(n, fmt) {
  switch (fmt) {
    case 'upperLetter':
      return String.fromCharCode(64 + (((n - 1) % 26) + 1));
    case 'lowerLetter':
      return String.fromCharCode(96 + (((n - 1) % 26) + 1));
    case 'upperRoman':
      return roman(n);
    case 'lowerRoman':
      return roman(n).toLowerCase();
    case 'bullet':
    case 'none':
      return '';
    default:
      return String(n);
  }
}

function loadNumbering(xml) {
  if (!xml) return null;
  const doc = parseXml(xml);
  const abstracts = {};
  for (const a of Array.from(doc.getElementsByTagName('w:abstractNum'))) {
    const levels = {};
    for (const lvl of kids(a).filter((c) => c.nodeName === 'w:lvl')) {
      levels[attr(lvl, 'w:ilvl')] = {
        start: Number(attr(first(lvl, 'w:start'), 'w:val') ?? 1),
        fmt: attr(first(lvl, 'w:numFmt'), 'w:val') || 'decimal',
        text: attr(first(lvl, 'w:lvlText'), 'w:val') ?? '',
      };
    }
    abstracts[attr(a, 'w:abstractNumId')] = levels;
  }
  const nums = {};
  for (const n of Array.from(doc.getElementsByTagName('w:num'))) {
    const levels = { ...(abstracts[attr(first(n, 'w:abstractNumId'), 'w:val')] || {}) };
    for (const ov of kids(n).filter((c) => c.nodeName === 'w:lvlOverride')) {
      const il = attr(ov, 'w:ilvl');
      const so = first(ov, 'w:startOverride');
      if (so && levels[il]) levels[il] = { ...levels[il], start: Number(attr(so, 'w:val')) };
    }
    nums[attr(n, 'w:numId')] = levels;
  }
  const counters = {};
  return {
    label(numId, ilvl) {
      const levels = nums[numId];
      if (!levels || numId === '0') return '';
      const lv = levels[ilvl];
      if (!lv || lv.fmt === 'bullet' || lv.fmt === 'none') return '';
      const c = (counters[numId] ||= []);
      const L = Number(ilvl);
      c[L] = c[L] === undefined ? lv.start : c[L] + 1;
      c.length = L + 1; // đặt lại các cấp con
      return lv.text.replace(/%(\d)/g, (_, k) => {
        const idx = Number(k) - 1;
        const l2 = levels[idx] || lv;
        return fmtNum(c[idx] ?? l2.start, l2.fmt);
      });
    },
  };
}

// ---------- Kiểu chữ dùng để đánh dấu đáp án ----------
function isEmphasis(rPr) {
  if (!rPr) return false;
  const u = kids(rPr).find((c) => c.nodeName === 'w:u');
  if (u && attr(u, 'w:val') !== 'none') return true;
  const hl = kids(rPr).find((c) => c.nodeName === 'w:highlight');
  if (hl && attr(hl, 'w:val') !== 'none') return true;
  const shd = kids(rPr).find((c) => c.nodeName === 'w:shd');
  const fill = shd && attr(shd, 'w:fill');
  if (fill && fill !== 'auto' && !/^(FFFFFF|000000)$/i.test(fill)) return true;
  const color = kids(rPr).find((c) => c.nodeName === 'w:color');
  const hex = color && attr(color, 'w:val');
  if (hex && /^[0-9A-F]{6}$/i.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if (r > 150 && g < 90 && b < 90) return true; // màu đỏ
  }
  return false;
}

/**
 * @returns {Promise<{ text: string, images: Record<number, {blob: Blob, ext: string}|null>, stats: object }>}
 */
export async function readDocx(file) {
  const zip = await JSZip.loadAsync(file);
  const docXml = await zip.file('word/document.xml')?.async('string');
  if (!docXml) throw new Error('Không đọc được nội dung file Word.');
  const relsXml = (await zip.file('word/_rels/document.xml.rels')?.async('string')) || '';
  const rels = {};
  for (const r of Array.from(parseXml(relsXml).getElementsByTagName('Relationship'))) rels[attr(r, 'Id')] = attr(r, 'Target');
  const numbering = loadNumbering(await zip.file('word/numbering.xml')?.async('string'));

  const doc = parseXml(docXml);
  const body = first(doc, 'w:body');
  const images = {};
  const pendingImages = [];
  const pendingOle = [];
  const stats = { omml: 0, mathtype: 0, mathtypeFailed: 0, images: 0, badImages: 0 };
  let imgCount = 0;

  const zipPath = (target) => {
    if (!target) return null;
    const t = target.replace(/^\//, '');
    return t.startsWith('word/') ? t : `word/${t.replace(/^\.\//, '')}`;
  };

  function imageToken(rid) {
    const path = zipPath(rels[rid]);
    if (!path || !zip.file(path)) return '';
    const n = ++imgCount;
    const ext = path.split('.').pop().toLowerCase();
    stats.images++;
    if (!['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext)) {
      stats.badImages++;
      images[n] = null;
    } else pendingImages.push(zip.file(path).async('blob').then((blob) => (images[n] = { blob, ext })));
    return ` [[HINH:${n}]] `;
  }

  // Công thức MathType: giải mã bất đồng bộ rồi thay vào chỗ giữ chỗ
  function mathTypeToken(rid) {
    const path = zipPath(rels[rid]);
    const key = `${pendingOle.length}`;
    stats.mathtype++;
    pendingOle.push(
      (async () => {
        try {
          const bytes = await zip.file(path).async('uint8array');
          return `$${mathTypeOleToLatex(bytes)}$`;
        } catch (e) {
          console.warn('MathType lỗi', e);
          stats.mathtypeFailed++;
          return '[MathType lỗi]';
        }
      })()
    );
    return key;
  }

  function runText(r) {
    let s = '';
    for (const c of kids(r)) {
      switch (c.nodeName) {
        case 'w:t':
          s += c.textContent;
          break;
        case 'w:tab':
          s += '\t';
          break;
        case 'w:br':
        case 'w:cr':
          s += attr(c, 'w:type') === 'page' ? '\n' : '\n';
          break;
        case 'w:noBreakHyphen':
          s += '-';
          break;
        case 'w:sym': {
          // Ký hiệu chèn bằng Insert > Symbol (font Symbol)
          const code = parseInt(attr(c, 'w:char') || '0', 16) & 0xff;
          s += /symbol/i.test(attr(c, 'w:font') || '') ? SYMBOL_FONT[code] || '' : '';
          break;
        }
        case 'w:drawing': {
          const blip = first(c, 'a:blip');
          if (blip) s += imageToken(attr(blip, 'r:embed'));
          break;
        }
        case 'w:object':
        case 'w:pict': {
          const ole = first(c, 'o:OLEObject');
          const prog = attr(ole, 'ProgID') || '';
          if (ole && /Equation/i.test(prog)) s += mathTypeToken(attr(ole, 'r:id'));
          else {
            const img = first(c, 'v:imagedata');
            if (img) s += imageToken(attr(img, 'r:id'));
          }
          break;
        }
        default:
          break;
      }
    }
    if (!s) return '';
    return isEmphasis(kids(r).find((c) => c.nodeName === 'w:rPr')) && s.trim() ? `${MARK_OPEN}${s}${MARK_CLOSE}` : s;
  }

  // Duyệt nội dung một đoạn theo thứ tự
  function inline(node) {
    let s = '';
    for (const c of kids(node)) {
      switch (c.nodeName) {
        case 'w:r':
          s += runText(c);
          break;
        case 'm:oMathPara':
          for (const om of Array.from(c.getElementsByTagName('m:oMath'))) {
            stats.omml++;
            s += ` $${ommlToLatex(om)}$ `;
          }
          break;
        case 'm:oMath':
          stats.omml++;
          s += `$${ommlToLatex(c)}$`;
          break;
        case 'w:del':
        case 'w:pPr':
        case 'w:rPr':
          break;
        case 'w:fldSimple':
        case 'w:hyperlink':
        case 'w:ins':
        case 'w:smartTag':
        case 'w:sdt':
        case 'w:sdtContent':
        case 'w:customXml':
          s += inline(c);
          break;
        default:
          if (c.getElementsByTagName && (c.getElementsByTagName('w:r').length || c.getElementsByTagName('m:oMath').length)) s += inline(c);
      }
    }
    return s;
  }

  const lines = [];
  function paragraph(p) {
    let label = '';
    const pPr = kids(p).find((c) => c.nodeName === 'w:pPr');
    const numPr = pPr && kids(pPr).find((c) => c.nodeName === 'w:numPr');
    if (numPr && numbering) {
      const numId = attr(kids(numPr).find((c) => c.nodeName === 'w:numId'), 'w:val');
      const ilvl = attr(kids(numPr).find((c) => c.nodeName === 'w:ilvl'), 'w:val') || '0';
      label = numbering.label(numId, ilvl);
    }
    const text = inline(p);
    if (!text.trim() && !label) return;
    for (const line of (label ? `${label} ${text}` : text).split('\n')) lines.push(line);
  }

  function block(node) {
    for (const c of kids(node)) {
      if (c.nodeName === 'w:p') paragraph(c);
      else if (c.nodeName === 'w:tbl') {
        for (const tr of kids(c).filter((x) => x.nodeName === 'w:tr')) {
          // Bảng phương án A|B|C|D: mỗi ô thành một đoạn; bảng đáp án: các ô nối bằng tab
          const cells = kids(tr).filter((x) => x.nodeName === 'w:tc');
          const before = lines.length;
          const texts = cells.map((tc) => {
            const start = lines.length;
            block(tc);
            return lines.splice(start).join(' ').trim();
          });
          lines.length = before;
          const isOptionRow = texts.filter((t) => /^[]*[A-D][]*\s*[.)]/.test(t)).length >= 2;
          if (isOptionRow) texts.forEach((t) => t && lines.push(t));
          else lines.push(texts.join('\t'));
        }
      } else if (c.nodeName === 'w:sdt' || c.nodeName === 'w:sdtContent' || c.nodeName === 'w:customXml') block(c);
    }
  }
  block(body);

  let text = lines
    .map((l) => l.replace(/(\s*)/g, '$1').replace(/[  ]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\$\s*\$/g, '')
    .replace(/\n{3,}/g, '\n\n');

  const ole = await Promise.all(pendingOle);
  text = text.replace(/(\d+)/g, (_, i) => ole[Number(i)]);
  // Gộp các công thức liền nhau: $a$$b$ → $a b$
  for (let prev = ''; prev !== text; ) {
    prev = text;
    text = text.replace(/\$([^$\n]+)\$[ \t]*\$([^$\n]+)\$/g, '$$$1 $2$$');
  }
  // Word dựa vào khoảng đệm của công thức nên hay thiếu dấu cách: "năm $2020$là" → "năm $2020$ là"
  text = text
    .split('\n')
    .map((line) =>
      line.replace(/(\$[^$\n]+\$)/g, (m, _f, offset) => {
        const before = line[offset - 1];
        const after = line[offset + m.length];
        return `${before && /[A-Za-zÀ-ỹ0-9]/.test(before) ? ' ' : ''}${m}${after && /[A-Za-zÀ-ỹ0-9]/.test(after) ? ' ' : ''}`;
      })
    )
    .join('\n');
  await Promise.all(pendingImages);
  return { text, images, stats };
}
