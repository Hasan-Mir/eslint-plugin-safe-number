import {
    AST_NODE_TYPES,
    ESLintUtils,
    ParserServicesWithTypeInformation,
    TSESLint,
    TSESTree,
} from '@typescript-eslint/utils';
import ts from 'typescript';

type MessageIds =
    | 'unsafeConversion'
    | 'unsafeCallback'
    | 'fixStrictNull'
    | 'fixStrictUndefined'
    | 'fixMixed'
    | 'fixMapStrictNull'
    | 'fixMapStrictUndefined'
    | 'fixMapMixed';

type Options = [];

const createRule = ESLintUtils.RuleCreator(
    name => `https://github.com/Hasan-Mir/eslint-plugin-safe-number/blob/main/src/rules/${name}.ts`
);

function isNonNumericStringLiteral(type: ts.Type): boolean {
    if (type.isStringLiteral()) {
        const val = type.value;
        if (val.trim() === '' || Number.isNaN(Number(val))) {
            return true;
        }
    }
    return false;
}

/**
 * Checks whether an identifier refers to the global ECMAScript Number constructor
 * rather than a shadowed local variable, parameter, or third-party .d.ts export.
 */
function isGlobalNumber(
    node: TSESTree.Node,
    services: ParserServicesWithTypeInformation,
    checker: ts.TypeChecker
): boolean {
    const tsNode = services.esTreeNodeToTSNodeMap.get(node);
    const symbol = checker.getSymbolAtLocation(tsNode);
    if (!symbol) {
        return true;
    }

    const actualSymbol =
        (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;

    if (actualSymbol.name !== 'Number') {
        return false;
    }

    if (!actualSymbol.declarations || actualSymbol.declarations.length === 0) {
        return true;
    }

    return actualSymbol.declarations.some(decl => {
        return services.program.isSourceFileDefaultLibrary(decl.getSourceFile());
    });
}

function getNullableFlags(
    type: ts.Type,
    checker: ts.TypeChecker,
    visited: Set<ts.Type> = new Set()
) {
    let hasNull = false;
    let hasUndefined = false;
    let hasInvalidString = false;

    function checkType(t: ts.Type): void {
        if (visited.has(t)) {
            return;
        }
        visited.add(t);

        const flags = t.getFlags();
        const intrinsicName = (t as unknown as { intrinsicName?: string }).intrinsicName;
        const typeName = checker.typeToString(t);

        if ((flags & ts.TypeFlags.Null) !== 0 || intrinsicName === 'null' || typeName === 'null') {
            hasNull = true;
            return;
        }

        if (
            (flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)) !== 0 ||
            intrinsicName === 'undefined' ||
            intrinsicName === 'void' ||
            typeName === 'undefined' ||
            typeName === 'void'
        ) {
            hasUndefined = true;
            return;
        }

        if (isNonNumericStringLiteral(t)) {
            hasInvalidString = true;
            return;
        }

        // Handle generic type parameters (e.g. <T extends string | null>)
        if ((flags & ts.TypeFlags.TypeParameter) !== 0) {
            const constraint = t.getConstraint();
            if (constraint) {
                checkType(constraint);
            }
            return;
        }

        // Handle union types
        if (t.isUnion()) {
            for (const subType of t.types) {
                checkType(subType);
            }
            return;
        }

        // Intersections require all constituents to allow null/undefined (e.g. (string | null) & {})
        if (t.isIntersection()) {
            let allowsNull = true;
            let allowsUndefined = true;
            let intersectionHasInvalidString = false;

            for (const subType of t.types) {
                const subFlags = getNullableFlags(subType, checker, new Set(visited));
                if (!subFlags.hasNull) {
                    allowsNull = false;
                }
                if (!subFlags.hasUndefined) {
                    allowsUndefined = false;
                }
                if (subFlags.hasInvalidString) {
                    intersectionHasInvalidString = true;
                }
            }

            if (allowsNull) {
                hasNull = true;
            }
            if (allowsUndefined) {
                hasUndefined = true;
            }
            if (intersectionHasInvalidString) {
                hasInvalidString = true;
            }
            return;
        }
    }

    checkType(type);

    return { hasNull, hasUndefined, hasInvalidString };
}

