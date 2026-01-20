import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, addDoc, query, where, 
  onSnapshot, updateDoc, doc, serverTimestamp, limit, getDocs, writeBatch, deleteDoc 
} from 'firebase/firestore';
import { 
  getAuth, signInAnonymously, onAuthStateChanged 
} from 'firebase/auth';
import { 
  ShieldCheck, AlertTriangle, Pill, Activity, 
  MapPin, Store, Truck, Download,
  CheckCircle, XCircle, LogOut,
  Building2, Camera, Box, User, ChevronDown, ChevronUp, ClipboardList, Trash2, HelpCircle, Plus, Clock, Github
} from 'lucide-react';

// --- ASSETS & LOCAL IMPORTS ---
// 1. TO USE YOUR LOGO LOCALLY: Uncomment the import below and comment out 'const logo = null;'
import logo from '/vite.png'; 
// const logo = null; 

// 2. TO ENABLE ZIP DOWNLOAD & QR SCANNING LOCALLY: Uncomment these imports
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

// --- Firebase Initialization ---
// REPLACE THESE WITH YOUR ACTUAL ENV VARIABLES IN VERCEL
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'pharmakrypt-local';

// --- Helpers ---
const generateSecureID = (prefix: string) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; 
  let result = '';
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (i < 3) result += '-';
  }
  return `${prefix}-${result}`;
};

const generateCredential = (length: number = 8) => {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let res = '';
  for(let i=0; i<length; i++) res += chars.charAt(Math.floor(Math.random() * chars.length));
  return res;
};

// --- Shared: Clear Database Function ---
const clearGlobalData = async () => {
  if(!confirm("⚠️ WARNING: This will delete ALL Inventory and Alerts from the database. Use this to reset the demo. Continue?")) return;
  try {
    const batch = writeBatch(db);
    const medsSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'medicines'));
    const alertsSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'alerts'));
    
    medsSnap.forEach(doc => batch.delete(doc.ref));
    alertsSnap.forEach(doc => batch.delete(doc.ref));
    
    await batch.commit();
    alert("System Reset Complete. Database is clean.");
  } catch(err) {
    console.error(err);
    alert("Reset failed. Check console.");
  }
};

// --- Types ---
type ViewState = 'landing' | 'admin-login' | 'admin-dashboard' | 'govt' | 'distributor-login' | 'distributor-dash' | 'pharmacy-login' | 'pharmacy-dashboard';

interface Medicine {
  id: string;
  name: string;
  batchId: string;
  masterCartonId: string;
  manufacturingDate: any;
  status: 'inactive' | 'in-transit' | 'stocked' | 'sold' | 'counterfeit';
  targetPharmacy?: string; 
  targetCity?: string;     
  scanHistory: ScanRecord[];
  uniqueId: string;
}

interface ScanRecord {
  role: 'manufacturer' | 'distributor' | 'pharmacy' | 'public';
  name: string;
  location: string;
  timestamp: any;
  action: string;
  result: 'valid' | 'invalid' | 'alert';
}

interface Alert {
  id: string;
  medicineName: string;
  medicineUniqueId: string; 
  originalScan: ScanRecord;
  counterfeitScan: ScanRecord;
  timestamp: any;
  type: string;
  status: 'active' | 'resolved';
  resolvedAt?: any;
}

interface RegisteredEntity {
  id: string;
  name: string;
  location: string;
  type: 'manufacturer' | 'pharmacy' | 'distributor';
  addedAt: any;
  // Credentials
  adminId?: string;
  licenseId?: string;
  distributorId?: string;
  password?: string;
}

// --- Helper: Create Alert ---
const createAlert = async (med: Medicine, badScan: ScanRecord, type: string, overrideID?: string) => {
  const history = med.scanHistory || [];
  const original = history.find(s => s.result === 'valid') || badScan;
  
  await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'alerts'), {
    medicineName: med.name || 'Unknown',
    medicineUniqueId: overrideID || med.uniqueId || 'Unknown', 
    originalScan: original,
    counterfeitScan: badScan,
    timestamp: serverTimestamp(),
    type: type,
    status: 'active'
  });
  
  const medRef = doc(db, 'artifacts', appId, 'public', 'data', 'medicines', med.id);
  await updateDoc(medRef, {
     status: 'counterfeit',
     scanHistory: [...history, badScan]
  });
};

