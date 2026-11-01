# Spotifood

Plateforme SaaS de commande en salle par QR code, en **deux versions indépendantes** :

| Dossier              | Version                     | Langues         | Devise | Paiement en ligne | Hébergement                    |
| -------------------- | --------------------------- | --------------- | ------ | ----------------- | ------------------------------ |
| [`global/`](global/) | **Spotifood International** | fr*, en, fa, ar | EUR…   | Stripe            | Docker (Railway, Render, VPS…) |
| [`iran/`](iran/)     | **Spotifood Iran**          | fa*, en, ar     | IRR    | Zarinpal          | Liara                          |

\* langue par défaut

Chaque dossier est une application complète (code, base de données, tests, Dockerfile, déploiement). Les deux partent du même code à la date de séparation, puis **évoluent séparément** : une modification dans `iran/` n'a aucun effet sur `global/`, et inversement.

## Travailler sur une version

```bash
cd iran        # ou: cd global
npm install
npm run dev
```

Chaque version a son propre `README.md` (démarrage local) et `DEPLOY.md` (mise en production).

## Reporter un correctif d'une version à l'autre

Les corrections de sécurité ou de bugs communs méritent souvent d'aller dans les deux versions. Rien n'est automatique : vous choisissez ce que vous reportez.

```bash
# Rejoue le commit <sha>, fait dans global/, sur iran/ (puis relisez, testez, committez)
scripts/port.sh <sha> global iran
```

S'il y a un conflit parce que les deux versions ont trop divergé à cet endroit, le script s'arrête et laisse les parties à résoudre à la main (fichiers `.rej`).

## Déploiement Iran sur Liara depuis GitHub

`liara.json` et `.dockerignore` à la racine servent aux déploiements GitHub de Liara : ils construisent uniquement `iran/` (branche `main`). Détails : [`iran/DEPLOY.md`](iran/DEPLOY.md).

## CI

`.github/workflows/ci.yml` teste et construit chaque dossier séparément. Le job d'un dossier ne tourne que si ce dossier a changé. `deploy-iran.yml` déploie `iran/` sur Liara, à la main depuis l'onglet Actions.
