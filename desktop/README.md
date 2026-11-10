# Spotihotel Desktop (Windows · macOS)

Le logiciel PC de l'hôtel. Avec internet, c'est Spotihotel dans sa propre fenêtre (réception,
planning, comptes, rapports ; impression des cartes d'enregistrement, factures et tickets cuisine).
Quand internet ou le site coupe, le PC continue de travailler :

- **Réception de secours** (sur le PC de la réception uniquement) :
  - clients présents : chambre, nom, société, nationalité, nombre de personnes, dates, plan,
    téléphone et **solde** de chaque séjour ;
  - **arrivées** des trois prochains jours, jour par jour (chambre attribuée ou non, heure
    d'arrivée, pré-enregistrement, acompte) ;
  - **départs du jour** (partis ou encore là, solde à encaisser) ;
  - **tableau des chambres** par étage : occupée (client, date de départ), propre, à nettoyer,
    hors service ;
  - **registre de police** (nom, prénom, nom du père, nationalité, pièce d'identité, naissance,
    dates) ;
  - recherche (nom, chambre, n° de réservation, code national, téléphone ; chiffres persans
    acceptés) et **impression A4** de chaque liste.

  La copie est rafraîchie toutes les deux minutes tant qu'internet est là ; son heure est affichée
  et signalée en rouge au-delà de 15 minutes. Elle est en lecture seule : les arrivées, départs et
  paiements pendant la coupure sont notés puis saisis sur le site au retour d'internet.
- **Caisse des restaurants et cafés** : prise de commande au PC et sur les téléphones / tablettes
  du personnel branchés au même Wi-Fi (adresse et code à 6 chiffres affichés en haut du logiciel),
  écran cuisine / bar, tickets imprimés en local (ESC/POS réseau port 9100 ou imprimante USB
  installée), encaissement espèces ou carte. Au retour d'internet, tout remonte sur le site, sans
  doublon, avec le numéro local (« H-12 ») conservé.

## Données des clients

La copie de la réception contient des données personnelles. Elle est :

- servie uniquement à la fenêtre du PC lui-même (clé interne), jamais aux téléphones appairés ;
- **chiffrée sur le disque** avec le trousseau du système (DPAPI sous Windows, Keychain sous
  macOS) ; si le chiffrement n'est pas disponible, elle reste en mémoire seulement ;
- **effacée** quand le PC est délié ou retiré depuis le site (Réglages → Logiciel PC → Retirer).

## Installation

1. Téléchargez l'installateur depuis **Réglages → Logiciel PC** sur le site (ou la dernière
   release GitHub : `Spotihotel-Setup.exe` pour Windows, `Spotihotel-mac.dmg` pour macOS, Intel
   et Apple Silicon).
2. Installez-le sur le PC de la réception (et, si besoin, celui de la caisse du restaurant).
   - Windows : « Windows a protégé votre ordinateur » → *Informations complémentaires* →
     *Exécuter quand même*. Autorisez le pare-feu sur les réseaux privés (pour les téléphones du
     restaurant).
   - macOS : clic droit sur Spotihotel → *Ouvrir* → *Ouvrir*. Si macOS dit que l'app est
     endommagée : `xattr -cr /Applications/Spotihotel.app` dans le Terminal.
3. Ouvrez-le, gardez l'adresse du site, *Se connecter* avec un compte gérant, ouvrez l'hôtel et
   confirmez **Activer ce PC**. Le logiciel démarre ensuite tout seul avec l'ordinateur.

Le PC apparaît dans **Réglages → Logiciel PC** ; *Retirer* le déconnecte immédiatement.

## Fonctionnement

| Pièce | Rôle |
| --- | --- |
| `src/main.js` | fenêtre (barre d'état + site ou écrans locaux), activation, bascule automatique hors ligne (réception de secours pour un hôtel) |
| `src/hub.js` | serveur local `:7420` : copie de la réception (ce PC seulement), commandes, appairage des appareils, flux temps réel |
| `src/sync.js` | surveillance de la connexion, copie de la réception (2 min) et du menu (5 min), envoi des commandes hors ligne, file d'impression du site |
| `src/store.js` | fichiers de données ; fichiers scellés (chiffrés) pour les données des clients |
| `src/printer.js`, `src/escpos.js`, `src/tickets.js` | tickets dessinés par Chromium (persan correct) puis envoyés en raster ESC/POS |
| `offline/` | écrans hors ligne : réception de secours (`frontdesk.js`), prise de commande, commandes, cuisine |
| `setup/` | barre d'état, premier lancement, réglages du PC (imprimantes locales, code, délier) |

Côté site :

- `POST /api/v1/offline/devices` (activation, session gérant) ;
- `GET /api/v1/offline/frontdesk` (copie de la réception, hôtels) ;
- `GET /api/v1/offline/snapshot` et `POST /api/v1/offline/orders` (caisse) — jeton du PC.

Chaque commande porte l'identifiant du PC qui l'a prise (`orders.offline_ref`, unique) : un
renvoi après coupure ne crée jamais de doublon.

Les données locales sont dans le dossier de l'application (`%APPDATA%/Spotihotel/data` sous
Windows, `~/Library/Application Support/Spotihotel/data` sous macOS).

## Développement

```sh
cd desktop
npm install
npm test            # serveur local, copie de la réception, prix, tickets, ESC/POS
npm start           # SPOTIHOTEL_URL=http://localhost:3000 npm start pour un site local
```

Essai automatique avec captures d'écran : `SPOTIHOTEL_SMOKE=<dossier>` et
`SPOTIHOTEL_SMOKE_SCREENS="frontdesk?tab=rooms,frontdesk?tab=police,outage,settings"`
(`outage` coupe le site pendant l'essai et vérifie la bascule).

Les installateurs sont construits par `.github/workflows/desktop.yml` (Actions → *Desktop app* →
*Run workflow*, ou un tag `desktop-v1.2.3`) et publiés comme release GitHub ; le site pointe vers
la dernière (`DESKTOP_WINDOWS_URL` / `DESKTOP_MAC_URL` pour un miroir en Iran). Pour une nouvelle
version, augmentez `version` dans `package.json`. Les installateurs ne sont pas signés ; la
signature (Apple Developer ID, certificat Windows) s'ajoute sans autre changement.
