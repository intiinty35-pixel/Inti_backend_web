import { createComplaintPdf } from "./complaint-pdf";

const record = {
  claimantFirstName: "María",
  claimantLastName: "Pérez",
  claimantEmail: "maria@example.com",
  claimantPhone: "+591 70000000",
  documentNumber: "1234567",
};

const encoded = (value: string) => `<${Buffer.from(value, "latin1").toString("hex").toUpperCase()}>`;

describe("createComplaintPdf", () => {
  it("genera una plantilla descargable en horizontal aunque todavía no existan datos", () => {
    const pdf = createComplaintPdf({
      claimantFirstName: "",
      claimantLastName: "",
      documentNumber: "",
      claimantPhone: "",
      claimantEmail: "",
    }).toString("ascii");

    expect(pdf).toContain("/Count 1");
    expect(pdf).toContain("/MediaBox [0 0 842 595]");
    for (const heading of ["Número de documento", "Nombres", "Apellidos", "Teléfono", "Correo electrónico"]) {
      expect(pdf).toContain(encoded(heading));
    }
  });

  it("genera un PDF que contiene únicamente los datos solicitados del consumidor en columnas", () => {
    const pdf = createComplaintPdf(record).toString("ascii");

    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("/Count 1");
    expect(pdf).toContain("/WinAnsiEncoding");
    for (const value of [
      "Número de documento",
      "1234567",
      "Nombres",
      "María",
      "Apellidos",
      "Pérez",
      "Teléfono",
      "+591 70000000",
      "Correo electrónico",
      "maria@example.com",
    ]) {
      expect(pdf).toContain(encoded(value));
    }
    expect(pdf).not.toContain(encoded("Descripción del problema"));
    expect(pdf.endsWith("%%EOF")).toBe(true);
  });
});
