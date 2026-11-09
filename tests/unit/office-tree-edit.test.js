// D67: editing the office hierarchy.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { findNode, fromRows, moveNode, nudge, placeOffice, reconcile, toRows, unsetOffice } from '../../src/shared/office-tree-edit.js';

const root = path.resolve(import.meta.dirname, '..', '..');
const shipped = JSON.parse(readFileSync(path.join(root, 'profiles/pwd-offices.json'), 'utf8'));
const live = Object.entries(shipped.egpOffices).map(([value, text]) => ({ value, text }));

const small = () => ({ nodes: [{ id: 'ce', name: 'CE', level: 1, children: [
  { id: 'z1', name: 'Zone 1', level: 2, egpId: '1', children: [{ id: 'c1', name: 'Circle 1', level: 3, egpId: '2', children: [{ id: 'd1', name: 'Div 1', level: 4, egpId: '3', children: [] }] }] },
  { id: 'z2', name: 'Zone 2', level: 2, egpId: '4', children: [] },
] }] });

describe('moving', () => {
  it('moves a branch inside another, and its levels follow', () => {
    const { tree } = moveNode(small(), 'c1', 'z2', 'inside');
    expect(findNode(tree.nodes, 'c1').depth).toBe(3);
    expect(findNode(tree.nodes, 'd1').node.level).toBe(4);
    expect(findNode(tree.nodes, 'z1').node.children).toHaveLength(0);
  });
  it('places before and after', () => {
    const { tree } = moveNode(small(), 'z2', 'z1', 'before');
    expect(tree.nodes[0].children.map((n) => n.id)).toEqual(['z2', 'z1']);
  });
  it('refuses a place under itself, or deeper than Sub-division', () => {
    expect(moveNode(small(), 'z1', 'd1', 'inside').error).toContain('its own');
    const deep = small();
    findNode(deep.nodes, 'd1').node.children.push({ id: 's1', name: 'Sub 1', level: 5, children: [] });
    expect(moveNode(deep, 'z1', 'z2', 'inside').error).toContain('5 levels');
  });
  it('keyboard: up, down, in and out', () => {
    let { tree } = nudge(small(), 'z2', 'up');
    expect(tree.nodes[0].children[0].id).toBe('z2');
    ({ tree } = nudge(tree, 'z1', 'right'));
    expect(findNode(tree.nodes, 'z1').depth).toBe(3);
    ({ tree } = nudge(tree, 'z1', 'left'));
    expect(findNode(tree.nodes, 'z1').depth).toBe(2);
  });
});

describe('Not set and gone', () => {
  it('a new e-GP office is Not set; one e-GP no longer lists is gone', () => {
    const got = reconcile(small(), [{ value: '1', text: 'a' }, { value: '2', text: 'b' }, { value: '3', text: 'c' }, { value: '99', text: 'New office' }]);
    expect(got.unset.map((o) => o.value)).toEqual(['99']);
    expect([...got.gone]).toEqual(['z2']);
  });
  it('placing a Not set office, and taking one out again', () => {
    let { tree } = placeOffice(small(), { value: '99', text: 'New office' }, 'c1', 'inside');
    expect(findNode(tree.nodes, 'egp-99').depth).toBe(4);
    ({ tree } = unsetOffice(tree, 'egp-99'));
    expect(findNode(tree.nodes, 'egp-99')).toBeNull();
    // An office with offices under it stays as a heading; only its link goes.
    ({ tree } = unsetOffice(tree, 'c1'));
    expect(findNode(tree.nodes, 'c1').node.egpId).toBeUndefined();
    expect(findNode(tree.nodes, 'd1')).not.toBeNull();
  });
  it('the shipped tree against the shipped list: nothing gone, 39 Not set', () => {
    const got = reconcile(shipped, live);
    expect(got.gone.size).toBe(0);
    expect(got.unset).toHaveLength(39);
  });
});

describe('Excel rows', () => {
  it('the shipped tree goes out and comes back the same', () => {
    const rows = [['Level', 'Office', 'e-GP office ID', 'Name on e-GP', 'On e-GP now'], ...toRows(shipped, live)];
    const back = fromRows(rows);
    expect(back.error).toBeUndefined();
    const ids = (tree) => { const out = []; const w = (ns, d) => ns.forEach((n) => { out.push(`${d}:${n.name}:${n.egpId ?? ''}`); w(n.children, d + 1); }); w(tree.nodes, 1); return out; };
    expect(ids(back.tree)).toEqual(ids(shipped));
  });
  it('a new office added in the template lands where its level puts it', () => {
    const rows = [['Level', 'Office', 'e-GP office ID'], ['Chief Engineer', 'CE'], ['Zone', 'Zone A'], ['Circle', 'Circle A', '700'], ['Division', 'New Division', '701']];
    const { tree } = fromRows(rows);
    expect(findNode(tree.nodes, 'x4').node.name).toBe('New Division');
    expect(findNode(tree.nodes, 'x4').depth).toBe(4);
  });
  it('says what is wrong, by row', () => {
    expect(fromRows([['Level', 'Office'], ['Chief Engineer', 'CE'], ['Division', 'D']]).error).toContain('Row 3');
    expect(fromRows([['Level', 'Office'], ['Zone X', 'Z']]).error).toContain('isn\'t one of');
    expect(fromRows([['Name'], ['x']]).error).toContain('Level and Office');
    expect(fromRows([['Level', 'Office', 'e-GP office ID'], ['Chief Engineer', 'A', '5'], ['Zone', 'B', '5']]).error).toContain('twice');
  });
});
