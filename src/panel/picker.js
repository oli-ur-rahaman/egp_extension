// @ts-nocheck: draws from the portal's tree answers. Behaviour is covered by the panel's e2e tests.
// The Department and Category pickers. A sheet over the panel. Opening a branch adds only that branch,
// so the list never moves under the user's hand.

import { h, icon } from './icons.js';

const MAX_DEPTH = 12;

/**
 * @param {{
 *   filter: any,
 *   multi: boolean,
 *   chosen: { id?: string, names?: string[] },
 *   nodes: (key: string) => any[] | undefined,
 *   load: (key: string, id: string) => Promise<any[]>,
 *   expanded: Set<string>,
 *   onExpandChange: () => void,
 *   onPick: (value: any) => void,
 *   onClose: () => void,
 *   scrollTop: number,
 *   onScroll: (top: number) => void,
 * }} input
 */
export function buildPicker(input) {
  const { filter, multi, chosen, nodes, load, expanded, onExpandChange, onPick, onClose } = input;
  const title = filter.label.replace(/^(Select|By) /, '');
  const names = new Set(chosen.names ?? []);

  const doneBtn = multi && h('button', { id: 'picker-done', type: 'button', class: 'btn filled', onclick: () => onPick({ names: [...names] }) }, 'Done');
  const showCount = () => {
    if (doneBtn) doneBtn.textContent = names.size ? `Done (${names.size})` : 'Done';
  };
  showCount();

  /** @param {any} node @param {number} depth */
  function row(node, depth) {
    const a = node.attr;
    const name = multi ? a.cpvname : a.dname;
    const rawId = String(a.id).replace(/^deptid_/, '');
    const key = `${filter.id}:${rawId}`;
    const item = h('li', { role: 'treeitem', 'data-node': rawId, 'data-name': name.toLowerCase() });
    const line = h('div', { class: 'tree-row', style: `--depth:${depth}` });
    item.append(line);

    if (node.state === 'closed') {
      const twist = h('button', { type: 'button', class: 'twist', 'aria-label': `Open ${name}`, 'aria-expanded': 'false' }, icon('chevronRight'));
      /** @type {HTMLElement | null} */
      let children = null;
      const show = async () => {
        twist.setAttribute('aria-expanded', 'true');
        twist.setAttribute('aria-label', `Close ${name}`);
        if (children) {
          children.hidden = false;
          return;
        }
        children = branch(key, rawId, depth + 1);
        item.append(children);
      };
      twist.addEventListener('click', () => {
        if (twist.getAttribute('aria-expanded') === 'true') {
          twist.setAttribute('aria-expanded', 'false');
          twist.setAttribute('aria-label', `Open ${name}`);
          children.hidden = true;
          expanded.delete(key);
        } else {
          expanded.add(key);
          show();
        }
        onExpandChange();
      });
      line.append(twist);
      // The limit is far deeper than any real tree: an answer that repeats itself can't open forever.
      if (expanded.has(key) && depth < MAX_DEPTH) show();
    } else {
      line.append(h('span', { class: 'twist-gap' }));
    }

    if (multi) {
      const box = h('input', { type: 'checkbox', checked: names.has(name), onchange: (e) => {
        if (e.target.checked) names.add(name);
        else names.delete(name);
        showCount();
      } });
      line.append(h('label', { class: 'node' }, box, h('span', {}, name)));
    } else {
      const picked = chosen.id === rawId;
      line.append(h('button', { type: 'button', class: picked ? 'node picked' : 'node', onclick: () => onPick({ id: rawId, name }) },
        h('span', {}, name)));
    }
    return item;
  }

  /** One level of the tree. It fills itself in once its answer arrives. @param {string} key @param {string} id @param {number} depth */
  function branch(key, id, depth) {
    const list = h('ul', { class: 'tree', role: depth ? 'group' : 'tree' });
    const fill = (found) => {
      list.replaceChildren(...(found.length ? found.map((n) => row(n, depth)) : [h('li', { class: 'tree-note', style: `--depth:${depth}` }, 'Nothing under this item.')]));
      applyFilterText();
    };
    const cached = nodes(key);
    if (cached) {
      fill(cached);
      return list;
    }
    const fetch = () => {
      list.replaceChildren(...[0, 1, 2].map(() => h('li', { class: 'skeleton', style: `--depth:${depth}` })));
      load(key, id).then(fill, (err) => {
        list.replaceChildren(h('li', { class: 'tree-note', style: `--depth:${depth}` },
          `Couldn't load this list. ${err?.message ?? ''} `,
          h('button', { type: 'button', class: 'btn text', onclick: fetch }, 'Try again')));
      });
    };
    fetch();
    return list;
  }

  const search = h('input', { id: 'picker-search', type: 'text', placeholder: 'Find in the opened lists', 'aria-label': `Find in ${title}`, autocomplete: 'off', oninput: applyFilterText });

  /** Keeps what matches, and the parents leading to it. Only opened lists are here: the portal sends each branch when it's opened. */
  function applyFilterText() {
    const words = search?.value?.trim().toLowerCase() ?? '';
    const items = (root) => [...root.getElementsByTagName('li')].filter((li) => li.dataset.name);
    for (const li of items(body)) {
      li.hidden = words !== '' && !li.dataset.name.includes(words) && !items(li).some((c) => c.dataset.name.includes(words));
    }
  }

  const body = h('div', { class: 'sheet-body', onscroll: (e) => input.onScroll(e.target.scrollTop) });
  body.append(branch(`${filter.id}:root`, '0', 0));

  const sheet = h('div', { class: 'sheet', style: 'display:contents', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, onkeydown: (e) => {
    if (e.key === 'Escape') onClose();
  } },
    h('header', { class: 'sheet-head' },
      h('h2', {}, title),
      h('button', { id: 'picker-close', type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: onClose }, icon('close'))),
    h('div', { class: 'sheet-search' }, icon('search'), search),
    body,
    doneBtn && h('footer', { class: 'sheet-foot' }, h('button', { type: 'button', class: 'btn text', onclick: onClose }, 'Cancel'), doneBtn));

  // Called once the sheet is on screen.
  sheet.restore = () => {
    body.scrollTop = input.scrollTop;
    search.focus({ preventScroll: true });
  };
  return sheet;
}
