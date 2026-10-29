// Chuyển LaTeX → OMML (công thức Equation gốc của Word, sửa được trong Word)
// Đường đi: LaTeX --KaTeX--> MathML --mathml2omml--> OMML, rồi dọn các lỗi nhỏ của thư viện.
import katex from 'katex';
import { mml2omml } from 'mathml2omml';

function preprocess(tex) {
  return tex
    .replace(/\\(dfrac|tfrac)/g, '\\frac')
    .replace(/\\displaystyle/g, '');
}

// Bọc các đoạn chữ "lạc" (nằm ngoài <m:t>) thành <m:r><m:t>…</m:t></m:r>, Word không chấp nhận chữ trần.
function wrapStrayText(xml) {
  const tokens = xml.split(/(<[^>]+>)/);
  const stack = [];
  let out = '';
  for (const tk of tokens) {
    if (!tk) continue;
    if (tk.startsWith('<')) {
      if (tk.startsWith('</')) stack.pop();
      else if (!tk.endsWith('/>') && !tk.startsWith('<?')) stack.push(tk.slice(1).split(/[\s>]/)[0]);
      out += tk;
    } else {
      const top = stack[stack.length - 1];
      if (top === 'm:t' || top === 'w:t' || !tk.trim()) out += tk;
      else out += `<m:r><m:t xml:space="preserve">${tk}</m:t></m:r>`;
    }
  }
  return out;
}

// Tên hàm (sin, cos, log, lim…) được KaTeX đánh dấu bằng U+2061: tách thành run chữ đứng
function uprightFunctions(xml) {
  return xml.replace(/<m:r>(<m:rPr>[\s\S]*?<\/m:rPr>)?<m:t xml:space="preserve">([^<]*⁡[^<]*)<\/m:t><\/m:r>/g, (_, pr = '', text) => {
    const r = (t) => (t ? `<m:r>${pr}<m:t xml:space="preserve">${t}</m:t></m:r>` : '');
    const pieces = text.split(/([a-zA-Z]+)⁡/);
    let out = '';
    for (let i = 0; i < pieces.length; i++) {
      if (i % 2 === 0) out += r(pieces[i].replace(/⁡/g, ''));
      else {
        const hasArg = i + 1 < pieces.length && pieces[i + 1].length > 0;
        out += `<m:r><m:rPr><m:sty m:val="p"/></m:rPr><m:t xml:space="preserve">${pieces[i]}${hasArg ? ' ' : ''}</m:t></m:r>`;
      }
    }
    return out;
  });
}

// Hệ phương trình \begin{cases}: dấu "{" co giãn theo chiều cao, căn trái các dòng
function bracedCases(xml) {
  return xml.replace(/\{<\/m:t><\/m:r>(<m:m>[\s\S]*?<\/m:m>)/g, (_, mat) => {
    const left = mat.replace(/<m:mcJc m:val="center"\/>/g, '<m:mcJc m:val="left"/>');
    return `</m:t></m:r><m:d><m:dPr><m:begChr m:val="{"/><m:endChr m:val=""/><m:ctrlPr/></m:dPr><m:e>${left}</m:e></m:d>`;
  });
}

function cleanup(xml) {
  let s = xml
    .replace(/<m:argPr><m:scrLvl m:val="0"\/><\/m:argPr>/g, '')
    .replace(/<m:sty m:val="undefined"\/>/g, '')
    .replace(/<w:rPr\/>/g, '')
    .replace(/<m:rPr><\/m:rPr>/g, '')
    .replace(/<m:r><m:t xml:space="preserve"><\/m:t><\/m:r>/g, '');
  s = uprightFunctions(s);
  s = bracedCases(s);
  s = s.replace(/⁡/g, '');
  return wrapStrayText(s);
}

const DOUBLE_STRUCK = { R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ' };

const cache = new Map();

export function latexToOmml(tex) {
  if (cache.has(tex)) return cache.get(tex);
  let result = null;
  try {
    const html = katex.renderToString(preprocess(tex), { output: 'mathml', throwOnError: true, strict: 'ignore' });
    const m = html.match(/<math[\s\S]*<\/math>/);
    if (m) {
      const mathml = m[0]
        .replace(/<annotation[\s\S]*?<\/annotation>/g, '')
        .replace(/<mi mathvariant="double-struck">([RNZQC])<\/mi>/g, (_, c) => `<mi>${DOUBLE_STRUCK[c]}</mi>`);
      result = cleanup(mml2omml(mathml));
    }
  } catch {
    result = null;
  }
  cache.set(tex, result);
  return result;
}
