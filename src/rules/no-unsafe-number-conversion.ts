import { ESLintUtils, ASTUtils } from "@typescript-eslint/utils";
import * as ts from "typescript";

const createRule = ESLintUtils.RuleCreator(() => ``);

const rule = createRule({
  name: "no-number-on-null",
  meta: {
    type: "problem",
    docs: {
      description: "Disallow converting values that could be null using global Number()",
    },
    messages: {
      unsafeNumberNull:
        "Avoid using global Number() on values that can be null, as Number(null) results in 0. Handle null explicitly.",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const parserServices = ESLintUtils.getParserServices(context);
    const checker = parserServices.program.getTypeChecker();

    return {
      CallExpression(node) {
        // 1. Basic Check: Is the callee an Identifier named 'Number'?
        if (node.callee.type !== "Identifier" || node.callee.name !== "Number") {
          return;
        }

        // 2. Global Check: Ensure 'Number' is not shadowed by a local variable
        // We get the scope of the current node
        const scope = context.sourceCode.getScope(node);

        // We look for the variable 'Number' in this scope or parent scopes
        const variable = ASTUtils.findVariable(scope, "Number");

        // If the variable is found AND has definitions (defs.length > 0),
        // it means it was defined in the code (local variable, import, etc.)
        // so it is NOT the global Number constructor.
        if (variable && variable.defs.length > 0) {
          return;
        }

        // 3. Argument Check: Ensure there is at least one argument
        if (node.arguments.length === 0) {
          return;
        }

        const argument = node.arguments[0];
        const tsNode = parserServices.esTreeNodeToTSNodeMap.get(argument);
        const type = checker.getTypeAtLocation(tsNode);

        // 4. Type Check: Does the type include Null?
        if (isNullableType(type)) {
          context.report({
            node: node,
            messageId: "unsafeNumberNull",
          });
        }
      },
    };
  },
});

/**
 * Helper to check if a type is strictly null or a union containing null.
 */
function isNullableType(type: ts.Type): boolean {
  // Check strict Null flag
  if ((type.getFlags() & ts.TypeFlags.Null) !== 0) {
    return true;
  }

  // Check Union types (e.g. string | null)
  if (type.isUnion()) {
    for (const part of type.types) {
      if ((part.getFlags() & ts.TypeFlags.Null) !== 0) {
        return true;
      }
    }
  }

  return false;
}

export default rule;
