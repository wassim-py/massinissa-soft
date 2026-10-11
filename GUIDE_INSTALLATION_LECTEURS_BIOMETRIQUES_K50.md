# Manuel d'Installation — Lecteurs Biométriques ZKTeco K50 Pro (Connexion Ethernet Directe sur PC École)

Ce manuel explique étape par étape comment installer et configurer **un ou plusieurs lecteurs d'empreintes digitales ZKTeco K50 / K50 Pro** sur les ordinateurs de chaque siège (**ECOLE**, **ANNEX**, **AMPHI**) en utilisant la méthode **Câble Ethernet (RJ45) direct vers le PC**, tout en gardant la connexion Internet du PC via **Wi-Fi**.

---

## 1. Architecture Matérielle (1 seul lecteur ou Plusieurs lecteurs par Siège)

### Cas A : 1 seul lecteur ZKTeco K50 Pro sur le PC du Siège
* **Internet / Base de données :** Le PC de l'administration est connecté au **Wi-Fi** (ex: `192.168.1.x`).
* **Lecteur Biométrique :** Le lecteur ZKTeco K50 Pro est branché **directement par câble RJ45** dans le port Ethernet du PC.

| Équipement | Adresse IP | Masque de sous-réseau | Passerelle (Gateway) | Port TCP |
| :--- | :--- | :--- | :--- | :--- |
| **Carte Ethernet du PC** | `192.168.50.1` | `255.255.255.0` | *(Laisser vide)* | — |
| **Lecteur K50 Pro #1** | `192.168.50.201` | `255.255.255.0` | `0.0.0.0` *(ou vide)* | `4370` |

---

### Cas B : Plusieurs lecteurs ZKTeco K50 Pro sur le MÊME PC dans un même Siège
Si un siège (ex: **ANNEX** ou **ECOLE** aux heures de pointe) possède **2 ou 3 lecteurs K50 Pro** à la réception :

#### Option Matérielle 1 (Recommandée — Switch Ethernet 5 ports non-manageable)
1. Branchez un petit **Switch Ethernet 5 ports** (ex: *TP-Link LS1005G*) au port Ethernet RJ45 du PC.
2. Branchez tous les lecteurs K50 Pro sur ce Switch avec des câbles RJ45.
3. Chaque lecteur reçoit une adresse IP unique dans le sous-réseau `192.168.50.x` :

| Équipement | Adresse IP | Masque de sous-réseau | Passerelle (Gateway) | Port TCP |
| :--- | :--- | :--- | :--- | :--- |
| **Carte Ethernet du PC** | `192.168.50.1` | `255.255.255.0` | *(Laisser vide)* | — |
| **Lecteur K50 Pro #1 (Entrée A)** | `192.168.50.201` | `255.255.255.0` | `0.0.0.0` | `4370` |
| **Lecteur K50 Pro #2 (Entrée B)** | `192.168.50.202` | `255.255.255.0` | `0.0.0.0` | `4370` |
| **Lecteur K50 Pro #3 (Entrée C)** | `192.168.50.203` | `255.255.255.0` | `0.0.0.0` | `4370` |

#### Option Matérielle 2 (Adaptateurs USB vers Ethernet RJ45)
Si vous n'utilisez pas de Switch et branchez le 2ème lecteur via un **Adaptateur USB-RJ45** :
* **Port Ethernet 1 (Intégré au PC) :** IP PC = `192.168.50.1` $\rightarrow$ Lecteur #1 = `192.168.50.201`
* **Port Ethernet 2 (Adaptateur USB) :** IP PC = `192.168.51.1` $\rightarrow$ Lecteur #2 = `192.168.51.201`

---

## 2. Étape 1 — Configurer l'adresse IP sur chaque Lecteur ZKTeco K50 Pro

Sur le clavier physique du lecteur **ZKTeco K50 Pro** :

