import * as ts from 'typescript';

const PARAMETER_PROPERTY_MODIFIERS = new Set([
  ts.SyntaxKind.PublicKeyword,
  ts.SyntaxKind.PrivateKeyword,
  ts.SyntaxKind.ProtectedKeyword,
  ts.SyntaxKind.ReadonlyKeyword,
]);

const ASSIGNMENT_OPERATORS = new Set([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.AsteriskAsteriskEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
  ts.SyntaxKind.PercentEqualsToken,
  ts.SyntaxKind.AmpersandEqualsToken,
  ts.SyntaxKind.BarEqualsToken,
  ts.SyntaxKind.CaretEqualsToken,
  ts.SyntaxKind.LessThanLessThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

/** Requires the `ts.SourceFile` to have been parsed with `setParentNodes: true` since it relies on `.parent`. */
function findEnclosingClass(node: ts.Node): ts.ClassDeclaration | null {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isClassDeclaration(current)) return current;
    current = current.parent;
  }
  return null;
}

function findDeclaredPropertyDefault(classNode: ts.ClassDeclaration, propertyName: string): ts.ArrayLiteralExpression | null {
  for (const member of classNode.members) {
    if (ts.isPropertyDeclaration(member) && ts.isIdentifier(member.name) && member.name.text === propertyName) {
      return member.initializer && ts.isArrayLiteralExpression(member.initializer) ? member.initializer : null;
    }
  }
  return null;
}

function findPromotedPropertyDefault(classNode: ts.ClassDeclaration, propertyName: string): ts.ArrayLiteralExpression | null {
  const ctor = classNode.members.find(ts.isConstructorDeclaration);
  if (!ctor) return null;

  for (const param of ctor.parameters) {
    const isParameterProperty = param.modifiers?.some((m) => PARAMETER_PROPERTY_MODIFIERS.has(m.kind)) ?? false;
    if (isParameterProperty && ts.isIdentifier(param.name) && param.name.text === propertyName) {
      return param.initializer && ts.isArrayLiteralExpression(param.initializer) ? param.initializer : null;
    }
  }

  return null;
}

function isRootedInThisProperty(node: ts.Node, propertyName: string): boolean {
  if (ts.isPropertyAccessExpression(node) && node.expression.kind === ts.SyntaxKind.ThisKeyword && node.name.text === propertyName) {
    return true;
  }
  if (ts.isElementAccessExpression(node)) return isRootedInThisProperty(node.expression, propertyName);
  return false;
}

function anyThisPropertyAssignment(node: ts.Node, propertyName: string): boolean {
  if (ts.isBinaryExpression(node) && ASSIGNMENT_OPERATORS.has(node.operatorToken.kind)) {
    if (isRootedInThisProperty(node.left, propertyName)) return true;
  }

  // Scope-blind on purpose (matches PHP big0nia's SubtreeAssignmentFinder):
  // descends into closures and nested functions, since `this` inside them
  // still binds to the enclosing class. Only stops at a nested class body,
  // which has its own unrelated `this`.
  if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) return false;

  return ts.forEachChild(node, (child) => anyThisPropertyAssignment(child, propertyName)) ?? false;
}

function isReassignedElsewhere(classNode: ts.ClassDeclaration, propertyName: string): boolean {
  for (const member of classNode.members) {
    const hasBody = ts.isConstructorDeclaration(member) || ts.isMethodDeclaration(member) || ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member);
    if (hasBody && member.body && anyThisPropertyAssignment(member.body, propertyName)) {
      return true;
    }
  }
  return false;
}

export function findPropertyDefaultArray(contextNode: ts.Node, propertyName: string): ts.ArrayLiteralExpression | null {
  const classNode = findEnclosingClass(contextNode);
  if (!classNode) return null;

  const defaultValue = findDeclaredPropertyDefault(classNode, propertyName) ?? findPromotedPropertyDefault(classNode, propertyName);
  if (!defaultValue || isReassignedElsewhere(classNode, propertyName)) return null;

  return defaultValue;
}