/**
 * Ensures an expression is pure and side-effect free before duplicating it in guards.
 * Disallows function invocations and mutations inside member chains.
 */
function isPureReference(node: TSESTree.Node): boolean {
    if (node.type === AST_NODE_TYPES.Identifier) {
        return true;
    }
    if (node.type === AST_NODE_TYPES.MemberExpression) {
        if (node.computed) {
            const isStaticLiteral =
                node.property.type === AST_NODE_TYPES.Literal &&
                (typeof node.property.value === 'string' ||
                    typeof node.property.value === 'number');
            if (isStaticLiteral) {
                return isPureReference(node.object);
            }
            return false;
        }
        return isPureReference(node.object);
    }
    if (node.type === AST_NODE_TYPES.ChainExpression) {
        return isPureReference(node.expression);
    }
    return false;
}

/**
 * Checks whether every non-nullable constituent of a type is an array, tuple, or string
 * whose index 0 access (`[0]`) is semantically equivalent to `.at(0)`.
 */
function isIndexableByZero(type: ts.Type, checker: ts.TypeChecker): boolean {
    const nonNullable = type.getNonNullableType();
    if (nonNullable.isUnion()) {
        return nonNullable.types.every(sub => isIndexableByZero(sub, checker));
    }
    return (
        checker.isArrayType(nonNullable) ||
        checker.isTupleType(nonNullable) ||
        (nonNullable.getFlags() & ts.TypeFlags.StringLike) !== 0
    );
}

/**
 * Checks if a node is a safe call to .at(0) on an array, tuple, or string.
 * Handles: x.at(0) AND x?.at(0), ensuring the object is a pure reference.
 */
function isSafeAtMethod(
    node: TSESTree.Node,
    services: ParserServicesWithTypeInformation,
    checker: ts.TypeChecker
): boolean {
    let target = node;
    if (target.type === AST_NODE_TYPES.ChainExpression) {
        target = target.expression;
    }

    if (
        target.type === AST_NODE_TYPES.CallExpression &&
        !target.optional &&
        target.callee.type === AST_NODE_TYPES.MemberExpression &&
        !target.callee.computed &&
        target.callee.property.type === AST_NODE_TYPES.Identifier &&
        target.callee.property.name === 'at' &&
        target.arguments.length === 1 &&
        target.arguments[0].type === AST_NODE_TYPES.Literal &&
        target.arguments[0].value === 0 &&
        isPureReference(target.callee.object)
    ) {
        const tsObj = services.esTreeNodeToTSNodeMap.get(target.callee.object);
        return isIndexableByZero(checker.getTypeAtLocation(tsObj), checker);
    }
    return false;
}

/**
 * Generates the index-access expression for a verified .at(0) call.
 * Converts x.at(0) -> x[0] and x?.at(0) -> x?.[0] so TypeScript can narrow it.
 */
