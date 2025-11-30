import { AST_NODE_TYPES, ESLintUtils, TSESLint } from "@typescript-eslint/utils";
import * as ts from "typescript";

type MessageIds =
  | "unsafeConversion"
  | "unsafeCallback"
  | "fixStrictNull"
  | "fixStrictUndefined"
  | "fixMixed"
  | "fixMapStrictNull"
  | "fixMapStrictUndefined"
  | "fixMapMixed";

type Options = [];
const createRule = ESLintUtils.RuleCreator((name) => `https://example.com/rule/${name}`);

function getNullableFlags(type: ts.Type, checker: ts.TypeChecker) {
  let hasNull = false;
  let hasUndefined = false;

  if (type.getFlags() & ts.TypeFlags.Null) hasNull = true;
  if (type.getFlags() & ts.TypeFlags.Undefined) hasUndefined = true;
  if (type.getFlags() & ts.TypeFlags.Void) hasUndefined = true;

  if (type.isUnion()) {
    for (const t of type.types) {
      const flags = getNullableFlags(t, checker);
      if (flags.hasNull) hasNull = true;
      if (flags.hasUndefined) hasUndefined = true;
    }
  }

  return { hasNull, hasUndefined };
}

export const noUnsafeNumberConversion = createRule<Options, MessageIds>({
  name: "no-unsafe-number-conversion",
  meta: {
    type: "problem",
    docs: {
      description: "Disallow converting null/undefined values to Number",
    },
    hasSuggestions: true,
    messages: {
      unsafeConversion: "Unsafe conversion to Number(). The value might be null or undefined.",
      unsafeCallback: 'Unsafe passing of "Number" as callback. The array may contain nulls.',
      // Direct Fixes
      fixStrictNull: "Guard with null check: val !== null ? Number(val) : null",
      fixStrictUndefined: "Guard with undefined check: val !== undefined ? Number(val) : undefined",
      fixMixed: "Guard with strict null/undefined checks",
      // Map/Callback Fixes
      fixMapStrictNull: "Use safe arrow function: val => val !== null ? Number(val) : null",
      fixMapStrictUndefined:
        "Use safe arrow function: val => val !== undefined ? Number(val) : undefined",
      fixMapMixed: "Use safe arrow function with strict checks",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();
    const sourceCode = context.sourceCode;

    return {
      CallExpression(node) {
        // ------------------------------------------------------
        // SCENARIO A: Direct Call -> Number(x)
        // ------------------------------------------------------
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === "Number" &&
          node.arguments.length === 1
        ) {
          const argument = node.arguments[0];

          // 1. Literal 'null' Check (No Fix)
          if (argument.type === AST_NODE_TYPES.Literal && argument.value === null) {
            context.report({ node: argument, messageId: "unsafeConversion" });
            return;
          }

          // 2. Identifier 'undefined' Check (No Fix)
          // undefined is technically an identifier, not a literal
          if (argument.type === AST_NODE_TYPES.Identifier && argument.name === "undefined") {
            context.report({ node: argument, messageId: "unsafeConversion" });
            return;
          }

          // 3. Variable Check
          const tsNode = services.esTreeNodeToTSNodeMap.get(argument);
          const type = checker.getTypeAtLocation(tsNode);
          const { hasNull, hasUndefined } = getNullableFlags(type, checker);

          if (hasNull || hasUndefined) {
            const argText = sourceCode.getText(argument);
            const isSafeToDuplicate =
              argument.type === AST_NODE_TYPES.Identifier ||
              argument.type === AST_NODE_TYPES.MemberExpression;

            const suggestions: TSESLint.SuggestionReportDescriptor<MessageIds>[] = [];

            if (isSafeToDuplicate) {
              if (hasNull && hasUndefined) {
                suggestions.push({
                  messageId: "fixMixed",
                  fix: (fixer) =>
                    fixer.replaceText(
                      node,
                      `${argText} !== null && ${argText} !== undefined ? Number(${argText}) : ${argText}`
                    ),
                });
              } else if (hasNull) {
                suggestions.push({
                  messageId: "fixStrictNull",
                  fix: (fixer) =>
                    fixer.replaceText(node, `${argText} !== null ? Number(${argText}) : null`),
                });
              } else if (hasUndefined) {
                suggestions.push({
                  messageId: "fixStrictUndefined",
                  fix: (fixer) =>
                    fixer.replaceText(
                      node,
                      `${argText} !== undefined ? Number(${argText}) : undefined`
                    ),
                });
              }
            }

            context.report({
              node: argument,
              messageId: "unsafeConversion",
              suggest: suggestions.length > 0 ? suggestions : undefined,
            });
          }
        }

        // ------------------------------------------------------
        // SCENARIO B: Callback usage -> arr.map(Number)
        // ------------------------------------------------------
        node.arguments.forEach((arg) => {
          if (arg.type === AST_NODE_TYPES.Identifier && arg.name === "Number") {
            if (
              node.callee.type === AST_NODE_TYPES.MemberExpression &&
              node.callee.property.type === AST_NODE_TYPES.Identifier &&
              node.callee.property.name === "map"
            ) {
              const arrayNode = services.esTreeNodeToTSNodeMap.get(node.callee.object);
              const arrayType = checker.getTypeAtLocation(arrayNode);
              let elementType: ts.Type | undefined;

              // Handle Array<T> or T[]
              if ((arrayType as any).typeArguments && (arrayType as any).typeArguments.length > 0) {
                elementType = (arrayType as any).typeArguments[0];
              } else if (arrayType.getNumberIndexType()) {
                elementType = arrayType.getNumberIndexType();
              }

              if (elementType) {
                const { hasNull, hasUndefined } = getNullableFlags(elementType, checker);

                if (hasNull || hasUndefined) {
                  const suggestions: TSESLint.SuggestionReportDescriptor<MessageIds>[] = [];

                  if (hasNull && hasUndefined) {
                    suggestions.push({
                      messageId: "fixMapMixed",
                      fix: (fixer) =>
                        fixer.replaceText(
                          arg,
                          `val => val !== null && val !== undefined ? Number(val) : val`
                        ),
                    });
                  } else if (hasNull) {
                    suggestions.push({
                      messageId: "fixMapStrictNull",
                      fix: (fixer) =>
                        fixer.replaceText(arg, `val => val !== null ? Number(val) : null`),
                    });
                  } else if (hasUndefined) {
                    suggestions.push({
                      messageId: "fixMapStrictUndefined",
                      fix: (fixer) =>
                        fixer.replaceText(
                          arg,
                          `val => val !== undefined ? Number(val) : undefined`
                        ),
                    });
                  }

                  context.report({
                    node: arg,
                    messageId: "unsafeCallback",
                    suggest: suggestions.length > 0 ? suggestions : undefined,
                  });
                }
              }
            }
          }
        });
      },
    };
  },
});
