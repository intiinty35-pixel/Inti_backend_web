import {
  isLotProjectType,
  phaseBelongsToType,
  type ProjectInput,
  type ProjectMediaData,
  type ProjectUnitData,
} from "../domain/project";
import { ProjectValidationError } from "../domain/project.errors";

const MIN_YEAR = 1900;
const MAX_YEAR = 2200;
const TAX_ID_PATTERN = /^[0-9A-Za-z-]{5,20}$/;

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Acepta solo fechas reales con formato AAAA-MM-DD dentro del rango permitido. */
function parseDay(value: string | undefined, label: string): number | undefined {
  if (!value) return undefined;
  const time = /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(`${value}T00:00:00Z`) : Number.NaN;
  const year = Number(value.slice(0, 4));
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value || year < MIN_YEAR || year > MAX_YEAR) {
    throw new ProjectValidationError(`${label} no es una fecha válida (usa el formato AAAA-MM-DD).`);
  }
  return time;
}

function validateDates(input: ProjectInput): void {
  const start = parseDay(input.startDate, "La fecha de inicio");
  const delivery = parseDay(input.estimatedDelivery, "La fecha de entrega");
  if (start !== undefined && delivery !== undefined && delivery < start) {
    throw new ProjectValidationError("La entrega estimada no puede ser anterior al inicio.");
  }
  input.timeline.forEach((entry) => parseDay(entry.date, `La fecha de "${entry.phase}"`));
}

export function validateUnit(unit: ProjectUnitData, lotProject: boolean): ProjectUnitData {
  const normalized: ProjectUnitData = {
    ...unit,
    unitNumber: unit.unitNumber.trim(),
    view: clean(unit.view),
    block: clean(unit.block),
    lotNumber: clean(unit.lotNumber),
  };

  if (lotProject) {
    if (unit.type !== "LOT") throw new ProjectValidationError("Las unidades de una lotización deben ser lotes.");
    if (!normalized.block || !normalized.lotNumber) throw new ProjectValidationError("Cada lote necesita manzana y número de lote.");
    normalized.unitNumber = normalized.unitNumber || `${normalized.block}-${normalized.lotNumber}`;
    return normalized;
  }

  if (unit.type === "LOT") throw new ProjectValidationError("Los lotes solo se pueden registrar en proyectos de lotización.");
  if (!normalized.unitNumber) throw new ProjectValidationError("Cada unidad necesita un número o nombre.");
  return { ...normalized, block: undefined, lotNumber: undefined, frontWidth: undefined };
}

function normalizeUnits(units: ProjectUnitData[], lotProject: boolean): ProjectUnitData[] {
  const normalized = units.map((unit) => validateUnit(unit, lotProject));
  const identifiers = normalized.map((unit) => (lotProject ? `${unit.block}|${unit.lotNumber}` : unit.unitNumber).toLowerCase());
  if (new Set(identifiers).size !== identifiers.length) {
    throw new ProjectValidationError(lotProject ? "Hay lotes repetidos en la misma manzana." : "Hay unidades con el mismo número.");
  }
  return normalized;
}

/** Deja exactamente una portada: la marcada o, si no hay ninguna, la primera. */
function normalizeMedia(media: ProjectMediaData[]): ProjectMediaData[] {
  const coverIndex = Math.max(0, media.findIndex((item) => item.isCover));
  return media.map((item, index) => ({ ...item, position: index, isCover: index === coverIndex }));
}

const WITHOUT_LOT_DATA = {
  ruc: undefined,
  socialReason: undefined,
  initialFee: undefined,
  monthlyPayment: undefined,
  financingInfo: undefined,
  totalBlocks: undefined,
  hasUrbanization: false,
  hasPropertyTitle: false,
} satisfies Partial<ProjectInput>;

function applyLotizationRules(input: ProjectInput, units: ProjectUnitData[]): Partial<ProjectInput> {
  const ruc = clean(input.ruc);
  const socialReason = clean(input.socialReason);
  if (!ruc || !socialReason) throw new ProjectValidationError("Una lotización necesita RUC/NIT y razón social.");
  if (!TAX_ID_PATTERN.test(ruc)) throw new ProjectValidationError("El RUC/NIT debe tener entre 5 y 20 letras, números o guiones.");

  const usedBlocks = new Set(units.map((unit) => unit.block!.toLowerCase())).size;
  if (input.totalBlocks != null && input.totalBlocks < usedBlocks) {
    throw new ProjectValidationError(`El total de manzanas (${input.totalBlocks}) es menor a las manzanas usadas en los lotes (${usedBlocks}).`);
  }

  return {
    floors: undefined,
    ruc,
    socialReason,
    financingInfo: clean(input.financingInfo),
    hasUrbanization: input.hasUrbanization ?? false,
    hasPropertyTitle: input.hasPropertyTitle ?? false,
  };
}

/** Aplica las reglas de negocio del proyecto y limpia lo que no corresponde a su tipo. */
export function normalizeProjectInput(input: ProjectInput): ProjectInput {
  const lotProject = isLotProjectType(input.type);
  if (!phaseBelongsToType(input.phase, input.type)) throw new ProjectValidationError("La fase elegida no corresponde al tipo de proyecto.");
  if (input.units.length === 0) throw new ProjectValidationError("Agrega al menos una unidad o lote al proyecto.");
  if (input.media.length === 0) throw new ProjectValidationError("Agrega al menos una imagen del proyecto.");
  if ((input.latitude == null) !== (input.longitude == null)) throw new ProjectValidationError("Indica latitud y longitud juntas, o ninguna.");
  validateDates(input);

  const units = normalizeUnits(input.units, lotProject);
  const base: ProjectInput = {
    ...input,
    name: input.name.trim(),
    description: input.description.trim(),
    department: input.department.trim(),
    province: input.province.trim(),
    district: input.district.trim(),
    address: input.address.trim(),
    urbanization: clean(input.urbanization),
    reference: clean(input.reference),
    contactName: clean(input.contactName),
    contactEmail: clean(input.contactEmail),
    contactPhone: clean(input.contactPhone),
    contactWhatsapp: clean(input.contactWhatsapp),
    websiteUrl: clean(input.websiteUrl),
    units,
    media: normalizeMedia(input.media),
    amenities: [...new Set(input.amenities.map((amenity) => amenity.trim()).filter(Boolean))],
    timeline: input.timeline.map((entry) => ({ ...entry, phase: entry.phase.trim(), description: clean(entry.description) })),
  };

  return { ...base, ...(lotProject ? applyLotizationRules(input, units) : WITHOUT_LOT_DATA) };
}
