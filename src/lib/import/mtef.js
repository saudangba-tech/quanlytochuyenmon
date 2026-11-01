// Đọc công thức MathType (đối tượng OLE "Equation.DSMT4…" / "Equation.3") → LaTeX.
// oleObject*.bin là tệp OLE (CFB) chứa luồng "Equation Native" = 28 byte đầu + dữ liệu MTEF (v3 hoặc v5).
import CFB from 'cfb';
import { mapSymbols, FUNCTION_NAMES } from './latexSymbols.js';

const END = 0, LINE = 1, CHAR = 2, TMPL = 3, PILE = 4, MATRIX = 5, EMBELL = 6, RULER = 7, FONT_STYLE_DEF = 8, SIZE = 9;
const FULL = 10, SUB = 11, SUB2 = 12, SYM = 13, SUBSYM = 14, COLOR = 15, COLOR_DEF = 16, FONT_DEF = 17, EQN_PREFS = 18, ENCODING_DEF = 19;

const FN_TEXT = 1, FN_FUNCTION = 2, FN_EXPAND = 22, FN_MARKER = 23, FN_SPACE = 24;

class Reader {
  constructor(bytes, pos = 0) {
    this.b = bytes;
    this.p = pos;
  }
  get eof() {
    return this.p >= this.b.length;
  }
  u8() {
    if (this.p >= this.b.length) throw new Error('MTEF: hết dữ liệu');
    return this.b[this.p++];
  }
  u16() {
    const v = this.b[this.p] | (this.b[this.p + 1] << 8);
    this.p += 2;
    return v;
  }
  str() {
    let s = '';
    for (let c = this.u8(); c !== 0; c = this.u8()) s += String.fromCharCode(c);
    return s;
  }
}

