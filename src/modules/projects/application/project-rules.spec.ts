import type { ProjectInput, ProjectUnitData } from "../domain/project";
import { ProjectValidationError } from "../domain/project.errors";
import { normalizeProjectInput, validateUnit } from "./project-rules";

const description = "Proyecto de prueba con una descripción suficientemente larga para ser válida.";

const apartment = (unitNumber: string, overrides: Partial<ProjectUnitData> = {}): ProjectUnitData => ({
  unitNumber,
  type: "APARTMENT",
  status: "AVAILABLE",
  price: 100000,
  ...overrides,
});

const lot = (block: string, lotNumber: string, overrides: Partial<ProjectUnitData> = {}): ProjectUnitData => ({
  unitNumber: "",
  type: "LOT",
  status: "AVAILABLE",
  block,
  lotNumber,
  ...overrides,
});

function residential(overrides: Partial<ProjectInput> = {}): ProjectInput {
  return {
    name: "  Torres del Urubó ",
    description,
    type: "RESIDENTIAL",
    phase: "PRE_SALE",
    currency: "USD",
    department: "Santa Cruz",
    province: "Andrés Ibáñez",
    district: "Urubó",
    address: "Av. Principal 100",
    units: [apartment("101"), apartment("102")],
    media: [{ url: "http://localhost/a.png", kind: "IMAGE" }],
    amenities: [],
    timeline: [],
    ...overrides,
  };
}

function lotization(overrides: Partial<ProjectInput> = {}): ProjectInput {
  return residential({
    type: "LOTIZATION",
    phase: "PLOTTING",
    ruc: "1023456028",
    socialReason: "Inmobiliaria Las Palmas S.R.L.",
    units: [lot("A", "1"), lot("B", "1")],
    ...overrides,
  });
}

const expectInvalid = (input: ProjectInput, message: RegExp) => {
  expect(() => normalizeProjectInput(input)).toThrow(ProjectValidationError);
  expect(() => normalizeProjectInput(input)).toThrow(message);
};

describe("normalizeProjectInput", () => {
  describe("reglas generales", () => {
    it("limpia espacios y devuelve el proyecto normalizado", () => {
      expect(normalizeProjectInput(residential()).name).toBe("Torres del Urubó");
    });

    it("exige al menos una unidad y una imagen", () => {
      expectInvalid(residential({ units: [] }), /al menos una unidad/);
      expectInvalid(residential({ media: [] }), /al menos una imagen/);
    });

    it("rechaza una fase que no corresponde al tipo", () => {
      expectInvalid(residential({ phase: "URBANIZATION" }), /fase elegida/);
      expectInvalid(lotization({ phase: "PRE_SALE" }), /fase elegida/);
    });

    it("exige latitud y longitud juntas", () => {
      expectInvalid(residential({ latitude: -17.7 }), /latitud y longitud/);
      expect(() => normalizeProjectInput(residential({ latitude: -17.7, longitude: -63.1 }))).not.toThrow();
    });

    it("elimina amenidades repetidas o vacías", () => {
      const result = normalizeProjectInput(residential({ amenities: ["Piscina", " Piscina ", "", "Gimnasio"] }));
      expect(result.amenities).toEqual(["Piscina", "Gimnasio"]);
    });

    it("deja exactamente una portada, la primera si ninguna está marcada", () => {
      const media = [
        { url: "a", kind: "IMAGE" as const },
        { url: "b", kind: "RENDER" as const },
      ];
      expect(normalizeProjectInput(residential({ media })).media.map((item) => item.isCover)).toEqual([true, false]);
      expect(normalizeProjectInput(residential({ media: [{ ...media[0], isCover: true }, { ...media[1], isCover: true }] })).media.map((item) => item.isCover)).toEqual([true, false]);
    });
  });

  describe("fechas", () => {
    it.each(["012027-03-12", "2027-02-31", "27-01-2027", "2027/01/01", "1800-01-01", "2300-01-01"])("rechaza %s", (value) => {
      expectInvalid(residential({ startDate: value }), /fecha válida/);
    });

    it("acepta fechas reales e ignora las vacías", () => {
      expect(() => normalizeProjectInput(residential({ startDate: "2026-01-15", estimatedDelivery: "2027-12-01" }))).not.toThrow();
      expect(() => normalizeProjectInput(residential({ startDate: undefined }))).not.toThrow();
    });

    it("rechaza una entrega anterior al inicio", () => {
      expectInvalid(residential({ startDate: "2027-06-01", estimatedDelivery: "2027-01-01" }), /no puede ser anterior/);
    });

    it("valida también las fechas del cronograma", () => {
      expectInvalid(residential({ timeline: [{ phase: "Entrega", date: "2027-13-01" }] }), /Entrega/);
    });
  });

  describe("unidades", () => {
    it("rechaza unidades con el mismo número, sin distinguir mayúsculas", () => {
      expectInvalid(residential({ units: [apartment("A1"), apartment("a1")] }), /mismo número/);
    });

    it("rechaza lotes en un proyecto residencial y viceversa", () => {
      expectInvalid(residential({ units: [lot("A", "1")] }), /solo se pueden registrar en proyectos de lotización/);
      expectInvalid(lotization({ units: [apartment("101")] }), /deben ser lotes/);
    });
  });

  describe("lotización", () => {
    it("exige RUC/NIT y razón social", () => {
      expectInvalid(lotization({ ruc: undefined }), /RUC\/NIT y razón social/);
      expectInvalid(lotization({ socialReason: "  " }), /RUC\/NIT y razón social/);
    });

    it("valida el formato del RUC/NIT", () => {
      expectInvalid(lotization({ ruc: "12 34" }), /entre 5 y 20/);
    });

    it("exige manzana y lote, y genera el nombre del lote", () => {
      expectInvalid(lotization({ units: [lot("", "1")] }), /manzana y número de lote/);
      expect(normalizeProjectInput(lotization()).units.map((unit) => unit.unitNumber)).toEqual(["A-1", "B-1"]);
    });

    it("rechaza lotes repetidos en la misma manzana", () => {
      expectInvalid(lotization({ units: [lot("A", "1"), lot("a", "1")] }), /lotes repetidos/);
      expect(() => normalizeProjectInput(lotization({ units: [lot("A", "1"), lot("B", "1")] }))).not.toThrow();
    });

    it("rechaza un total de manzanas menor al de las usadas", () => {
      expectInvalid(lotization({ totalBlocks: 1 }), /total de manzanas/);
      expect(() => normalizeProjectInput(lotization({ totalBlocks: 2 }))).not.toThrow();
    });

    it("ignora los pisos, que no aplican a lotes", () => {
      expect(normalizeProjectInput(lotization({ floors: 8 })).floors).toBeUndefined();
    });
  });

  it("descarta los datos de lotización en un proyecto residencial", () => {
    const result = normalizeProjectInput(residential({ ruc: "1023456028", socialReason: "X", initialFee: 100, totalBlocks: 3, hasUrbanization: true }));
    expect(result).toMatchObject({ ruc: undefined, socialReason: undefined, initialFee: undefined, totalBlocks: undefined, hasUrbanization: false });
  });
});

describe("validateUnit", () => {
  it("quita los datos de manzana en proyectos que no son de lotización", () => {
    const unit = validateUnit(apartment("101", { block: "A", lotNumber: "1", frontWidth: 10 }), false);
    expect(unit).toMatchObject({ block: undefined, lotNumber: undefined, frontWidth: undefined });
  });
});
