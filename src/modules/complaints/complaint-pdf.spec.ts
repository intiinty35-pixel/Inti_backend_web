import { createComplaintPdf } from "./complaint-pdf";

const record = {
  ticketNumber: "INTI-2026-ABCDEF0123",
  claimantName: "María Pérez",
  claimantEmail: "maria@example.com",
  claimantPhone: "+591 70000000",
  documentNumber: null,
  entryType: "COMPLAINT",
  serviceDescription: "Atención al cliente",
  detail: "Información de prueba. ".repeat(220),
  desiredResolution: null,
  createdAt: new Date("2026-11-08T12:00:00.000Z"),
};

describe("createComplaintPdf", () => {
  it("genera una constancia PDF válida con páginas para el detalle largo", () => {
    const pdf = createComplaintPdf(record);
    const source = pdf.toString("ascii");

    expect(source.startsWith("%PDF-1.4")).toBe(true);
    expect(source).toMatch(/\/Count [2-9]\d*/);
    expect(source).toContain("/WinAnsiEncoding");
    expect(source.endsWith("%%EOF")).toBe(true);
  });
});