// ---------------- Phân tích MTEF thành cây đối tượng ----------------
function parseMtef(bytes) {
  const r = new Reader(bytes);
  const version = r.u8();
  if (version !== 5 && version !== 3 && version !== 4) throw new Error(`MTEF v${version} chưa hỗ trợ`);
  r.u8(); // platform
  r.u8(); // product
  r.u8(); // product version
  r.u8(); // subversion
  if (version >= 4) {
    r.str(); // application key
    r.u8(); // equation options
  }
  const v5 = version >= 4;

  function head() {
    const b = r.u8();
    if (v5) return { tag: b, opts: 0 };
    return { tag: b & 0x0f, opts: b >> 4 };
  }
  function nudge(opts) {
    if (opts & 0x08) {
      const dx = r.u8();
      const dy = r.u8();
      if (dx === 128 && dy === 128) {
        r.u16();
        r.u16();
      }
    }
  }
  function ruler() {
    const n = r.u8();
    for (let i = 0; i < n; i++) {
      r.u8();
      r.u16();
    }
  }
  function dims(count) {
    // Mảng kích thước mã hóa theo nửa byte, mỗi giá trị kết thúc bằng 0xF
    let nib = 0;
    const start = r.p;
    const get = () => {
      const byte = r.b[start + (nib >> 1)];
      const v = nib % 2 === 0 ? byte >> 4 : byte & 0x0f;
      nib++;
      return v;
    };
    for (let i = 0; i < count; i++) {
      get(); // đơn vị
      while (get() !== 0x0f);
    }
    r.p = start + Math.ceil(nib / 2);
  }

  // Đọc danh sách đối tượng tới END
  function objectList() {
    const list = [];
    for (;;) {
      if (r.eof) return list;
      const h = head();
      if (h.tag === END) return list;
      const o = record(h);
      if (o) list.push(o);
    }
  }

  function record({ tag, opts }) {
    if (v5 && [LINE, CHAR, TMPL, PILE, MATRIX, EMBELL].includes(tag)) opts = r.u8();
    switch (tag) {
      case LINE: {
        nudge(opts);
        if (opts & 0x04) r.u16(); // khoảng cách dòng
        if (opts & 0x02) {
          if (!v5) head(); // v5: thước căn lề không có byte nhãn
          ruler();
        }
        if (opts & 0x01) return { t: 'line', items: [] };
        return { t: 'line', items: objectList() };
      }
      case CHAR: {
        nudge(opts);
        const typeface = r.u8() - 128;
        let code = 0;
        if (v5) {
          if (!(opts & 0x20)) code = r.u16();
          if (opts & 0x04) {
            const fp = r.u8();
            if (opts & 0x20) code = fp;
          }
          if (opts & 0x10) {
            const fp = r.u16();
            if (opts & 0x20) code = fp;
          }
        } else code = r.u16();
        const embell = (v5 ? opts & 0x01 : opts & 0x02) ? objectList().filter((o) => o.t === 'embell') : [];
        return { t: 'char', typeface, code, embell };
      }
      case TMPL: {
        nudge(opts);
        const selector = r.u8();
        let variation = r.u8();
        if (v5 && variation & 0x80) variation = (variation & 0x7f) | (r.u8() << 8);
        r.u8(); // tùy chọn riêng của mẫu
        return { t: 'tmpl', selector, variation, items: objectList() };
      }
      case PILE: {
        nudge(opts);
        r.u8(); // halign
        r.u8(); // valign
        if (opts & 0x02) {
          if (!v5) head();
          ruler();
        }
        return { t: 'pile', items: objectList() };
      }
      case MATRIX: {
        nudge(opts);
        r.u8(); // valign
        r.u8(); // h_just
        r.u8(); // v_just
        const rows = r.u8();
        const cols = r.u8();
        r.p += Math.ceil(((rows + 1) * 2) / 8);
        r.p += Math.ceil(((cols + 1) * 2) / 8);
        return { t: 'matrix', rows, cols, items: objectList() };
      }
      case EMBELL: {
        nudge(opts);
        return { t: 'embell', kind: r.u8() };
      }
      case RULER:
        ruler();
        return null;
      case FONT_STYLE_DEF:
        if (v5) {
          r.u8();
          r.u8();
        } else {
          r.u8(); // typeface
          r.u8(); // style
          r.str(); // tên font (v3: bản ghi FONT)
        }
        return null;
      case SIZE: {
        const lsize = r.u8();
        if (lsize === 101) r.u16();
        else if (lsize === 100) {
          r.u8();
          r.u16();
        } else r.u8();
        return null;
      }
      case FULL:
      case SUB:
      case SUB2:
      case SYM:
      case SUBSYM:
        return null;
      case COLOR:
        if (v5) r.u8();
        return null;
      case COLOR_DEF: {
        const o = r.u8();
        for (let i = 0; i < (o & 0x01 ? 4 : 3); i++) r.u16();
        if (o & 0x04) r.str();
        return null;
      }
      case FONT_DEF:
        r.u8();
        r.str();
        return null;
      case EQN_PREFS: {
        r.u8(); // options
        dims(r.u8()); // sizes
        dims(r.u8()); // spaces
        const n = r.u8();
        for (let i = 0; i < n; i++) if (r.u8() !== 0) r.u8();
        return null;
      }
      case ENCODING_DEF:
        r.str();
        return null;
      default:
        if (tag >= 100) {
          r.p += r.u16();
          return null;
        }
        throw new Error(`MTEF: bản ghi lạ ${tag}`);
    }
  }

  const items = objectList();
  return items;
}

// ---------------- Cây đối tượng → LaTeX ----------------
const EMBELL_TEX = {
  2: ['\\dot{', '}'],
  3: ['\\ddot{', '}'],
  4: ['\\dddot{', '}'],
  5: ['', "'"],
  6: ['', "''"],
  7: ['', '`'],
  8: ['\\tilde{', '}'],
  9: ['\\hat{', '}'],
  10: ['\\not ', ''],
  11: ['\\vec{', '}'],
  12: ['\\overleftarrow{', '}'],
  13: ['\\overleftrightarrow{', '}'],
  14: ['\\vec{', '}'],
  15: ['\\overleftarrow{', '}'],
  16: ['\\overline{', '}'],
  17: ['\\overline{', '}'],
  18: ['', "'''"],
  19: ['\\overset{\\frown}{', '}'],
};

function charText(code) {
  if (code >= 0xef00 && code <= 0xef1f) return ' '; // các loại khoảng trắng của MathType
  if (code >= 0xe000 && code <= 0xf8ff) {
    const pua = { 0xeb1a: '\\to ', 0xec0c: '\\ldots ', 0xec0b: '\\cdots ', 0xeb04: '\\to ' };
    return pua[code] ?? '';
  }
  return mapSymbols(String.fromCodePoint(code));
}

