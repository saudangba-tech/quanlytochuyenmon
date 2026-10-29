// Bộ tạo file Word (.docx) tối giản, chạy hoàn toàn trên trình duyệt.
// Viết trực tiếp WordprocessingML để chèn được công thức OMML (Equation gốc của Word).
import JSZip from 'jszip';
import { splitMath } from './mathSplit.js';
import { latexToOmml } from './omml.js';

const CM = 567; // twips / cm
const EMU_CM = 360000; // EMU / cm

export const esc = (s) =>
  String(s ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function rPr({ bold, italic, underline, size, color } = {}) {
  let x = '';
  if (bold) x += '<w:b/><w:bCs/>';
  if (italic) x += '<w:i/><w:iCs/>';
  if (underline) x += '<w:u w:val="single"/>';
  if (color) x += `<w:color w:val="${color}"/>`;
  if (size) x += `<w:sz w:val="${Math.round(size * 2)}"/><w:szCs w:val="${Math.round(size * 2)}"/>`;
  return x ? `<w:rPr>${x}</w:rPr>` : '';
}

// Đoạn chữ thường; "\n" → xuống dòng, "\t" → tab
export function run(text, style = {}) {
  const pr = rPr(style);
  return String(text ?? '')
    .split('\n')
    .map((line, i) => {
      const parts = line.split('\t').map((t, j) => (j ? '<w:tab/>' : '') + (t ? `<w:t xml:space="preserve">${esc(t)}</w:t>` : ''));
      return `<w:r>${pr}${i ? '<w:br/>' : ''}${parts.join('')}</w:r>`;
    })
    .join('');
}

export const tab = () => '<w:r><w:tab/></w:r>';
export const br = () => '<w:r><w:br/></w:r>';
export const pageBreak = () => '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

// Văn bản có công thức: $...$ → OMML; nếu không chuyển được thì giữ nguyên LaTeX
export function mathRuns(text, style = {}) {
  return splitMath(text || '')
    .map((p) => {
      if (p.type === 'text') return run(p.value, style);
      const omml = latexToOmml(p.value);
      return omml || run(`$${p.value}$`, style);
    })
    .join('');
}

export function para(children, opts = {}) {
  const c = Array.isArray(children) ? children.join('') : children || '';
  let pPr = '';
  if (opts.style) pPr += `<w:pStyle w:val="${opts.style}"/>`;
  if (opts.keepNext) pPr += '<w:keepNext/>';
  if (opts.keepLines) pPr += '<w:keepLines/>';
  if (opts.tabs?.length)
    pPr += `<w:tabs>${opts.tabs.map((t) => `<w:tab w:val="${t.val || 'left'}" w:pos="${Math.round(t.pos * CM)}"/>`).join('')}</w:tabs>`;
  const sb = opts.before ?? 0;
  const sa = opts.after ?? 0;
  pPr += `<w:spacing w:before="${Math.round(sb * 20)}" w:after="${Math.round(sa * 20)}"${
    opts.line ? ` w:line="${Math.round(opts.line * 240)}" w:lineRule="auto"` : ''
  }/>`;
  if (opts.indent || opts.hanging || opts.firstLine) {
    pPr += `<w:ind w:left="${Math.round((opts.indent || 0) * CM)}"${opts.hanging ? ` w:hanging="${Math.round(opts.hanging * CM)}"` : ''}${
      opts.firstLine ? ` w:firstLine="${Math.round(opts.firstLine * CM)}"` : ''
    }/>`;
  }
  if (opts.align) pPr += `<w:jc w:val="${opts.align === 'justify' ? 'both' : opts.align}"/>`;
  return `<w:p><w:pPr>${pPr}</w:pPr>${c}</w:p>`;
}

// Tiện ích: một đoạn chỉ có chữ
export const textPara = (text, style = {}, opts = {}) => para(run(text, style), opts);

export class DocxBuilder {
  constructor({ font = 'Times New Roman', fontSize = 12, margins = { top: 2, bottom: 2, left: 2, right: 1.5 }, footer = '' } = {}) {
    this.font = font;
    this.fontSize = fontSize;
    this.margins = margins;
    this.footer = footer;
    this.body = [];
    this.media = [];
    this.docPrId = 1;
  }

  get contentWidth() {
    return 21 - this.margins.left - this.margins.right;
  }

  add(...xml) {
    this.body.push(...xml.flat());
    return this;
  }

  // Ảnh từ dataURL (png/jpeg). widthCm tối đa; giữ tỉ lệ theo w/h gốc (px)
  image(dataUrl, wPx, hPx, maxWidthCm = 8) {
    const m = /^data:image\/(png|jpe?g|gif);base64,(.+)$/.exec(dataUrl || '');
    if (!m) return '';
    const ext = m[1] === 'jpg' ? 'jpeg' : m[1];
    const idx = this.media.length + 1;
    const rid = `rIdImg${idx}`;
    this.media.push({ name: `image${idx}.${ext}`, data: m[2], rid });
    const natW = ((wPx || 400) * 2.54) / 96;
    const natH = ((hPx || 300) * 2.54) / 96;
    const scale = Math.min(1, maxWidthCm / natW);
    const cx = Math.round(natW * scale * EMU_CM);
    const cy = Math.round(natH * scale * EMU_CM);
    const id = this.docPrId++;
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Hinh ${id}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="image${idx}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  }

  // rows: mảng hàng; mỗi ô là chuỗi (chữ thường), hoặc { xml, text, bold, align, shade, span, vAlign }
  table(rows, { widths, borders = true, fontSize, headerShade = 'D9E2F3', header = false, align = 'center' } = {}) {
    const cols = widths || Array(Math.max(...rows.map((r) => r.length))).fill(this.contentWidth / rows[0].length);
    const bd = borders
      ? '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/><w:insideH w:val="single" w:sz="4" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:color="000000"/></w:tblBorders>'
      : '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>';
    const grid = cols.map((w) => `<w:gridCol w:w="${Math.round(w * CM)}"/>`).join('');
    const trs = rows
      .map((row, ri) => {
        let ci = 0;
        const tcs = row
          .map((cell) => {
            const c = typeof cell === 'object' && cell !== null ? cell : { text: cell };
            const span = c.span || 1;
            const w = cols.slice(ci, ci + span).reduce((a, b) => a + b, 0);
            ci += span;
            const isHeader = header && ri === 0;
            const shade = c.shade || (isHeader ? headerShade : '');
            let tcPr = `<w:tcW w:w="${Math.round(w * CM)}" w:type="dxa"/>`;
            if (span > 1) tcPr += `<w:gridSpan w:val="${span}"/>`;
            if (shade) tcPr += `<w:shd w:val="clear" w:color="auto" w:fill="${shade}"/>`;
            tcPr += `<w:vAlign w:val="${c.vAlign || 'center'}"/>`;
            const content =
              c.xml ||
              String(c.text ?? '')
                .split('\n')
                .map((line) =>
                  para(mathRuns(line, { bold: c.bold || isHeader, italic: c.italic, size: fontSize }), {
                    align: c.align || (isHeader ? 'center' : 'left'),
                  })
                )
                .join('');
            return `<w:tc><w:tcPr>${tcPr}</w:tcPr>${content || '<w:p/>'}</w:tc>`;
          })
          .join('');
        return `<w:tr><w:trPr><w:cantSplit/>${header && ri === 0 ? '<w:tblHeader/>' : ''}</w:trPr>${tcs}</w:tr>`;
      })
      .join('');
    this.body.push(
      `<w:tbl><w:tblPr><w:tblW w:w="${Math.round(cols.reduce((a, b) => a + b, 0) * CM)}" w:type="dxa"/><w:jc w:val="${align}"/>${bd}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${trs}</w:tbl>`
    );
    // Word yêu cầu có đoạn văn sau bảng nếu bảng đứng cuối
    return this;
  }

  _styles() {
    const sz = Math.round(this.fontSize * 2);
    const f = esc(this.font);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:eastAsia="${f}" w:cs="${f}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:lang w:val="vi-VN" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style><w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style></w:styles>`;
  }

  async toBlob(type = typeof window === 'undefined' ? 'nodebuffer' : 'blob') {
    const zip = new JSZip();
    const hasFooter = Boolean(this.footer);
    const ns =
      'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
    const mg = this.margins;
    const sect = `<w:sectPr>${hasFooter ? '<w:footerReference w:type="default" r:id="rIdFooter1"/>' : ''}<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="${Math.round(mg.top * CM)}" w:right="${Math.round(
      mg.right * CM
    )}" w:bottom="${Math.round(mg.bottom * CM)}" w:left="${Math.round(mg.left * CM)}" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>`;
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${ns}><w:body>${this.body.join('')}<w:p/>${sect}</w:body></w:document>`;

    const imgTypes = [...new Set(this.media.map((m) => m.name.split('.').pop()))];
    zip.file(
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${imgTypes
        .map((e) => `<Default Extension="${e}" ContentType="image/${e}"/>`)
        .join('')}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>${
        hasFooter ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' : ''
      }</Types>`
    );
    zip.file(
      '_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
    );
    zip.file(
      'word/_rels/document.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${
        hasFooter ? '<Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' : ''
      }${this.media
        .map((m) => `<Relationship Id="${m.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`)
        .join('')}</Relationships>`
    );
    zip.file('word/document.xml', doc);
    zip.file('word/styles.xml', this._styles());
    if (hasFooter) {
      const fld = (code) =>
        `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${code} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
      zip.file(
        'word/footer1.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr ${ns}><w:p><w:pPr><w:pStyle w:val="Footer"/><w:jc w:val="center"/></w:pPr>${run(`${this.footer} – Trang `)}${fld('PAGE')}${run('/')}${fld('NUMPAGES')}</w:p></w:ftr>`
      );
    }
    for (const m of this.media) zip.file(`word/media/${m.name}`, m.data, { base64: true });
    return zip.generateAsync({
      type,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      compression: 'DEFLATE',
    });
  }
}

// Đầu văn bản hai cột: bên trái cơ quan, bên phải quốc hiệu/tiêu đề
export function headerTable(builder, left, right, widths) {
  const w = widths || [builder.contentWidth * 0.42, builder.contentWidth * 0.58];
  const cell = (lines) => ({
    xml: lines.map((l) => para(run(l.text, { bold: l.bold, italic: l.italic, underline: l.underline, size: l.size }), { align: 'center' })).join(''),
    vAlign: 'top',
  });
  builder.table([[cell(left), cell(right)]], { widths: w, borders: false });
}
