# ZKTeco K50 Pro — Complete Installation & User Manual for School PCs
**Version:** 3.1 (Direct PC Ethernet & Local Router / Switch Support)  
**Branches:** `ECOLE` • `ANNEX` • `AMPHI`  
**Connection Types Supported:**
* **Option A (Direct Cable):** Direct RJ45 Ethernet cable plugged into the PC's Ethernet port.
* **Option B (Router / Local Network):** K50 Pro plugged into the local building router or switch (PC connected via Wi-Fi or Ethernet to the same router).
* **Option C (Multiple Readers):** 2 or 3 readers on the same PC via a mini switch.

---

## 1. Can One Branch Use Direct Cable and Another Use the Router?
**YES, 100% ABSOLUTELY!**

Because each branch has its own School PC running the local bridge (`zk-bridge`), the hardware connection is completely independent per branch:
* **Branch A (e.g. `ECOLE`):** K50 Pro plugged **directly into the PC** via an RJ45 cable (`192.168.50.201`).
* **Branch B (e.g. `AMPHI`):** K50 Pro plugged **into the Wi-Fi Router or Switch** (`192.168.1.201`).
* **Online Cloud App:** The cloud application and PostgreSQL database don't care how the device is physically wired. Every branch streams its finger scans in real time (**< 2ms**) to the cloud.

---

## 2. Option A: Direct Ethernet Cable to PC (e.g. at `ECOLE`)
Use this method when the K50 Pro is placed right next to the PC, or there is no router nearby.

### 1. Configure the K50 Pro Device:
Hold **`M/OK`** for 2s $\rightarrow$ **`Comm.` $\rightarrow$ `Ethernet`**:
* **IP Address:** `192.168.50.201`
* **Subnet Mask:** `255.255.255.0`
* **Gateway:** `0.0.0.0` *(or `192.168.50.1`)*
* **TCP Port:** `4370`
* **DHCP:** `OFF`

### 2. Configure the Windows PC Ethernet Adapter (`192.168.50.1`):
1. Connect PC to internet via **Wi-Fi**.
2. Press **`Win + R`**, type **`ncpa.cpl`**, press Enter.
3. Right-click **Ethernet** $\rightarrow$ **Properties** $\rightarrow$ double-click **IPv4**.
4. Set static IP:
   * **IP address:** `192.168.50.1`
   * **Subnet mask:** `255.255.255.0`
   * **Default gateway:** **LEAVE COMPLETELY BLANK!** *(Ensures Wi-Fi stays used for internet)*.
5. Click **OK** $\rightarrow$ **OK**.

### 3. Run the Installer on this PC:
* Run **`INSTALLER_ET_DEMARRER_PONT_K50.bat`** as Administrator.
* Press **`[Enter]`** to keep the default `192.168.50.201`.

---

## 3. Option B: Connected to the Router / Local Network (e.g. at `AMPHI` or `ANNEX`)
Use this method when the K50 Pro is mounted on a wall near the entrance, plugged into a router/switch port, and the PC is elsewhere in the room (connected to the same router via Wi-Fi or Ethernet).

### 1. Find Your Router's IP Subnet:
Most Algerian internet modems / routers (Algérie Télécom, 4G Ooredoo/Djezzy/Mobilis) use:
* Subnet: `192.168.1.1` (or sometimes `192.168.0.1`).
* To check, open PowerShell on the PC and type `Get-NetRoute -DestinationPrefix '0.0.0.0/0'` $\rightarrow$ look at `NextHop` (e.g. `192.168.1.1`).

### 2. Configure the K50 Pro Device for the Router:
Hold **`M/OK`** for 2s $\rightarrow$ **`Comm.` $\rightarrow$ `Ethernet`**:
* **IP Address:** Choose an unused static IP in the router's range, for example:
  * If router is `192.168.1.1`: Enter **`192.168.1.201`**
  * If router is `192.168.0.1`: Enter **`192.168.0.201`**
* **Subnet Mask:** `255.255.255.0`
* **Gateway:** Enter your router's IP (e.g., `192.168.1.1` or `192.168.0.1`)
* **TCP Port:** `4370`
* **DHCP:** `OFF`

### 3. Windows PC Network Configuration for Option B:
* **No manual IP settings needed on the PC!**
* Since the PC and K50 Pro are both connected to the same router (the PC via Wi-Fi or cable, the K50 Pro via cable), the router automatically routes packets between them.
* Test from the PC in PowerShell:
  ```powershell
  Test-NetConnection 192.168.1.201 -Port 4370
  ```
  Confirm it returns: **`TcpTestSucceeded : True`**.

