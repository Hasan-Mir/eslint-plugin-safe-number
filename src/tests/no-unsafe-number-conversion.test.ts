import { RuleTester } from "@typescript-eslint/rule-tester";
import { noUnsafeNumberConversion } from "../rules/no-unsafe-number-conversion";
import * as path from "path";

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      // 1. Tell the parser to look for a tsconfig.json
      projectService: {
        allowDefaultProject: ["*.ts*"],
        defaultProject: "tsconfig.json",
      },
      // 2. IMPORTANT: Point to the ROOT directory where tsconfig.json lives
      // Since this test file is in src/tests/, we go up two levels to find root
      tsconfigRootDir: path.join(__dirname, "../../"),
    },
  },
});

ruleTester.run("no-unsafe-number-conversion", noUnsafeNumberConversion, {
  valid: [
    {
      code: `
        const val = "123";
        Number(val);
      `,
    },
    {
      code: `
        const val: number = 10;
        Number(val);
      `,
    },
  ],
  invalid: [
    {
      code: `Number(null);`,
      errors: [{ messageId: "unsafeConversion" }],
    },
    {
      code: `
        const val: string | null = null;
        Number(val);
      `,
      errors: [{ messageId: "unsafeConversion" }],
    },
    {
      code: `
        function convert(val: number | null) {
          return Number(val);
        }
      `,
      errors: [{ messageId: "unsafeConversion" }],
    },
  ],
});
