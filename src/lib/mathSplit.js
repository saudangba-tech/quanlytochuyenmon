// Tách chuỗi thành các đoạn: văn bản thường, công thức $...$ (inline), $$...$$ (display).
// Hỗ trợ cả \( ... \) và \[ ... \].
export function splitMath(src) {
  const out = [];
  const text = src || '';
  const re = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ type: 'text', value: text.slice(last, m.index) });
    if (m[1] !== undefined || m[2] !== undefined) out.push({ type: 'display', value: (m[1] ?? m[2]).trim() });
    else out.push({ type: 'inline', value: (m[3] ?? m[4]).trim() });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  return out;
}