### 4. Run the Installer on this PC:
1. Right-click **`INSTALLER_ET_DEMARRER_PONT_K50.bat`** $\rightarrow$ **Run as administrator**.
2. When prompted for the device IP, type the router IP you assigned to the K50 Pro (e.g. **`192.168.1.201`**) and press **`[Enter]`**.
3. Done! The bridge will connect to the K50 Pro across the local router network.

---

## 4. Option C: Multiple Readers on the Same PC (via 5-Port Switch)
Connect all readers and the PC to a small Ethernet switch:
* **Reader #1:** `192.168.50.201` (Port `4370`, DHCP `OFF`)
* **Reader #2:** `192.168.50.202` (Port `4370`, DHCP `OFF`)
* **In the installer:** When asked for IPs, enter: `192.168.50.201,192.168.50.202`

---

## 5. Daily Operation & Real-Time Sync

1. Open your online Massinissa School Software URL in **Chrome** or **Edge**.
2. **Select the Active Branch** in the top navigation bar (`ECOLE`, `ANNEX`, or `AMPHI`).
3. Ensure the **Fingerprint** button is toggled **ON** (allow local network access if Chrome asks).
4. The status indicator will turn **Green (Connected)**.
5. **Instant Scan (< 200ms):** When an enrolled student places their finger on the reader, the scan displays on the screen instantly in **0ms** and marks them **Present**.
6. **Strict Branch Isolation:** Scanning at `AMPHI` strictly processes `AMPHI` classes. If an `ECOLE` student comes to `AMPHI`, the Catch-Up (Rattrapage) card opens on screen to record their attendance safely.
7. **Anti-Inactivity Keepalive (v3):** Sends an active 8-second protocol heartbeat so the session **never expires or sleeps**, even after 24 hours of inactivity.
8. **Instant Reconnect:** If the device or router is ever restarted, toggling the **Fingerprint** button **OFF then ON** in the top navbar forces an immediate re-handshake in `< 50ms`.

---

## 6. Troubleshooting Comparison

| Issue | Option A (Direct Cable) | Option B (Router / Local Network) |
| :--- | :--- | :--- |
| **Physical Wiring** | RJ45 cable from PC Ethernet directly to K50 Pro | RJ45 cable from K50 Pro into Router LAN port |
| **PC Internet** | Must use Wi-Fi | Can use Wi-Fi or Ethernet connected to router |
| **PC IPv4 Configuration** | Static `192.168.50.1` (Gateway left blank) | Standard DHCP (automatic, managed by router) |
| **K50 Pro IP** | `192.168.50.201` | Matching router range, e.g. `192.168.1.201` |
| **Installer Input** | Press `[Enter]` (default `192.168.50.201`) | Enter your chosen IP (e.g. `192.168.1.201`) |
| **Test Command** | `Test-NetConnection 192.168.50.201 -Port 4370` | `Test-NetConnection 192.168.1.201 -Port 4370` |
| **Device was rebooted** | Auto-reconnects in 2–3s (or toggle navbar button) | Auto-reconnects in 2–3s (or toggle navbar button) |

---

## 7. Multi-Branch Biometric Cloud Sync (v4)

When your school has multiple branches (`ECOLE`, `ANNEX`, `AMPHI`), each terminal has its own separate hardware flash memory.

### How Automatic Biometric Sync Works:
1. **Enroll Once at Any Branch (e.g. Branch A):**
   * Go to the student's profile and click **"Enregistrer l'empreinte"**.
   * Student taps their finger 3 times on Branch A's K50 reader.
   * `zk-bridge` automatically extracts the raw biometric template from Branch A's reader (`CMD_USERTEMP_RRQ`) and saves it in the central cloud PostgreSQL database.
2. **Auto-Download to Other Branches (e.g. Branch B):**
   * As soon as Branch B's PC runs `zk-bridge` (or every 5 minutes in background), it downloads all student profiles and biometric templates from the cloud and writes them directly into Branch B's K50 reader hardware memory (`CMD_USER_WRQ` + `CMD_TMP_WRITE`).
   * **Result:** The student can immediately walk into Branch B and scan their finger — Branch B's K50 reader recognizes them instantly!
3. **One-Click Manual Sync Button:**
   * Open the **Biometric Journal** drawer from the top navbar.
   * Click **"Sync K50"** (or *مزامنة الفروع*).
   * A toast notification will confirm: *"Lecteur K50 synchronisé avec succès (X empreintes mises à jour) !"*