const lines = (items) => items.filter((o) => o.t === 'line' || o.t === 'pile');
const chars = (items) => items.filter((o) => o.t === 'char');

function texOfObjects(items) {
  let out = '';
  let i = 0;
  while (i < items.length) {
    const o = items[i];
    if (o.t === 'char') {
      // Gom các ký tự cùng kiểu chữ "văn bản" hoặc "hàm"
      if ((o.typeface === FN_TEXT || o.typeface === FN_FUNCTION) && !o.embell.length) {
        let s = '';
        const tf = o.typeface;
        while (i < items.length && items[i].t === 'char' && items[i].typeface === tf && !items[i].embell.length) {
          s += String.fromCodePoint(items[i].code);
          i++;
        }
        if (tf === FN_FUNCTION) {
          const w = s.trim();
          out += FUNCTION_NAMES.includes(w) ? `\\${w} ` : /^[a-zA-Z]+$/.test(w) ? `\\operatorname{${w}} ` : mapSymbols(s);
        } else if (/^[\s\d.,;:()=+\-<>/[\]]*$/.test(s)) out += mapSymbols(s);
        else out += `\\text{${s.replace(/([{}%#$&_\\])/g, '\\$1')}}`;
        continue;
      }
      if (o.typeface === FN_EXPAND || o.typeface === FN_MARKER || o.typeface === FN_SPACE) {
        i++;
        continue;
      }
      let t = charText(o.code);
      for (const e of o.embell) {
        const [a, b] = EMBELL_TEX[e.kind] || ['', ''];
        t = `${a}${t}${b}`;
      }
      out += t;
    } else out += tex(o);
    i++;
  }
  return out;
}

function tex(o) {
  if (!o) return '';
  switch (o.t) {
    case 'line':
      return texOfObjects(o.items);
    case 'pile': {
      const ls = lines(o.items).map(tex);
      return ls.length > 1 ? `\\begin{array}{l} ${ls.join(' \\\\ ')} \\end{array}` : ls.join('');
    }
    case 'matrix': {
      const cells = lines(o.items).map(tex);
      const rows = [];
      for (let r = 0; r < o.rows; r++) rows.push(cells.slice(r * o.cols, (r + 1) * o.cols).join(' & '));
      return `\\begin{matrix} ${rows.join(' \\\\ ')} \\end{matrix}`;
    }
    case 'tmpl':
      return template(o);
    case 'char':
      return charText(o.code);
    default:
      return '';
  }
}

const FENCES = {
  0: ['\\langle', '\\rangle'],
  1: ['(', ')'],
  2: ['\\{', '\\}'],
  3: ['[', ']'],
  4: ['|', '|'],
  5: ['\\|', '\\|'],
  6: ['\\lfloor', '\\rfloor'],
  7: ['\\lceil', '\\rceil'],
  8: ['[', ']'],
};
const INTV = ['(', ')', '[', ']'];