// --- Main Component ---
export default function PharmaKryptApp() {
  const [user, setUser] = useState<any>(null);
  const [view, setView] = useState<ViewState>('landing');
  const [loading, setLoading] = useState(true);

  // Session State
  const [sessionName, setSessionName] = useState('');
  const [sessionLocation, setSessionLocation] = useState('');

  useEffect(() => {
    const initAuth = async () => {
      try { await signInAnonymously(auth); } catch (error) { console.error("Auth Error:", error); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-800">Initializing Secure Core...</div>;
  if (!user) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-800">Authenticating...</div>;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      {/* Navigation */}
      <nav className="bg-white text-slate-900 shadow-md sticky top-0 z-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            <div className="flex items-center cursor-pointer group" onClick={() => setView('landing')}>
              <div className="mr-3 transition-transform group-hover:scale-105">
                 {logo ? <img src={logo} alt="PharmaKrypt Logo" className="h-12 w-auto object-contain" /> : <ShieldCheck className="h-10 w-10 text-emerald-600" />}
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold text-2xl tracking-tight text-slate-900">Pharma<span className="text-emerald-600">Krypt</span></span>
                <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Secure Medicine Verification</span>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {view !== 'landing' && (
                <button onClick={() => setView('landing')} className="text-sm font-medium text-slate-600 hover:text-red-600 flex items-center bg-slate-100 hover:bg-red-50 px-4 py-2 rounded-full transition-all">
                  <LogOut className="w-4 h-4 mr-2" /> Exit Role
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 flex-grow w-full">
        {view === 'landing' && (
          <LandingPage 
            onAdminSelect={() => setView('admin-login')} 
            onGovtSelect={() => setView('govt')}
            onDistributorSelect={() => setView('distributor-login')}
            onPharmacySelect={() => setView('pharmacy-login')} 
          />
        )}
        
        {view === 'admin-login' && <ManufacturerLogin onLogin={() => setView('admin-dashboard')} />}
        {view === 'admin-dashboard' && <AdminDashboard />}
        
        {view === 'govt' && <GovernmentDashboard />}
        
        {view === 'distributor-login' && (
           <DistributorLogin onJoin={(name, loc) => {
              setSessionName(name);
              setSessionLocation(loc);
              setView('distributor-dash');
           }} />
        )}
        {view === 'distributor-dash' && <DistributorDashboard name={sessionName} location={sessionLocation} />}

        {view === 'pharmacy-login' && (
          <PharmacyLogin 
            onJoin={(name, loc) => {
              setSessionName(name);
              setSessionLocation(loc);
              setView('pharmacy-dashboard');
            }} 
          />
        )}
        {view === 'pharmacy-dashboard' && <PharmacyDashboard pharmacyName={sessionName} location={sessionLocation} />}
      </main>

      {view === 'landing' && <Footer />}
    </div>
  );
}

// --- Sub-Components ---

function LandingPage(props: { 
  onAdminSelect: () => void, 
  onGovtSelect: () => void, 
  onDistributorSelect: () => void,
  onPharmacySelect: () => void,
}) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const faqs = [
    { 
      q: "How do Manufacturers, Distributors, and Pharmacies get their credentials?", 
      a: "The \"Regulator (Admin)\" acts as the centralized root of trust. They exclusively generate and issue secure credentials for legitimate \"Manufacturers\" and \"Pharmacies\". Once a Manufacturer is onboarded by the Admin, they are then authorized to create credentials for their specific \"Distributors\". This hierarchical system ensures that no unverified entity can ever enter the supply chain." 
    },
    { 
      q: "How does PharmaKrypt prevent theft during transit or manufacturing?", 
      a: "We utilize a \"Digital Batch Activation\" protocol. All QR codes generated at the factory are created in an \"Inactive\" state. Even if a medicine box is stolen from the factory or a delivery truck, the QR code will return an \"Inactive/Invalid\" error if scanned. The batch is only cryptographically activated when a verified Distributor scans the Master Carton upon receipt, ensuring that only medicines in the official supply chain are valid." 
    },
    { 
      q: "What prevents a counterfeiter from photographing the QR code and printing thousands of copies?", 
      a: "We employ a two-layer defense system:\n\n1. Physical Layer: The unique QR code on the unit is covered by an opaque scratch-off panel. A counterfeiter cannot photograph the code without destroying the packaging's tamper-evident seal.\n\n2. Economic Firewall: Even if a code is stolen, our \"One-Time Scan\" policy ensures that once the original ID is verified and sold, that ID is permanently marked as \"Consumed\". If a counterfeiter prints 1,000 copies of that ID, every single subsequent scan will instantly trigger a \"Duplicate Alert,\" rendering the fake batch unsellable." 
    },
    { 
      q: "How does the system prevent \"Diversion\" (selling medicines in unauthorized regions)?", 
      a: "PharmaKrypt implements \"Location Locking\". When a Distributor activates a shipment, they must digitally assign it to a specific target Pharmacy and City. If that medicine appears and is scanned at a different pharmacy location, the system detects a geolocation mismatch and immediately flags it as a \"Diversion Alert,\" allowing authorities to identify exactly where the supply chain leaked." 
    },
    { 
      q: "Does the Distributor need to open every medicine box to activate them?", 
      a: "No. We use \"Parent-Child Aggregation\" logic. The Manufacturer links individual medicine Unit IDs (Children) to a single Master Carton ID (Parent) in the database. The Distributor simply scans the external Master Carton QR code once. This single scan verifies the shipment and automatically activates all 50 or 100 individual units inside without breaking their seals." 
    },
    { 
      q: "What control does the Regulatory Authority have if a compromise is detected?", 
      a: "The Regulatory Authority acts as the root of trust. They possess the master administrative power to instantly revoke credentials of any Pharmacy or Distributor found to be complicit in diversion. They can also freeze specific Batch IDs globally, preventing them from being scanned or sold anywhere in the network immediately, ensuring bad actors are locked out of the system in real-time." 
    }
  ];

  return (
    <div className="space-y-24 pb-12">
      {/* Hero Section */}
      <div className="flex flex-col items-center justify-center pt-12 space-y-12 animate-in fade-in duration-700">
        <div className="text-center space-y-6 max-w-3xl">
          <div className="inline-block p-2 px-4 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold uppercase tracking-widest mb-2">Next Gen Supply Chain Security</div>
          <h1 className="text-5xl sm:text-6xl font-extrabold text-slate-900 tracking-tight leading-tight">
            Trust Every <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-500">Medicine</span>.
          </h1>
          <p className="text-xl text-slate-600 leading-relaxed">
            PharmaKrypt eliminates counterfeits using military-grade digital serialization and real-time transit locking. One ID. One Scan. Zero Fakes.
          </p>
        </div>

        <div className="grid md:grid-cols-4 gap-6 w-full max-w-7xl px-4">
          <div onClick={props.onAdminSelect} className="role-card group bg-white border border-slate-200 p-8 rounded-2xl shadow-sm hover:shadow-2xl cursor-pointer flex flex-col items-center text-center transition-all hover:-translate-y-2 relative overflow-hidden">
            <div className="absolute top-0 w-full h-1 bg-blue-500"></div>
            <div className="p-4 bg-blue-50 rounded-full mb-4 group-hover:bg-blue-100 transition-colors"><Activity className="w-8 h-8 text-blue-600" /></div>
            <h3 className="font-bold text-slate-900 text-lg mb-2">Manufacturer</h3>
            <p className="text-sm text-slate-500">Generate Secure Batches & Track Production</p>
          </div>
          <div onClick={props.onDistributorSelect} className="role-card group bg-white border border-slate-200 p-8 rounded-2xl shadow-sm hover:shadow-2xl cursor-pointer flex flex-col items-center text-center transition-all hover:-translate-y-2 relative overflow-hidden">
            <div className="absolute top-0 w-full h-1 bg-indigo-500"></div>
            <div className="p-4 bg-indigo-50 rounded-full mb-4 group-hover:bg-indigo-100 transition-colors"><Truck className="w-8 h-8 text-indigo-600" /></div>
            <h3 className="font-bold text-slate-900 text-lg mb-2">Distributor</h3>
            <p className="text-sm text-slate-500">Secure Transit & Location Locking</p>
          </div>
           <div onClick={props.onGovtSelect} className="role-card group bg-white border border-slate-200 p-8 rounded-2xl shadow-sm hover:shadow-2xl cursor-pointer flex flex-col items-center text-center transition-all hover:-translate-y-2 relative overflow-hidden">
            <div className="absolute top-0 w-full h-1 bg-purple-500"></div>
            <div className="p-4 bg-purple-50 rounded-full mb-4 group-hover:bg-purple-100 transition-colors"><Building2 className="w-8 h-8 text-purple-600" /></div>
            <h3 className="font-bold text-slate-900 text-lg mb-2">Regulator</h3>
            <p className="text-sm text-slate-500">National Oversight & Fraud Alerts</p>
          </div>
          <div onClick={props.onPharmacySelect} className="role-card group bg-white border border-slate-200 p-8 rounded-2xl shadow-sm hover:shadow-2xl cursor-pointer flex flex-col items-center text-center transition-all hover:-translate-y-2 relative overflow-hidden">
            <div className="absolute top-0 w-full h-1 bg-emerald-500"></div>
            <div className="p-4 bg-emerald-50 rounded-full mb-4 group-hover:bg-emerald-100 transition-colors"><Store className="w-8 h-8 text-emerald-600" /></div>
            <h3 className="font-bold text-slate-900 text-lg mb-2">Pharmacy</h3>
            <p className="text-sm text-slate-500">Verify Stock & Dispense to Patient</p>
          </div>
        </div>
      </div>

      {/* Video Section Title with Emoji */}
      <div className="w-full max-w-5xl mx-auto px-4 mt-8 mb-4 flex items-center justify-center">
         <span className="text-4xl mr-3 animate-pulse">🎥</span>
         <h2 className="text-3xl font-bold text-slate-900">How We Work</h2>
      </div>

      {/* Video Section */}
      <div className="w-full max-w-5xl mx-auto px-4">
        <div className="bg-slate-900 rounded-3xl overflow-hidden shadow-2xl relative group">
           <div className="absolute inset-0 bg-slate-900 z-0"></div>
           <div className="relative z-10 w-full aspect-video">
             <video 
               controls 
               className="w-full h-full object-cover" 
               poster="https://images.unsplash.com/photo-1576602976047-174e57a47881?auto=format&fit=crop&q=80"
             >
                <source src="/howwework.mp4" type="video/mp4" />
                Your browser does not support the video tag.
             </video>
           </div>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="w-full max-w-3xl mx-auto px-4">
        <h2 className="text-3xl font-bold text-slate-900 mb-8 text-center flex items-center justify-center">
          <HelpCircle className="w-8 h-8 mr-2 text-blue-600" /> Frequently Asked Questions
        </h2>
        <div className="space-y-4">
          {faqs.map((item, i) => (
            <div 
              key={i} 
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
              className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="p-6 flex justify-between items-center bg-slate-50/50">
                 <h3 className="font-bold text-lg text-slate-800">{item.q}</h3>
                 <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${openFaq === i ? 'rotate-180' : ''}`} />
              </div>
              <div className={`overflow-hidden transition-all duration-300 ${openFaq === i ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                {/* whitespace-pre-line class respects \n newlines in the string */}
                <p className="p-6 pt-0 text-slate-600 leading-relaxed border-t border-slate-100 whitespace-pre-line">{item.a}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-400 py-12 mt-12 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 grid md:grid-cols-3 gap-8 items-center">
        
        {/* Left: Branding (Matched to Header) */}
        <div>
           <div className="flex items-center gap-3 mb-4 cursor-default">
             <div className="transition-transform hover:scale-105">
                 {logo ? <img src={logo} alt="PharmaKrypt Logo" className="h-12 w-auto object-contain" /> : <ShieldCheck className="h-10 w-10 text-emerald-500" />}
             </div>
             <div className="flex flex-col">
               <span className="font-extrabold text-2xl tracking-tight text-white">Pharma<span className="text-emerald-500">Krypt</span></span>
               <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Secure Medicine Verification</span>
             </div>
           </div>
           <p className="text-sm max-w-xs italic text-slate-300 border-l-4 border-emerald-500 pl-4 py-1">"Other systems ask the patient to spot a fake. Our system ensures a fake never reaches the patient."</p>
        </div>
        
        {/* Center: GitHub Logo */}
        <div className="flex justify-center">
          <a href="https://github.com/aryankumarrai/Pharmakrypt" target="_blank" rel="noopener noreferrer" className="group flex flex-col items-center hover:text-white transition-colors">
             <Github className="w-10 h-10 mb-2 group-hover:scale-110 transition-transform" />
             <span className="font-mono text-xs opacity-70 group-hover:opacity-100">aryankumarrai/Pharmakrypt</span>
          </a>
        </div>

        {/* Right: Contact */}
        <div className="text-center md:text-right">
           <h4 className="font-bold text-white mb-2">Contact & Support</h4>
           <a href="mailto:support@pharmakrypt.app" className="text-emerald-400 hover:text-white font-mono text-sm transition-colors block">support@pharmakrypt.app</a>
        </div>

      </div>
      <div className="max-w-7xl mx-auto px-4 mt-12 pt-8 border-t border-slate-800 text-center text-xs">
        <p>&copy; 2026 PharmaKrypt Inc. All rights reserved.</p>
      </div>
    </footer>
  );
}

// ----------------------------------------------------------------------
// AUTH & LOGIN COMPONENTS
// ----------------------------------------------------------------------

function ManufacturerLogin({ onLogin }: { onLogin: () => void }) {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const handleLogin = async () => {
    setChecking(true);
    setError('');
    try {
      const q = query(
        collection(db, 'artifacts', appId, 'public', 'data', 'users'), 
        where('type', '==', 'manufacturer'),
        where('adminId', '==', id.trim()),
        where('password', '==', password.trim())
      );
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        onLogin();
      } else {
        setError('Invalid credentials. Please ask the Admin Portal to register you first.');
      }
    } catch (err) {
      console.error(err);
      setError('System connection error.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white p-8 rounded-2xl shadow-lg border border-slate-100 mt-12">
      <div className="text-center mb-8"><Activity className="w-12 h-12 text-blue-600 mx-auto mb-3" /><h2 className="text-2xl font-bold text-slate-900">Manufacturer Login</h2></div>
      <div className="space-y-4">
        <input type="text" placeholder="Manufacturer ID" value={id} onChange={(e) => setId(e.target.value)} className="w-full border rounded-lg p-3" />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border rounded-lg p-3" />
        {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded border border-red-100">{error}</p>}
        <button onClick={handleLogin} disabled={checking} className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
          {checking ? 'Verifying...' : 'Secure Login'}
        </button>
      </div>
    </div>
  );
}

function DistributorLogin({ onJoin }: { onJoin: (name: string, loc: string) => void }) {
  const [distId, setDistId] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const handleLogin = async () => {
    setChecking(true);
    setError('');
    try {
      const q = query(
        collection(db, 'artifacts', appId, 'public', 'data', 'users'), 
        where('type', '==', 'distributor'),
        where('distributorId', '==', distId.trim())
      );
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const userData = snapshot.docs[0].data() as RegisteredEntity;
        onJoin(userData.name, userData.location);
      } else {
        setError('Invalid Distributor ID. Contact Manufacturer.');
      }
    } catch (err) {
      setError('System Error');
    } finally {
      setChecking(false);
    }
  };
  
  return (
    <div className="max-w-md mx-auto bg-white p-8 rounded-2xl shadow-lg border border-slate-100 mt-12">
      <div className="text-center mb-8"><Truck className="w-12 h-12 text-indigo-600 mx-auto mb-3" /><h2 className="text-2xl font-bold text-slate-900">Distributor Login</h2></div>
      <div className="space-y-4">
        <input type="text" placeholder="Your Unique Distributor ID" value={distId} onChange={(e) => setDistId(e.target.value)} className="w-full border rounded-lg p-3" />
        {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded border border-red-100">{error}</p>}
        <button onClick={handleLogin} disabled={checking} className="w-full bg-indigo-600 text-white font-bold py-3 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50">
          {checking ? 'Verifying...' : 'Login'}
        </button>
      </div>
    </div>
  );
}

function PharmacyLogin({ onJoin }: { onJoin: (name: string, loc: string) => void }) {
  const [licenseId, setLicenseId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const handleLogin = async () => {
    setChecking(true);
    setError('');
    try {
      const q = query(
        collection(db, 'artifacts', appId, 'public', 'data', 'users'), 
        where('type', '==', 'pharmacy'),
        where('licenseId', '==', licenseId.trim()),
        where('password', '==', password.trim())
      );
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const userData = snapshot.docs[0].data() as RegisteredEntity;
        onJoin(userData.name, userData.location);
      } else {
        setError('Invalid License ID or Password. Contact Regulator.');
      }
    } catch (err) {
      setError('System Error');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white p-8 rounded-2xl shadow-lg border border-slate-100 mt-12">
      <div className="text-center mb-8"><Store className="w-12 h-12 text-emerald-600 mx-auto mb-3" /><h2 className="text-2xl font-bold text-slate-900">Pharmacy Portal</h2></div>
      <div className="space-y-4">
        <input type="text" placeholder="Pharmacy License ID" value={licenseId} onChange={(e) => setLicenseId(e.target.value)} className="w-full border rounded-lg p-3" />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border rounded-lg p-3" />
        {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded border border-red-100">{error}</p>}
        <button onClick={handleLogin} disabled={checking} className="w-full bg-emerald-600 text-white font-bold py-3 rounded-lg disabled:opacity-50">
          {checking ? 'Authenticating...' : 'Secure Login'}
        </button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// DASHBOARDS
// ----------------------------------------------------------------------

function ManufacturingHub() {
  const [activeTab, setActiveTab] = useState<'batch' | 'distributors'>('batch');
  const [medName, setMedName] = useState('Amoxicillin 500mg');
  const [batchSize, setBatchSize] = useState(5);
  const [generatedBatch, setGeneratedBatch] = useState<Medicine[]>([]);
  const [currentCartonId, setCurrentCartonId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Distributor State
  const [distName, setDistName] = useState('');
  const [distLoc, setDistLoc] = useState('');
  const [newDistId, setNewDistId] = useState('');

  const handleGenerate = async () => {
    setIsGenerating(true);
    const batchId = `BATCH-${Math.floor(Math.random() * 10000)}`;
    const masterCartonId = generateSecureID("CTN");
    setCurrentCartonId(masterCartonId);

    try {
      const batchPromises = Array.from({ length: batchSize }).map(async () => {
        const uniqueId = generateSecureID("MED");
        const newMed: any = {
          name: medName,
          batchId: batchId,
          masterCartonId: masterCartonId,
          uniqueId: uniqueId,
          status: 'inactive',
          scanHistory: [],
          manufacturingDate: serverTimestamp(),
        };
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'medicines'), newMed);
        return newMed as Medicine;
      });
      const results = await Promise.all(batchPromises);
      setGeneratedBatch(results);
    } catch (error) { console.error("Error generating batch:", error); } 
    finally { setIsGenerating(false); }
  };

  const handleRegisterDistributor = async () => {
    if(!distName || !distLoc) return;
    const generatedId = generateSecureID("DIST");
    
    // 1. Create User
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'users'), {
      name: distName,
      location: distLoc,
      distributorId: generatedId,
      type: 'distributor',
      addedAt: serverTimestamp()
    });

    // 2. Alert Admin
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'alerts'), {
      type: 'New Distributor Registered',
      medicineName: 'System Notification',
      medicineUniqueId: generatedId,
      status: 'active',
      timestamp: serverTimestamp(),
      originalScan: {
         name: distName,
         location: distLoc,
         action: 'Registration',
         role: 'manufacturer'
      },
      counterfeitScan: {
         name: 'System', location: 'Admin Panel', action: 'Notification', role: 'public'
      }
    });

    setNewDistId(generatedId);
    setDistName('');
    setDistLoc('');
  };

  const handleDownloadZip = async () => {
    if (!generatedBatch.length || !currentCartonId) return;
    try {
      const zip = new JSZip();
      const batchFolder = zip.folder(`PharmaKrypt_Batch_${generatedBatch[0].batchId}`);
      const cartonUrl = await QRCode.toDataURL(currentCartonId, { width: 400, margin: 2 });
      batchFolder?.file(`MASTER_CARTON_${currentCartonId}.png`, cartonUrl.split(',')[1], { base64: true });
      for (const med of generatedBatch) {
        const unitUrl = await QRCode.toDataURL(med.uniqueId, { width: 300, margin: 1 });
        batchFolder?.file(`UNIT_${med.uniqueId}.png`, unitUrl.split(',')[1], { base64: true });
      }
      const manifest = `Batch ID: ${generatedBatch[0].batchId}\nMaster Carton: ${currentCartonId}\nProduct: ${medName}\nUnits: ${generatedBatch.length}`;
      batchFolder?.file("manifest.txt", manifest);
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `PharmaKrypt_Batch_${generatedBatch[0].batchId}.zip`);
    } catch (err) { alert("Download unavailable in demo mode."); }
  };

  return (
    <div className="space-y-6">
       <div className="flex space-x-4 border-b border-slate-200 pb-2">
         <button onClick={() => setActiveTab('batch')} className={`pb-2 px-4 font-medium ${activeTab === 'batch' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500'}`}>Production Line</button>
         <button onClick={() => setActiveTab('distributors')} className={`pb-2 px-4 font-medium ${activeTab === 'distributors' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500'}`}>Manage Distributors</button>
       </div>

       {activeTab === 'distributors' ? (
         <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
               <h3 className="font-bold text-lg text-slate-800 mb-4">Register New Distributor</h3>
               <div className="space-y-4">
                  <input className="w-full border p-2 rounded" placeholder="Distributor Name" value={distName} onChange={e => setDistName(e.target.value)} />
                  <input className="w-full border p-2 rounded" placeholder="Location" value={distLoc} onChange={e => setDistLoc(e.target.value)} />
                  <button onClick={handleRegisterDistributor} className="w-full bg-blue-600 text-white font-bold py-2 rounded hover:bg-blue-700">Generate Access ID</button>
               </div>
            </div>
            {newDistId && (
               <div className="bg-green-50 border border-green-200 p-6 rounded-xl animate-in zoom-in">
                  <h3 className="font-bold text-green-800 mb-2 flex items-center"><CheckCircle className="w-5 h-5 mr-2" /> Distributor Created</h3>
                  <p className="text-sm text-green-700 mb-4">Share this ID with the distributor. Admin has been notified.</p>
                  <div className="bg-white p-4 rounded border border-green-100 font-mono text-center text-xl font-bold tracking-widest">{newDistId}</div>
               </div>
            )}
         </div>
       ) : (
         <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-1 space-y-6">
               <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
               <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center"><Pill className="w-5 h-5 mr-2 text-blue-500" /> New Secure Batch</h3>
               <div className="space-y-4">
                  <div><label className="block text-sm font-medium text-slate-700 mb-1">Medicine Name</label><input type="text" value={medName} onChange={(e) => setMedName(e.target.value)} className="w-full border p-2 rounded-lg" /></div>
                  <div><label className="block text-sm font-medium text-slate-700 mb-1">Units per Carton</label><input type="number" min="1" max="20" value={batchSize} onChange={(e) => setBatchSize(parseInt(e.target.value))} className="w-full border p-2 rounded-lg" /></div>
                  <button onClick={handleGenerate} disabled={isGenerating} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">{isGenerating ? 'Encrypting...' : 'Generate Batch'}</button>
               </div>
               </div>
            </div>
            <div className="md:col-span-2">
               <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-full">
               <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold text-slate-800">Batch Output</h3>
                  {generatedBatch.length > 0 && (<button onClick={handleDownloadZip} className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg flex items-center hover:bg-indigo-700 transition-colors"><Download className="w-4 h-4 mr-2" /> Download ZIP</button>)}
               </div>
               {generatedBatch.length === 0 ? (
                  <div className="text-center text-slate-400 py-12 border-2 border-dashed border-slate-200 rounded-lg"><Box className="w-12 h-12 mx-auto mb-2 opacity-50" /><p>No batch generated yet.</p></div>
               ) : (
                  <div className="space-y-4">
                     <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-lg flex justify-between items-center">
                        <div className="flex items-center"><Box className="w-8 h-8 text-indigo-600 mr-3" /><div><p className="text-xs font-bold text-indigo-600 uppercase">Master Carton ID</p><p className="font-mono font-bold text-lg">{currentCartonId}</p></div></div>
                     </div>
                     <div className="space-y-2">
                        {generatedBatch.map((med, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
                           <div className="flex items-center space-x-3"><Plus className="w-4 h-4 text-slate-400" /><p className="font-mono text-sm font-bold text-slate-700">{med.uniqueId}</p></div>
                           <div className="text-xs text-slate-500">{med.name}</div>
                        </div>
                        ))}
                     </div>
                  </div>
               )}
               </div>
            </div>
         </div>
       )}
    </div>
  );
}

function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'generate' | 'tracking' | 'alerts'>('generate');
  return (
    <div className="space-y-6">
      <div className="flex space-x-4 border-b border-slate-200 pb-2">
        <button onClick={() => setActiveTab('generate')} className={`pb-2 px-4 font-medium transition-colors ${activeTab === 'generate' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500'}`}>Manufacturing Hub</button>
        <button onClick={() => setActiveTab('tracking')} className={`pb-2 px-4 font-medium transition-colors ${activeTab === 'tracking' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500'}`}>Live Inventory</button>
        <button onClick={() => setActiveTab('alerts')} className={`pb-2 px-4 font-medium transition-colors ${activeTab === 'alerts' ? 'border-b-2 border-red-600 text-red-600' : 'text-slate-500'}`}>Alerts</button>
      </div>
      {activeTab === 'generate' && <ManufacturingHub />}
      {activeTab === 'tracking' && <LiveTrackingTable />}
      {activeTab === 'alerts' && <AlertsPanel title="Factory Alerts" showResolve={false} />}
    </div>
  );
}

function GovernmentDashboard() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'manufacturers' | 'pharmacies' | 'distributors' | 'logs'>('dashboard');
  
  return (
    <div className="space-y-6">
      <div className="bg-purple-900 text-white p-6 rounded-xl shadow-lg mb-6"><h2 className="text-2xl font-bold flex items-center"><Building2 className="w-6 h-6 mr-3 text-purple-300" /> Regulatory Authority Dashboard</h2><p className="text-purple-200 mt-2">National Oversight & Real-time Counterfeit Monitoring</p></div>
      
      <div className="flex space-x-4 border-b border-slate-200 pb-2 overflow-x-auto">
        <button onClick={() => setActiveTab('dashboard')} className={`pb-2 px-4 font-medium whitespace-nowrap ${activeTab === 'dashboard' ? 'border-b-2 border-purple-600 text-purple-600' : 'text-slate-500'}`}>Overview</button>
        <button onClick={() => setActiveTab('manufacturers')} className={`pb-2 px-4 font-medium whitespace-nowrap ${activeTab === 'manufacturers' ? 'border-b-2 border-purple-600 text-purple-600' : 'text-slate-500'}`}>Manufacturers</button>
        <button onClick={() => setActiveTab('pharmacies')} className={`pb-2 px-4 font-medium whitespace-nowrap ${activeTab === 'pharmacies' ? 'border-b-2 border-purple-600 text-purple-600' : 'text-slate-500'}`}>Pharmacies</button>
        <button onClick={() => setActiveTab('distributors')} className={`pb-2 px-4 font-medium whitespace-nowrap ${activeTab === 'distributors' ? 'border-b-2 border-purple-600 text-purple-600' : 'text-slate-500'}`}>Distributors</button>
        <button onClick={() => setActiveTab('logs')} className={`pb-2 px-4 font-medium whitespace-nowrap ${activeTab === 'logs' ? 'border-b-2 border-purple-600 text-purple-600' : 'text-slate-500'}`}>Logs & Alerts</button>
      </div>

      {activeTab === 'dashboard' && <GovtOverview />}
      {activeTab === 'manufacturers' && <EntityManagement type="manufacturer" />}
      {activeTab === 'pharmacies' && <EntityManagement type="pharmacy" />}
      {activeTab === 'distributors' && <EntityManagement type="distributor" />}
      {activeTab === 'logs' && (
        <div className="grid md:grid-cols-2 gap-6">
          <LiveMonitor />
          <AlertsPanel title="National Security Alerts" showResolve={true} />
        </div>
      )}
    </div>
  );
}

function EntityManagement({ type }: { type: 'manufacturer' | 'pharmacy' | 'distributor' }) {
  const [entities, setEntities] = useState<RegisteredEntity[]>([]);
  const [newName, setNewName] = useState('');
  const [newLoc, setNewLoc] = useState('');
  const [lastCreated, setLastCreated] = useState<any>(null);

  useEffect(() => {
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'users'), where('type', '==', type));
    const unsub = onSnapshot(q, (snap) => setEntities(snap.docs.map(d => ({id: d.id, ...d.data()})) as RegisteredEntity[]));
    return () => unsub();
  }, [type]);

  const handleAdd = async () => {
    if(!newName || !newLoc) return;
    
    // Generate Credentials
    const genId = type === 'manufacturer' ? `MFG-${generateCredential(4).toUpperCase()}` : `LIC-${generateCredential(6).toUpperCase()}`;
    const genPass = generateCredential(8);

    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'users'), {
      name: newName, 
      location: newLoc, 
      type, 
      addedAt: serverTimestamp(),
      ...(type === 'manufacturer' ? { adminId: genId, password: genPass } : {}),
      ...(type === 'pharmacy' ? { licenseId: genId, password: genPass } : {})
    });

    setLastCreated({ name: newName, id: genId, pass: genPass });
    setNewName(''); setNewLoc('');
  };

  const handleRevoke = async (id: string) => {
    if(confirm(`Are you sure you want to REVOKE access for this ${type}? This action cannot be undone.`)) {
       await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', id));
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="font-bold text-lg mb-4 capitalize">
          {type === 'distributor' ? 'Distributor Registry (View Only)' : `Register New ${type}`}
        </h3>
        
        {/* Registration Form - Hidden for Distributors */}
        {type !== 'distributor' && (
          <>
            <div className="flex gap-4 mb-4 bg-slate-50 p-4 rounded-lg items-end">
              <div className="flex-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Entity Name</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)} className="w-full border p-2 rounded" placeholder={`New ${type} name`} />
              </div>
              <div className="flex-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Location/City</label>
                <input type="text" value={newLoc} onChange={e => setNewLoc(e.target.value)} className="w-full border p-2 rounded" placeholder="Location" />
              </div>
              <button onClick={handleAdd} className="bg-purple-600 text-white px-4 py-2 rounded font-bold hover:bg-purple-700 flex items-center"><Plus className="w-4 h-4 mr-2" /> Generate Credentials</button>
            </div>

            {lastCreated && (
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-6 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                <div>
                  <p className="text-sm text-blue-800 font-bold mb-1">New {type} Registered: {lastCreated.name}</p>
                  <div className="flex space-x-6 text-sm">
                      <span>ID: <code className="font-bold bg-white px-2 py-0.5 rounded border border-blue-100">{lastCreated.id}</code></span>
                      <span>Password: <code className="font-bold bg-white px-2 py-0.5 rounded border border-blue-100">{lastCreated.pass}</code></span>
                  </div>
                </div>
                <button onClick={() => setLastCreated(null)} className="text-blue-500 text-xs hover:text-blue-700">Dismiss</button>
              </div>
            )}
          </>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 text-slate-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Location</th>
                <th className="px-4 py-2">
                   {type === 'distributor' ? 'Distributor ID' : 'License/Admin ID'}
                </th>
                {type !== 'distributor' && <th className="px-4 py-2">Password</th>}
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {entities.map(e => (
                <tr key={e.id} className="border-b">
                  <td className="px-4 py-3 font-bold">{e.name}</td>
                  <td className="px-4 py-3">{e.location}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    {type === 'manufacturer' ? e.adminId : (type === 'distributor' ? e.distributorId : e.licenseId)}
                  </td>
                  {type !== 'distributor' && (
                     <td className="px-4 py-3 font-mono text-xs text-slate-600 bg-slate-50">
                        {e.password}
                     </td>
                  )}
                  <td className="px-4 py-3"><span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">Active</span></td>
                  <td className="px-4 py-3">
                     <button onClick={() => handleRevoke(e.id)} className="text-red-600 hover:text-white border border-red-200 hover:bg-red-600 px-3 py-1 rounded text-xs font-bold transition-colors">
                        Revoke
                     </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------
// SHARED COMPONENTS
// ----------------------------------------------------------------------

function LiveTrackingTable() {
  const [groupedMedicines, setGroupedMedicines] = useState<Record<string, Medicine[]>>({});
  const [expandedCartons, setExpandedCartons] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const medsRef = collection(db, 'artifacts', appId, 'public', 'data', 'medicines');
    const q = query(medsRef, limit(200)); 
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), scanHistory: doc.data().scanHistory || [] } as Medicine));
      const groups: Record<string, Medicine[]> = {};
      data.forEach(med => {
        const key = med.masterCartonId || 'UNASSIGNED';
        if (!groups[key]) groups[key] = [];
        groups[key].push(med);
      });
      setGroupedMedicines(groups);
    }, (e) => console.warn("Index check", e));
    return () => unsubscribe();
  }, []);

  const toggleCarton = (cartonId: string) => {
    setExpandedCartons(prev => ({ ...prev, [cartonId]: !prev[cartonId] }));
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
        <h3 className="font-bold text-slate-700 flex items-center"><Activity className="w-4 h-4 mr-2" /> Live Inventory Status</h3>
        <button onClick={clearGlobalData} className="text-xs flex items-center text-red-600 hover:text-white border border-red-200 hover:bg-red-600 font-bold px-3 py-1 rounded transition-colors">
           <Trash2 className="w-3 h-3 mr-1" /> RESET DEMO DATA
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-slate-500">
          <thead className="text-xs text-slate-700 uppercase bg-slate-100">
            <tr>
              <th className="px-4 py-3 w-10"></th>
              <th className="px-4 py-3">Master Carton ID</th>
              <th className="px-4 py-3">Units</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Location</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(groupedMedicines).map(([cartonId, items]) => {
              const isOpen = expandedCartons[cartonId];
              const status = items[0]?.status || 'unknown';
              const location = items[0]?.targetPharmacy ? `${items[0].targetPharmacy}, ${items[0].targetCity}` : 'Unassigned';
              return (
                <React.Fragment key={cartonId}>
                  <tr className="border-b hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => toggleCarton(cartonId)}>
                    <td className="px-4 py-3 text-center">{isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</td>
                    <td className="px-4 py-3 font-mono font-bold text-indigo-700">{cartonId}<br/><span className="text-xs font-normal text-slate-500">{items[0]?.name}</span></td>
                    <td className="px-4 py-3">{items.length} units</td>
                    <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${status === 'stocked' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{status}</span></td>
                    <td className="px-4 py-3 text-slate-600">{location}</td>
                  </tr>
                  {isOpen && items.map(med => (
                    <tr key={med.uniqueId} className="bg-slate-50 border-b border-slate-100">
                      <td></td>
                      <td className="px-4 py-2 pl-12 flex items-center"><Plus className="w-3 h-3 mr-2 text-slate-400" /><span className="font-mono text-xs text-slate-600">{med.uniqueId}</span></td>
                      <td className="px-4 py-2 text-xs">{med.name}</td>
                      <td className="px-4 py-2"><span className="text-xs font-medium uppercase">{med.status}</span></td>
                      <td className="px-4 py-2 text-xs italic text-slate-400">Last: {med.scanHistory.length > 0 ? med.scanHistory[med.scanHistory.length-1].action : 'N/A'}</td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LiveMonitor() {
  const [scans, setScans] = useState<Medicine[]>([]);
  useEffect(() => {
    const medsRef = collection(db, 'artifacts', appId, 'public', 'data', 'medicines');
    const q = query(medsRef, limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), scanHistory: doc.data().scanHistory || [] } as Medicine));
      data.sort((a, b) => {
        const lastA = a.scanHistory[a.scanHistory.length - 1]?.timestamp || 0;
        const lastB = b.scanHistory[b.scanHistory.length - 1]?.timestamp || 0;
        return new Date(lastB).getTime() - new Date(lastA).getTime();
      });
      setScans(data);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full flex flex-col">
      <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
         <h3 className="font-bold text-slate-700 flex items-center"><Activity className="w-4 h-4 mr-2" /> Live Verification Feed</h3>
         <button onClick={clearGlobalData} className="text-xs flex items-center text-red-600 hover:text-white border border-red-200 hover:bg-red-600 font-bold px-3 py-1 rounded transition-colors">
            <Trash2 className="w-3 h-3 mr-1" /> RESET
         </button>
      </div>
      <div className="divide-y divide-slate-100 flex-1 overflow-y-auto max-h-[600px]">
        {scans.map((med) => {
            const lastScan = med.scanHistory[med.scanHistory.length - 1];
            if (!lastScan) return null;
            return (
              <div key={med.uniqueId + (lastScan.timestamp || '0')} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-full ${['stocked', 'sold', 'in-transit'].includes(med.status) ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'}`}>
                      {med.status === 'counterfeit' ? <AlertTriangle className="w-5 h-5 text-red-600" /> : <Activity className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 text-sm">{med.name}</p>
                      <p className="text-xs text-slate-500 flex items-center"><MapPin className="w-3 h-3 mr-1" /> {lastScan.location}</p>
                    </div>
                  </div>
                  <div className="text-right">
                     <span className={`text-xs font-bold px-2 py-1 rounded-full uppercase ${med.status === 'stocked' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>{med.status}</span>
                     <p className="text-xs text-slate-300 mt-0.5">{new Date(lastScan.timestamp).toLocaleTimeString()}</p>
                  </div>
                </div>
              </div>
            );
        })}
      </div>
    </div>
  );
}

function AlertsPanel({ title, showResolve }: { title: string, showResolve?: boolean }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'alerts'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => { 
       const allAlerts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Alert[];
       const filtered = allAlerts.filter(a => {
          const status = a.status || 'active';
          return showHistory ? status === 'resolved' : status === 'active';
       });
       filtered.sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
       setAlerts(filtered); 
    });
    return () => unsubscribe();
  }, [showHistory]);

  const resolveAlert = async (id: string) => {
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'alerts', id), { status: 'resolved', resolvedAt: serverTimestamp() });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full">
      <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-red-50">
         <h3 className="text-lg font-bold text-red-800 flex items-center"><AlertTriangle className="w-5 h-5 mr-2" /> {title}</h3>
         <button onClick={() => setShowHistory(!showHistory)} className="text-xs flex items-center bg-white border px-3 py-1 rounded hover:bg-slate-50">
            {showHistory ? <Activity className="w-3 h-3 mr-1"/> : <Clock className="w-3 h-3 mr-1"/>}
            {showHistory ? 'Show Active' : 'Show Resolved'}
         </button>
      </div>
      <div className="flex-1 overflow-y-auto max-h-[600px] divide-y divide-slate-100">
          {alerts.length === 0 ? <div className="p-12 text-center text-slate-500"><ShieldCheck className="w-16 h-16 mx-auto mb-4 text-emerald-100" /><p>No {showHistory ? 'resolved' : 'active'} alerts.</p></div> : alerts.map((alert) => (
              <div key={alert.id} className="p-6 hover:bg-slate-50 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider ${showHistory ? 'bg-slate-200 text-slate-600' : 'bg-red-600 text-white'}`}>{showHistory ? 'Resolved' : 'Critical'}</span>
                    <span className="text-xs text-slate-400">{alert.timestamp?.seconds ? new Date(alert.timestamp.seconds * 1000).toLocaleString() : 'Just now'}</span>
                  </div>
                  <h4 className="text-lg font-bold text-slate-800 mb-1">{alert.type}</h4>
                  <p className="text-xs text-red-600 font-bold mb-3">{alert.medicineName} ({alert.medicineUniqueId})</p>
                  
                  {alert.originalScan && (
                    <div className="text-sm bg-slate-50 p-2 rounded mt-2">
                       <p className="font-semibold text-xs text-slate-500">Triggered by:</p>
                       <p>{alert.originalScan.name} <span className="text-slate-400">({alert.originalScan.location})</span></p>
                    </div>
                  )}

                  {showResolve && !showHistory && (
                    <button onClick={() => resolveAlert(alert.id)} className="mt-4 w-full bg-slate-800 text-white text-xs font-bold py-2 rounded hover:bg-slate-900 transition-colors">MARK AS RESOLVED</button>
                  )}
              </div>
          ))}
      </div>
    </div>
  );
}

function GovtOverview() {
  const [stats, setStats] = useState({ activeAlerts: 0 });
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const alertQ = query(collection(db, 'artifacts', appId, 'public', 'data', 'alerts'), where('status', '==', 'active'));
        const alertSnap = await getDocs(alertQ);
        setStats({ activeAlerts: alertSnap.size });
      } catch(e) {}
    }
    fetchStats();
  }, []);

  return (
     <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-red-50 border border-red-100 p-6 rounded-xl">
           <h3 className="text-red-800 font-bold uppercase text-sm mb-2">Active Alerts</h3>
           <p className="text-4xl font-extrabold text-red-600">{stats.activeAlerts}</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 p-6 rounded-xl">
           <h3 className="text-blue-800 font-bold uppercase text-sm mb-2">System Status</h3>
           <p className="text-lg font-bold text-blue-600 flex items-center"><Activity className="w-5 h-5 mr-2" /> Online</p>
        </div>
        <div className="bg-purple-50 border border-purple-100 p-6 rounded-xl">
           <h3 className="text-purple-800 font-bold uppercase text-sm mb-2">Blockchain</h3>
           <p className="text-lg font-bold text-purple-600 flex items-center"><ShieldCheck className="w-5 h-5 mr-2" /> Synced</p>
        </div>
     </div>
  )
}

function DistributorDashboard({ name, location }: { userId?: string, name: string, location: string }) {
  const [inputCartonId, setInputCartonId] = useState('');
  const [selectedPharmacyId, setSelectedPharmacyId] = useState('');
  const [pharmacies, setPharmacies] = useState<RegisteredEntity[]>([]);
  const [scanResult, setScanResult] = useState<{valid: boolean, count: number, msg?: string, ts?: number} | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'users'), where('type', '==', 'pharmacy'));
    const unsub = onSnapshot(q, (snap) => setPharmacies(snap.docs.map(d => ({id: d.id, ...d.data()})) as RegisteredEntity[]));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!isCameraOpen) return;
    let stream: MediaStream | null = null;
    let animationFrame: number;
    const startScan = async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).catch(() => navigator.mediaDevices.getUserMedia({ video: true }));
          if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.setAttribute("playsinline", "true"); videoRef.current.play(); requestAnimationFrame(tick); }
        } catch (err) { setIsCameraOpen(false); }
    };
    const tick = () => {
      if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        const canvas = document.createElement("canvas"); canvas.width = videoRef.current.videoWidth; canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          try {
             const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
             if (code && code.data) setInputCartonId(prev => (prev !== code.data ? code.data : prev));
          } catch(e) {}
        }
      }
      if (isCameraOpen) animationFrame = requestAnimationFrame(tick);
    };
    startScan();
    return () => { if (stream) stream.getTracks().forEach(track => track.stop()); cancelAnimationFrame(animationFrame); };
  }, [isCameraOpen]);

  useEffect(() => { if(inputCartonId && selectedPharmacyId) handleVerifyAndActivate(); }, [inputCartonId]);

  const handleVerifyAndActivate = async () => {
    if (!inputCartonId || !selectedPharmacyId) return;
    if (scanResult && scanResult.msg?.includes(inputCartonId) && (Date.now() - (scanResult.ts || 0) < 2000)) return;

    const targetPharm = pharmacies.find(p => p.id === selectedPharmacyId);
    if (!targetPharm) return;

    try {
      const medsRef = collection(db, 'artifacts', appId, 'public', 'data', 'medicines');
      const q = query(medsRef, where('masterCartonId', '==', inputCartonId.trim()));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const med = snapshot.docs[0].data() as Medicine;
        if (med.status !== 'inactive') {
           const badScan: ScanRecord = { role: 'distributor', name, location, timestamp: new Date().toISOString(), action: 'Duplicate Activation', result: 'alert' };
           await createAlert(med, badScan, "Duplicate Carton Scan", inputCartonId);
           setScanResult({ valid: false, count: 0, msg: `ALERT: Carton ${inputCartonId} already active!`, ts: Date.now() });
           return;
        }
        const updatePromises = snapshot.docs.map(docSnap => {
           const medData = docSnap.data();
           return updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'medicines', docSnap.id), {
             status: 'in-transit', targetPharmacy: targetPharm.name, targetCity: targetPharm.location, 
             scanHistory: [...(medData.scanHistory || []), { role: 'distributor', name, location, timestamp: new Date().toISOString(), action: `Activated for ${targetPharm.name}`, result: 'valid' }]
           });
        });
        await Promise.all(updatePromises);
        setScanResult({ valid: true, count: snapshot.size, msg: `Activated Carton ${inputCartonId}`, ts: Date.now() });
      } else {
        setScanResult({ valid: false, count: 0, msg: `Invalid ID ${inputCartonId}`, ts: Date.now() });
      }
    } catch(err) { setScanResult({ valid: false, count: 0, msg: "System Error" }); } 
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white p-6 rounded-xl shadow-lg border border-indigo-100">
        <div className="flex items-center mb-6 text-indigo-900"><Truck className="w-8 h-8 mr-3" /><div><h2 className="text-xl font-bold">Distributor Activation Hub</h2><p className="text-sm text-indigo-500">{name} • {location}</p></div></div>
        <div className="bg-indigo-50 p-6 rounded-xl mb-6 text-center space-y-4">
           <p className="text-sm text-indigo-800 font-bold uppercase">1. Select Destination Pharmacy</p>
           <div className="relative">
              <select value={selectedPharmacyId} onChange={(e) => setSelectedPharmacyId(e.target.value)} className="w-full p-4 border border-indigo-200 rounded-lg appearance-none bg-white text-lg focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer">
                <option value="">-- Choose Registered Pharmacy --</option>
                {pharmacies.map(p => (<option key={p.id} value={p.id}>{p.name} ({p.location})</option>))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-indigo-700"><ChevronDown className="h-5 w-5" /></div>
           </div>
           
           <p className="text-sm text-indigo-800 font-bold uppercase pt-4">2. Continuous Scan Mode</p>
           {!isCameraOpen ? (
             <button onClick={() => { setInputCartonId(''); setIsCameraOpen(true); }} disabled={!selectedPharmacyId} className="w-full bg-indigo-600 text-white px-6 py-4 rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50 mt-2 text-lg shadow-lg flex items-center justify-center transition-all hover:scale-[1.02]"><Camera className="w-6 h-6 mr-2" /> START SCANNING SESSION</button>
           ) : (
             <div className="space-y-4">
               <div className="relative w-full h-80 bg-black rounded-lg overflow-hidden border-4 border-indigo-300 shadow-2xl">
                  <video ref={videoRef} className="w-full h-full object-cover" />
                  {scanResult && (<div className={`absolute bottom-0 left-0 right-0 p-4 ${scanResult.valid ? 'bg-emerald-600' : 'bg-red-600'} text-white transition-all duration-300 ease-in-out`}><div className="flex items-center justify-center font-bold text-lg">{scanResult.valid ? <CheckCircle className="w-6 h-6 mr-2" /> : <AlertTriangle className="w-6 h-6 mr-2" />}{scanResult.msg}</div></div>)}
                  <button onClick={() => setIsCameraOpen(false)} className="absolute top-2 right-2 bg-black/50 hover:bg-red-600 text-white px-4 py-2 rounded-full text-xs font-bold transition-colors">STOP</button>
               </div>
             </div>
           )}
        </div>
      </div>
    </div>
  );
}

