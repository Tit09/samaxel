# Politique de sécurité — SAMA XHEL

## Signaler une faille
N'ouvrez pas de ticket public. Écrivez à l'équipe SAMA XHEL (contact : +221 77 470 21 57)
en décrivant la faille et comment la reproduire. Réponse sous 72 h ; correctif prioritaire
pour toute faille touchant des données de santé.

## Données
Le dépôt et les environnements de démonstration ne contiennent **que des données fictives**.
Aucune donnée réelle de patient n'est traitée avant l'autorisation de la CDP (loi n° 2008-12).

## Secrets
Aucun secret n'est versionné : `.env`, clés JWT, clés de chiffrement et identifiants
(Telegram, Orange, WhatsApp, e-mail) restent sur les serveurs. Ils sont bloqués par
`.gitignore`, par le crochet `.githooks/pre-commit` et par gitleaks dans l'intégration continue.
Un secret exposé par erreur est **révoqué et remplacé immédiatement**, puis retiré de l'historique.