function template(o) {
  const sl = lines(o.items);
  const s = (k) => tex(sl[k]);
  const v = o.variation;
  const sel = o.selector;
  if (sel <= 8) {
    const [L, R] = FENCES[sel];
    const hasL = v & 0x01 || !(v & 0x03);
    const hasR = v & 0x02 || !(v & 0x03);
    const body = sl[0];
    // Dấu { chỉ bên trái + nhiều dòng → hệ phương trình; [ → hệ "hoặc"
    const pile = body?.items?.length === 1 && body.items[0].t === 'pile' ? body.items[0] : body?.t === 'pile' ? body : null;
    if (pile && hasL && !hasR && sel === 2) return `\\begin{cases} ${lines(pile.items).map(tex).join(' \\\\ ')} \\end{cases}`;
    if (pile && hasL && !hasR && sel === 3) return `\\left[\\begin{array}{l} ${lines(pile.items).map(tex).join(' \\\\ ')} \\end{array}\\right.`;
    return `\\left${hasL ? L : '.'} ${s(0)} \\right${hasR ? R : '.'}`;
  }
  switch (sel) {
    case 9: // khoảng [a;b)
      return `\\left${INTV[v & 0x03]} ${s(0)} \\right${INTV[(v >> 4) & 0x03]}`;
    case 10: // căn
      return v & 0x01 && s(1).trim() ? `\\sqrt[${s(1)}]{${s(0)}}` : `\\sqrt{${s(0)}}`;
    case 11: // phân số
      return v & 0x02 ? `{${s(0)}}/{${s(1)}}` : `\\frac{${s(0)}}{${s(1)}}`;
    case 12:
      return `\\underline{${s(0)}}`;
    case 13:
      return `\\overline{${s(0)}}`;
    case 14:
      return `\\xrightarrow[${s(1)}]{${s(0)}}`;
    case 15: {
      // tích phân: thân, cận dưới, cận trên
      const n = v & 0x03 || 1;
      const op = v & 0x04 ? '\\oint' : ['\\int', '\\int', '\\iint', '\\iiint'][n];
      const lo = sl.length > 1 ? s(1).trim() : '';
      const hi = sl.length > 2 ? s(2).trim() : '';
      return `${op}${lo ? `_{${lo}}` : ''}${hi ? `^{${hi}}` : ''} ${s(0)}`;
    }
    case 16:
    case 17:
    case 18:
    case 19:
    case 20:
    case 21:
    case 22: {
      const op = { 16: '\\sum', 17: '\\prod', 18: '\\coprod', 19: '\\bigcup', 20: '\\bigcap', 21: '\\int', 22: '\\sum' }[sel];
      const lo = sl.length > 1 ? s(1).trim() : '';
      const hi = sl.length > 2 ? s(2).trim() : '';
      return `${op}${lo ? `_{${lo}}` : ''}${hi ? `^{${hi}}` : ''} ${s(0)}`;
    }
    case 23: {
      // giới hạn: "lim" + dưới (+ trên)
      const main = s(0).trim() || '\\lim';
      const name = /^\\?(lim|max|min|sup|inf)\s*$/.test(main) ? `\\${main.replace(/^\\/, '').trim()}` : main;
      const lo = sl.length > 1 ? s(1).trim() : '';
      return `${name}${lo ? `_{${lo}}` : ''} `;
    }
    case 24:
      return v & 0x01 ? `\\underbrace{${s(0)}}_{${s(1)}}` : `\\overbrace{${s(0)}}^{${s(1)}}`;
    case 25:
      return v & 0x01 ? `\\underbrace{${s(0)}}` : `\\overbrace{${s(0)}}`;
    case 27:
      return `_{${s(0)}}`;
    case 28:
      return `^{${s(1) || s(0)}}`;
    case 29:
      return `_{${s(0)}}^{${s(1)}}`;
    case 31: {
      if (v & 0x04) return `\\underrightarrow{${s(0)}}`;
      if ((v & 0x03) === 0x03) return `\\overleftrightarrow{${s(0)}}`;
      if (v & 0x01) return `\\overleftarrow{${s(0)}}`;
      return `\\overrightarrow{${s(0)}}`;
    }
    case 32:
      return `\\widetilde{${s(0)}}`;
    case 33:
      return `\\widehat{${s(0)}}`;
    case 34:
      return `\\overset{\\frown}{${s(0)}}`;
    case 36:
      return `\\cancel{${s(0)}}`;
    case 37:
      return `\\boxed{${s(0)}}`;
    default:
      return sl.map(tex).join(' ');
  }
}

function cleanLatex(s) {
  return s
    .replace(/\s+/g, ' ')
    .replace(/\s*([_^])\s*/g, '$1')
    .replace(/\{\s+/g, '{')
    .replace(/\s+\}/g, '}')
    .trim();
}

// Từ nội dung tệp oleObject*.bin (Uint8Array) → LaTeX
export function mathTypeOleToLatex(bytes) {
  const cfb = CFB.read(bytes, { type: 'array' });
  const entry = CFB.find(cfb, 'Equation Native') || cfb.FileIndex.find((f) => /equation native/i.test(f.name));
  if (!entry?.content) throw new Error('Không thấy luồng Equation Native');
  const data = entry.content instanceof Uint8Array ? entry.content : Uint8Array.from(entry.content);
  const hdrLen = data[0] | (data[1] << 8);
  return cleanLatex(texOfObjects(parseMtef(data.subarray(hdrLen))));
}

export const _test = { parseMtef, texOfObjects };
