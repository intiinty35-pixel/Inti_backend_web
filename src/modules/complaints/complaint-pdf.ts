export interface ComplaintPdfRecord {
  claimantFirstName: string;
  claimantLastName: string;
  claimantEmail: string;
  claimantPhone: string;
  documentNumber: string | null;
}

const CP1252_EXTENDED = new Map<number, number>([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85],
  [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a],
  [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92],
  [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c],
  [0x017e, 0x9e], [0x0178, 0x9f],
]);

function pdfHex(text: string) {
  let hex = "";
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0x3f;
    const byte = CP1252_EXTENDED.get(code) ?? (code <= 0xff && !(code >= 0x80 && code <= 0x9f) ? code : 0x3f);
    hex += byte.toString(16).padStart(2, "0");
  }
  return `<${hex.toUpperCase()}>`;
}

export function createComplaintPdf(entry: ComplaintPdfRecord): Buffer {
  const commands = [
    "0.05 0.20 0.43 rg 0 523 842 72 re f",
    `BT /F2 18 Tf 48 561 Td ${pdfHex("DATOS DEL CONSUMIDOR")} Tj ET`,
    `BT /F1 9 Tf 49 541 Td ${pdfHex("Libro de Reclamaciones")} Tj ET`,
  ];
  const left = 48;
  const widths = [145, 135, 135, 120, 211];
  const tableWidth = widths.reduce((total, width) => total + width, 0);
  const headerTop = 480;
  const headerHeight = 42;
  const rowHeight = 66;
  const rowTop = headerTop - headerHeight;
  const rowBottom = rowTop - rowHeight;
  const headings = ["Número de documento", "Nombres", "Apellidos", "Teléfono", "Correo electrónico"];
  const values = [entry.documentNumber, entry.claimantFirstName, entry.claimantLastName, entry.claimantPhone, entry.claimantEmail];

  commands.push(`0.90 0.93 0.97 rg ${left} ${rowTop} ${tableWidth} ${headerHeight} re f`);
  commands.push(`0.98 0.985 0.995 rg ${left} ${rowBottom} ${tableWidth} ${rowHeight} re f`);
  commands.push(`0.74 0.79 0.86 RG 0.7 w ${left} ${rowBottom} ${tableWidth} ${headerHeight + rowHeight} re S`);
  let columnX = left;
  headings.forEach((heading, index) => {
    if (index > 0) commands.push(`0.78 0.82 0.87 RG 0.6 w ${columnX} ${rowBottom} m ${columnX} ${headerTop} l S`);
    commands.push(`0.19 0.26 0.37 rg BT /F2 8 Tf ${columnX + 6} ${rowTop + 17} Td ${pdfHex(heading)} Tj ET`);
    const value = (values[index] ?? "").slice(0, index === 4 ? 42 : 27);
    if (value) commands.push(`0.12 0.16 0.22 rg BT /F1 9 Tf ${columnX + 6} ${rowBottom + 29} Td ${pdfHex(value)} Tj ET`);
    columnX += widths[index];
  });
  commands.push("0.75 0.79 0.84 RG 48 30 m 794 30 l S");

  const pages = [commands.join("\n")];

  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  const pageIds: number[] = [];
  pages.forEach((content, index) => {
    const pageId = 5 + index * 2;
    const contentId = pageId + 1;
    pageIds.push(pageId);
    const stream = `${content}\n`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}endstream`);
  });
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let document = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(document, "ascii"));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(document, "ascii");
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) document += `${String(offset).padStart(10, "0")} 00000 n \n`;
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(document, "ascii");
}