1. Appuyez longuement sur la touche **`M/OK`** pour ouvrir le menu principal.
2. Allez dans **Réseau (Comm. / Network)** $\rightarrow$ **Ethernet**.
3. Configurez les paramètres suivants :
   * **Adresse IP (IP Address) :**
     * Pour le **Lecteur #1** : `192.168.50.201`
     * Pour le **Lecteur #2** *(si présent)* : `192.168.50.202`
     * Pour le **Lecteur #3** *(si présent)* : `192.168.50.203`
   * **Masque de sous-réseau (Subnet Mask) :** `255.255.255.0`
   * **Passerelle (Gateway) :** `0.0.0.0`
   * **DHCP :** `OFF` (Désactivé)
   * **Port TCP :** `4370`
4. Revenez d'un cran dans **Comm.** $\rightarrow$ **Contrôle d'accès / Sécurité (Comm. Key / Mot de passe Comm.)** :
   * Vérifiez que **Comm Key = `0`** (valeur par défaut).
5. Appuyez sur **`ESC`** pour sauvegarder et revenir à l'écran d'accueil.

---

## 3. Étape 2 — Configurer la Carte Ethernet Windows sur le PC de l'École

> **TRÈS IMPORTANT :** Ne remplissez **JAMAIS** la case *"Passerelle par défaut (Default Gateway)"* sur la carte Ethernet. Si vous la laissez vide, Windows garde automatiquement Internet sur le **Wi-Fi** et utilise le câble **Ethernet** uniquement pour les lecteurs d'empreintes.

### Méthode Rapide (1 clic en PowerShell Administrateur)
Ouvrez **PowerShell en tant qu'Administrateur** sur le PC de l'école et exécutez :

```powershell
# 1. Trouver le nom exact de la carte Ethernet
Get-NetAdapter | Select-Object Name, Status, InterfaceDescription

# 2. Assigner l'IP fixe 192.168.50.1 (Remplacez "Ethernet" si votre carte porte un autre nom)
New-NetIPAddress -InterfaceAlias "Ethernet" -IPAddress 192.168.50.1 -PrefixLength 24

# 3. Autoriser le port 4370 dans le pare-feu Windows
New-NetFirewallRule -DisplayName "ZKTeco K50 Pro Biometrics" -Direction Inbound -LocalPort 4370 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "ZKTeco K50 Pro Biometrics Out" -Direction Outbound -RemotePort 4370 -Protocol TCP -Action Allow
```

### Méthode Graphique (Panneau de Configuration Windows)
1. Appuyez sur **`Win + R`**, tapez **`ncpa.cpl`** et appuyez sur **Entrée**.
2. Faites un **clic droit** sur la carte **Ethernet** (pas le Wi-Fi) $\rightarrow$ **Propriétés**.
3. Double-cliquez sur **Protocole Internet version 4 (TCP/IPv4)**.
4. Cochez **Utiliser l'adresse IP suivante** :
   * **Adresse IP :** `192.168.50.1`
   * **Masque de sous-réseau :** `255.255.255.0`
   * **Passerelle par défaut :** *(Laisser totalement VIDE)*
   * **Serveur DNS :** *(Laisser totalement VIDE)*
5. Cliquez sur **OK** $\rightarrow$ **OK**.

---

## 4. Étape 3 — Tester la Connexion Matérielle depuis le PC

Ouvrez **PowerShell** sur le PC de l'école et lancez :

```powershell
# Tester le Lecteur #1
Test-NetConnection 192.168.50.201 -Port 4370

# Si vous avez un Lecteur #2 sur le même PC :
Test-NetConnection 192.168.50.202 -Port 4370
```

Vous devez obtenir :
```text
TcpTestSucceeded : True
```

---

## 5. Étape 4 — Configurer le fichier `.env` sur le PC de l'École

Dans le dossier du logiciel sur le PC de l'école, vérifiez ou ajoutez ces lignes dans le fichier **`.env`** :

### Si le PC possède 1 seul lecteur K50 Pro :
```env
ZK_DEVICE_IP="192.168.50.201"
ZK_DEVICE_PORT="4370"
ZK_COMM_KEY="0"
```

