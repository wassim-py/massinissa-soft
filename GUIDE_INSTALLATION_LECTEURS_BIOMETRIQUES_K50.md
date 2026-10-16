# Guide Complet d'Installation des Lecteurs Biométriques ZKTeco K50 Pro
**Version :** 3.0 (Moteur Auto-Cicatrisant & Anti-Mise en Veille)  
**Sièges :** `ECOLE` • `ANNEX` • `AMPHI`  
**Type de Branchement :** Câble Ethernet RJ45 direct au PC (1 Lecteur) ou via Switch (Plusieurs Lecteurs sur 1 PC)  
**Mode de Fonctionnement :** Application Déployée en Ligne (Cloud) + Pont Local 1 Clic (`zk-bridge`)

---

## 1. Vue d'Ensemble & Architecture
Puisque le logiciel Massinissa School Software est déployé **en ligne dans le cloud**, le lecteur physique ZKTeco K50 Pro (relié par câble réseau RJ45 au PC de l'école) ne peut pas être joint directement depuis Internet sans un pont local.

Le PC de l'école exécute donc en arrière-plan un service ultra-léger (**`zk-bridge`**) :
* **Liaison Matérielle :** Dialogue directement avec le K50 Pro en TCP sur le câble réseau (`192.168.50.201:4370`).
* **Liaison Navigateur Instantanée (SSE) :** Transmet chaque scan au navigateur en **< 2 ms** via Server-Sent Events locaux (`http://127.0.0.1:4375/events`).
* **Zéro Consommation de Quota Cloud :** Supprime les requêtes de polling inutiles en base de données, réduisant la consommation NeonDB de **plus de 75 %**.
* **Moteur Anti-Veille & Auto-Cicatrisant (v3) :** Envoie un battement de cœur ZKTeco actif toutes les 8 secondes (`CMD_REG_EVENT`) qui **empêche la session du K50 Pro d'expirer** et maintient la carte réseau du PC éveillée 24h/24. Si le câble est débranché ou le lecteur redémarré, il le détecte en 14 secondes et se reconnecte automatiquement en 2 à 3 secondes dès le rebranchement.

---

## 2. Prérequis sur chaque PC de l'école
Avant de brancher le lecteur sur un PC :
1. **Connexion Internet par Wi-Fi :** Le PC de l'école doit être connecté à Internet en **Wi-Fi**, afin de laisser le **port Ethernet (RJ45)** totalement libre pour le ZKTeco K50 Pro.
2. **Node.js Installé :** Assurez-vous que **Node.js LTS** est installé sur le PC ([https://nodejs.org](https://nodejs.org)).
3. **Copier le dossier `zk-bridge` :** Copiez le dossier `zk-bridge` (contenant `zk-bridge.js`, `INSTALLER_ET_DEMARRER_PONT_K50.bat`, et `ARRETER_PONT_K50.bat`) sur le PC de l'école.

---

## 3. Étape 1 — Configuration Matérielle du Lecteur K50 Pro

Sur le clavier du ZKTeco K50 Pro, maintenez la touche **`M/OK`** pendant 2 secondes pour ouvrir le menu, puis accédez à :  
**`Comm.` (Communication) $\rightarrow$ `Ethernet`**

### A. Si le PC a 1 SEUL Lecteur (Câble RJ45 direct au PC) :
| Paramètre sur le K50 Pro | Valeur à saisir |
| :--- | :--- |
| **Adresse IP** | `192.168.50.201` |
| **Masque de sous-réseau** | `255.255.255.0` |
| **Passerelle** | `0.0.0.0` *(ou `192.168.50.1`)* |
| **Port TCP** | `4370` |
| **DHCP** | `OFF` (Désactivé) |
| **Clé comm (Mot de passe)** | `0` |

### B. Si le PC a PLUSIEURS Lecteurs (via un Switch Ethernet 5 Ports) :
Reliez le PC et tous les lecteurs K50 Pro au switch avec des câbles RJ45, et configurez une IP unique par lecteur :
* **Lecteur #1 :** `192.168.50.201` (Masque `255.255.255.0`, Port `4370`, DHCP `OFF`)
* **Lecteur #2 :** `192.168.50.202` (Masque `255.255.255.0`, Port `4370`, DHCP `OFF`)
* **Lecteur #3 :** `192.168.50.203` (Masque `255.255.255.0`, Port `4370`, DHCP `OFF`)

---

## 4. Étape 2 — Configuration du Port Ethernet de Windows (`192.168.50.1`)

Pour que le PC dialogue avec le K50 Pro **sans jamais couper Internet par Wi-Fi** :

1. Appuyez sur **`Win + R`**, tapez **`ncpa.cpl`** et validez par **Entrée**.
2. Clic droit sur **Ethernet** (la carte filaire reliée au K50 Pro) $\rightarrow$ **Propriétés**.
3. Double-cliquez sur **Protocole Internet version 4 (TCP/IPv4)**.
4. Cochez **Utiliser l'adresse IP suivante** et renseignez :
   * **Adresse IP :** `192.168.50.1`
   * **Masque de sous-réseau :** `255.255.255.0`
   * **Passerelle par défaut :** **LAISSER TOTALEMENT VIDE !**  
     *(Essentiel : Laisser la passerelle vide garantit que Windows continue d'utiliser le Wi-Fi pour Internet tout en routant le K50 Pro sur le câble RJ45).*
5. Cliquez sur **OK**, puis **OK**.

### Test Rapide de Connexion :
Ouvrez **PowerShell** et tapez :
```powershell
Test-NetConnection 192.168.50.201 -Port 4370
```
Vérifiez que la dernière ligne indique : **`TcpTestSucceeded : True`**.

---

## 5. Étape 3 — Lancement de l'Installateur 1 Clic (`zk-bridge`)

1. Ouvrez le dossier **`zk-bridge`** sur le PC de l'école.
2. **Clic droit $\rightarrow$ Exécuter en tant qu'administrateur** sur **`INSTALLER_ET_DEMARRER_PONT_K50.bat`**.
3. Lorsque le script vous demande l'IP :
   * Appuyez sur **`[Entrée]`** pour conserver `192.168.50.201` (si 1 seul lecteur).
   * Ou tapez `192.168.50.201,192.168.50.202` (si 2 lecteurs sur ce PC).
4. **C'est terminé !** Le script effectue automatiquement :
   * Copie de `zk-bridge.js` dans `%USERPROFILE%\MassinissaK50Bridge\zk-bridge.js`.
   * **Désactivation de la mise en veille Ethernet :** Coupe `PowerSavingMode`, `Green Ethernet`, et `Energy-Efficient Ethernet (EEE)` pour empêcher Windows d'éteindre le port réseau après une longue inactivité.
   * **Configuration du Pare-feu Windows :** Ouvre les ports TCP `4370` et `4375`.
   * **Démarrage Automatique Silencieux :** Enregistre un lanceur invisible (`MassinissaK50Bridge.vbs`) dans le démarrage de Windows (`shell:startup`) pour qu'il s'allume tout seul chaque matin sans invite de commande.
   * **Démarrage Immédiat :** Active le service local sur `http://127.0.0.1:4375`.

---

## 6. Étape 4 — Connexion à l'Application en Ligne

1. Ouvrez **Google Chrome** ou **Microsoft Edge** sur le PC de l'école et allez sur votre site en ligne.
2. **Sélectionnez le Siège correspondant au bâtiment :**
   * Sur le PC d'**ECOLE** $\rightarrow$ Sélectionnez **ECOLE**
   * Sur le PC d'**ANNEX** $\rightarrow$ Sélectionnez **ANNEX**
   * Sur le PC d'**AMPHI** $\rightarrow$ Sélectionnez **AMPHI**
3. Vérifiez que le bouton **Empreinte** en haut est activé sur **ON** (et cliquez sur **Autoriser** si Chrome demande la permission de communiquer avec le réseau local).
4. En 2 secondes, le voyant passe au **Vert (Connecté)** !

---

## 7. Fonctionnement Quotidien & Avantages

* **Pointage Instantané (< 200 ms) :** Le scan arrive au navigateur via SSE en 0 ms. La carte de passage s'affiche, le son retentit et l'élève est marqué **PRÉSENT** immédiatement.
* **Mise à Jour Immédiate du Roster :** Si la secrétaire a la page d'appel ouverte, le statut de l'élève passe au vert et son **Solde de séances restantes se met à jour instantanément** sans avoir besoin de cliquer sur Sauvegarder.
* **Isolation Stricte par Siège :** Scanner à AMPHI vérifie uniquement les séances d'AMPHI. Un élève d'ECOLE venu faire un rattrapage à AMPHI déclenche la carte **Séance de Rattrapage** pour être enregistré en 2 clics sans fausser son groupe d'origine.
* **Zéro Doublon :** Plusieurs scans d'affilée pour la même séance ne décomptent jamais de crédit supplémentaire (`Déjà pointé présent`).
* **Battement de Cœur Anti-Inactivité (v3) :** Le pont envoie un signal au K50 Pro toutes les 8 secondes pour garder la liaison active toute la journée.
* **Reconnexion Manuelle Immédiate :** Si l'appareil a été débranché ou redémarré, il suffit de basculer le bouton **Empreinte** en haut sur **OFF puis ON** pour forcer une ré-authentification immédiate en `< 50 ms`.

---

## 8. Tableau de Dépannage Rapide

| Symptôme | Cause probable | Solution immédiate |
| :--- | :--- | :--- |
| **Internet se coupe quand on branche le câble RJ45** | Une *Passerelle par défaut* a été saisie dans la carte Ethernet | Ouvrez `ncpa.cpl` $\rightarrow$ Ethernet $\rightarrow$ IPv4 et **videz** la case *Passerelle par défaut*. |
| **Le bouton Empreinte reste Rouge / Déconnecté en ligne** | Le pont local n'est pas lancé ou Chrome a bloqué l'accès local | 1. Relancez `INSTALLER_ET_DEMARRER_PONT_K50.bat` en administrateur.<br>2. Dans Chrome, cliquez sur l'icône à gauche de l'URL $\rightarrow$ autorisez l'**Accès aux appareils du réseau local**. |
| **`TcpTestSucceeded : False` sur `192.168.50.201`** | Câble RJ45 débranché ou IP Ethernet perdue | Vérifiez le câble et tapez `ipconfig` dans PowerShell pour vérifier que Ethernet a bien `192.168.50.1`. |
| **Le lecteur a été redémarré ou est resté inactif la nuit** | Session matériel fermée ou câble rebranché | Le pont v3 se reconnecte automatiquement en 2 à 3 secondes. Vous pouvez aussi basculer le bouton **Empreinte** sur **OFF puis ON** dans la barre du haut pour forcer la reconnexion immédiate. |
| **Le port Ethernet se coupe après une longue inactivité** | Économie d'énergie Realtek activée dans Windows | Exécutez `INSTALLER_ET_DEMARRER_PONT_K50.bat`, ou dans le Gestionnaire de périphériques (`devmgmt.msc`) $\rightarrow$ carte Realtek $\rightarrow$ Avancé $\rightarrow$ passez `Energy-Efficient Ethernet`, `Green Ethernet` et `Power Saving Mode` sur **Désactivé**. |
| **L'élève scanne mais apparaît *"Hors créneau"*** | Le mauvais siège est sélectionné dans la barre du haut | Vérifiez que le sélecteur de siège en haut correspond bien au bâtiment physique (`ECOLE`, `ANNEX`, ou `AMPHI`). |
| **Comment arrêter le pont en arrière-plan** | Besoin de fermer le service Node.js local | Double-cliquez sur [`ARRETER_PONT_K50.bat`](file:///c:/Users/wassi/OneDrive/Bureau/massinissa-school-software/zk-bridge/ARRETER_PONT_K50.bat). |

---

## 7. Synchronisation Biométrique Multi-Sièges (v4)

Chaque appareil ZKTeco K50 Pro possède sa propre mémoire flash physique interne. Avec le moteur de synchronisation cloud v4 :

1. **Enregistrement unique :**
   * Vous enregistrez l'empreinte d'un élève sur le lecteur du siège A (3 passages de doigt).
   * Le pont local extrait automatiquement le modèle biométrique et le sauvegarde dans la base de données cloud centrale PostgreSQL.
2. **Distribution automatique aux autres sièges :**
   * Dès que le PC du siège B est allumé avec son pont local (ou automatiquement toutes les 5 minutes), il télécharge les profils et les modèles biométriques depuis le cloud et les injecte directement dans la puce mémoire du K50 du siège B.
3. **Reconnaissance instantanée partout :**
   * L'élève peut désormais poser son doigt sur n'importe quel lecteur K50 de l'école — il est reconnu immédiatement sans ré-enrôlement !
4. **Bouton de synchronisation immédiate :**
   * Ouvrez le **Journal de présence biométrique** en haut à droite.
   * Cliquez sur **"Sync K50"** (ou *مزامنة الفروع*).
   * Une notification verte confirmera : *"Lecteur K50 synchronisé avec succès (X empreintes mises à jour) !"*

