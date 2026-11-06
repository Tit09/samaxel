# Sécurité du dépôt de code (DevSecOps)

Le dépôt GitHub `sama-xhel` est protégé à quatre niveaux : le poste du développeur, le dépôt,
l'intégration continue et l'exploitation.

| Niveau | Mesure | Outil | Ce qu'elle empêche |
|---|---|---|---|
| Poste | Fichiers de secrets jamais suivis | `.gitignore` | Envoi de `.env`, clés JWT, clés de chiffrement |
| Poste | Contrôle avant chaque commit | `.githooks/pre-commit` + gitleaks | Commit d'un fichier ou d'un jeton secret |
| Poste | Fins de ligne normalisées | `.gitattributes` | Scripts Docker cassés après un clonage sous Windows |
| Dépôt | Dépôt privé, double authentification (2FA) du compte | GitHub | Vol du code par prise de compte |
| Dépôt | Branche `main` protégée : modification par demande de fusion, contrôles verts obligatoires, pas de réécriture forcée | Règles de branche GitHub | Code non vérifié en production, effacement de l'historique |
| Dépôt | Mises à jour de sécurité automatiques | Dependabot (npm, pub, Docker, Actions) | Bibliothèques vulnérables oubliées |
| Dépôt | Politique de signalement des failles | `SECURITY.md` | Divulgation publique d'une faille non corrigée |
| CI | Jeton en lecture seule, un passage par branche | `permissions`, `concurrency` | Action compromise qui modifierait le dépôt |
| CI | Recherche de secrets dans tout l'historique | gitleaks | Secret commis par erreur |
| CI | Analyse statique OWASP | Semgrep | Injection, XSS, mauvaise cryptographie |
| CI | Tests de sécurité (RLS, chiffrement, MFA) | node:test, 77 tests | Fuite de données entre hôpitaux |
| CI | Dépendances et image Docker | npm audit, Trivy, SBOM CycloneDX | Composants vulnérables, inventaire logiciel |
| CI | Test d'intrusion automatisé | OWASP ZAP | En-têtes manquants, failles web courantes |
| Exploitation | Secrets dans le coffre de l'hébergeur (Render) ou `.env` du serveur | — | Secrets dans le code ou dans l'image |
| Exploitation | Serveur durci | `durcissement-serveur.sh` (ufw, fail2ban, SSH par clé) | Intrusion sur le serveur |

## Réglages à faire une fois sur GitHub

1. **Compte** : Settings → Password and authentication → activer la **double authentification**.
2. **Dépôt** : Settings → Code security → activer **Dependabot alerts** et **Dependabot security updates**.
3. **Branche `main`** (Settings → Branches → Add rule) : *Require a pull request before merging*,
   *Require status checks to pass* (backend, securite), *Do not allow force pushes*.
   Sur un dépôt privé, cette protection demande GitHub Pro, offert aux étudiants par le
   **GitHub Student Developer Pack** (education.github.com).
4. **Poste** : `git config core.hooksPath .githooks` puis `winget install gitleaks`.
