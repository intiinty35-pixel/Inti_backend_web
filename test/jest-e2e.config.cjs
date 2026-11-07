/** Pruebas de extremo a extremo: levantan la API completa con una base SQLite temporal. */
module.exports = {
  rootDir: "..",
  testRegex: "test/.*\.e2e-spec\.ts$",
  testEnvironment: "node",
  testTimeout: 60000,
  setupFiles: ["<rootDir>/test/e2e-env.cjs"],
  transform: { "^.+\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.spec.json" }] },
};
