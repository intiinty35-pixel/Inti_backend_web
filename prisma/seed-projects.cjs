const { PrismaClient } = require("@prisma/client");
const { ensureDemoAccounts, ensureDemoSubscription } = require("./demo-support.cjs");

const prisma = new PrismaClient();
const frontendUrl = process.env.FRONTEND_PUBLIC_URL ?? "http://localhost:3000";
const day = (value) => new Date(`${value}T00:00:00Z`);
const images = (...numbers) => numbers.map((number, index) => ({ url: `${frontendUrl}/home/${number}.jpg`, kind: "IMAGE", position: index, isCover: index === 0 }));

/** Departamentos u oficinas: `floors` pisos con `perFloor` unidades cada uno. */
function buildingUnits({ prefix, type, floors, perFloor, baseArea, bedrooms, bathrooms, parking, basePrice, soldCount = 0, reservedCount = 0 }) {
  const units = [];
  for (let floor = 1; floor <= floors; floor++) {
    for (let index = 1; index <= perFloor; index++) {
      const position = units.length;
      units.push({
        unitNumber: `${prefix}${floor}0${index}`,
        type,
        floor,
        area: baseArea + index * 6,
        bedrooms: bedrooms == null ? null : bedrooms + (index % 2),
        bathrooms,
        parkingSpots: parking,
        price: basePrice + floor * 2500 + index * 4000,
        status: position < soldCount ? "SOLD" : position < soldCount + reservedCount ? "RESERVED" : "AVAILABLE",
        position,
      });
    }
  }
  return units;
}

/** Lotes por manzana: cada manzana trae `perBlock` lotes numerados desde 1. */
function lotUnits({ blocks, perBlock, area, frontWidth, basePrice, soldCount = 0, reservedCount = 0 }) {
  const units = [];
  for (const block of blocks) {
    for (let lot = 1; lot <= perBlock; lot++) {
      const position = units.length;
      units.push({
        unitNumber: `${block}-${lot}`,
        type: "LOT",
        area: area + (lot % 3) * 20,
        frontWidth: frontWidth + (lot % 3),
        price: basePrice + (lot % 3) * 4000,
        status: position < soldCount ? "SOLD" : position < soldCount + reservedCount ? "RESERVED" : "AVAILABLE",
        block,
        lotNumber: String(lot),
        position,
      });
    }
  }
  return units;
}

const contact = { contactName: "Equipo comercial Inti", contactEmail: "admin@inti.local", contactPhone: "+591 700 000 10", contactWhatsapp: "+591 700 000 10" };

