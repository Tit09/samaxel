# SAMA XHEL — site vitrine

Site statique (HTML, CSS, JavaScript, **sans backend**) relié à l'API publique de SAMA XHEL Santé.

| Section | Appel à l'API Santé |
|---|---|
| Phrase d'accueil « J'habite à … et mon enfant … » | `POST /api/orientation` (IA d'orientation : trouble, région, coût, langue) |
| Carte et liste de toutes les structures | `GET /api/structures` (partenaires + établissements OpenStreetMap) |
| Test de repérage anonyme | `GET /api/questionnaires`, `POST /api/questionnaires/:code/evaluer` (rien n'est enregistré) |
| Candidature d'un professionnel | `POST /api/auth/register-professionnel`, `POST /api/candidatures/pieces`, `POST /api/auth/verify` |
| Dons | `GET /api/dons/transparence`, `POST /api/dons` (Wave) |

## Lancer en local
```bash
# 1. démarrer le backend Santé (port 3001) ; 2. servir le site :
python3 -m http.server 5500
# ouvrir http://localhost:5500
```
L'adresse de l'API se règle dans `js/config.js` (localhost en développement, `https://api.samaxhel.sn/api` en ligne).
En production, ajouter l'adresse du site à `CORS_ORIGINS` dans le `.env` du backend.

## Choix
- Images d'origine conservées, converties en WebP (12 Mo → 0,5 Mo : chargement rapide en 3G).
- Polices : Baloo 2 (titres) et Atkinson Hyperlegible (texte, conçue pour la lisibilité).
- Carte MapLibre GL + fond OpenFreeMap (gratuit, sans clé d'API, données OpenStreetMap), regroupement des points, bibliothèque servie localement (dossier vendor).
- Photos des structures : fournies par l'API avec leur crédit. Sans photo, une vignette OpenStreetMap du lieu réel.
  ⚠ Les photos de presse doivent être remplacées par des photos autorisées par chaque structure avant la mise en ligne publique.

## Tests
`node tests/tests_site.js` (Playwright) : rendu ordinateur et mobile, orientation, « autour de moi », test de repérage, candidature avec pièces, dons.
