/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  // Ignore the build output directory so we don't run tests twice
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
  // explicitly transform ts files
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.json",
      },
    ],
  },
};
