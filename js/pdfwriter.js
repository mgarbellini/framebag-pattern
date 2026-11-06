/*
 * Framebag Pattern — pdfwriter.js
 *
 * A deliberately small PDF writer: vector paths, clipping, dashes, grey
 * fills and Helvetica text. Coordinates are millimetres from the top-left
 * corner of the page (y grows downwards), like the rest of the app.
 *
 * Text uses the standard Helvetica and Helvetica-Bold fonts that every PDF
 * viewer provides, so nothing is embedded. Character widths below are the
 * Adobe Core 14 AFM metrics (Copyright (c) 1985, 1987, 1989, 1990, 1997 Adobe
 * Systems Incorporated. All Rights Reserved.) mapped to WinAnsi codes 32–255.
 */
(function (root) {
  'use strict';

  const FB = root.FB = root.FB || {};
  const K = 72 / 25.4; // PDF points per millimetre

  const W_REG = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 0,
    556, 0, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0,
    0, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 0, 500, 667,
    278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333,
    400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611,
    667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278,
    722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611,
    556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500
  ];
  const W_BOLD = [
    278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
    975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
    333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
    611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584, 0,
    556, 0, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0,
    0, 278, 278, 500, 500, 350, 556, 1000, 333, 1000, 556, 333, 944, 0, 500, 667,
    278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333,
    400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611,
    722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278,
    722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611,
    556, 556, 556, 556, 556, 556, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278,
    611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556
  ];
  // WinAnsi (CP1252) codes for characters above U+00FF.
  const CP1252 = {
    0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86,
    0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C,
    0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95,
    0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B,
    0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F
  };
  // Stand-ins for common characters the standard fonts cannot show.
  const SUBST = { '−': '-', '≈': '~', '≤': '<=', '≥': '>=', '→': '->', '←': '<-' };

  function toCodes(str) {
    const out = [];
    for (const ch of String(str)) {
      const s = SUBST[ch];
      if (s) {
        for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
        continue;
      }
      const cp = ch.codePointAt(0);
      if ((cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff)) out.push(cp);
      else if (CP1252[cp]) out.push(CP1252[cp]);
      else if (cp === 0x09 || cp === 0x0a || cp === 0x0d) out.push(0x20);
      else out.push(0x3f); // '?'
    }
    return out;
  }

  function literal(codes) {
    let s = '(';
    for (const c of codes) {
      if (c === 0x28 || c === 0x29 || c === 0x5c) s += '\\' + String.fromCharCode(c);
      else if (c < 0x20 || c > 0x7e) s += '\\' + c.toString(8).padStart(3, '0');
      else s += String.fromCharCode(c);
    }
    return s + ')';
  }

  /** PDF text string in UTF-16BE, for document metadata. */
  function utf16(str) {
    let s = '<FEFF';
    for (let i = 0; i < str.length; i++) s += str.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
    return s + '>';
  }

  function num(v) {
    if (Math.abs(v) < 5e-4) return '0';
    let s = v.toFixed(3);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s === '-0' ? '0' : s;
  }

  function textWidthPt(str, size, bold) {
    const w = bold ? W_BOLD : W_REG;
    let t = 0;
    for (const c of toCodes(str)) t += w[c - 32] || 0;
    return t * size / 1000;
  }

  function pdfDate(d) {
    const p = (v) => String(v).padStart(2, '0');
    return 'D:' + d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) +
      p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z';
  }

  function PdfDoc(opts) {
    opts = opts || {};
    this.title = opts.title || '';
    this.creator = opts.creator || '';
    this.pages = [];
    this.cur = null;
  }

  PdfDoc.prototype = {
    addPage(wMm, hMm) {
      this.cur = { w: wMm, h: hMm, ops: [] };
      this.pages.push(this.cur);
      return this;
    },
    op(s) { this.cur.ops.push(s); return this; },
    pt(x, y) { return num(x * K) + ' ' + num((this.cur.h - y) * K); },

    // graphics state
    save() { return this.op('q'); },
    restore() { return this.op('Q'); },
    lineWidth(mm) { return this.op(num(mm * K) + ' w'); },
    strokeGray(g) { return this.op(num(g) + ' G'); },
    fillGray(g) { return this.op(num(g) + ' g'); },
    dash(arrMm, phaseMm) {
      const a = (arrMm || []).map((v) => num(v * K)).join(' ');
      return this.op('[' + a + '] ' + num((phaseMm || 0) * K) + ' d');
    },
    lineCap(c) { return this.op(c + ' J'); },
    lineJoin(j) { return this.op(j + ' j'); },

    // paths
    moveTo(x, y) { return this.op(this.pt(x, y) + ' m'); },
    lineTo(x, y) { return this.op(this.pt(x, y) + ' l'); },
    curveTo(x1, y1, x2, y2, x3, y3) { return this.op(this.pt(x1, y1) + ' ' + this.pt(x2, y2) + ' ' + this.pt(x3, y3) + ' c'); },
    closePath() { return this.op('h'); },
    stroke() { return this.op('S'); },
    fill() { return this.op('f'); },
    rect(x, y, w, h) {
      return this.op(num(x * K) + ' ' + num((this.cur.h - y - h) * K) + ' ' + num(w * K) + ' ' + num(h * K) + ' re');
    },
    clipRect(x, y, w, h) { this.rect(x, y, w, h); return this.op('W n'); },
    polyline(pts, closed) {
      if (pts.length < 2) return this;
      this.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) this.lineTo(pts[i][0], pts[i][1]);
      if (closed) this.closePath();
      return this;
    },
    line(x1, y1, x2, y2) { return this.moveTo(x1, y1).lineTo(x2, y2).stroke(); },
    circle(cx, cy, r) {
      const k = 0.5522847498 * r;
      this.moveTo(cx + r, cy);
      this.curveTo(cx + r, cy + k, cx + k, cy + r, cx, cy + r);
      this.curveTo(cx - k, cy + r, cx - r, cy + k, cx - r, cy);
      this.curveTo(cx - r, cy - k, cx - k, cy - r, cx, cy - r);
      this.curveTo(cx + k, cy - r, cx + r, cy - k, cx + r, cy);
      return this.closePath();
    },

    /**
     * Text with its baseline at (x, y). Options: size (pt), bold, gray (0–1),
     * align ('left' | 'center' | 'right'), angle (degrees, anticlockwise).
     */
    text(str, x, y, o) {
      o = o || {};
      const size = o.size || 10;
      const bold = !!o.bold;
      const codes = toCodes(str);
      const w = textWidthPt(str, size, bold);
      const ang = (o.angle || 0) * Math.PI / 180;
      const c = Math.cos(ang), s = Math.sin(ang);
      const shift = o.align === 'center' ? -w / 2 : (o.align === 'right' ? -w : 0);
      const px = x * K + shift * c;
      const py = (this.cur.h - y) * K + shift * s;
      if (o.gray != null) this.fillGray(o.gray);
      return this.op('BT /' + (bold ? 'F2' : 'F1') + ' ' + num(size) + ' Tf ' +
        num(c) + ' ' + num(s) + ' ' + num(-s) + ' ' + num(c) + ' ' + num(px) + ' ' + num(py) + ' Tm ' +
        literal(codes) + ' Tj ET');
    },
    textWidth(str, size, bold) { return textWidthPt(str, size, bold) / K; },

    /** The finished file as bytes. */
    output() {
      const objs = [];
      const add = (body) => { objs.push(body); return objs.length; };
      const catalog = add('');
      const pagesId = add('');
      const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
      const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
      const info = add('<< /Title ' + utf16(this.title) + ' /Creator ' + utf16(this.creator) +
        ' /Producer (Framebag Pattern) /CreationDate (' + pdfDate(new Date()) + ') >>');
      const kids = [];
      for (const pg of this.pages) {
        const content = pg.ops.join('\n');
        const cid = add('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
        const pid = add('<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 ' + num(pg.w * K) + ' ' + num(pg.h * K) +
          '] /Resources << /Font << /F1 ' + f1 + ' 0 R /F2 ' + f2 + ' 0 R >> >> /Contents ' + cid + ' 0 R >>');
        kids.push(pid + ' 0 R');
      }
      objs[catalog - 1] = '<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>';
      objs[pagesId - 1] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + kids.length + ' >>';

      let out = '%PDF-1.4\n%âãÏÓ\n';
      const offsets = [];
      objs.forEach((body, i) => {
        offsets.push(out.length);
        out += (i + 1) + ' 0 obj\n' + body + '\nendobj\n';
      });
      const xref = out.length;
      out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
      for (const off of offsets) out += String(off).padStart(10, '0') + ' 00000 n \n';
      out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + catalog + ' 0 R /Info ' + info + ' 0 R >>\n' +
        'startxref\n' + xref + '\n%%EOF\n';

      const bytes = new Uint8Array(out.length);
      for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
      return bytes;
    }
  };

  FB.PdfDoc = PdfDoc;
  FB.pdfText = { toCodes, textWidthPt };
})(typeof window !== 'undefined' ? window : globalThis);
