# Spotifood Iran

Ce dossier contient la version **Iran** de Spotifood. C'est une application indépendante : la version International (`../global/`) vit dans son propre dossier et peut évoluer différemment.

Les deux versions sont nées du même code. Les réglages qui les distinguaient au départ sont dans `src/config/edition.ts`. Ce fichier contient encore les deux configurations ; ce dossier utilise la sienne par défaut (`NEXT_PUBLIC_EDITION`). Vous pouvez simplifier ce fichier ou diverger librement.

## Spécificités de cette version

- Langues : **persan (par défaut)**, anglais, arabe. Pas de français.
- Devise par défaut : **IRR**, fuseau Asia/Tehran, TVA 10 % et 0 % à la création d'un restaurant.
- Paiement en ligne : **Zarinpal** (`src/server/infra/payments/zarinpal.ts`), plus espèces et terminal.
- Montants stockés en rials (`bigint`), **affichés et saisis en tomans** ; chiffres persans acceptés à la saisie.
- Chaque restaurant encaisse sur **son propre compte Zarinpal** (code marchand dans Paramètres → Paiements).
- Polices et ressources auto-hébergées : aucune requête vers Google ou un CDN étranger.
- Démo : menu iranien en persan, sans alcool, prix en tomans.
- Factures iraniennes (صورتحساب) : numérotation par année persane, mentions légales iraniennes, PDF en persan. Pas encore d'envoi à la سامانه مودیان.
- Déploiement Liara : `liara.json` à la racine du dossier, guide dans `DEPLOY.md`.

## À décider ou à faire

- Remboursements via l'API Zarinpal (aujourd'hui depuis le panel Zarinpal).
- Chiffres persans partout (numéros de table, quantités, calories s'affichent encore en chiffres latins).

## Points juridiques

Les deux versions doivent rester des services distincts : société, comptes bancaires et de paiement, hébergement, données. Stripe et de nombreux prestataires internationaux interdisent toute activité liée à l'Iran. À faire valider par un juriste avant le lancement.
