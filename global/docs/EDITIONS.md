# Spotifood International

Ce dossier contient la version **International** de Spotifood. C'est une application indépendante : la version Iran (`../iran/`) vit dans son propre dossier et peut évoluer différemment.

Les deux versions sont nées du même code. Les réglages qui les distinguaient au départ sont dans `src/config/edition.ts`. Ce fichier contient encore les deux configurations ; ce dossier utilise la sienne par défaut (`NEXT_PUBLIC_EDITION`). Vous pouvez simplifier ce fichier ou diverger librement.

## Spécificités de cette version

- Langues : **français (par défaut)**, anglais, persan, arabe.
- Devise par défaut : **EUR** (autres devises proposées dans les paramètres), TVA française à la création.
- Paiement en ligne : **Stripe** (`src/server/infra/payments/stripe.ts`), plus espèces et terminal.
- Déploiement Docker : guide dans `DEPLOY.md`, `deploy/docker-compose.yml` pour un VPS.

## À décider ou à faire

- **Stripe Connect** : encaissement sur le compte de chaque restaurant (voir `docs/ROADMAP.md`, Phase 7).

## Points juridiques

Les deux versions doivent rester des services distincts : société, comptes bancaires et de paiement, hébergement, données. Stripe et de nombreux prestataires internationaux interdisent toute activité liée à l'Iran. À faire valider par un juriste avant le lancement.