const demoProjects = [
  {
    slug: "torres-del-urubo-demo",
    name: "Torres del Urubó",
    description: "Dos torres de departamentos en el corazón del Urubó, con vistas abiertas al río Piraí, áreas verdes y un club social completo. Distribuciones de uno a tres dormitorios, acabados de primera y estacionamiento incluido para cada unidad.",
    type: "RESIDENTIAL", phase: "CONSTRUCTION", status: "PUBLISHED", currency: "USD", floors: 8, constructionProgress: 55,
    startDate: day("2026-01-15"), estimatedDelivery: day("2027-12-01"),
    department: "Santa Cruz", province: "Andrés Ibáñez", district: "Urubó", address: "Av. Principal del Urubó", urbanization: "Urbanización Río Piraí", reference: "A 5 minutos del puente Urubó", latitude: -17.7592, longitude: -63.2368,
    ...contact,
    units: buildingUnits({ prefix: "T", type: "APARTMENT", floors: 4, perFloor: 3, baseArea: 62, bedrooms: 2, bathrooms: 2, parking: 1, basePrice: 98000, soldCount: 4, reservedCount: 2 }),
    media: images(1, 2, 3),
    amenities: ["Piscina", "Gimnasio", "Salón de eventos", "Áreas verdes", "Seguridad 24/7", "Ascensor", "Parrilla / BBQ"],
    timeline: [
      { phase: "Lanzamiento y preventa", date: "2025-11-10", description: "Apertura de ventas con precios de lanzamiento.", completed: true },
      { phase: "Inicio de obra", date: "2026-01-15", description: "Excavación y cimentación de ambas torres.", completed: true },
      { phase: "Estructura terminada", date: "2026-12-15", description: "Entrega de obra gruesa de la torre A.", completed: false },
      { phase: "Entrega de departamentos", date: "2027-12-01", description: "Entrega con acabados completos.", completed: false },
    ],
    comments: [
      { authorName: "Mariana Soliz", content: "Me encantó la ubicación. ¿Los departamentos de dos dormitorios tienen balcón?" },
      { authorName: "Carlos Vaca", content: "Visité la obra el fin de semana y el avance es real. Buena atención del equipo." },
    ],
  },
  {
    slug: "residencial-equipetrol-park-demo",
    name: "Residencial Equipetrol Park",
    description: "Edificio boutique de departamentos en Equipetrol, pensado para quienes buscan vivir cerca de todo. Cuenta con terraza social, coworking y seguridad permanente, a pocos pasos de restaurantes, colegios y centros comerciales.",
    type: "RESIDENTIAL", phase: "PRE_SALE", status: "PUBLISHED", currency: "BOB", floors: 10, constructionProgress: 8,
    startDate: day("2027-02-01"), estimatedDelivery: day("2029-03-01"),
    department: "Santa Cruz", province: "Andrés Ibáñez", district: "Equipetrol", address: "Calle 7 Oeste", urbanization: "Equipetrol Norte", reference: "A una cuadra del segundo anillo", latitude: -17.7702, longitude: -63.1988,
    ...contact,
    units: buildingUnits({ prefix: "E", type: "APARTMENT", floors: 3, perFloor: 4, baseArea: 48, bedrooms: 1, bathrooms: 1, parking: 1, basePrice: 520000, soldCount: 1, reservedCount: 3 }),
    media: images(2, 4),
    amenities: ["Terraza social", "Coworking", "Seguridad 24/7", "Ascensor", "Estacionamiento de visitas"],
    timeline: [
      { phase: "Preventa", date: "2026-10-01", description: "Reserva tu departamento con precio de preventa.", completed: true },
      { phase: "Inicio de obra", date: "2027-02-01", description: "Movimiento de tierra y fundaciones.", completed: false },
      { phase: "Entrega", date: "2029-03-01", description: "Entrega llave en mano.", completed: false },
    ],
    comments: [{ authorName: "Lucía Rojas", content: "¿Aceptan financiamiento bancario para la cuota inicial?" }],
  },
  {
    slug: "centro-empresarial-aurora-demo",
    name: "Centro Empresarial Aurora",
    description: "Oficinas y locales comerciales en un edificio corporativo sobre el tercer anillo, con recepción, salas de reuniones compartidas y estacionamiento subterráneo. Espacios flexibles desde 40 m² para emprendedores y empresas en crecimiento.",
    type: "COMMERCIAL", phase: "FINISHING", status: "PUBLISHED", currency: "USD", floors: 6, constructionProgress: 88,
    startDate: day("2025-03-01"), estimatedDelivery: day("2026-12-20"),
    department: "Santa Cruz", province: "Andrés Ibáñez", district: "Santa Cruz de la Sierra", address: "Av. Cristo Redentor", urbanization: "Tercer anillo externo", reference: "Frente a la rotonda", latitude: -17.7391, longitude: -63.1722,
    ...contact,
    units: buildingUnits({ prefix: "OF-", type: "OFFICE", floors: 3, perFloor: 3, baseArea: 40, bedrooms: null, bathrooms: 1, parking: 1, basePrice: 64000, soldCount: 3, reservedCount: 1 }),
    media: images(3, 1),
    amenities: ["Seguridad 24/7", "Ascensor", "Estacionamiento de visitas", "Salón de eventos"],
    timeline: [
      { phase: "Inicio de obra", date: "2025-03-01", completed: true },
      { phase: "Obra gruesa", date: "2026-03-01", completed: true },
      { phase: "Acabados", date: "2026-09-01", description: "Instalación de pisos, cielos y carpintería.", completed: true },
      { phase: "Entrega de oficinas", date: "2026-12-20", completed: false },
    ],
    comments: [],
  },
  {
    slug: "lotizacion-las-palmas-demo",
    name: "Lotización Las Palmas",
    description: "Lotes con habilitación urbana completa en Warnes, a 20 minutos de la ciudad. Calles asfaltadas, agua potable, energía eléctrica y áreas verdes. Financiamiento directo con cuota inicial accesible y entrega inmediata con título de propiedad.",
    type: "LOTIZATION", phase: "PLOTTING", status: "PUBLISHED", currency: "BOB", constructionProgress: 0,
    estimatedDelivery: day("2027-06-01"),
    department: "Santa Cruz", province: "Warnes", district: "Warnes", address: "Carretera al Norte km 20", reference: "A 800 metros del surtidor principal", latitude: -17.5139, longitude: -63.1664,
    ...contact,
    ruc: "1023456028", socialReason: "Inmobiliaria Las Palmas S.R.L.", initialFee: 6000, monthlyPayment: 950, financingInfo: "Hasta 60 cuotas sin interés. Entrega inmediata con la cuota inicial y trámite de título incluido.", totalBlocks: 3, hasUrbanization: true, hasPropertyTitle: true,
    units: lotUnits({ blocks: ["A", "B", "C"], perBlock: 6, area: 300, frontWidth: 10, basePrice: 78000, soldCount: 5, reservedCount: 2 }),
    media: images(4, 2),
    amenities: ["Portón de ingreso", "Calles asfaltadas", "Agua potable", "Energía eléctrica", "Alumbrado público", "Áreas verdes", "Cerco perimetral"],
    timeline: [
      { phase: "Habilitación urbana aprobada", date: "2026-02-01", completed: true },
      { phase: "Apertura de calles y servicios", date: "2026-08-01", completed: true },
      { phase: "Entrega de lotes", date: "2027-06-01", completed: false },
    ],
    comments: [
      { authorName: "Rodrigo Mamani", content: "¿Los lotes de la manzana C tienen esquina disponible?" },
      { authorName: "Teresa Añez", content: "Muy buena opción para construir. El financiamiento directo ayuda bastante." },
    ],
  },
  {
    slug: "subdivision-tierra-verde-demo",
    name: "Tierra Verde Cotoca",
    description: "Terrenos subdivididos en Cotoca, ideales para vivienda o inversión. Cada lote cuenta con acceso directo, medidas regulares y documentación en proceso de registro. Una oportunidad para asegurar tu terreno antes de la valorización de la zona.",
    type: "LAND_SUBDIVISION", phase: "REGISTRATION", status: "PUBLISHED", currency: "USD", constructionProgress: 0,
    department: "Santa Cruz", province: "Cordillera", district: "Cotoca", address: "Camino a Cotoca km 8", reference: "Pasando el segundo puente", latitude: -17.7466, longitude: -63.0412,
    ...contact,
    ruc: "4057781012", socialReason: "Tierra Verde Desarrollos S.A.", initialFee: 1500, monthlyPayment: 220, financingInfo: "Financiamiento de hasta 36 meses.", totalBlocks: 2, hasUrbanization: false, hasPropertyTitle: false,
    units: lotUnits({ blocks: ["M1", "M2"], perBlock: 5, area: 250, frontWidth: 10, basePrice: 11500, soldCount: 2 }),
    media: images(1),
    amenities: ["Cerco perimetral", "Energía eléctrica"],
    timeline: [{ phase: "Registro de propiedad", date: "2027-01-15", description: "Inscripción de los lotes en Derechos Reales.", completed: false }],
    comments: [],
  },
  {
    slug: "edificio-aurora-borrador-demo",
    name: "Edificio Aurora (borrador)",
    description: "Proyecto en preparación: edificio residencial de ocho pisos en la zona norte. Este borrador no es visible al público hasta que se publique desde el panel de administración.",
    type: "RESIDENTIAL", phase: "PRE_SALE", status: "DRAFT", currency: "USD", floors: 8, constructionProgress: 0,
    department: "Santa Cruz", province: "Andrés Ibáñez", district: "Zona Norte", address: "Av. Banzer km 5", latitude: -17.7011, longitude: -63.1695,
    ...contact,
    units: buildingUnits({ prefix: "A", type: "APARTMENT", floors: 2, perFloor: 2, baseArea: 70, bedrooms: 2, bathrooms: 2, parking: 1, basePrice: 110000 }),
    media: images(3),
    amenities: ["Piscina", "Ascensor"],
    timeline: [],
    comments: [],
  },
];

async function seedProject(project, ownerId, subscriptionId) {
  const { units, media, amenities, timeline, comments, ...fields } = project;
  // Reemplaza el proyecto demo anterior (si existe) para poder repetir el seed sin duplicados.
  await prisma.project.deleteMany({ where: { slug: project.slug } });
  await prisma.project.create({
    data: {
      ...fields,
      ownerId,
      subscriptionId,
      units: { create: units },
      media: { create: media },
      amenities: { create: amenities.map((name) => ({ name })) },
      timeline: { create: timeline.map((entry) => ({ ...entry, date: day(entry.date) })) },
      comments: { create: comments },
    },
  });
}

async function main() {
  // Crea la cuenta demo si falta y le activa un plan gratuito: así los proyectos se ven en el sitio.
  const { agent } = await ensureDemoAccounts(prisma);
  const subscriptionId = await ensureDemoSubscription(prisma, agent.id);
  for (const project of demoProjects) await seedProject(project, agent.id, subscriptionId);
  console.log(`Se cargaron ${demoProjects.length} proyectos de demostración.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
