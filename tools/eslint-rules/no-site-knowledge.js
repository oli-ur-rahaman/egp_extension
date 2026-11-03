// ESLint rule: no portal knowledge in program logic (PROJECT_PLAN §3.2, EXECUTION_PLAN §4.4).
// Every URL, CSS selector and column mapping for the portal lives in profiles/.
// This rule flags string literals in src/ that look like either.

const PORTAL_HOST = /eprocure\.gov\.bd|e-gp\.gov|\begp\.gov\.bd/i;

/** Strings that are almost certainly CSS selectors. */
const SELECTOR_PATTERNS = [
  /^\s*#[A-Za-z_][\w-]*\s*$/, //                       #id
  /^\s*[#.][A-Za-z_][\w-]*\s*([\s>+~,]|[#.[:][\w-])/, // .a .b  #a>td  .a:first  #a[x]
  /\[\s*[\w-]+\s*[*^$|~]?=/, //                         [name*=...]
  /:(nth-child|nth-of-type|first-child|last-child|has|not|contains)\(/,
  /^\s*(table|tbody|thead|tr|td|th|select|option|input|form|div|span|a|ul|li)\s*([>+~]|[.#[:][\w-])/i,
  /^\s*(table|tbody|thead|tr|td|th|select|option|input|form)(\s+(table|tbody|thead|tr|td|th|select|option|input|form|a|span|div))+\s*$/i,
];

/** DOM methods whose string argument is a selector by definition. */
const SELECTOR_METHODS = new Set(['querySelector', 'querySelectorAll', 'closest', 'matches', 'getElementById', 'getElementsByClassName']);

/** @param {string} text */
function looksLikeSelector(text) {
  return SELECTOR_PATTERNS.some((re) => re.test(text));
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Portal URLs and CSS selectors belong in profiles/, not in program logic.' },
    schema: [],
    messages: {
      url: 'Portal URL "{{text}}" in program logic. Put it in the Site Profile (profiles/).',
      selector: 'CSS selector "{{text}}" in program logic. Put it in the Site Profile (profiles/).',
      selectorArg: '{{method}}() called with a literal selector. Read the selector from the Site Profile.',
    },
  },
  create(context) {
    // Only content scripts touch portal pages; the panel may query its own DOM by literal id.
    const isContentScript = /[\\/]src[\\/]content[\\/]/.test(context.filename);

    /**
     * @param {import('estree').Node} node
     * @param {string} text
     */
    function check(node, text) {
      const parent = /** @type {any} */ (node).parent;
      if (parent && (parent.type === 'ImportDeclaration' || parent.type === 'ExportAllDeclaration' || parent.type === 'ExportNamedDeclaration' || parent.type === 'ImportExpression')) return;

      if (PORTAL_HOST.test(text)) {
        context.report({ node, messageId: 'url', data: { text: text.slice(0, 60) } });
        return;
      }

      if (isContentScript && parent && parent.type === 'CallExpression' && parent.arguments[0] === node) {
        const callee = parent.callee;
        const method = callee.type === 'MemberExpression' && callee.property.type === 'Identifier' ? callee.property.name : null;
        if (method && SELECTOR_METHODS.has(method)) {
          context.report({ node, messageId: 'selectorArg', data: { method } });
          return;
        }
      }

      if (looksLikeSelector(text)) {
        context.report({ node, messageId: 'selector', data: { text: text.slice(0, 60) } });
      }
    }

    return {
      Literal(node) {
        if (typeof node.value === 'string') check(node, node.value);
      },
      TemplateLiteral(node) {
        // Stand in an identifier for each ${…} so `#row${i} td` reads as `#rowx td`.
        check(node, node.quasis.map((q) => q.value.cooked ?? q.value.raw).join('x'));
      },
    };
  },
};

export default rule;
