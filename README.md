# eslint-plugin-safe-number

An ESLint plugin to prevent unsafe conversions to `Number()` from `null`, `undefined`, or non-numeric string values.

[![npm version](https://img.shields.io/npm/v/eslint-plugin-safe-number.svg)](https://www.npmjs.com/package/eslint-plugin-safe-number)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Installation

```bash
npm install --save-dev eslint-plugin-safe-number
```

## ⚠️ Requirements

**This plugin works ONLY in TypeScript projects.**

It relies on the TypeScript Type Checker to determine if a variable is nullable. It will **not** work in standard JavaScript projects or without proper `parserOptions`.

## ⚙️ Configuration

### Flat Config (`eslint.config.js` — ESLint 9+)

```js
import tsParser from '@typescript-eslint/parser';
import safeNumberPlugin from 'eslint-plugin-safe-number';

export default [
    {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                // ⚠️ CRITICAL: Enable TypeScript type-aware linting
                project: true,
            },
        },
        plugins: {
            'safe-number': safeNumberPlugin,
        },
        rules: {
            'safe-number/no-unsafe-number-conversion': 'error',
        },
    },
];
```

Or use the recommended flat preset with ESLint's `defineConfig`:

```js
import { defineConfig } from 'eslint/config';
import tsParser from '@typescript-eslint/parser';
import safeNumberPlugin from 'eslint-plugin-safe-number';

export default defineConfig([
    {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                project: true,
            },
        },
        extends: [safeNumberPlugin.configs['flat/recommended']],
    },
]);
```

### Legacy Config (`.eslintrc.js` — ESLint 8 / ESLint 9 legacy mode)

> Legacy `.eslintrc` configuration is supported by ESLint 8 and can be used in ESLint 9 legacy mode. ESLint 10+ supports flat config only.

```js
module.exports = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        // ⚠️ CRITICAL: Point to your tsconfig(s) to enable type-aware linting
        project: ['./tsconfig.json', './packages/*/tsconfig.json'],
        tsconfigRootDir: __dirname,
    },
    plugins: ['safe-number'],
    rules: {
        'safe-number/no-unsafe-number-conversion': 'error',
    },
};
```

Or extend the legacy recommended preset:

```js
module.exports = {
    extends: ['plugin:safe-number/recommended'],
    parser: '@typescript-eslint/parser',
    parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: __dirname,
    },
};
```

## ❌ The Problem

In JavaScript/TypeScript, passing `null` to the `Number()` constructor results in `0`. This is often a source of subtle bugs in data processing, financial calculations, or optional form fields where "no value" should not be treated as "zero". Furthermore, passing `undefined` or non-numeric strings (such as `"nt"`) produces `NaN`.

```ts
Number(null); // Result: 0  (Often unexpected)
Number(undefined); // Result: NaN
Number('nt'); // Result: NaN (Non-numeric string)
Array.from(['1', null], Number); // Unsafe!
getMaybeNullValue().then(Number); // Unsafe!
```

## 🔍 Rule Behavior & Auto-Fixes

The `no-unsafe-number-conversion` rule analyzes the **TypeScript type** of the value being passed to `Number()` and offers **Suggestions (Quick Fixes)** depending on the exact nullability of the value.
The goal is to prevent unsafe numeric conversions such as `Number(null)`, `Number(undefined)`, or `Number("nt")`.

### **1. Strict Null (`T | null`)**

If the variable type is **exactly** `Type | null`:

#### ❌ Incorrect

```ts
const val: string | null = null;
Number(val);
```

#### ✅ Fixed (Suggestion)

```ts
(val !== null ? Number(val) : null);
```

### **2. Strict Undefined (`T | undefined`)**

If the variable type is **exactly** `Type | undefined`:

#### ❌ Incorrect

```ts
const val: string | undefined = undefined;
Number(val);
```

#### ✅ Fixed (Suggestion)

```ts
val !== undefined ? Number(val) : undefined;
```

### **3. Mixed Types (`T | null | undefined`)**

If the variable can be **null or undefined** in addition to the base type:

#### ❌ Incorrect

```ts
declare const val: string | null | undefined;
Number(val);
```

#### ✅ Fixed (Suggestion)

```ts
val !== null && val !== undefined ? Number(val) : val;
```

### **4. Array Callbacks (`.map`, `.forEach`, etc.)**

The rule also detects unsafe conversions in array callbacks such as `map(Number)`:

#### ❌ Incorrect

```ts
const arr: (string | null)[] = ['1', null];
arr.map(Number);
```

#### ✅ Fixed (Suggestion)

```ts
arr.map(val => (val !== null ? Number(val) : null));
```

### **5. Literal Values**

The rule flags literal unsafe calls:

```ts
Number(null);
Number(undefined);
Number('nt');
Number('');
```

These are treated as **errors**, but **no auto-fix is offered**, because the logic is ambiguous and should be resolved manually.

### **6. Types with Non-Numeric Literals (`T | "nt" | null`)**

When a variable's type includes non-numeric string literals (e.g. `number | "nt" | null` or `number | "nt"`):

#### ❌ Flagged as Error (No Auto-Fix)

```ts
declare const val: number | 'nt' | null;
Number(val);
```

**Why is no auto-fix offered?**
A suggestion like `(val !== null ? Number(val) : null)` would leave `Number(val)` with type `number | "nt"`. Passing `"nt"` to `Number("nt")` evaluates to `NaN`, introducing a hidden runtime bug. Because handling application-specific sentinel values (like `"nt"`) requires domain-specific business logic, the rule flags the issue without offering an auto-fix so you can resolve it safely and intentionally.
