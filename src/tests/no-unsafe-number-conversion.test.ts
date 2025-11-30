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
    { code: `Number(10);` },
    { code: `Number("10");` },
    { code: `const arr: string[] = ["1", "2"]; arr.map(Number);` },
  ],
  invalid: [
    // 1. Literal Null (No Fix)
    {
      code: `Number(null);`,
      errors: [{ messageId: "unsafeConversion", suggestions: undefined }],
    },

    // 2. Literal Null (No Fix)
    {
      code: `Number(undefined);`,
      errors: [{ messageId: "unsafeConversion", suggestions: undefined }],
    },

    // 3. Strict Null Variable
    {
      code: `
        const val: string | null = null;
        Number(val);
      `,
      errors: [
        {
          messageId: "unsafeConversion",
          suggestions: [
            {
              messageId: "fixStrictNull",
              // ADDED MISSING OUTPUT HERE
              output: `
        const val: string | null = null;
        val !== null ? Number(val) : null;
      `,
            },
          ],
        },
      ],
    },

    // 4. Strict Undefined Variable
    {
      code: `
        const val: string | undefined = undefined;
        Number(val);
      `,
      errors: [
        {
          messageId: "unsafeConversion",
          suggestions: [
            {
              messageId: "fixStrictUndefined",
              // ADDED MISSING OUTPUT HERE
              output: `
        const val: string | undefined = undefined;
        val !== undefined ? Number(val) : undefined;
      `,
            },
          ],
        },
      ],
    },

    // 5. Mixed (Null | Undefined)
    {
      code: `
        declare const val: string | null | undefined;
        Number(val);
      `,
      errors: [
        {
          messageId: "unsafeConversion",
          suggestions: [
            {
              messageId: "fixMixed",
              output: `
        declare const val: string | null | undefined;
        val !== null && val !== undefined ? Number(val) : val;
      `,
            },
          ],
        },
      ],
    },

    // 6. Map with Strict Null
    {
      code: `
        const arr: (string | null)[] = ["1", null];
        arr.map(Number);
      `,
      errors: [
        {
          messageId: "unsafeCallback",
          suggestions: [
            {
              messageId: "fixMapStrictNull",
              output: `
        const arr: (string | null)[] = ["1", null];
        arr.map(val => val !== null ? Number(val) : null);
      `,
            },
          ],
        },
      ],
    },

    // 7. Map with Strict Undefined
    {
      code: `
        const arr: (string | undefined)[] = ["1", undefined];
        arr.map(Number);
      `,
      errors: [
        {
          messageId: "unsafeCallback",
          suggestions: [
            {
              messageId: "fixMapStrictUndefined",
              output: `
        const arr: (string | undefined)[] = ["1", undefined];
        arr.map(val => val !== undefined ? Number(val) : undefined);
      `,
            },
          ],
        },
      ],
    },

    // 8. Map with Mixed (Null & Undefined)
    {
      code: `
        declare const arr: (string | null | undefined)[];
        arr.map(Number);
      `,
      errors: [
        {
          messageId: "unsafeCallback",
          suggestions: [
            {
              messageId: "fixMapMixed",
              output: `
        declare const arr: (string | null | undefined)[];
        arr.map(val => val !== null && val !== undefined ? Number(val) : val);
      `,
            },
          ],
        },
      ],
    },
  ],
});