### Si le PC possède plusieurs lecteurs K50 Pro (séparés par une virgule) :
```env
ZK_DEVICE_IP="192.168.50.201,192.168.50.202"
ZK_DEVICE_PORT="4370"
ZK_COMM_KEY="0"
```

### Si l'application est déployée EN LIGNE (Cloud / Serveur distant) — Activation en 1 Clic :
Puisque le lecteur K50 Pro (`192.168.50.201`) est branché physiquement par câble RJ45 au PC de l'école (réseau privé local), un serveur distant sur Internet ne peut pas voir le câble RJ45 directement sans un **Pont Local** sur le PC de l'école :
1. Copiez le dossier **`zk-bridge`** sur chaque PC de l'école (**ECOLE**, **ANNEX**, **AMPHI**).
2. Faites un **Clic droit $\rightarrow$ Exécuter en tant qu'administrateur** sur **`INSTALLER_ET_DEMARRER_PONT_K50.bat`**.
3. Appuyez sur **Entrée** pour conserver `192.168.50.201` (ou tapez `192.168.50.201,192.168.50.202` si 2 lecteurs sont branchés sur ce PC).
4. **C'est tout !** Le pont local (`http://127.0.0.1:4375`) démarre immédiatement en arrière-plan (invisible) et s'enregistre dans le démarrage automatique de Windows. Dès que vous ouvrez l'application en ligne dans Chrome/Edge, elle détecte le pont local automatiquement et allume le voyant vert **Connecté** !

---

## 6. Fonctionnement Multi-Sièges (**ECOLE**, **ANNEX**, **AMPHI**)

1. **Sélection du Siège dans l'Application :**
   * Sur le PC de **ECOLE**, sélectionnez le siège **ECOLE** en haut dans la barre de navigation.
   * Sur le PC de **ANNEX**, sélectionnez le siège **ANNEX**.
   * Sur le PC de **AMPHI**, sélectionnez le siège **AMPHI**.
2. **Isolation Stricte par Siège :**
   * Lorsqu'un élève pose son doigt sur un lecteur d'un siège (ex: **AMPHI**), le système vérifie **uniquement** les séances prévues dans ce siège (**AMPHI**).
   * Si l'élève a manqué sa séance à **ECOLE** et vient à **AMPHI** pour faire un **Rattrapage**, il ne sera **jamais** marqué présent par erreur dans le groupe d'**ECOLE** : la carte **Hors créneau / Séance de Rattrapage** s'affiche sur l'écran d'**AMPHI** pour enregistrer son rattrapage en 2 clics.
3. **Activation en Arrière-Plan :**
   * Vérifiez que le bouton **Empreinte ON** (avec le point vert animé) est activé dans la barre supérieure.
   * Les présences et le solde des séances se mettent à jour **instantanément (0 ms)**, y compris lorsque la page d'appel est ouverte.

---

## 7. Dépannage Rapide (Checklist)

| Symptôme | Cause probable | Solution immédiate |
| :--- | :--- | :--- |
| **Internet se coupe quand on branche le câble RJ45** | Une *Passerelle par défaut* a été saisie dans la carte Ethernet | Ouvrez `ncpa.cpl` $\rightarrow$ Ethernet $\rightarrow$ IPv4 et **videz** la case *Passerelle par défaut*. |
| **`TcpTestSucceeded : False` sur `192.168.50.201`** | Câble RJ45 débranché ou IP du PC perdue | Tapez `ipconfig` pour vérifier que `192.168.50.1` est bien actif sur la carte Ethernet. |
| **Le lecteur dit *"Réessayez"* mais rien ne s'affiche** | Le bouton **Empreinte** en haut de l'application est sur **OFF** | Cliquez sur le bouton **Empreinte OFF** dans la barre du haut pour le passer sur **ON**. |
| **L'élève scanne mais apparaît *"Hors créneau"*** | Le mauvais siège est sélectionné en haut de l'écran (ex: *ECOLE* au lieu d'*AMPHI*) | Sélectionnez le bon siège dans le sélecteur de siège en haut de l'application. |
