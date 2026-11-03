// M0-AT4: the lint rule catches portal selectors and URLs planted in src/.
import { describe, expect, it } from 'vitest';
import { ESLint, RuleTester } from 'eslint';
import path from 'node:path';
import rule from '../../tools/eslint-rules/no-site-knowledge.js';

const root = path.resolve(import.meta.dirname, '..', '..');

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({ languageOptions: { ecmaVersion: 2023, sourceType: 'module' } });

tester.run('no-site-knowledge', rule, {
  valid: [
    { code: "const ext = '.xlsx';" },
    { code: "const file = './data.json';" },
    { code: "import { x } from '../shared/bus.js';" },
    { code: "const msg = 'sw/ping';" },
    { code: "const text = 'Ready. Waiting for the page.';" },
    { code: "document.getElementById('status');", filename: path.join(root, 'src/panel/panel.js') },
    { code: 'el.querySelector(profile.results.table);', filename: path.join(root, 'src/content/table-parser.js') },
  ],
  invalid: [
    { code: "const u = 'https://www.eprocure.gov.bd/resources/common/AppSearch.jsp';", errors: [{ messageId: 'url' }] },
    { code: "const s = '#ddlMinistry';", errors: [{ messageId: 'selector' }] },
    { code: "const s = '#gvReport tbody tr';", errors: [{ messageId: 'selector' }] },
    { code: "const s = 'select[name*=Ministry]';", errors: [{ messageId: 'selector' }] },
    { code: "const s = 'td:nth-child(2)';", errors: [{ messageId: 'selector' }] },
    { code: "const s = 'table > tbody > tr';", errors: [{ messageId: 'selector' }] },
    { code: "const s = 'tbody tr';", errors: [{ messageId: 'selector' }] },
    { code: 'const s = `#row${i} td`;', errors: [{ messageId: 'selector' }] },
    {
      code: "document.querySelector('pager');",
      filename: path.join(root, 'src/content/table-parser.js'),
      errors: [{ messageId: 'selectorArg' }],
    },
  ],
});

describe('repository lint config', () => {
  it('rejects a selector planted in src/ with the real config', async () => {
    const eslint = new ESLint({ cwd: root });
    const [result] = await eslint.lintText("export const table = '#gvReport tbody tr';\n", {
      filePath: path.join(root, 'src/content/planted.js'),
    });
    expect(result.messages.map((m) => m.ruleId)).toContain('egp/no-site-knowledge');
  });

  it('allows selectors in tests/ and profiles tooling', async () => {
    const eslint = new ESLint({ cwd: root });
    const [result] = await eslint.lintText("export const table = '#gvReport tbody tr';\n", {
      filePath: path.join(root, 'tests/unit/planted.js'),
    });
    expect(result.messages.filter((m) => m.ruleId === 'egp/no-site-knowledge')).toEqual([]);
  });
});
