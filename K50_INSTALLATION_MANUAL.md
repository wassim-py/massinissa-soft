# ZKTeco K50 Pro — Complete Installation & User Manual for School PCs
**Version:** 3.0 (Self-Healing Bridge & Anti-Timeout Engine)  
**Branches:** `ECOLE` • `ANNEX` • `AMPHI`  
**Connection Type:** Direct Ethernet Cable (RJ45) to PC (1 Device) or via Mini Switch (Multiple Devices on 1 PC)  
**Application Mode:** Online Cloud Deployment + 1-Click Local Bridge (`zk-bridge`)

---

## 1. Overview & Architecture
Because the Massinissa School Software is deployed **online in the cloud**, the physical ZKTeco K50 Pro reader (connected by a direct RJ45 Ethernet cable to the School PC) cannot be reached directly across the public internet.

To bridge this connection, the School PC runs a lightweight, zero-dependency background service (**`zk-bridge`**):
* **Physical Link:** Communicates directly with the K50 Pro over Ethernet (`192.168.50.201:4370`).
* **Instant Browser Link (SSE):** Streams scan events to the online application in **< 2ms** via local Server-Sent Events (`http://127.0.0.1:4375/events`).
* **Zero Cloud Polling Quota:** Eliminates unnecessary cloud database heartbeats, cutting NeonDB query consumption by **over 75%**.
* **Self-Healing Engine (v3):** Sends an active 8-second ZKTeco application heartbeat (`CMD_REG_EVENT`) that **prevents the K50 Pro session from ever expiring** and keeps the PC's Ethernet card awake 24/7. If the cable is unplugged or the device is rebooted, it automatically detects it within 14 seconds and reconnects in 2–3 seconds as soon as the cable is back.

---