function PharmacyDashboard({ pharmacyName, location }: { userId?: string, pharmacyName: string, location: string }) {
  const [activeTab, setActiveTab] = useState<'scan' | 'inventory'>('scan');
  const [mode, setMode] = useState<'stock' | 'sell'>('stock');
  const [scanResult, setScanResult] = useState<any>(null);
  const [inputValue, setInputValue] = useState('');
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanLogs, setScanLogs] = useState<any[]>([]);

  useEffect(() => {
    if (!isCameraOpen) return;
    let stream: MediaStream | null = null;
    let animationFrame: number;
    const startCamera = async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).catch(() => navigator.mediaDevices.getUserMedia({ video: true }));
          if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.setAttribute("playsinline", "true"); videoRef.current.play(); requestAnimationFrame(tick); }
        } catch (err) { setIsCameraOpen(false); }
    };
    const tick = () => {
      if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        const canvas = document.createElement("canvas"); canvas.width = videoRef.current.videoWidth; canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          try {
             const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
             if (code && code.data && code.data !== inputValue) setInputValue(code.data);
          } catch(e) {}
        }
      }
      if (isCameraOpen) animationFrame = requestAnimationFrame(tick);
    };
    startCamera();
    return () => { if (stream) stream.getTracks().forEach(track => track.stop()); cancelAnimationFrame(animationFrame); };
  }, [isCameraOpen, inputValue]);

  useEffect(() => { if (inputValue) processScan(); }, [inputValue]);

  const processScan = async () => {
    if (!inputValue) return;
    if (scanLogs.length > 0 && scanLogs[0].id === inputValue && (Date.now() - scanLogs[0].ts < 2000)) return;

    try {
      const medsRef = collection(db, 'artifacts', appId, 'public', 'data', 'medicines');
      const q = query(medsRef, where('uniqueId', '==', inputValue.trim()));
      const snapshot = await getDocs(q);

      if (snapshot.empty) throw new Error("Invalid ID - Not in Database");
      const docSnap = snapshot.docs[0];
      const med = docSnap.data() as Medicine;
      const history = med.scanHistory || []; 
      const medRef = doc(db, 'artifacts', appId, 'public', 'data', 'medicines', docSnap.id);
      const badScan: ScanRecord = { role: 'pharmacy', name: pharmacyName, location, timestamp: new Date().toISOString(), action: `Attempted ${mode}`, result: 'alert' };

      if (mode === 'stock') {
         if (med.status === 'inactive') { await createAlert({ ...med, scanHistory: history }, badScan, "Theft: Inactive Batch Scan"); throw new Error("SECURITY ALERT: Batch Inactive"); }
         if (med.targetPharmacy !== pharmacyName) { await createAlert({ ...med, scanHistory: history }, badScan, "Diversion: Wrong Location"); throw new Error(`DIVERSION ALERT: Unit assigned to ${med.targetPharmacy}`); }
         if (med.status === 'stocked' || med.status === 'sold') { throw new Error("Already Stocked/Sold - Duplicate Scan"); }
         
         await updateDoc(medRef, { status: 'stocked', scanHistory: [...history, { role: 'pharmacy', name: pharmacyName, location, timestamp: new Date().toISOString(), action: 'Stock Arrival', result: 'valid' }] });
         setScanLogs(prev => [{id: inputValue, status: 'success', msg: 'Added to Stock', ts: Date.now()}, ...prev]);
         setTimeout(() => setInputValue(''), 1000); 
      } else {
         if (med.status === 'sold') { await createAlert({ ...med, scanHistory: history }, badScan, "Duplicate Sale Attempt"); throw new Error("ALERT: Unit already marked as SOLD."); }
         if (med.status !== 'stocked') { throw new Error("Cannot Sell: Not in authenticated stock"); }
         
         await updateDoc(medRef, { status: 'sold', scanHistory: [...history, { role: 'pharmacy', name: pharmacyName, location, timestamp: new Date().toISOString(), action: 'Dispensed', result: 'valid' }] });
         setScanLogs(prev => [{id: inputValue, status: 'success', msg: 'Sold Successfully', ts: Date.now()}, ...prev]);
         setTimeout(() => setInputValue(''), 1000);
      }
    } catch (err: any) {
      setScanResult({ title: "ALERT", msg: err.message });
      setScanLogs(prev => [{id: inputValue, status: 'error', msg: err.message, ts: Date.now()}, ...prev]);
      setIsCameraOpen(false); 
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
        <div><h2 className="font-bold text-slate-800">{pharmacyName}</h2><p className="text-xs text-slate-500"><MapPin className="w-3 h-3 inline mr-1" /> {location}</p></div>
        <div className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold">Authenticated Session</div>
      </div>
      <div className="flex space-x-4 border-b border-slate-200 pb-2">
        <button onClick={() => setActiveTab('scan')} className={`pb-2 px-4 font-medium transition-colors ${activeTab === 'scan' ? 'border-b-2 border-emerald-600 text-emerald-600' : 'text-slate-500'}`}>Scanner</button>
        <button onClick={() => setActiveTab('inventory')} className={`pb-2 px-4 font-medium transition-colors ${activeTab === 'inventory' ? 'border-b-2 border-emerald-600 text-emerald-600' : 'text-slate-500'}`}>My Inventory</button>
      </div>

      {activeTab === 'inventory' ? (
        <PharmacyInventory pharmacyName={pharmacyName} />
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
           <div className="space-y-6">
              <div className="flex bg-slate-200 p-1 rounded-lg">
                 <button onClick={() => {setMode('stock'); setScanLogs([]); setInputValue('');}} className={`flex-1 py-2 rounded-md font-bold text-sm ${mode === 'stock' ? 'bg-white shadow text-emerald-600' : 'text-slate-500'}`}>1. Receive Stock</button>
                 <button onClick={() => {setMode('sell'); setScanLogs([]); setInputValue('');}} className={`flex-1 py-2 rounded-md font-bold text-sm ${mode === 'sell' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>2. Dispense (Sale)</button>
              </div>

              {!isCameraOpen ? (
                <div className="bg-white rounded-xl shadow p-12 text-center border border-slate-200 h-80 flex flex-col items-center justify-center">
                   <div className={`p-4 rounded-full mb-4 ${mode === 'stock' ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'}`}>{mode === 'stock' ? <Box className="w-10 h-10" /> : <User className="w-10 h-10" />}</div>
                   <h3 className="text-xl font-bold mb-2">{mode === 'stock' ? 'Scan Incoming Box' : 'Scan for Customer'}</h3>
                   {scanResult && scanResult.title === "ALERT" && (
                     <div className="mb-4 bg-red-50 p-4 rounded-lg border border-red-200 w-full animate-in shake">
                        <h4 className="text-red-800 font-bold flex items-center justify-center"><AlertTriangle className="w-4 h-4 mr-2" /> SCAN STOPPED</h4>
                        <p className="text-red-600 text-sm">{scanResult.msg}</p>
                     </div>
                   )}
                   <button onClick={() => {setIsCameraOpen(true); setScanResult(null);}} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-black flex items-center justify-center transition-transform hover:scale-105"><Camera className="w-5 h-5 mr-2" /> LAUNCH SCANNER</button>
                </div>
              ) : (
                <div className="relative w-full h-80 bg-black rounded-lg overflow-hidden border-4 border-slate-200 shadow-2xl">
                   <video ref={videoRef} className="w-full h-full object-cover" />
                   <button onClick={() => setIsCameraOpen(false)} className="absolute top-2 right-2 bg-black/50 text-white px-3 py-1 rounded text-xs">Stop</button>
                </div>
              )}
           </div>

           <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 flex flex-col h-[400px]">
              <h3 className="font-bold text-slate-500 text-sm uppercase mb-3 flex items-center"><Activity className="w-4 h-4 mr-2" /> Live Session Log</h3>
              <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                 {scanLogs.length === 0 && <p className="text-center text-slate-400 mt-12 italic">Scans will appear here...</p>}
                 {scanLogs.map((log, i) => (
                    <div key={i} className={`p-3 rounded-lg border flex items-start ${log.status === 'success' ? 'bg-white border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                        {log.status === 'success' ? <CheckCircle className="w-5 h-5 text-emerald-500 mr-3 mt-0.5" /> : <XCircle className="w-5 h-5 text-red-500 mr-3 mt-0.5" />}
                        <div><p className={`text-sm font-bold ${log.status === 'success' ? 'text-slate-800' : 'text-red-800'}`}>{log.msg}</p><p className="text-xs font-mono text-slate-500">{log.id}</p></div>
                        <span className="ml-auto text-xs text-slate-400">{new Date(log.ts).toLocaleTimeString()}</span>
                    </div>
                 ))}
              </div>
           </div>
        </div>
      )}
    </div>
  );
}

function PharmacyInventory({ pharmacyName }: { pharmacyName: string }) {
  const [inventory, setInventory] = useState<Medicine[]>([]);
  useEffect(() => {
    const medsRef = collection(db, 'artifacts', appId, 'public', 'data', 'medicines');
    const q = query(medsRef, where('status', '==', 'stocked'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allMeds = snapshot.docs.map(doc => ({ ...doc.data(), scanHistory: doc.data().scanHistory || [] } as Medicine));
      setInventory(allMeds.filter(m => m.targetPharmacy === pharmacyName));
    });
    return () => unsubscribe();
  }, [pharmacyName]);

  const clearMyStock = async () => {
    if (!window.confirm("Clear inventory?")) return;
    try { const batch = writeBatch(db); inventory.forEach(med => batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'medicines', med.id))); await batch.commit(); } catch(err) { console.error(err); }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
       <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold text-slate-800 flex items-center"><ClipboardList className="w-6 h-6 mr-2 text-blue-600" /> Current Inventory</h3><div className="flex gap-2 items-center"><div className="bg-blue-100 text-blue-800 px-4 py-2 rounded-lg font-bold">Total: {inventory.length}</div>{inventory.length > 0 && (<button onClick={clearMyStock} className="text-red-600 hover:text-white border border-red-600 hover:bg-red-600 px-3 py-2 rounded-lg transition-colors flex items-center"><Trash2 className="w-4 h-4 mr-1" /> Clear</button>)}</div></div>
       {inventory.length === 0 ? <div className="text-center py-8 text-slate-500">No stock available.</div> : (
         <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead className="text-xs text-slate-700 uppercase bg-slate-100"><tr><th className="px-4 py-3">Medicine</th><th className="px-4 py-3">ID</th><th className="px-4 py-3">Date</th></tr></thead><tbody>{inventory.map(item => (<tr key={item.uniqueId} className="border-b hover:bg-slate-50"><td className="px-4 py-3 font-bold">{item.name}</td><td className="px-4 py-3 font-mono text-slate-600">{item.uniqueId}</td><td className="px-4 py-3 text-slate-500">{item.scanHistory.length > 0 ? new Date(item.scanHistory[item.scanHistory.length-1].timestamp).toLocaleDateString() : '-'}</td></tr>))}</tbody></table></div>
       )}
    </div>
  );
}