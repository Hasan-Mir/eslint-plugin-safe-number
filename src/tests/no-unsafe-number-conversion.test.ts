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
    // Safe Promise
    { code: `Promise.resolve("1").then(Number);` },
  ],
  invalid: [
    // 1. Direct Calls (Sanity check)
    {
      code: `Number(null);`,
      errors: [{ messageId: "unsafeConversion", suggestions: undefined }],
    },
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
              output: `
        const val: string | null = null;
        val !== null ? Number(val) : null;
      `,
            },
          ],
        },
      ],
    },

    // 2. Array.map (Generic Check)
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

    // 3. Array.from (Generic Check - 2nd Argument)
    {
      code: `
        const set = new Set<string | undefined>(["1", undefined]);
        Array.from(set, Number);
      `,
      errors: [
        {
          messageId: "unsafeCallback",
          suggestions: [
            {
              messageId: "fixMapStrictUndefined",
              output: `
        const set = new Set<string | undefined>(["1", undefined]);
        Array.from(set, val => val !== undefined ? Number(val) : undefined);
      `,
            },
          ],
        },
      ],
    },

    // 4. Promise.then (Generic Check)
    {
      code: `
        declare const p: Promise<string | null>;
        p.then(Number);
      `,
      errors: [
        {
          messageId: "unsafeCallback",
          suggestions: [
            {
              messageId: "fixMapStrictNull",
              output: `
        declare const p: Promise<string | null>;
        p.then(val => val !== null ? Number(val) : null);
      `,
            },
          ],
        },
      ],
    },

    // 5. Custom Function (Generic Check)
    {
      code: `
        function process(converter: (input: string | null | undefined) => number) {
           return converter("test");
        }
        process(Number);
      `,
      errors: [
        {
          messageId: "unsafeCallback",
          suggestions: [
            {
              messageId: "fixMapMixed",
              output: `
        function process(converter: (input: string | null | undefined) => number) {
           return converter("test");
        }
        process(val => val !== null && val !== undefined ? Number(val) : val);
      `,
            },
          ],
        },
      ],
    },

    // 6. ChainExpression and CallExpression (x?.at(0))
    {
      code: `
        const x = [] as string[] | undefined;
        Number(x?.at(0));
      `,
      errors: [
        {
          messageId: "unsafeConversion",
          suggestions: [
            {
              messageId: "fixStrictUndefined",
              output: `
        const x = [] as string[] | undefined;
        x?.at(0) !== undefined ? Number(x?.[0]) : undefined;
      `,
            },
          ],
        },
      ],
    },

    // 7. MemberExpression (x[0])
    {
      code: `
        const x = [null] as (string | null)[];
        Number(x[0]);
      `,
      errors: [
        {
          messageId: "unsafeConversion",
          suggestions: [
            {
              messageId: "fixStrictNull",
              output: `
        const x = [null] as (string | null)[];
        x[0] !== null ? Number(x[0]) : null;
      `,
            },
          ],
        },
      ],
    },

    // 8. Optional MemberExpression (x?.[0])
    {
      code: `
        const x = [] as string[] | undefined;
        Number(x?.[0]);
      `,
      errors: [
        {
          messageId: "unsafeConversion",
          suggestions: [
            {
              messageId: "fixStrictUndefined",
              output: `
        const x = [] as string[] | undefined;
        x?.[0] !== undefined ? Number(x?.[0]) : undefined;
      `,
            },
          ],
        },
      ],
    },

    // 9. Function Call (f())
    // EXPECTATION: No fix (still unsafe)
    {
      code: `
        const f = () => 2 as number | null;
        Number(f());
      `,
      errors: [
        {
          messageId: "unsafeConversion",
          suggestions: undefined,
        },
      ],
    },

    // 10. Standard .at() Call (x.at(0))
    // FIX: Expect x[0] inside Number()
    {
      code: `
        const x = [] as (string | null)[];
        Number(x.at(0));
      `,
      errors: [
        {
          messageId: "unsafeConversion",
          suggestions: [
            {
              messageId: "fixMixed",
              output: `
        const x = [] as (string | null)[];
        x.at(0) !== null && x.at(0) !== undefined ? Number(x[0]) : x.at(0);
      `,
            },
          ],
        },
      ],
    },
  ],
});