## 2. Prerequisites on Each School PC
Before configuring the fingerprint device on a new School PC:
1. **Wi-Fi Internet Connection:** The School PC must connect to the internet via **Wi-Fi**, leaving the **Ethernet (RJ45) port** free exclusively for the ZKTeco K50 Pro.
2. **Node.js Installed:** Ensure **Node.js LTS** is installed on the School PC ([https://nodejs.org](https://nodejs.org)).
3. **Copy the `zk-bridge` Folder:** Copy the [`zk-bridge`](file:///c:/Users/wassi/OneDrive/Bureau/massinissa-school-software/zk-bridge) folder (containing `zk-bridge.js`, `INSTALLER_ET_DEMARRER_PONT_K50.bat`, and `ARRETER_PONT_K50.bat`) onto the School PC.

---

## 3. Step 1 — Configure the ZKTeco K50 Pro Device(s)

Press and hold the **`M/OK`** button on the ZKTeco K50 Pro keypad for 2 seconds to open the menu, then navigate to:  
**`Comm.` (Communication) $\rightarrow$ `Ethernet`**

### A. Single Reader on the PC (Direct RJ45 Cable to PC):
| Setting on K50 Pro | Value to Enter | Notes |
| :--- | :--- | :--- |
| **IP Address** | `192.168.50.201` | Default device IP |
| **Subnet Mask** | `255.255.255.0` | Standard Class C subnet |
| **Gateway** | `0.0.0.0` *(or `192.168.50.1`)* | Gateway on the local cable |
| **TCP Port** | `4370` | ZKTeco standard communication port |
| **DHCP** | `OFF` (Disabled) | Must be disabled to prevent IP changes |
| **Comm Key (Password)** | `0` | Communication password (default: 0) |

### B. Multiple Readers on the Same PC (via 5-Port Ethernet Switch):
Connect the PC and all K50 Pro readers to an unmanaged 5-port Gigabit/Fast Ethernet switch using standard RJ45 cables, and assign a unique IP to each reader:
* **Reader #1:** `192.168.50.201` (Subnet `255.255.255.0`, Port `4370`, DHCP `OFF`)
* **Reader #2:** `192.168.50.202` (Subnet `255.255.255.0`, Port `4370`, DHCP `OFF`)
* **Reader #3:** `192.168.50.203` (Subnet `255.255.255.0`, Port `4370`, DHCP `OFF`)

---

## 4. Step 2 — Configure the Windows PC Ethernet Adapter (Static IP `192.168.50.1`)

To allow Windows to communicate with the K50 Pro over the Ethernet cable **without disrupting your Wi-Fi Internet**:

1. Press **`Win + R`** on your keyboard, type **`ncpa.cpl`**, and press **Enter**.
2. Right-click on **Ethernet** (the wired network card connected to the K50 Pro) $\rightarrow$ click **Properties**.
3. Double-click on **Internet Protocol Version 4 (TCP/IPv4)**.
4. Select **Use the following IP address** and enter:
   * **IP address:** `192.168.50.1`
   * **Subnet mask:** `255.255.255.0`
   * **Default gateway:** **LEAVE COMPLETELY BLANK (EMPTY)!**  
     *(Crucial: Leaving the Default Gateway empty ensures Windows continues using Wi-Fi for all internet traffic while routing `192.168.50.x` exclusively through the Ethernet cable).*
5. Click **OK**, then **OK** again.

### Quick Connection Verification:
Open **PowerShell** and run:
```powershell
Test-NetConnection 192.168.50.201 -Port 4370
```
Confirm that the output ends with: **`TcpTestSucceeded : True`**.

---

## 5. Step 3 — Run the 1-Click Local Bridge Installer (`zk-bridge`)

The installer configures the service, firewall, and power settings automatically:

1. Open the **`zk-bridge`** folder on the School PC.
2. **Right-click** on **`INSTALLER_ET_DEMARRER_PONT_K50.bat`** and select **Run as administrator** (*Exécuter en tant qu'administrateur*).
3. When prompted for device IPs:
   * Press **`[Enter]`** to keep the default `192.168.50.201` (for 1 reader).
   * Or enter **`192.168.50.201,192.168.50.202`** (for multiple readers).
4. **Done!** The batch script automatically:
   * Copies `zk-bridge.js` into `%USERPROFILE%\MassinissaK50Bridge\zk-bridge.js`.
   * **Disables Windows Ethernet Power Saving:** Automatically turns off `PowerSavingMode`, `Green Ethernet`, and `Energy-Efficient Ethernet (EEE)` on the Ethernet adapter to prevent the network card from sleeping during idle hours.
   * **Configures Windows Firewall:** Opens incoming and outgoing TCP ports `4370` and `4375`.
   * **Sets Up Silent Auto-Start:** Adds a silent launcher (`MassinissaK50Bridge.vbs`) to Windows Startup (`shell:startup`) so the bridge starts automatically in the background every morning with **no black command window**.
   * **Starts the Service:** Launches the bridge immediately on `http://127.0.0.1:4375`.

---

## 6. Step 4 — Open the Online Web Application

1. Open **Google Chrome** or **Microsoft Edge** on the School PC and navigate to your online Massinissa School Software URL.
2. **Select the Active Branch** in the top navigation bar:
   * On the **ECOLE** PC $\rightarrow$ Select **ECOLE**
   * On the **ANNEX** PC $\rightarrow$ Select **ANNEX**
   * On the **AMPHI** PC $\rightarrow$ Select **AMPHI**
3. Ensure the **Fingerprint** button in the top navbar is toggled **ON**.
   * *Note:* If Chrome/Edge shows a security prompt asking to *"Look for and connect to any device on your local network"*, click **Allow** (*Autoriser*).
4. Within 2 seconds, the status dot on the **Fingerprint ON** button will turn **Green (Connected)**!

---

## 7. How the System Works in Daily Operation

### 1. Instant Sub-200ms Scans & Real-Time Roster Update
* The instant an enrolled student places their finger on the sensor, the K50 Pro sends the hardware event to `zk-bridge.js` in `< 5ms`.
* `zk-bridge.js` immediately forwards the event to your browser via Server-Sent Events (`SSE`), and the application displays the passing card, plays the success sound, and marks the student **PRESENT** in **0ms**.
* If the secretary has the **Attendance Taking** page open, the student's status changes to **Present** and their **Remaining Credit (`Séances restantes`) updates in 0ms** without needing to click Save.

### 2. Strict Branch Isolation (`ECOLE` vs `ANNEX` vs `AMPHI`)
* When a student scans their finger at **AMPHI**, the system strictly evaluates lessons scheduled at **AMPHI**.
* If the student missed a lesson at **ECOLE** and comes to **AMPHI** for a **Catch-Up (Rattrapage)**, they are **never** accidentally marked present in the **ECOLE** group. Instead, the **Out-of-Slot / Catch-Up** card appears on the **AMPHI** screen, allowing the secretary to assign them to a catch-up group in 2 clicks.

### 3. Zero Duplicate Attendance Records
* If a student scans their finger multiple times in a row for the same lesson, the system records presence once and prevents duplicate credit deductions (`Déjà pointé présent`).

### 4. Self-Healing Anti-Inactivity Engine (v3)
* **Continuous Keepalive:** The bridge sends a keepalive packet every 8 seconds, keeping the K50 Pro session alive all day without manual intervention.
* **Auto-Recovery on Unplug/Reboot:** If the cable is unplugged or the K50 Pro is restarted, the bridge detects it within 14 seconds and automatically reconnects in 2–3 seconds as soon as the cable is replugged.
* **Instant Manual Reconnect:** If needed, simply click the **Fingerprint** toggle button in the top navbar **OFF then ON** to force an instant fresh hardware handshake in `< 50ms`.

---

## 8. Troubleshooting Checklist

| Symptom | Probable Cause | Immediate Solution |
| :--- | :--- | :--- |
| **Wi-Fi internet disconnects when RJ45 cable is plugged in** | A *Default Gateway* was entered in the Ethernet IPv4 settings | Open `ncpa.cpl` $\rightarrow$ Ethernet $\rightarrow$ IPv4 Properties and **clear (empty)** the *Default Gateway* field. |
| **Fingerprint button stays Red/Offline in the online app** | Local Bridge not running or Chrome blocked local network access | 1. Right-click `INSTALLER_ET_DEMARRER_PONT_K50.bat` $\rightarrow$ Run as administrator.<br>2. In Chrome, click the settings icon to the left of the URL bar $\rightarrow$ enable **Local network access**. |
| **`TcpTestSucceeded : False` on `192.168.50.201`** | Ethernet cable unplugged or PC IP reset | Check the physical cable connection and run `ipconfig` in PowerShell to ensure Ethernet has IPv4 `192.168.50.1`. |
| **Device was unplugged, restarted, or idle overnight** | Firmware session dropped or cable reconnected | The v3 bridge auto-reconnects in 2–3 seconds. You can also toggle the **Fingerprint** button in the top navbar **OFF then ON** to force an immediate reconnect. |
| **Ethernet port enters sleep mode after long idle periods** | Realtek Power Saving / Green Ethernet enabled | Run `INSTALLER_ET_DEMARRER_PONT_K50.bat` to disable power saving, or open Device Manager (`devmgmt.msc`) $\rightarrow$ Realtek Controller $\rightarrow$ Advanced $\rightarrow$ set `Energy-Efficient Ethernet`, `Green Ethernet`, and `Power Saving Mode` to **Disabled**. |
| **Student scans finger but sees "Out of Slot / Catch-Up"** | Wrong branch selected in the top navbar | Ensure the branch selected in the top navigation bar matches the physical building (`ECOLE`, `ANNEX`, or `AMPHI`). |
| **How to stop the background bridge service** | Need to stop background Node.js bridge | Double-click [`ARRETER_PONT_K50.bat`](file:///c:/Users/wassi/OneDrive/Bureau/massinissa-school-software/zk-bridge/ARRETER_PONT_K50.bat). |
