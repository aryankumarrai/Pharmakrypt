# **🛡️ PharmaKrypt**


### **"Medicines should be trusted, not guessed."**

PharmaKrypt is a **Secure Supply Chain Verification System** designed to eliminate counterfeit medicines using cryptographic serialization, real-time geolocation locking, and a "One-Scan" consumption policy.

## **🚀 The Problem**

Counterfeit medicines kill over **1 million people annually**. Current solutions (holograms, standard QR codes) are passive and easily copied. Once a counterfeiter clones a valid ID, they can flood the market with thousands of fakes that pass verification.

## **💡 The Solution: Active Defense**

PharmaKrypt transforms verification into an active, state-aware process.

* **One Medicine \= One Identity \= One Successful Scan.**  
* **Digital Batch Activation:** Codes are worthless (Inactive) until digitally activated by a verified distributor.  
* **Location Locking:** Medicines are cryptographically locked to a specific pharmacy's geolocation before they even arrive.

## **🔑 Key Features**

### **1\. 🏭 Manufacturing Hub (Admin)**

* **Batch Generation:** Generate cryptographically secure, high-entropy unique IDs (PK-7X92-M4K1...) for individual units and Master Cartons.  
* **Default State:** All generated codes start as **INACTIVE**. Theft at the factory level results in useless product.  
* **Live Tracking:** Monitor the real-time status of every unit (Inactive \-\> In-Transit \-\> Stocked \-\> Sold).

### **2\. 🚛 Secure Distribution (The "Handshake")**

* **Aggregation:** Distributors scan a single **Master Carton ID** to verify 50+ units instantly.  
* **Location Locking:** Upon scanning, the Distributor assigns a **Target Pharmacy** and **City**.  
* **Activation:** The batch status updates to IN-TRANSIT, but it is **locked** to that specific destination. If scanned elsewhere, it triggers a diversion alert.

### **3\. 🏥 Pharmacy Portal**

* **Two-Stage Verification:**  
  1. **Stock Intake:** Verifies the medicine was *intended* for this specific pharmacy. Updates status to STOCKED.  
  2. **Dispense (Sale):** Marks the unique ID as SOLD / CONSUMED.  
* **Inventory Management:** Live view of current stock levels.  
* **Anti-Diversion:** Attempting to stock a medicine assigned to a different city triggers a critical alert.

### **4\. 🚨 Regulatory Oversight (Super Admin)**

* **Global Kill Switch:** Ability to freeze compromised batches or revoke pharmacy credentials.  
* **Entity Management:** Register legitimate Manufacturers and Pharmacies.  
* **Counterfeit Radar:** Real-time feed of failed scans (Duplicate, Theft, Diversion) with exact timestamps and locations.

## **🛠️ Tech Stack**

* **Frontend:** React (Vite), TypeScript  
* **Styling:** Tailwind CSS, Lucide React (Icons)  
* **Backend / Database:** Firebase Firestore (Real-time NoSQL)  
* **Authentication:** Firebase Auth (Anonymous & Custom Claims simulation)  
* **Scanning Engine:** jsQR (Real-time video frame analysis)  
* **Asset Generation:** qrcode, jszip, file-saver (For generating printable batch assets)

## **⚙️ Installation & Setup**

### **Prerequisites**

* Node.js (v16+)  
* A Firebase Project (Free Tier)

### **1\. Clone the Repository**

```
git clone \[https://github.com/yourusername/pharmakrypt.git\](https://github.com/yourusername/pharmakrypt.git) 
```
``` 
cd pharmakrypt
```

### **2\. Install Dependencies**

```
npm install  
```
### Install specific libraries for scanning & file generation  
```
npm install jsqr qrcode jszip file-saver @types/jsqr @types/qrcode @types/file-saver
```

### **3\. Configure Firebase**

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com).  
2. Enable **Firestore Database** (Test Mode).  
3. Enable **Authentication** (Anonymous Sign-in).  
4. Copy your config object into src/App.tsx:
```
const firebaseConfig \= {  
  apiKey: "YOUR\_API\_KEY",  
  authDomain: "YOUR\_PROJECT.firebaseapp.com",  
  projectId: "YOUR\_PROJECT\_ID",  
  // ... other keys  
};
```

### **4\. Run Locally**
```
npm run dev
```

## **🛡️ Security Logic Explained**

### **The "Double-Spend" Protection**

Just like cryptocurrency prevents spending the same coin twice, PharmaKrypt prevents selling the same medicine twice.

1. **Original Box:** Scanned at Pharmacy A $\\rightarrow$ Status: SOLD.  
2. **Counterfeit Copy:** Scanned at Pharmacy B $\\rightarrow$ Check: "Is ID SOLD?" $\\rightarrow$ **YES** $\\rightarrow$ **TRIGGER RED ALERT**.

### **The "Scratch-Off" Physical Layer**

To prevent pre-emptive copying (scanning the code before the real patient buys it), the unique QR code on the physical box is covered by a scratch-off layer.

* **Distributors** scan the *outer* Carton QR (Parent).  
* **Pharmacists** scan the unit QR (Child) only at the moment of dispensing.

## **📸 Future Scope**

* **Consumer App:** A dedicated mobile app for patients to scan SOLD medicines and view their provenance journey on a map.  
* **Blockchain Integration:** Move the ledger from Firestore to Hyperledger Fabric for immutable, decentralized trust.  
* **AI Risk Scoring:** Machine learning model to predict high-risk pharmacy locations based on scan anomalies.

## **📄 License**

This project is licensed under the MIT License \- see the [LICENSE.md](https://www.google.com/search?q=LICENSE) file for details.

[![PharmaKrypt](/src/assets/logo.png)](https://www.pharmakrypt.app)