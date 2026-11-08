export interface ComplaintPdfRecord {
  ticketNumber: string;
  claimantName: string;
  claimantEmail: string;
  claimantPhone: string;
  documentNumber: string | null;
  entryType: string;
  serviceDescription: string;
  detail: string;
  desiredResolution: string | null;
  createdAt: Date;
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

function wrap(value: string, width: number): string[] {
  const result: string[] = [];
  for (const sourceLine of value.replace(/\r/g, "").split("\n")) {
    let line = sourceLine.trim();
    if (!line) {
      result.push("");
      continue;
    }
    while (line.length > width) {
      let splitAt = line.lastIndexOf(" ", width);
      if (splitAt < 1) splitAt = width;
      result.push(line.slice(0, splitAt).trim());
      line = line.slice(splitAt).trim();
    }
    result.push(line);
  }
  return result;
}

export function createComplaintPdf(entry: ComplaintPdfRecord): Buffer {
  const dateLabel = new Intl.DateTimeFormat("es-BO", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/La_Paz",
  }).format(entry.createdAt);
  const pages: string[] = [];
  let commands: string[] = [];
  let y = 744;
  let pageNumber = 0;

  function startPage() {
    pageNumber += 1;
    commands = [
      "0.05 0.20 0.43 rg 0 770 595 72 re f",
      `BT /F2 18 Tf 48 808 Td ${pdfHex("LIBRO DE RECLAMACIONES")} Tj ET`,
      `BT /F1 9 Tf 49 788 Td ${pdfHex(`Constancia de reclamo · ${entry.ticketNumber}`)} Tj ET`,
      `BT /F1 8 Tf 500 28 Td ${pdfHex(String(pageNumber))} Tj ET`,
      "0.75 0.79 0.84 RG 48 48 m 547 48 l S",
    ];
    y = 744;
  }

  function writeLine(text: string, bold = false, size = 10, color = "0.12 0.16 0.22") {
    if (y < 68) {
      pages.push(commands.join("\n"));
      startPage();
    }
    commands.push(`${color} rg BT /${bold ? "F2" : "F1"} ${size} Tf 50 ${y} Td ${pdfHex(text)} Tj ET`);
    y -= Math.round(size * 1.55);
  }

  function writeField(label: string, value: string, width = 96) {
    writeLine(label, true, 10, "0.05 0.20 0.43");
    for (const line of wrap(value || "No indicado", width)) writeLine(line || " ", false, 10);
    y -= 7;
  }

  startPage();
  writeLine("Constancia de recepción", true, 14, "0.05 0.20 0.43");
  writeLine(`Código: ${entry.ticketNumber}`, true, 11);
  writeLine(`Fecha y hora: ${dateLabel}`, false, 10);
  y -= 12;
  writeField("Datos de la persona", entry.claimantName);
  writeField("Documento de identidad", entry.documentNumber || "No indicado");
  writeField("Correo electrónico", entry.claimantEmail);
  writeField("Teléfono", entry.claimantPhone);
  writeField("Tipo", entry.entryType === "COMPLAINT" ? "Reclamo" : "Queja");
  writeField("Servicio relacionado", entry.serviceDescription);
  writeField("Detalle", entry.detail, 95);
  writeField("Solución solicitada", entry.desiredResolution || "No indicada", 95);
  writeLine("Documento generado desde el registro del Libro de Reclamaciones de Inti.", false, 8, "0.37 0.41 0.47");
  pages.push(commands.join("\n"));

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
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
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
