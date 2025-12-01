# eslint-plugin-safe-number

An ESLint plugin to prevent unsafe conversions to `Number()` from `null` or `undefined` values.

[![npm version](https://img.shields.io/npm/v/eslint-plugin-safe-number.svg)](https://www.npmjs.com/package/eslint-plugin-safe-number)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Installation

```bash
npm install --save-dev eslint-plugin-safe-number
```

## ⚠️ Requirements

**This plugin works ONLY in TypeScript projects.**

It relies on the TypeScript Type Checker to determine if a variable is nullable. It will **not** work in standard JavaScript projects or without proper `parserOptions`.

### Configuration

```js
module.exports = {
  // ...
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    // ⚠️ CRITICAL: Point to your TSConfig(s) to enable type-aware linting
    project: ["./packages/*/tsconfig.json", "./tsconfig.json"],
    tsconfigRootDir: __dirname,
  },
  plugins: ["safe-number"],
  rules: {
    // ... other rules
    "safe-number/no-unsafe-number-conversion": "error",
  },
};
```

## ❌ The Problem

In JavaScript/TypeScript, passing `null` to the `Number()` constructor results in `0`. This is often a source of subtle bugs in data processing, financial calculations, or optional form fields where "no value" should not be treated as "zero".

```ts
Number(null); // Result: 0  (Often unexpected)
Number(undefined); // Result: NaN
Array.from(["1", null], Number); // Unsafe!
getMaybeNullValue().then(Number); // Unsafe!
```

## 🔍 Rule Behavior & Auto-Fixes

The `no-unsafe-number-conversion` rule analyzes the **TypeScript type** of the value being passed to `Number()` and offers **Suggestions (Quick Fixes)** depending on the exact nullability of the value.
The goal is to prevent unsafe numeric conversions such as `Number(null)` or `Number(undefined)`.

### **1. Strict Null (`T | null`)**

If the variable type is **exactly** `Type | null`:

#### ❌ Incorrect

```ts
const val: string | null = null;
Number(val);
```

#### ✅ Fixed (Suggestion)

```ts
val !== null ? Number(val) : null;
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
const arr: (string | null)[] = ["1", null];
arr.map(Number);
```

#### ✅ Fixed (Suggestion)

```ts
arr.map((val) => (val !== null ? Number(val) : null));
```

### **5. Literal Values**

The rule flags literal unsafe calls:

```ts
Number(null);
Number(undefined);
```

These are treated as **errors**, but **no auto-fix is offered**, because the logic is ambiguous and should be resolved manually.
