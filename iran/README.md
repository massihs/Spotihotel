# Spotifood Iran

Version **Iran** : persan par défaut (en, ar), rial, Zarinpal, hébergée sur **Liara**. Déploiement : [`DEPLOY.md`](DEPLOY.md).

Ce dossier est une application **indépendante** : vous pouvez la modifier sans toucher à l'autre version (`../global/`). Voir le [README à la racine du dépôt](../README.md) pour reporter un correctif d'une version à l'autre.

- Architecture : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Avancement : [`docs/ROADMAP.md`](docs/ROADMAP.md)

## Stack

Next.js 16 (App Router, Cache Components) · React 19 · TypeScript strict · Tailwind CSS 4 · PostgreSQL 16 · Drizzle ORM · Zod · next-intl (fr / en / fa / ar, RTL) · Argon2id · Vitest.

## Démarrage

```bash
cd iran
cp .env.example .env              # puis renseigner APP_SECRET
docker compose up -d              # Postgres (+ base de test), MinIO, Mailpit
npm install
npm run db:migrate                # applique les migrations SQL de ./drizzle
npm run db:seed                   # plans, super admin, "Restaurant Demo"
npm run dev                       # http://localhost:3000 (en persan)
```

Comptes de démonstration (seed) :

| Rôle         | Email                        | Mot de passe                                    |
| ------------ | ---------------------------- | ----------------------------------------------- |
| Super admin  | `admin@spotifood.local`      | `ChangeMe!2026` (variables `SEED_SUPERADMIN_*`) |
| Propriétaire | `owner@demo.spotifood.local` | `DemoOwner!2026`                                |
| Équipe       | `staff@demo.spotifood.local` | `DemoStaff!2026`                                |

## Scripts

| Commande                                       | Rôle                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| `npm run dev` / `build` / `start`              | Next.js                                                               |
| `npm test`                                     | Tests unitaires + intégration (recrée la base `TEST_DATABASE_URL`)    |
| `npm run typecheck` · `lint` · `format`        | Qualité                                                               |
| `npm run db:generate`                          | Génère une migration SQL après modification de `src/server/db/schema` |
| `npm run db:migrate` · `db:seed` · `db:studio` | Base de données                                                       |

## Organisation du code

```
src/app/[locale]/        routes (landing, auth, dashboard restaurant, admin)
src/components/          design system (ui/) et composants d'écran
src/i18n/  messages/     internationalisation
src/lib/                 utilitaires purs (argent en centimes, ids, slug)
src/server/              couche métier — aucune dépendance à React
  auth/                  mots de passe, sessions, permissions, guards
  db/                    client + schéma Drizzle
  modules/<domaine>/     schémas Zod + services
  infra/                 rate limit (puis storage, email, paiements, realtime)
  tenancy.ts audit.ts    isolation multi-tenant, journal d'audit
tests/                   unit/ et integration/ (vraie base Postgres)
drizzle/                 migrations SQL versionnées
```

Règles : la logique métier vit dans `src/server`, jamais dans les pages ; chaque service reçoit un `RestaurantContext` authentifié et ne lit jamais l'identifiant du restaurant depuis l'entrée utilisateur ; les montants sont des entiers en centimes.