function getConvertArgument(node: TSESTree.Node, sourceCode: TSESLint.SourceCode): string {
    let target = node;
    if (target.type === AST_NODE_TYPES.ChainExpression) {
        target = target.expression;
    }

    if (
        target.type === AST_NODE_TYPES.CallExpression &&
        !target.optional &&
        target.callee.type === AST_NODE_TYPES.MemberExpression &&
        !target.callee.computed &&
        target.callee.property.type === AST_NODE_TYPES.Identifier &&
        target.callee.property.name === 'at' &&
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

/**
 * Collects all call signatures across a type, including callable constituents of a union
 * and all overloads of an overloaded function type.
 */
function collectCallSignatures(type: ts.Type): readonly ts.Signature[] {
    const nonNullable = type.getNonNullableType();
    if (nonNullable.isUnion()) {
        return nonNullable.types.flatMap(sub => collectCallSignatures(sub));
    }
    return nonNullable.getCallSignatures();
}

/**
 * Resolves the type of the first argument that a callback signature passes to Number.
 * Unwraps rest parameters (e.g. `(...args: (string | null)[]) => number`).
 */
function getFirstParamType(
    sig: ts.Signature,
    location: ts.Node,
    checker: ts.TypeChecker
): ts.Type | undefined {
    if (sig.parameters.length === 0) {
        return undefined;
    }
    const firstParam = sig.parameters[0];
    const paramType = checker.getTypeOfSymbolAtLocation(firstParam, location);
    const decl = firstParam.valueDeclaration;
    if (decl && ts.isParameter(decl) && decl.dotDotDotToken) {
        if (checker.isTupleType(paramType)) {
            const typeArgs = checker.getTypeArguments(paramType as ts.TypeReference);
            return typeArgs[0];
        }
        return checker.getIndexTypeOfType(paramType, ts.IndexKind.Number);
    }
    return paramType;
}

export const noUnsafeNumberConversion = createRule<Options, MessageIds>({
    name: 'no-unsafe-number-conversion',
    meta: {
        type: 'problem',
        docs: {
            description:
                'Disallow converting null/undefined or non-numeric string values to Number',
        },
        hasSuggestions: true,
        messages: {
            unsafeConversion:
                'Unsafe conversion to Number(). The value might be null, undefined, or a non-numeric string.',
            unsafeCallback:
                'Unsafe passing of "Number" as callback. The input to the callback may be null, undefined, or a non-numeric string.',
            // Direct Fixes
            fixStrictNull: 'Guard with null check: val !== null ? Number(val) : null',
            fixStrictUndefined:
                'Guard with undefined check: val !== undefined ? Number(val) : undefined',
            fixMixed: 'Guard with strict null/undefined checks',
            // Callback Fixes
            fixMapStrictNull: 'Wrap in arrow function: val => val !== null ? Number(val) : null',
            fixMapStrictUndefined:
                'Wrap in arrow function: val => val !== undefined ? Number(val) : undefined',
            fixMapMixed: 'Wrap in arrow function with strict checks',
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
                // --------------------------------------------------
                // SCENARIO A: Direct Call -> Number(x)
                // --------------------------------------------------
                if (
                    node.callee.type === AST_NODE_TYPES.Identifier &&
                    node.callee.name === 'Number' &&
                    node.arguments.length === 1 &&
                    isGlobalNumber(node.callee, services, checker)
                ) {
                    const argument = node.arguments[0];

                    // 1. Literal/Identifier Exclusions (No Fix)
                    if (argument.type === AST_NODE_TYPES.Literal && argument.value === null) {
                        context.report({ node: argument, messageId: 'unsafeConversion' });
                        return;
                    }
                    if (
                        argument.type === AST_NODE_TYPES.Identifier &&
                        argument.name === 'undefined'
                    ) {
                        context.report({ node: argument, messageId: 'unsafeConversion' });
                        return;
                    }
                    if (
                        argument.type === AST_NODE_TYPES.Literal &&
                        typeof argument.value === 'string' &&
                        (argument.value.trim() === '' || Number.isNaN(Number(argument.value)))
                    ) {
                        context.report({ node: argument, messageId: 'unsafeConversion' });
                        return;
                    }

                    // 2. Variable Check
                    const tsNode = services.esTreeNodeToTSNodeMap.get(argument);
                    const type = checker.getTypeAtLocation(tsNode);
                    const { hasNull, hasUndefined, hasInvalidString } = getNullableFlags(
                        type,
                        checker
                    );

                    if (hasNull || hasUndefined || hasInvalidString) {
                        const isAtMethod = isSafeAtMethod(argument, services, checker);
                        const isSafeToDuplicate = isPureReference(argument) || isAtMethod;
                        const exprText = isAtMethod
                            ? getConvertArgument(argument, sourceCode)
                            : sourceCode.getText(argument);

                        const suggestions: TSESLint.SuggestionReportDescriptor<MessageIds>[] = [];

                        if (isSafeToDuplicate && !hasInvalidString) {
                            if (hasNull && hasUndefined) {
                                suggestions.push({
                                    messageId: 'fixMixed',
                                    fix: fixer =>
                                        fixer.replaceText(
                                            node,
                                            `(${exprText} !== null && ${exprText} !== undefined ? Number(${exprText}) : ${exprText})`
                                        ),
                                });
                            } else if (hasNull) {
                                suggestions.push({
                                    messageId: 'fixStrictNull',
                                    fix: fixer =>
                                        fixer.replaceText(
                                            node,
                                            `(${exprText} !== null ? Number(${exprText}) : null)`
                                        ),
                                });
                            } else if (hasUndefined) {
                                suggestions.push({
                                    messageId: 'fixStrictUndefined',
                                    fix: fixer =>
                                        fixer.replaceText(
                                            node,
                                            `(${exprText} !== undefined ? Number(${exprText}) : undefined)`
                                        ),
                                });
                            }
                        }

                        context.report({
                            node: argument,
                            messageId: 'unsafeConversion',
                            suggest: suggestions.length > 0 ? suggestions : undefined,
                        });
                    }
                    // Stop here if it was a direct Number() call
                    return;
                }

                // --------------------------------------------------
                // SCENARIO B: Generic Callback Usage
                // Handles: arr.map(Number), Promise.then(Number), func(Number), Array.from(x, Number)
                // --------------------------------------------------
                const tsCallNode = services.esTreeNodeToTSNodeMap.get(node);
                const resolvedSignature = checker.getResolvedSignature(tsCallNode);

                node.arguments.forEach((arg, index) => {
                    // We only care if the argument is specifically global "Number"
                    if (
                        arg.type !== AST_NODE_TYPES.Identifier ||
                        arg.name !== 'Number' ||
                        !isGlobalNumber(arg, services, checker)
                    ) {
                        return;
                    }

                    // 1. Resolve the expected callback type via contextual typing (handles rest params & spreads),
                    // falling back to the resolved signature parameter if needed.
                    const tsArgNode = services.esTreeNodeToTSNodeMap.get(arg);
                    let paramType = ts.isExpression(tsArgNode)
                        ? checker.getContextualType(tsArgNode)
                        : undefined;

                    if (
                        !paramType &&
                        resolvedSignature &&
                        index < resolvedSignature.parameters.length
                    ) {
                        const paramSymbol = resolvedSignature.parameters[index];
                        if (paramSymbol) {
                            paramType = checker.getTypeOfSymbolAtLocation(paramSymbol, tsCallNode);
                        }
                    }

                    if (!paramType) {
                        return;
                    }

                    // 2. Collect all call signatures across union constituents and overloads
                    const callSignatures = collectCallSignatures(paramType);
                    if (callSignatures.length === 0) {
                        return;
                    }

                    // 3. Inspect the first parameter of every signature (unwrapping rest params)
                    let hasNull = false;
                    let hasUndefined = false;
                    let hasInvalidString = false;

                    for (const callbackSignature of callSignatures) {
                        const firstParamType = getFirstParamType(
                            callbackSignature,
                            tsCallNode,
                            checker
                        );
                        if (!firstParamType) {
                            continue;
                        }
                        const flags = getNullableFlags(firstParamType, checker);
                        hasNull ||= flags.hasNull;
                        hasUndefined ||= flags.hasUndefined;
                        hasInvalidString ||= flags.hasInvalidString;
                    }

                    if (hasNull || hasUndefined || hasInvalidString) {
                        const suggestions: TSESLint.SuggestionReportDescriptor<MessageIds>[] = [];

                        if (!hasInvalidString) {
                            if (hasNull && hasUndefined) {
                                suggestions.push({
                                    messageId: 'fixMapMixed',
                                    fix: fixer =>
                                        fixer.replaceText(
                                            arg,
                                            `val => val !== null && val !== undefined ? Number(val) : val`
                                        ),
                                });
                            } else if (hasNull) {
                                suggestions.push({
                                    messageId: 'fixMapStrictNull',
                                    fix: fixer =>
                                        fixer.replaceText(
                                            arg,
                                            `val => val !== null ? Number(val) : null`
                                        ),
                                });
                            } else if (hasUndefined) {
                                suggestions.push({
                                    messageId: 'fixMapStrictUndefined',
                                    fix: fixer =>
                                        fixer.replaceText(
                                            arg,
                                            `val => val !== undefined ? Number(val) : undefined`
                                        ),
                                });
                            }
                        }

                        context.report({
                            node: arg,
                            messageId: 'unsafeCallback',
                            suggest: suggestions.length > 0 ? suggestions : undefined,
                        });
                    }
                });
            },
        };
    },
});
