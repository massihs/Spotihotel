# Spotifood International — déploiement

Édition `global` : français par défaut (en, fa, ar), euro, Stripe. Voir aussi [README.md](./README.md).

L'application est une image Docker classique. Il faut un hébergeur capable de faire tourner **un conteneur en continu**, car le temps réel garde des connexions ouvertes (SSE) et écoute PostgreSQL (`LISTEN/NOTIFY`).

| Option                                   | Adapté ?       | Remarque                                                                 |
| ---------------------------------------- | -------------- | ------------------------------------------------------------------------ |
| Railway, Render, Fly.io, Koyeb, Scaleway | ✅ recommandé  | Déploiement du `Dockerfile` + PostgreSQL managé                          |
| VPS (Hetzner, OVH, Scaleway…)            | ✅             | `deploy/docker-compose.yml`, avec un reverse proxy TLS devant            |
| Vercel, Netlify (serverless)             | ⚠️ déconseillé | Fonctions courtes : le temps réel et l'écoute PostgreSQL ne tiennent pas |

## Plateforme managée (Railway, Render, Fly…)

1. Créez un service à partir du dépôt GitHub, de type **Dockerfile**, avec `global/` comme dossier racine (root directory).
2. Argument de build : `NEXT_PUBLIC_EDITION=global` (c'est déjà la valeur par défaut).
3. Ajoutez une base **PostgreSQL 16+**. `DATABASE_URL_DIRECT` doit être une connexion **directe**, pas un pooler en mode transaction.
4. Renseignez les variables de [`deploy/.env.production.example`](./deploy/.env.production.example). Pour les photos, utilisez un stockage S3 (R2, S3, Scaleway…) : le disque d'un conteneur est souvent effacé à chaque déploiement.
5. Health check : `GET /api/health`, port `3000`.

## VPS avec docker compose

```bash
cp deploy/.env.production.example deploy/.env      # puis remplissez-le
export POSTGRES_PASSWORD=$(openssl rand -hex 24)
docker compose -f deploy/docker-compose.yml up -d --build
```

Placez Caddy, Traefik ou nginx devant `127.0.0.1:3000` pour le HTTPS.

## Stripe

- Webhook : `https://votre-domaine.com/api/v1/payments/webhooks/stripe`, événements `checkout.session.completed`, `checkout.session.expired` et `checkout.session.async_payment_failed`.
- Variables : `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET`.
- À décider avant la production : **Stripe Connect** (encaissement sur le compte de chaque restaurant). Voir `docs/ROADMAP.md`, Phase 7.

À chaque démarrage, le conteneur applique les migrations, met à jour les données de la plateforme, puis démarre.
