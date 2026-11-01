# Spotifood Desktop (Windows · macOS)

Le logiciel de caisse Spotifood. Avec internet, il affiche le site Spotifood comme un navigateur
et imprime les tickets cuisine et bar (il remplace l'agent d'impression). Quand internet coupe,
le PC caisse devient le serveur du restaurant :

- **prise de commande** à la caisse et sur les téléphones / tablettes des serveurs, branchés au
  même Wi-Fi (adresse et code à 6 chiffres affichés en haut du logiciel) ;
- **écran cuisine / bar** sur n'importe quel écran du réseau ;
- **tickets imprimés en local** sur les imprimantes réseau du restaurant (ESC/POS, port 9100) ou
  sur une imprimante USB installée sur le PC, en persan, avec un ticket par poste ;
- **encaissement** espèces ou carte (TPE) ;
- au retour d'internet, **tout remonte sur le site** (commandes, paiements, statut), sans doublon,
  avec le numéro local (« H-12 ») conservé à côté du numéro du site.

## Installation

1. Téléchargez l'installateur depuis **Réglages → Logiciel PC** sur le site (ou la dernière
   release GitHub : `Spotifood-Setup.exe` pour Windows, `Spotifood-mac.dmg` pour macOS).
2. Installez-le sur le PC caisse (toujours allumé, sur le Wi-Fi du restaurant).
   - Windows : « Windows a protégé votre ordinateur » → *Informations complémentaires* → *Exécuter quand même*.
     Autorisez le pare-feu sur les réseaux privés (pour les téléphones).
   - macOS : clic droit sur Spotifood → *Ouvrir* → *Ouvrir*. Si macOS dit que l'app est endommagée :
     `xattr -cr /Applications/Spotifood.app` dans le Terminal.
3. Ouvrez-le, gardez l'adresse du site, *Se connecter* avec un compte gérant, ouvrez le restaurant
   et confirmez **Activer ce PC**. Le logiciel démarre ensuite tout seul avec l'ordinateur.

Le PC apparaît dans **Réglages → Logiciel PC** ; *Retirer* le déconnecte immédiatement.

## Fonctionnement

| Pièce | Rôle |
| --- | --- |
| `src/main.js` | fenêtre (barre d'état + site ou écrans locaux), activation, bascule automatique hors ligne |
| `src/hub.js` | serveur local `:7420` (réseau du restaurant) : commandes, appairage des appareils, flux temps réel |
| `src/sync.js` | surveillance de la connexion, copie du menu (5 min), envoi des commandes hors ligne, file d'impression du site |
| `src/printer.js`, `src/escpos.js`, `src/tickets.js` | tickets dessinés par Chromium (persan correct) puis envoyés en raster ESC/POS |
| `offline/` | écrans hors ligne (prise de commande, commandes, cuisine), partagés PC / téléphones |
| `setup/` | barre d'état, premier lancement, réglages du PC (imprimantes locales, code, délier) |

Côté site : `POST /api/v1/offline/devices` (activation, session gérant), `GET /api/v1/offline/snapshot`
et `POST /api/v1/offline/orders` (jeton du PC). Chaque commande porte l'identifiant du PC qui l'a
prise (`orders.offline_ref`, unique) : un renvoi après coupure ne crée jamais de doublon.

Les données locales sont dans le dossier de l'application (`%APPDATA%/Spotifood/data` sous
Windows, `~/Library/Application Support/Spotifood/data` sous macOS).

## Développement

```sh
cd desktop
npm install
npm test            # hub, prix, tickets, ESC/POS
npm start           # SPOTIFOOD_URL=http://localhost:3000 npm start pour un site local
```

Les installateurs sont construits par `.github/workflows/desktop.yml` (Actions → *Desktop app* →
*Run workflow*, ou un tag `desktop-v1.0.1`). Pour une nouvelle version, augmentez `version` dans
`package.json`. Les installateurs ne sont pas signés ; la signature (Apple Developer ID,
certificat Windows) s'ajoute sans autre changement.
