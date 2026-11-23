# HomeWhiz

Pilotez et surveillez dans Gladys l'électroménager de l'application
**HomeWhiz** : lave-linge, sèche-linge, lave-linge séchants, lave-vaisselle,
fours, tables de cuisson, réfrigérateurs, climatiseurs…

## Marques prises en charge

HomeWhiz est l'application du groupe Arçelik. Tous les appareils qu'elle gère
fonctionnent avec cette intégration, quelle que soit la marque en façade :

**Beko**, **Grundig**, **Arçelik**, **Blomberg**, **Bauknecht**,
**Elektrabregenz**, **Altus**, **Arctic**, **Defy**, **Leisure**, **Flavel**,
**Lamona**, **Dawlance**, **Voltas Beko**, ainsi que les modèles HomeWhiz de
Whirlpool, Smeg, Teka, Viking, Cylinda et V-Zug.

Si l'appareil apparaît dans votre application HomeWhiz, il apparaît dans
Gladys.

## Prérequis

- Gladys Assistant **5.1 ou plus récent**.
- Un **compte HomeWhiz** (e-mail + mot de passe) avec vos appareils ajoutés
  dans l'application.
- Des appareils connectés en **Wi-Fi**. Les appareils uniquement Bluetooth ne
  sont pas joignables depuis Gladys (l'intégration tourne dans un conteneur
  sans radio Bluetooth) : le bouton **Tester la connexion** les liste, mais
  ils ne sont pas créés.
- Une connexion internet : les appareils sont joints via le cloud HomeWhiz
  (intégration **cloud**).

## Configuration

1. Ouvrez l'onglet **Configuration** de l'intégration.
2. Saisissez l'**e-mail** et le **mot de passe** de votre compte HomeWhiz.
   Inscrit avec Google ? Définissez d'abord un mot de passe : dans l'app
   HomeWhiz, _Mon compte_ → _Changer le mot de passe_ → _Mot de passe
   oublié_.
3. Choisissez la **langue** des noms de fonctionnalités et des listes de
   programmes (anglais, français, allemand ou espagnol).
4. Enregistrez, puis cliquez sur **Tester la connexion** : le message liste
   vos appareils Wi-Fi et ceux uniquement Bluetooth.
5. Ouvrez l'onglet **Découverte** et ajoutez vos appareils.

Pour **piloter** un appareil depuis Gladys (démarrer, mettre en pause, changer
de programme), activez son **contrôle à distance** sur l'appareil lui-même
(souvent un appui long sur la touche Wi-Fi / télécommande). Sans cela,
l'appareil ne fait que remonter son état.

## Ce que vous obtenez

Chaque appareil devient un appareil Gladys dont les fonctionnalités dépendent
du modèle :

- **État** (allumé, éteint, en cours, en pause, départ différé) et un
  interrupteur **Marche / arrêt** ;
- **Programme** et ses options (température, essorage, niveau de séchage,
  prélavage, éco, lavage rapide…), sous forme de listes ou d'interrupteurs
  modifiables ;
- **Phase** du cycle (lavage, rinçage, essorage, séchage…) ;
- **Temps restant**, **durée** et **départ différé**, en minutes ;
- **Alertes** (porte ouverte, manque d'eau, de sel, de liquide de rinçage,
  filtre…), un interrupteur chacune plus un texte récapitulatif ;
- températures des compartiments réfrigérateur et congélateur, température
  du four, zones de la table de cuisson… ;
- pour un **climatiseur** : marche/arrêt, mode, consigne, vitesse de
  ventilation, oscillation et température de la pièce, dans la carte
  climatisation standard de Gladys.

Chaque appareil est rafraîchi toutes les minutes et remonte ses changements
en temps réel.

## Scènes

L'intégration ajoute ses propres cartes à l'éditeur de scènes (catégorie
**Intégrations**) :

- **Cycle d'un appareil démarré** (déclencheur) — un programme démarre. Le
  nom du programme est disponible avec `{{triggerEvent.data.program}}`.
- **Cycle d'un appareil terminé** (déclencheur) — par exemple « préviens-moi
  quand la lessive est finie ». Même variable `program`.
- **Alerte d'un appareil** (déclencheur) — porte ouverte, manque d'eau, de
  sel… L'alerte est disponible avec `{{triggerEvent.data.warning_label}}`.
- **Lancer un programme d'appareil** (action) — choisissez éventuellement un
  programme (son nom tel qu'affiché dans Gladys, ex. `Éco 40-60`) et un départ
  différé en minutes, puis démarrez. La sortie `success` indique si cela a
  fonctionné, `reason` pourquoi sinon (`remote_control_disabled`,
  `unknown_program`…).
- **Piloter un appareil** (action) — démarrer, mettre en pause, reprendre,
  allumer ou éteindre.

Exemple : lancer le lave-vaisselle la nuit en heures creuses, puis recevoir
un message sur votre téléphone à la fin du cycle.

## Tableau de bord

- Widget **Électroménager** — tous les appareils d'un coup d'œil : état,
  programme, phase, temps restant et alertes.
- Widget **Cycle d'un appareil** — un appareil (choisi dans les réglages du
  widget) : temps restant, jauge de progression, détails et boutons
  **Démarrer / Pause / Reprendre / Éteindre**.

## Actions

- **Tester la connexion** — se reconnecte et liste vos appareils.
- **Recharger les appareils** — télécharge à nouveau la configuration des
  appareils (après l'ajout d'un appareil dans l'app HomeWhiz, ou un
  changement de langue). Mettez ensuite les appareils à jour depuis l'onglet
  **Découverte**.

## Dépannage

- **Connexion refusée** : vérifiez l'e-mail et le mot de passe en vous
  connectant à l'app HomeWhiz ; les comptes créés avec Google ont besoin d'un
  mot de passe (voir plus haut).
- **Un appareil manque** : il est peut-être uniquement Bluetooth (voir
  **Tester la connexion**), ou pas encore ajouté à votre compte HomeWhiz.
- **Les commandes n'ont aucun effet** : activez le contrôle à distance sur
  l'appareil.
- **Logs** : ouvrez l'intégration dans Gladys, onglet **Logs**. Le mot de
  passe et les jetons n'y sont jamais écrits.
