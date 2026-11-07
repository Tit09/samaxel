"""Génère assets/textes/{fr,en,wo}.json depuis le catalogue unique (jeu/contenu/phrases.py)."""
import json, sys, os
sys.path.insert(0, sys.argv[1] if len(sys.argv) > 1 else '/home/claude/jeu/contenu')
from phrases import P
cles = [r[0] for r in P]
assert len(cles) == len(set(cles)), 'clé en double'
for i, lang in enumerate(['fr', 'en', 'wo']):
    json.dump({r[0]: r[i + 1] for r in P}, open(f'assets/textes/{lang}.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print(len(P), 'phrases')
