import { AST_NODE_TYPES, ESLintUtils, TSESLint, TSESTree } from "@typescript-eslint/utils";
import ts from "typescript";

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

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/Hasan-Mir/eslint-plugin-safe-number/blob/main/src/rules/${name}.ts`
);

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

/**
 * Checks if a node is a call to .at().
 * Handles: x.at(0) AND x?.at(0)
 */
function isSafeAtMethod(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.ChainExpression) {
    return isSafeAtMethod(node.expression);
  }

  if (node.type === AST_NODE_TYPES.CallExpression) {
    if (
      node.callee.type === AST_NODE_TYPES.MemberExpression &&
      node.callee.property.type === AST_NODE_TYPES.Identifier &&
      node.callee.property.name === "at"
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Generates the text for the argument inside Number().
 * If it detects .at(0), it converts it to [0].
 * If the call was optional (x?.at(0)), it converts to optional access (x?.[0]).
 */
function getConvertArgument(node: TSESTree.Node, sourceCode: TSESLint.SourceCode): string {
  let target = node;
  if (target.type === AST_NODE_TYPES.ChainExpression) {
    target = target.expression;
  }

  if (
    target.type === AST_NODE_TYPES.CallExpression &&
    target.callee.type === AST_NODE_TYPES.MemberExpression &&
    target.callee.property.type === AST_NODE_TYPES.Identifier &&
    target.callee.property.name === "at" &&
    target.arguments.length === 1 &&
    target.arguments[0].type === AST_NODE_TYPES.Literal &&
    target.arguments[0].value === 0
  ) {
    const objectText = sourceCode.getText(target.callee.object);

    // Use optional bracket access if the original call was optional (x?.at(0) -> x?.[0])
    if (target.callee.optional) {
      return `${objectText}?.[0]`;
    }

    return `${objectText}[0]`;
  }

  return sourceCode.getText(node);
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
      unsafeCallback:
        'Unsafe passing of "Number" as callback. The input to the callback may be null/undefined.',
      // Direct Fixes
      fixStrictNull: "Guard with null check: val !== null ? Number(val) : null",
      fixStrictUndefined: "Guard with undefined check: val !== undefined ? Number(val) : undefined",
      fixMixed: "Guard with strict null/undefined checks",
      // Callback Fixes
      fixMapStrictNull: "Wrap in arrow function: val => val !== null ? Number(val) : null",
      fixMapStrictUndefined:
        "Wrap in arrow function: val => val !== undefined ? Number(val) : undefined",
      fixMapMixed: "Wrap in arrow function with strict checks",
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

          // 1. Literal/Identifier Exclusions (No Fix)
          if (argument.type === AST_NODE_TYPES.Literal && argument.value === null) {
            context.report({ node: argument, messageId: "unsafeConversion" });
            return;
          }
          if (argument.type === AST_NODE_TYPES.Identifier && argument.name === "undefined") {
            context.report({ node: argument, messageId: "unsafeConversion" });
            return;
          }

          // 2. Variable Check
          const tsNode = services.esTreeNodeToTSNodeMap.get(argument);
          const type = checker.getTypeAtLocation(tsNode);
          const { hasNull, hasUndefined } = getNullableFlags(type, checker);

          if (hasNull || hasUndefined) {
            const argText = sourceCode.getText(argument);
            const convertText = getConvertArgument(argument, sourceCode);

            const isSafeToDuplicate =
              argument.type === AST_NODE_TYPES.Identifier ||
              argument.type === AST_NODE_TYPES.MemberExpression ||
              (argument.type === AST_NODE_TYPES.ChainExpression &&
                argument.expression.type === AST_NODE_TYPES.MemberExpression) ||
              isSafeAtMethod(argument);

            const suggestions: TSESLint.SuggestionReportDescriptor<MessageIds>[] = [];

            if (isSafeToDuplicate) {
              if (hasNull && hasUndefined) {
                suggestions.push({
                  messageId: "fixMixed",
                  fix: (fixer) =>
                    fixer.replaceText(
                      node,
                      `${argText} !== null && ${argText} !== undefined ? Number(${convertText}) : ${argText}`
                    ),
                });
              } else if (hasNull) {
                suggestions.push({
                  messageId: "fixStrictNull",
                  fix: (fixer) =>
                    fixer.replaceText(node, `${argText} !== null ? Number(${convertText}) : null`),
                });
              } else if (hasUndefined) {
                suggestions.push({
                  messageId: "fixStrictUndefined",
                  fix: (fixer) =>
                    fixer.replaceText(
                      node,
                      `${argText} !== undefined ? Number(${convertText}) : undefined`
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
          // Stop here if it was a direct Number() call
          return;
        }

        // ------------------------------------------------------
        // SCENARIO B: Generic Callback Usage
        // Handles: arr.map(Number), Promise.then(Number), func(Number), Array.from(x, Number)
        // ------------------------------------------------------
        const tsCallNode = services.esTreeNodeToTSNodeMap.get(node);
        const resolvedSignature = checker.getResolvedSignature(tsCallNode);

        if (!resolvedSignature) return;

        node.arguments.forEach((arg, index) => {
          // We only care if the argument is specifically "Number"
          if (arg.type !== AST_NODE_TYPES.Identifier || arg.name !== "Number") {
            return;
          }

          // 1. Find which parameter of the function definition matches this argument
          if (index >= resolvedSignature.parameters.length) return;

          const paramSymbol = resolvedSignature.parameters[index];
          if (!paramSymbol) return;

          // 2. Get the type of that parameter (Example: (val: string | null) => number)
          const paramType = checker.getTypeOfSymbolAtLocation(paramSymbol, tsCallNode);

          // 3. Get the Call Signatures of that callback
          // FIX: Promise.then's callback is optional (Function | undefined).
          // We must get the NonNullable type to access the signatures of the Function part.
          const actualParamType = paramType.getNonNullableType();
          const callSignatures = actualParamType.getCallSignatures();

          if (callSignatures.length === 0) return;

          const callbackSignature = callSignatures[0];

          // 4. Look at the FIRST parameter of the callback (that's what Number will receive)
          if (callbackSignature.parameters.length === 0) return;

          const firstParamSymbol = callbackSignature.parameters[0];
          const firstParamType = checker.getTypeOfSymbolAtLocation(firstParamSymbol, tsCallNode);

          // 5. Check flags
          const { hasNull, hasUndefined } = getNullableFlags(firstParamType, checker);

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
                fix: (fixer) => fixer.replaceText(arg, `val => val !== null ? Number(val) : null`),
              });
            } else if (hasUndefined) {
              suggestions.push({
                messageId: "fixMapStrictUndefined",
                fix: (fixer) =>
                  fixer.replaceText(arg, `val => val !== undefined ? Number(val) : undefined`),
              });
            }

            context.report({
              node: arg,
              messageId: "unsafeCallback",
              suggest: suggestions.length > 0 ? suggestions : undefined,
            });
          }
        });
      },
    };
  },
});
