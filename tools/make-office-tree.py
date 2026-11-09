"""Builds profiles/pwd-offices.json: PWD's office hierarchy (owner's file) with e-GP's office IDs placed in it (D66).
Office names and IDs only; the file's user columns are never read.
    python tools/make-office-tree.py <hierarchy.xlsx> <egp-offices.json>
egp-offices.json maps e-GP office name to its ID, from the office list the portal shows for PWD (224 on 2026-11-10).
"""
import json, re, sys, difflib
from datetime import date
from pathlib import Path
import openpyxl

xlsx, egp_file = sys.argv[1], sys.argv[2]
egp = json.load(open(egp_file, encoding='utf8'))
egp = egp.get('flow1', egp)

wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
rows = [r for r in wb['Office Hierarchy'].iter_rows(min_col=1, max_col=2, values_only=True)][1:]

SPELLING = [('barisal', 'barishal'), ('bogra', 'bogura'), ('jessore', 'jashore'), ('gonj', 'ganj'), ('hobiganj', 'habiganj'),
            ('perojpur', 'pirojpur'), ('jhalokathi', 'jhalakathi'), ('brammanbaria', 'brahmanbaria'), ('chapai nawabganj', 'chapainawabganj'),
            ('khagrachari', 'khagrachhari'), ('norshingdi', 'narsingdi'), ('laksmipur', 'lakshmipur'), ('shere bangla', 'sher e bangla'),
            ('devlopment', 'development'), ('builing', 'building'), ('pnd', 'p&d'), ('bhabon', 'bhaban'), ('coord', 'co')]

def key(name):
    t = name.lower().replace('&amp;', '&').replace('e/m', 'em').replace('e/ m', 'em')
    for a, b in SPELLING: t = t.replace(a, b)
    t = t.split(',')[0]  # a place after the comma differs between the two lists
    t = ' '.join(w for w in re.findall(r'[a-z0-9&-]+', t) if w not in {'office', 'of', 'the', 'pwd', 'public', 'works', 'department'})
    t = t.replace('sub-division', 'subdivision').replace('sub division', 'subdivision')
    return re.sub(r'[^a-z0-9&]', '', t)

def words(name):
    """The name's words in any order, town included: 'Chattogram PWD EM Division-2' is 'PWD E/M Division-2, Chattogram'."""
    t = name.lower().replace('&amp;', '&').replace('e/m', 'em').replace('e/ m', 'em')
    for a, b in SPELLING: t = t.replace(a, b)
    t = t.replace('sub-division', 'subdivision').replace('sub division', 'subdivision')
    t = re.sub(r'([a-z])(\d)', r'\1 \2', t)
    drop = {'office', 'of', 'the', 'pwd', 'public', 'works', 'department'}
    return ' '.join(sorted(set(re.findall(r'[a-z0-9&]+', t)) - drop))

def kind(k):
    for word in ('subdivision', 'division', 'circle', 'zone'):
        if word in k: return word
    return ''

# The tree, from the row order and levels: 1 Chief Engineer, 2 Zone, 3 Circle, 4 Division, 5 Sub-division.
nodes, stack = [], {}
for i, (level, name) in enumerate(rows):
    if not name: continue
    level, name = int(level), str(name).strip()
    node = {'id': f'n{i}', 'name': name, 'level': level, 'children': []}
    parent = next((stack[l] for l in sorted(stack, reverse=True) if l < level), None)
    (parent['children'] if parent else nodes).append(node)
    stack[level] = node
    for l in [l for l in stack if l > level]: del stack[l]

flat = []
def walk(ns):
    for n in ns:
        flat.append(n); walk(n['children'])
walk(nodes)
by_key, by_words = {}, {}
for n in flat:
    by_key.setdefault(key(n['name']), []).append(n)
    by_words.setdefault(words(n['name']), n)
# Whole names first, town included, so 'PWD EM Division-1, Dhaka' can't take Chattogram's Division-1.
egp_words = {words(name) for name in egp}
free = lambda ns: next((n for n in ns if 'egpId' not in n and words(n['name']) not in egp_words), None)

placed, unplaced = {}, []
for name, office_id in sorted(egp.items(), key=lambda x: x[0].lower().startswith('invalid')):
    if name.lower().startswith('invalid'):
        unplaced.append(name); continue
    k = key(name)
    node = by_words.get(words(name))
    if node and 'egpId' in node: node = None
    # Otherwise without the town, but never a node that another e-GP name matches whole.
    node = node or free(by_key.get(k, []))
    if not node:
        # Only a near spelling of the same kind, with the same numbers and the same E/M mark.
        for c in difflib.get_close_matches(k, list(by_key), n=3, cutoff=0.85):
            if kind(c) == kind(k) and re.findall(r'\d+', c) == re.findall(r'\d+', k) and ('em' in c) == ('em' in k):
                node = free(by_key[c])
                if node: break
    if node and 'egpId' not in node:
        node['egpId'] = office_id
        node['egpName'] = name
        placed[name] = node['name']
    else:
        unplaced.append(name)

out = {
    '$comment': 'PWD office hierarchy (D66). Built by tools/make-office-tree.py from the owner\'s hierarchy file and e-GP\'s office list. Office names and IDs only. Users place new or unmatched offices in the panel\'s Office hierarchy screen; their changes are kept in the browser, not here.',
    'department': 'Public Works Department',
    'builtOn': date.today().isoformat(),
    'levels': {'1': 'Chief Engineer', '2': 'Zone', '3': 'Circle', '4': 'Division', '5': 'Sub-division'},
    'egpOffices': {v: k for k, v in egp.items()},
    'nodes': nodes,
}
Path('profiles/pwd-offices.json').write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf8')
print('placed', len(placed), 'not placed', len(unplaced))
for n in unplaced: print('  not placed:', n)
