import { noUnsafeNumberConversion } from '../src/rules/no-unsafe-number-conversion';
import { ruleTester } from './utils/rule-testers';

ruleTester.run('no-unsafe-number-conversion', noUnsafeNumberConversion, {
    valid: [
        { code: `Number(10);` },
        { code: `Number("10");` },
        { code: `const arr: string[] = ["1", "2"]; arr.map(Number);` },
        // Safe Promise
        { code: `Promise.resolve("1").then(Number);` },
        // Safe numeric string literal union
        { code: `declare const val: "10" | "20"; Number(val);` },
        // Safe intersection type stripping null
        {
            code: `type NonNullableString = (string | null) & {}; declare const val: NonNullableString; Number(val);`,
        },
        // Shadowed local Number function should not be flagged
        {
            code: `
        function customFormat(Number: (x: string | null) => number, val: string | null) {
          return Number(val);
        }
      `,
        },
        // Shadowed local Number passed as callback should not be flagged
        {
            code: `
        function customMap(Number: (x: string | null) => number, arr: (string | null)[]) {
          return arr.map(Number);
        }
      `,
        },
        // Regression: fixed .at(0) suggestions must pass the rule cleanly after narrowing
        {
            code: `
        const x = [] as string[] | undefined;
        (x?.[0] !== undefined ? Number(x?.[0]) : undefined);
      `,
        },
        {
            code: `
        const x = [] as (string | null)[];
        (x[0] !== null && x[0] !== undefined ? Number(x[0]) : x[0]);
      `,
        },
    ],
    invalid: [
        // 1. Direct Calls (Sanity check)
        {
            code: `Number(null);`,
            errors: [{ messageId: 'unsafeConversion', suggestions: undefined }],
        },
        {
            code: `
        const val: string | null = null;
        Number(val);
      `,
            errors: [
                {
                    messageId: 'unsafeConversion',
                    suggestions: [
                        {
                            messageId: 'fixStrictNull',
                            output: `
        const val: string | null = null;
        (val !== null ? Number(val) : null);
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
                    messageId: 'unsafeCallback',
                    suggestions: [
                        {
                            messageId: 'fixMapStrictNull',
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
                    messageId: 'unsafeCallback',
                    suggestions: [
                        {
                            messageId: 'fixMapStrictUndefined',
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
                    messageId: 'unsafeCallback',
                    suggestions: [
                        {
                            messageId: 'fixMapStrictNull',
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
                    messageId: 'unsafeCallback',
                    suggestions: [
                        {
                            messageId: 'fixMapMixed',
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
                    messageId: 'unsafeConversion',
                    suggestions: [
                        {
                            messageId: 'fixStrictUndefined',
                            output: `
        const x = [] as string[] | undefined;
        (x?.[0] !== undefined ? Number(x?.[0]) : undefined);
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
                    messageId: 'unsafeConversion',
                    suggestions: [
                        {
                            messageId: 'fixStrictNull',
                            output: `
        const x = [null] as (string | null)[];
        (x[0] !== null ? Number(x[0]) : null);
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
                    messageId: 'unsafeConversion',
                    suggestions: [
                        {
                            messageId: 'fixStrictUndefined',
                            output: `
        const x = [] as string[] | undefined;
        (x?.[0] !== undefined ? Number(x?.[0]) : undefined);
      `,
                        },
                    ],
                },
            ],
        },

        // 9. Function Call (f())
        // EXPECTATION: No fix (unsafe to duplicate)
        {
            code: `
        const f = () => 2 as number | null;
        Number(f());
      `,
            errors: [
                {
                    messageId: 'unsafeConversion',
                    suggestions: undefined,
                },
            ],
        },

        // 10. Standard .at() Call (x.at(0))
        // FIX: Expect x[0] in both guard and Number() so TypeScript narrows it
        {
            code: `
        const x = [] as (string | null)[];
        Number(x.at(0));
      `,
            errors: [
                {
                    messageId: 'unsafeConversion',
                    suggestions: [
                        {
                            messageId: 'fixMixed',
                            output: `
        const x = [] as (string | null)[];
        (x[0] !== null && x[0] !== undefined ? Number(x[0]) : x[0]);
      `,
                        },
                    ],
                },
            ],
        },

        // 11. Literal Non-Numeric Strings (No Fix)
        {
            code: `Number("nt");`,
            errors: [{ messageId: 'unsafeConversion', suggestions: undefined }],
        },
        {
            code: `Number("");`,
            errors: [{ messageId: 'unsafeConversion', suggestions: undefined }],
        },
        {
            code: `Number("   ");`,
            errors: [{ messageId: 'unsafeConversion', suggestions: undefined }],
        },
        {
            code: 'Number(`nt`);',
            errors: [{ messageId: 'unsafeConversion', suggestions: undefined }],
        },

        // 12. Non-numeric String Union (No Fix)
        {
            code: `
        declare const val: number | "nt";
        Number(val);
      `,
            errors: [{ messageId: 'unsafeConversion', suggestions: undefined }],
        },

        // 13. Nullable Non-numeric String Union (No Fix to prevent NaN bug)
        {
            code: `
        declare const val: number | "nt" | null;
        Number(val);
      `,
            errors: [{ messageId: 'unsafeConversion', suggestions: undefined }],
        },

        // 14. Callback with Non-numeric String Union (No Fix)
        {
            code: `
        const arr: (number | "nt" | null)[] = [1, "nt", null];
        arr.map(Number);
      `,
            errors: [{ messageId: 'unsafeCallback', suggestions: undefined }],
        },

        // 15. Nullable with Valid Numeric String Literal (Fix Expected with Parentheses)
        {
            code: `
        declare const val: null | number | "5.6";
        Number(val);
      `,
            errors: [
                {
                    messageId: 'unsafeConversion',
                    suggestions: [
                        {
                            messageId: 'fixStrictNull',
                            output: `
        declare const val: null | number | "5.6";
        (val !== null ? Number(val) : null);
      `,
                        },
                    ],
                },
            ],
        },

        // 16. Arrow Function Parameter with Non-numeric String Union (No Fix)
        {
            code: `
        declare const arr: (number | "nt" | null)[];
        arr.map(val => Number(val));
      `,
            errors: [{ messageId: 'unsafeConversion', suggestions: undefined }],
        },

        // 17. Operator Precedence Test (Parenthesized fix prevents syntax/evaluation errors)
        {
            code: `
        declare const val: string | null;
        const total = 10 + Number(val);
      `,
            errors: [
                {
                    messageId: 'unsafeConversion',
                    suggestions: [
                        {
                            messageId: 'fixStrictNull',
                            output: `
        declare const val: string | null;
        const total = 10 + (val !== null ? Number(val) : null);
      `,
                        },
                    ],
                },
            ],
        },

        // 18. Constrained Generic Type Parameter
        {
            code: `
        function parse<T extends string | null>(val: T) {
          return Number(val);
        }
      `,
            errors: [
                {
                    messageId: 'unsafeConversion',
                    suggestions: [
                        {
                            messageId: 'fixStrictNull',
                            output: `
        function parse<T extends string | null>(val: T) {
          return (val !== null ? Number(val) : null);
        }
      `,
                        },
                    ],
                },
            ],
        },

        // 19. Impure Member Expressions with Invocations (No Fix)
        {
            code: `
        declare const getter: { fetchValue: () => string | null };
        Number(getter.fetchValue());
      `,
            errors: [
                {
                    messageId: 'unsafeConversion',
                    suggestions: undefined,
                },
            ],
        },

        // 20. Variable with literal undefined value
        {
            code: `
        const a = undefined;
        Number(a);
      `,
            errors: [
                {
                    messageId: 'unsafeConversion',
                    suggestions: [
                        {
                            messageId: 'fixStrictUndefined',
                            output: `
        const a = undefined;
        (a !== undefined ? Number(a) : undefined);
      `,
                        },
                    ],
                },
            ],
        },

        // 21. Union of number and undefined (conditional initialization)
        {
            code: `
        const x3: number | undefined = Math.random() > 0.5 ? 1 : undefined;
        Number(x3);
      `,
            errors: [
                {
                    messageId: 'unsafeConversion',
                    suggestions: [
                        {
                            messageId: 'fixStrictUndefined',
                            output: `
        const x3: number | undefined = Math.random() > 0.5 ? 1 : undefined;
        (x3 !== undefined ? Number(x3) : undefined);
      `,
                        },
                    ],
                },
            ],
        },

        // 22. Explicit undefined type annotation
        {
            code: `
        declare const val: undefined;
        Number(val);
      `,
            errors: [
                {
                    messageId: 'unsafeConversion',
                    suggestions: [
                        {
                            messageId: 'fixStrictUndefined',
                            output: `
        declare const val: undefined;
        (val !== undefined ? Number(val) : undefined);
      `,
                        },
                    ],
                },
            ],
        },

        // 23. Direct Number(undefined) Literal Exclusion (No Fix)
        {
            code: `Number(undefined);`,
            errors: [{ messageId: 'unsafeConversion', suggestions: undefined }],
        },

        // 24. Unary void expression (void 0 evaluates to undefined)
        {
            code: `Number(void 0);`,
            errors: [{ messageId: 'unsafeConversion', suggestions: undefined }],
        },

        // 25. NaN string literal
        {
            code: `Number("NaN");`,
            errors: [{ messageId: 'unsafeConversion', suggestions: undefined }],
        },

        // 26. Computed member access x[at](0) must not be rewritten as x[0]
        {
            code: `
        const at = "getValue" as const;
        declare const x: { getValue: (n: number) => string | null };
        Number(x[at](0));
      `,
            errors: [{ messageId: 'unsafeConversion', suggestions: undefined }],
        },

        // 27. Non-indexable custom object with .at(0) must not be rewritten as x[0]
        {
            code: `
        declare const list: { at(index: number): string | null };
        Number(list.at(0));
      `,
            errors: [{ messageId: 'unsafeConversion', suggestions: undefined }],
        },

        // 28. Optional call x.at?.(0) must not be rewritten as x[0]
        {
            code: `
        declare const x: { at?: (index: number) => string | null };
        Number(x.at?.(0));
      `,
            errors: [{ messageId: 'unsafeConversion', suggestions: undefined }],
        },

        // 29. Rest parameter callback (Scenario B)
        {
            code: `
        function applyAll(...fns: Array<(val: string | null) => number>) {
          return fns.map(fn => fn(null));
        }
        applyAll(x => 1, Number);
      `,
            errors: [
                {
                    messageId: 'unsafeCallback',
                    suggestions: [
                        {
                            messageId: 'fixMapStrictNull',
                            output: `
        function applyAll(...fns: Array<(val: string | null) => number>) {
          return fns.map(fn => fn(null));
        }
        applyAll(x => 1, val => val !== null ? Number(val) : null);
      `,
                        },
                    ],
                },
            ],
        },

        // 30. Spread-shifted callback argument (Scenario B)
        {
            code: `
        const prefix = ["a", 1] as const;
        function run(a: string, b: number, cb: (val: string | null) => number) {
          return cb(null);
        }
        run(...prefix, Number);
      `,
            errors: [
                {
                    messageId: 'unsafeCallback',
                    suggestions: [
                        {
                            messageId: 'fixMapStrictNull',
                            output: `
        const prefix = ["a", 1] as const;
        function run(a: string, b: number, cb: (val: string | null) => number) {
          return cb(null);
        }
        run(...prefix, val => val !== null ? Number(val) : null);
      `,
                        },
                    ],
                },
            ],
        },

        // 31. Overloaded callback interface (Scenario B)
        {
            code: `
        interface Parser {
          (val: string): number;
          (val: string | null): number;
        }
        declare function run(cb: Parser): void;
        run(Number);
      `,
            errors: [
                {
                    messageId: 'unsafeCallback',
                    suggestions: [
                        {
                            messageId: 'fixMapStrictNull',
                            output: `
        interface Parser {
          (val: string): number;
          (val: string | null): number;
        }
        declare function run(cb: Parser): void;
        run(val => val !== null ? Number(val) : null);
      `,
                        },
                    ],
                },
            ],
        },

        // 32. Union of callable and non-callable callback type (Scenario B)
        {
            code: `
        declare function run(cb: ((val: string | null) => number) | false): void;
        run(Number);
      `,
            errors: [
                {
                    messageId: 'unsafeCallback',
                    suggestions: [
                        {
                            messageId: 'fixMapStrictNull',
                            output: `
        declare function run(cb: ((val: string | null) => number) | false): void;
        run(val => val !== null ? Number(val) : null);
      `,
                        },
                    ],
                },
            ],
        },

        // 33. Callback whose first parameter is a rest parameter (Scenario B)
        {
            code: `
        declare function run(cb: (...args: (string | null)[]) => number): void;
        run(Number);
      `,
            errors: [
                {
                    messageId: 'unsafeCallback',
                    suggestions: [
                        {
                            messageId: 'fixMapStrictNull',
                            output: `
        declare function run(cb: (...args: (string | null)[]) => number): void;
        run(val => val !== null ? Number(val) : null);
      `,
                        },
                    ],
                },
            ],
        },
    ],
});
