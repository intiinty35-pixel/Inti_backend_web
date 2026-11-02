/** Pruebas unitarias: archivos *.spec.ts junto al código que prueban. */
module.exports = {
  rootDir: "src",
  testRegex: ".*\.spec\.ts$",
  testEnvironment: "node",
  transform: { "^.+\.ts$": ["ts-jest", { tsconfig: "<rootDir>/../tsconfig.spec.json" }] },
};
