import { ESLintUtils, AST_NODE_TYPES } from "@typescript-eslint/utils";
import ts from "typescript";

// 1. Setup the Rule Creator
const createRule = ESLintUtils.RuleCreator((name) => `https://example.com/rule/${name}`);

// 2. Helper to check if a type includes Null
function isNullableType(type: ts.Type, checker: ts.TypeChecker): boolean {
  // Check if the type itself is explicitly Null
  if (type.getFlags() & ts.TypeFlags.Null) {
    return true;
  }

  // If it's a Union type (e.g., number | null), check all parts
  if (type.isUnion()) {
    return type.types.some((t) => isNullableType(t, checker));
  }

  return false;
}

// 3. Define the Rule
export const noUnsafeNumberConversion = createRule({
  name: "no-unsafe-number-conversion",
  meta: {
    type: "problem",
    docs: {
      description: "Disallow converting null values to Number (which results in 0)",
    },
    messages: {
      unsafeConversion:
        'Unsafe conversion to Number(). The value might be "null", which converts to 0 silently. Handle null explicitly first.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    // 4. Get Parser Services (Access to TS Compiler)
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();

    return {
      CallExpression(node) {
        // Ensure we are calling "Number(...)"
        if (node.callee.type !== AST_NODE_TYPES.Identifier || node.callee.name !== "Number") {
          return;
        }

        // Ensure there is exactly 1 argument
        if (node.arguments.length !== 1) {
          return;
        }

        const argument = node.arguments[0];

        // 5. Get the TypeScript Type of the argument
        // We use the original TS Node for the type checker
        const tsNode = services.esTreeNodeToTSNodeMap.get(argument);
        const type = checker.getTypeAtLocation(tsNode);

        // 6. Check if type includes Null
        if (isNullableType(type, checker)) {
          context.report({
            node: argument,
            messageId: "unsafeConversion",
          });
        }
      },
    };
  },
});
