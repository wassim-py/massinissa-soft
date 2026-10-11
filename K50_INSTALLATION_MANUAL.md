# ZKTeco K50 Pro — Complete Installation Manual for School PCs (Online Application)
**Branches:** `ECOLE` • `ANNEX` • `AMPHI`  
**Connection Type:** Direct Ethernet Cable (RJ45) to PC (1 Device) or via Mini Switch (Multiple Devices on 1 PC)  
**Application Mode:** Online Cloud Deployment + 1-Click Local Bridge (`zk-bridge`)

---

## 1. Prerequisites on Each School PC
Before plugging in the fingerprint device on a new School PC:
1. **Internet Connection via Wi-Fi:** Make sure the School PC is connected to the internet via **Wi-Fi** (so the Ethernet RJ45 port remains free for the ZKTeco K50 Pro).
2. **Node.js Installed:** Make sure **Node.js (LTS)** is installed on the School PC ([https://nodejs.org](https://nodejs.org)).
3. **Copy the `zk-bridge` Folder:** Copy the **`zk-bridge`** folder (containing `zk-bridge.js`, `INSTALLER_ET_DEMARRER_PONT_K50.bat`, and `ARRETER_PONT_K50.bat`) onto the School PC's Desktop or Documents folder.

---

## 2. Step 1 — Configure the ZKTeco K50 Pro Device(s)

Press and hold the **`M/OK`** button on the ZKTeco K50 Pro keypad for 2 seconds to open the menu, then go to:  
**`Comm.` (Communication) $\rightarrow$ `Ethernet`**

### A. If the PC has ONLY 1 Fingerprint Reader (Direct RJ45 Cable to PC):
| Setting on K50 Pro | Value to Enter |
| :--- | :--- |
| **IP Address** | `192.168.50.201` |
| **Subnet Mask** | `255.255.255.0` |
| **Gateway** | `0.0.0.0` *(or `192.168.50.1`)* |
| **TCP Port** | `4370` |
| **DHCP** | `OFF` (Disabled) |
| **Comm Key (Password)** | `0` |

### B. If the PC has MULTIPLE Fingerprint Readers (e.g., 2 or 3 Readers on 1 PC):
Plug the PC and all K50 Pro readers into a small **5-Port Ethernet Switch** using RJ45 cables, and assign a unique IP to each reader:
* **Reader #1:** `192.168.50.201` (Subnet `255.255.255.0`, Port `4370`, DHCP `OFF`)
* **Reader #2:** `192.168.50.202` (Subnet `255.255.255.0`, Port `4370`, DHCP `OFF`)
* **Reader #3:** `192.168.50.203` (Subnet `255.255.255.0`, Port `4370`, DHCP `OFF`)

---

## 3. Step 2 — Configure the Windows PC Ethernet Adapter (Static IP `192.168.50.1`)

To allow the PC to talk to the K50 Pro over the Ethernet cable **without losing Wi-Fi Internet**:

1. Press **`Win + R`** on your keyboard, type **`ncpa.cpl`**, and press **Enter**.
2. Right-click on **Ethernet** (the wired network card where the K50 Pro is plugged in) $\rightarrow$ click **Properties**.
3. Double-click on **Internet Protocol Version 4 (TCP/IPv4)**.
4. Select **Use the following IP address** and enter:
   * **IP address:** `192.168.50.1`
   * **Subnet mask:** `255.255.255.0`
   * **Default gateway:** **LEAVE COMPLETELY BLANK (EMPTY)!**  
     *(Crucial: Leaving the Default Gateway blank ensures Windows keeps using your Wi-Fi for internet while using the Ethernet cable exclusively for the K50 Pro).*
5. Click **OK**, then **OK** again.

### Quick Connection Test (Optional):
Open **PowerShell** and run:
```powershell
Test-NetConnection 192.168.50.201 -Port 4370
```
Verify that the last line says: **`TcpTestSucceeded : True`**.

---

## 4. Step 3 — Run the 1-Click Local Bridge Installer (`zk-bridge`)

Because the application is hosted **online**, the PC needs the local bridge running in the background to forward scans in real time (**< 2ms** via local SSE):

1. Open the **`zk-bridge`** folder on the School PC.
2. **Right-click** on **`INSTALLER_ET_DEMARRER_PONT_K50.bat`** and select **Run as administrator** (*Exécuter en tant qu'administrateur*).
3. When prompted for the device IP:
   * Press **`[Enter]`** if you have **1 reader** (`192.168.50.201`).
   * Or type **`192.168.50.201,192.168.50.202`** and press **`[Enter]`** if you have **2 readers** connected to this PC.
4. **Done!** The installer automatically:
   * Installs the bridge into `C:\Users\<User>\MassinissaK50Bridge\zk-bridge.js`,
   * Opens ports `4370` and `4375` in Windows Firewall,
   * Adds a **100% silent auto-start script** into Windows Startup (`shell:startup`) so it starts automatically every morning when the PC is turned on (with no black command prompt window),
   * Starts the bridge immediately on `http://127.0.0.1:4375`.

---

## 5. Step 4 — Connect the Online Web Application

1. Open **Google Chrome** or **Microsoft Edge** on the School PC and go to your online Massinissa School Software URL.
2. **Select the Correct Branch** in the top navigation bar:
   * On the **ECOLE** PC $\rightarrow$ Select **ECOLE**
   * On the **ANNEX** PC $\rightarrow$ Select **ANNEX**
   * On the **AMPHI** PC $\rightarrow$ Select **AMPHI**
3. Make sure the **Fingerprint** button in the top bar is toggled **ON**.
   * *Note:* If Chrome/Edge shows a small permission prompt in the top-left asking to *"Look for and connect to any device on your local network"*, click **Allow** (*Autoriser*).
4. Within 2 seconds, the indicator dot on the **Fingerprint ON** button will turn **Green (Connected)**!

---

## 6. How Multi-Branch & 1-Time Registration Work

* **One Registration for All Branches:** Each student has a unique permanent ID (`globalNumber`, e.g., `#105`). When a student registers their finger once, that `#105` is saved in the cloud database. If you have multiple K50 Pro devices across different branches, enrolling the student's finger links them to `#105` across the entire school.
* **Strict Branch Isolation (`ECOLE` vs `ANNEX` vs `AMPHI`):**
  * When a student scans their finger at **AMPHI**, the system checks **only** lessons scheduled at **AMPHI**.
  * If the student missed their lesson at **ECOLE** and came to **AMPHI** for a **Catch-Up (Rattrapage)**, they will **never** be marked present in their **ECOLE** group by mistake. Instead, the **Out-of-Slot / Catch-Up** card pops up on the **AMPHI** screen so the secretary can log their Catch-Up in 2 clicks.
* **Zero Duplicate Attendance & Instant Credit Update:**
  * If a student scans their finger 2 or 3 times in a row for the same lesson, the system marks them **Present** on the first scan and ignores extra credit deductions on subsequent scans (`Déjà pointé présent`).
  * If the secretary has the **Attendance Taking** page open for that group, the student's status switches to **Present** and their **Remaining Credit (`Séances restantes`) updates in 0ms** without needing to click Save.

---

## 7. Quick Troubleshooting Table

| Symptom | Cause | Solution |
| :--- | :--- | :--- |
| **Wi-Fi Internet stops working when RJ45 cable is plugged in** | A *Default Gateway* was typed in the Ethernet IPv4 settings | Open `ncpa.cpl` $\rightarrow$ Ethernet $\rightarrow$ IPv4 Properties and **clear (empty)** the *Default Gateway* box. |
| **Fingerprint button stays Red/Orange (Offline) on the online app** | Local Bridge isn't running or Chrome blocked Local Network access | 1. Run `INSTALLER_ET_DEMARRER_PONT_K50.bat` once.<br>2. In Chrome, click the icon to the left of the URL bar $\rightarrow$ allow **Local network access**. |
| **`TcpTestSucceeded : False` on `192.168.50.201`** | Ethernet cable unplugged or PC IP reset | Run `ipconfig` in PowerShell and verify Ethernet still has IPv4 `192.168.50.1`. |
| **Student scans finger but gets "Out of Slot / Catch-Up"** | Wrong branch selected in the top navbar | Check the branch selector at the top of the screen (`ECOLE`, `ANNEX`, or `AMPHI`). |
