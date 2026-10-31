================================================================================
MASSINISSA ACADEMY — ZKTECO K50 PRO BIOMETRIC BRIDGE (v4.2)
GUIDE D'INSTALLATION ET DE GESTION / INSTALLATION & MANAGEMENT GUIDE
================================================================================

CONTENU DU DOSSIER / FOLDER CONTENTS:
--------------------------------------------------------------------------------
1. INSTALLER_ET_DEMARRER_PONT_K50.bat :
   -> Installateur complet en 1 clic.
   -> Demande le site/branche (1: ECOLE, 2: ANNEX, 3: AMPHI).
   -> Demande les IPs (192.168.50.201 ou plusieurs séparées par virgule: 192.168.50.201,192.168.50.202).
   -> Configure le pare-feu, la carte réseau et le démarrage automatique silencieux de Windows.
   -> Télécharge automatiquement zk-bridge.js depuis GitHub si vous n'avez pas tout le projet !

2. METTRE_A_JOUR_PONT.bat :
   -> Mise à jour en 1 clic.
   -> Télécharge instantanément la dernière version de zk-bridge.js depuis GitHub.
   -> Conserve intacte votre configuration (IPs et site/branche de ce PC).
   -> Redémarre le service automatiquement sans ouvrir de fenêtre noire.

3. TESTER_CONNEXION_LECTEURS.bat :
   -> Outil de diagnostic réseau instantané.
   -> Teste la connexion TCP (Port 4370) vers chaque lecteur configuré.
   -> Indique en VERT si le lecteur répond ou en ROUGE s'il est injoignable avec conseils.

4. ARRETER_PONT_K50.bat :
   -> Arrête proprement le pont local sans affecter les autres programmes.

5. REDEMARRER_PONT_K50.bat :
   -> Redémarre le pont en un seul double-clic.

6. zk-bridge.js :
   -> Le moteur Node.js du pont avec reconnexion automatique, synchronisation multi-branches et push 0ms.


CONFIGURATION DES BRANCHES / SITES :
--------------------------------------------------------------------------------
Branche 1 = ECOLE
Branche 2 = ANNEX
Branche 3 = AMPHI


CONFIGURATION MULTI-LECTEURS (SWITCH RÉSEAU) :
--------------------------------------------------------------------------------
Si vous connectez 2 lecteurs K50 Pro sur le même PC via un switch Ethernet :
- Lecteur 1 : IP 192.168.50.201
- Lecteur 2 : IP 192.168.50.202
Dans l'installateur, indiquez simplement :
192.168.50.201,192.168.50.202
Les deux lecteurs fonctionneront simultanément sans aucune coupure !
================================================================================
