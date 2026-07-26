import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, onSnapshot, setDoc, deleteDoc, updateDoc, getDocs } from "firebase/firestore";
import { Coffee, UtensilsCrossed, Moon, ShoppingBasket, X, Clock, Check, CalendarDays, Package, AlertTriangle, Plus, Minus, Trash2, Shuffle, RefreshCw, Loader2, Circle, Save, Sparkles, Users, Wand2, Lightbulb, Receipt, Camera, Upload } from "lucide-react";

// ─── FIREBASE ─────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBYbfCxx37NrTssw78btV3U92UkEJekyt8",
  authDomain: "orden-your-life.firebaseapp.com",
  projectId: "orden-your-life",
  storageBucket: "orden-your-life.firebasestorage.app",
  messagingSenderId: "362151993511",
  appId: "1:362151993511:web:f9e1d4c2203e4dfe1bfb82",
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// ─── FAMILY CONSTANTS ─────────────────────────────────────────────────────────
const EXPENSE_CATS = ["Supermercado","Servicios","Ocio","Transporte","Educación","Salud","Ropa","Otros"];
const INCOME_CATS  = ["Sueldo","Freelance","Alquiler","Otros ingresos"];
const PRIORITIES   = ["alta","media","baja"];
const PCOLOR       = { alta:"#EF4444", media:"#F59E0B", baja:"#22C55E" };
const DEFAULT_USERS = [
  { id:"u1", name:"Mamá",   role:"admin", emoji:"👩", pin:"1234", color:"#7C3AED" },
  { id:"u2", name:"Papá",   role:"admin", emoji:"👨", pin:"5678", color:"#0EA5E9" },
  { id:"u3", name:"Hijo/a", role:"child", emoji:"🧒", pin:"0000", color:"#F59E0B" },
];
const DEFAULT_BUDGETS = { Supermercado:500, Servicios:200, Ocio:150, Transporte:100, Otros:200 };

// ─── MENU CONSTANTS ───────────────────────────────────────────────────────────
const DAYS = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
const DAY_SHORT = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
const DAY_COLOR = ["#FF5C4D","#FFB627","#06C99B","#4F9DDE","#8B5CF6","#E91E63","#B8E063"];
const MEAL_TYPES = [
  { k:"desayuno", l:"Desayuno", I:Coffee,          c:"#FFB627", g:"from-amber-300 to-rose-300" },
  { k:"comida",   l:"Comida",   I:UtensilsCrossed, c:"#FF5C4D", g:"from-rose-400 to-orange-400" },
  { k:"cena",     l:"Cena",     I:Moon,            c:"#8B5CF6", g:"from-indigo-400 to-pink-400" },
];
const PANTRY_CATS  = ["Básicos","Especias","Panadería","Frescos","Verduras","Frutas","Legumbres","Cereales","Proteínas","Frutos secos","Conservas","Otros"];
const CAT_COLOR    = { Básicos:"#9CA3AF",Especias:"#F59E0B",Panadería:"#FB923C",Frescos:"#3B82F6",Verduras:"#10B981",Frutas:"#EC4899",Legumbres:"#D97706",Cereales:"#EAB308",Proteínas:"#EF4444","Frutos secos":"#EA580C",Conservas:"#6366F1",Otros:"#9CA3AF" };
const UNITS        = ["g","kg","ml","l","ud","reb","filete","diente","rama"];
const BASE         = 2;
const MENU_KEY     = "menu-week-v4";

// ─── MENU HELPERS ─────────────────────────────────────────────────────────────
const mk  = (name,mins,ings,steps,e,iq) => ({ name,mins,ingredients:ings,steps,e,iq,status:"pending",consumed:null,improvisedName:"" });
const ing = (n,q,u) => ({ name:n,qty:q,unit:u });
const norm    = s => (s||"").toLowerCase().trim();
const scaleI  = (i,ppl) => ({ ...i, qty:+(i.qty*ppl/BASE).toFixed(2) });
const scaleIs = (xs,ppl) => xs.map(x=>scaleI(x,ppl));
const applyDelta = (pantry,ings,sign) => {
  const next=pantry.map(x=>({...x}));
  ings.forEach(i=>{ const k=norm(i.name); const idx=next.findIndex(x=>norm(x.name)===k); if(idx>=0) next[idx].qty=Math.max(0,+(next[idx].qty+sign*i.qty).toFixed(2)); else if(sign<0) next.push({id:k+"-"+Date.now(),name:i.name,qty:0,unit:i.unit,threshold:0,cat:"Otros"}); });
  return next;
};
const lowItems = pantry => pantry.filter(x=>x.threshold>0&&x.qty<=x.threshold).sort((a,b)=>(a.qty/Math.max(a.threshold,1))-(b.qty/Math.max(b.threshold,1)));
const pp = (n,q,u,t,c) => ({ id:n.toLowerCase().replace(/\s+/g,"-"),name:n,qty:q,unit:u,threshold:t,cat:c });

const DEFAULT_MENU = {
  Lunes:{
    desayuno:mk("Tostadas con tomate",10,[ing("Pan rústico",2,"reb"),ing("Tomate",1,"ud"),ing("Aceite de oliva",15,"ml")],["Tuesta el pan.","Ralla el tomate.","AOVE y sal."],"🍅","tomato-toast"),
    comida:mk("Lentejas estofadas",45,[ing("Lentejas pardinas",200,"g"),ing("Cebolla",1,"ud"),ing("Zanahoria",2,"ud"),ing("Ajo",2,"diente"),ing("Pimentón dulce",5,"g")],["Sofríe verduras.","Añade lentejas.","Cuece 40 min."],"🍲","lentil-stew"),
    cena:mk("Tortilla con espinacas",15,[ing("Huevos",4,"ud"),ing("Espinacas",100,"g"),ing("Queso rallado",30,"g")],["Saltea espinacas.","Bate huevos.","Cuaja con queso."],"🍳","spinach-omelette"),
  },
  Martes:{
    desayuno:mk("Yogur con granola",5,[ing("Yogur griego",300,"g"),ing("Granola",60,"g"),ing("Arándanos",80,"g"),ing("Miel",15,"g")],["Sirve yogur.","Granola y fruta.","Miel."],"🫐","yogurt-granola"),
    comida:mk("Pollo al limón",55,[ing("Muslos de pollo",4,"ud"),ing("Patatas",500,"g"),ing("Limón",1,"ud"),ing("Ajo",3,"diente"),ing("Romero",5,"g")],["Marina pollo.","Patatas en gajos.","Horno 200°C 45 min."],"🍗","roast-chicken-lemon"),
    cena:mk("Crema de calabacín",25,[ing("Calabacín",3,"ud"),ing("Puerro",1,"ud"),ing("Patatas",1,"ud"),ing("Caldo de verduras",500,"ml")],["Pocha puerro y patata.","Añade calabacín 15 min.","Tritura."],"🥣","zucchini-soup"),
  },
  Miércoles:{
    desayuno:mk("Avena con plátano",8,[ing("Copos de avena",80,"g"),ing("Leche",400,"ml"),ing("Plátano",1,"ud"),ing("Crema de cacahuete",20,"g")],["Cocina avena 5 min.","Plátano.","Crema cacahuete."],"🍌","oatmeal-banana"),
    comida:mk("Pasta al pesto",20,[ing("Pasta",250,"g"),ing("Albahaca",30,"g"),ing("Piñones",30,"g"),ing("Parmesano",50,"g"),ing("Tomates cherry",200,"g")],["Cuece pasta.","Tritura pesto.","Mezcla."],"🍝","pesto-pasta"),
    cena:mk("Merluza con brócoli",20,[ing("Merluza",2,"filete"),ing("Brócoli",200,"g"),ing("Limón",0.5,"ud")],["Vapor brócoli.","Plancha merluza.","Limón."],"🐟","fish-broccoli"),
  },
  Jueves:{
    desayuno:mk("Tostada con aguacate",12,[ing("Pan integral",2,"reb"),ing("Aguacate",1,"ud"),ing("Huevos",2,"ud"),ing("Lima",0.5,"ud")],["Tuesta pan.","Aplasta aguacate.","Huevo encima."],"🥑","avocado-toast"),
    comida:mk("Garbanzos con espinacas",30,[ing("Garbanzos cocidos",400,"g"),ing("Espinacas",200,"g"),ing("Cebolla",1,"ud"),ing("Ajo",2,"diente"),ing("Pimentón dulce",5,"g")],["Sofríe cebolla.","Añade especias.","Garbanzos 10 min."],"🌿","chickpea-spinach"),
    cena:mk("Tortilla de patatas",35,[ing("Huevos",6,"ud"),ing("Patatas",3,"ud"),ing("Cebolla",1,"ud")],["Pocha patata 25 min.","Mezcla con huevos.","Cuaja."],"🥔","spanish-tortilla"),
  },
  Viernes:{
    desayuno:mk("Smoothie verde",5,[ing("Espinacas",50,"g"),ing("Manzana",1,"ud"),ing("Plátano",1,"ud"),ing("Leche vegetal",250,"ml"),ing("Nueces",20,"g")],["Tritura.","Frío.","Nueces."],"🥤","green-smoothie"),
    comida:mk("Salmón con quinoa",30,[ing("Salmón",2,"filete"),ing("Quinoa",150,"g"),ing("Brócoli",200,"g"),ing("Limón",0.5,"ud")],["Quinoa 15 min.","Salmón al horno 12 min.","Brócoli al vapor."],"🍣","salmon-quinoa"),
    cena:mk("Pizza de verduras",35,[ing("Base de pizza",2,"ud"),ing("Tomate frito",150,"g"),ing("Mozzarella",200,"g"),ing("Champiñones",100,"g"),ing("Aceitunas",50,"g")],["Tomate en base.","Mozza y verduras.","220°C 12 min."],"🍕","vegetable-pizza"),
  },
  Sábado:{
    desayuno:mk("Tortitas con fruta",20,[ing("Harina",150,"g"),ing("Huevos",2,"ud"),ing("Leche",200,"ml"),ing("Fresas",150,"g"),ing("Sirope",30,"g")],["Mezcla masa.","Sartén.","Fruta y sirope."],"🥞","pancakes-berries"),
    comida:mk("Arroz con marisco",40,[ing("Arroz",200,"g"),ing("Gambas",250,"g"),ing("Mejillones",300,"g"),ing("Caldo de pescado",800,"ml"),ing("Ajo",2,"diente")],["Sofríe ajo.","Arroz y caldo.","18 min."],"🦐","seafood-rice"),
    cena:mk("Hamburguesa casera",30,[ing("Carne picada",300,"g"),ing("Pan de hamburguesa",2,"ud"),ing("Lechuga",50,"g"),ing("Tomate",1,"ud"),ing("Boniato",2,"ud")],["Boniato 25 min.","Plancha carne.","Monta."],"🍔","burger-fries"),
  },
  Domingo:{
    desayuno:mk("Huevos con jamón",10,[ing("Huevos",4,"ud"),ing("Jamón ibérico",60,"g"),ing("Aguacate",1,"ud"),ing("Pan rústico",2,"reb")],["Revuelve huevos.","Añade jamón.","Pan y aguacate."],"🍳","eggs-ham"),
    comida:mk("Pollo al horno",70,[ing("Pollo entero",1,"ud"),ing("Patatas",4,"ud"),ing("Cebolla",2,"ud"),ing("Zanahoria",3,"ud"),ing("Vino blanco",100,"ml")],["Salpimenta.","Verduras alrededor.","190°C 1h."],"🍗","roasted-chicken"),
    cena:mk("Sopa minestrone",35,[ing("Judías blancas",200,"g"),ing("Pasta",80,"g"),ing("Apio",2,"rama"),ing("Tomate frito",200,"g"),ing("Caldo de verduras",800,"ml")],["Pocha verduras.","Caldo y judías.","Pasta al final."],"🍜","minestrone"),
  },
};

const DEFAULT_PANTRY_MENU = [
  pp("Aceite de oliva",500,"ml",100,"Básicos"),pp("Sal",500,"g",100,"Básicos"),pp("Miel",250,"g",30,"Básicos"),pp("Sirope",200,"g",30,"Básicos"),
  pp("Pimentón dulce",50,"g",10,"Especias"),pp("Romero",20,"g",5,"Especias"),
  pp("Pan rústico",6,"reb",2,"Panadería"),pp("Pan integral",6,"reb",2,"Panadería"),pp("Base de pizza",2,"ud",1,"Panadería"),
  pp("Huevos",18,"ud",6,"Frescos"),pp("Leche",1000,"ml",300,"Frescos"),pp("Yogur griego",500,"g",150,"Frescos"),pp("Mozzarella",250,"g",100,"Frescos"),
  pp("Tomate",4,"ud",2,"Verduras"),pp("Cebolla",6,"ud",2,"Verduras"),pp("Ajo",12,"diente",4,"Verduras"),pp("Patatas",1500,"g",300,"Verduras"),pp("Aguacate",3,"ud",1,"Verduras"),pp("Brócoli",500,"g",200,"Verduras"),pp("Espinacas",400,"g",100,"Verduras"),
  pp("Lentejas pardinas",500,"g",150,"Legumbres"),pp("Garbanzos cocidos",800,"g",200,"Legumbres"),
  pp("Arroz",1000,"g",300,"Cereales"),pp("Pasta",500,"g",150,"Cereales"),pp("Quinoa",300,"g",100,"Cereales"),pp("Copos de avena",400,"g",100,"Cereales"),
  pp("Pollo entero",1,"ud",1,"Proteínas"),pp("Muslos de pollo",4,"ud",2,"Proteínas"),pp("Salmón",2,"filete",2,"Proteínas"),pp("Merluza",2,"filete",2,"Proteínas"),pp("Gambas",250,"g",100,"Proteínas"),
  pp("Nueces",150,"g",30,"Frutos secos"),pp("Piñones",80,"g",20,"Frutos secos"),
  pp("Aceitunas",150,"g",50,"Conservas"),pp("Tomate frito",400,"g",100,"Conservas"),pp("Caldo de verduras",1000,"ml",300,"Conservas"),
];

const initMenuData = () => ({ menu:JSON.parse(JSON.stringify(DEFAULT_MENU)), pantryMenu:JSON.parse(JSON.stringify(DEFAULT_PANTRY_MENU)), people:2, updatedAt:Date.now() });

// ─── CLAUDE API ───────────────────────────────────────────────────────────────
async function callClaude(prompt, image) {
  const content = image ? [{ type:"image", source:{ type:"base64", media_type:image.mediaType, data:image.base64 }},{ type:"text", text:prompt }] : prompt;
  const r = await fetch("https://api.anthropic.com/v1/messages",{ method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:2000, messages:[{ role:"user", content }] }) });
  if (!r.ok) throw new Error("API "+r.status);
  const d = await r.json();
  const text = (d.content||[]).map(c=>c.text||"").join("").trim();
  return JSON.parse(text.replace(/```json\s*/g,"").replace(/```/g,"").trim());
}

async function getAlternatives(mode, mt, current, pantry, menu) {
  const avail = pantry.filter(x=>x.qty>0).map(x=>`${x.name} (${x.qty}${x.unit})`).join(", ");
  const week = Object.values(menu).flatMap(d=>Object.values(d).map(x=>x.name)).filter(n=>n!==current.name).slice(0,10).join(", ");
  const restrict = mode==="improvise" ? `RESTRICCIÓN: usa SOLO estos ingredientes: ${avail}` : `Prioriza usar: ${avail}. Puede faltar 1-2.`;
  const prompt = `Chef español. 3 alternativas para ${mt.l.toLowerCase()} (no "${current.name}"). Para 2 personas. ${restrict} Distintas de: ${week}. Solo JSON: {"alternatives":[{"name":"","mins":0,"e":"🍽","iq":"food keywords en","ingredients":[{"name":"","qty":0,"unit":"g"}],"steps":[""]}]}`;
  const r = await callClaude(prompt);
  return (r.alternatives||[]).map(a=>({ name:a.name||"Plato",mins:+a.mins||20,e:a.e||"🍽️",iq:a.iq||"food",ingredients:(a.ingredients||[]).map(i=>({ name:i.name,qty:+i.qty||1,unit:i.unit||"g" })),steps:a.steps||[],status:"pending",consumed:null,improvisedName:"" }));
}

async function readReceipt(image, pantry) {
  const names = pantry.map(x=>x.name).join(", ");
  const prompt = `Foto de tiquet. Extrae productos COMESTIBLES. Para cada uno: name (es), qty, unit (${UNITS.join("|")}), cat (${PANTRY_CATS.join("|")}), threshold (~25% qty). Si coincide con uno existente usa nombre EXACTO: ${names}. IGNORA totales, IVA, bolsas. Solo JSON: {"items":[{"name":"","qty":1,"unit":"ud","cat":"Otros","threshold":1}]}`;
  const r = await callClaude(prompt, image);
  return (r.items||[]).map(i=>({ name:i.name||"Producto",qty:+i.qty||1,unit:i.unit||"ud",cat:PANTRY_CATS.includes(i.cat)?i.cat:"Otros",threshold:+i.threshold||Math.max(1,Math.floor((+i.qty||1)*0.25)),include:true }));
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const MENU_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;700&family=Outfit:wght@400;500;600;700&display=swap');
.fd{font-family:'Bricolage Grotesque',sans-serif;letter-spacing:-.02em;font-weight:700}
.fb{font-family:'Outfit',sans-serif}
.fm{font-family:'Outfit',sans-serif;font-weight:500;letter-spacing:.04em}
@keyframes fu{from{opacity:0;transform:translateY(6px)}to{opacity:1}}
.fu{animation:fu .3s ease-out both}
@keyframes sh{0%{background-position:-400px 0}100%{background-position:400px 0}}
.sh{background:linear-gradient(90deg,#f0f0f0,#f8f8f8,#f0f0f0);background-size:800px 100%;animation:sh 1.4s linear infinite}
.sx::-webkit-scrollbar{display:none}.sx{scrollbar-width:none}
input[type=range].ps{appearance:none;-webkit-appearance:none;width:100%;height:8px;border-radius:99px;outline:none;cursor:pointer;background:linear-gradient(to right,#FF5C4D,#E91E63,#8B5CF6)}
input[type=range].ps::-webkit-slider-thumb{appearance:none;-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:#fff;border:3px solid #FF5C4D;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.18)}
`;

// ══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  // ── Family state (Firebase) ──────────────────────────────────────────────
  const [users, setUsers]               = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [tasks, setTasks]               = useState([]);
  const [budgets, setBudgets]           = useState(DEFAULT_BUDGETS);
  const [fbLoading, setFbLoading]       = useState(true);
  const [currentUser, setCurrentUser]   = useState(null);
  const [loginStep, setLoginStep]       = useState({ selectUser:true, selectedUser:null });
  const [pinInput, setPinInput]         = useState("");
  const [pinError, setPinError]         = useState(false);

  // ── Menu state (shared storage) ──────────────────────────────────────────
  const [menuData, setMenuData]   = useState(initMenuData);
  const [menuLoaded, setMenuLoaded] = useState(false);
  const [, setSynced]             = useState(Date.now());
  const menuRef = useRef(0);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [appSection, setAppSection] = useState("family"); // family | menu
  const [familyScreen, setFamilyScreen] = useState("home"); // home | finance | tasks | settings
  const [menuView, setMenuView]   = useState("menu"); // menu | pantry | shopping
  const [dayIdx, setDayIdx]       = useState(0);
  const [openMeal, setOpenMeal]   = useState(null);
  const [swapMeal, setSwapMeal]   = useState(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [modal, setModal]         = useState(null);
  const [toast, setToast]         = useState(null);

  // ── Firebase init ────────────────────────────────────────────────────────
  useEffect(() => {
    const seed = async () => {
      const uSnap = await getDocs(collection(db,"users"));
      if (uSnap.empty) for (const u of DEFAULT_USERS) await setDoc(doc(db,"users",u.id), u);
      const bSnap = await getDocs(collection(db,"config"));
      if (bSnap.empty) await setDoc(doc(db,"config","budgets"), DEFAULT_BUDGETS);
    };
    seed();
    const u1 = onSnapshot(collection(db,"users"),        s=>setUsers(s.docs.map(d=>({...d.data(),id:d.id}))));
    const u2 = onSnapshot(collection(db,"transactions"), s=>setTransactions(s.docs.map(d=>({...d.data(),id:d.id}))));
    const u3 = onSnapshot(collection(db,"tasks"),        s=>setTasks(s.docs.map(d=>({...d.data(),id:d.id}))));
    const u4 = onSnapshot(doc(db,"config","budgets"),    s=>{ if(s.exists()) setBudgets(s.data()); setFbLoading(false); });
    return () => { u1(); u2(); u3(); u4(); };
  }, []);

  // ── Menu shared storage ──────────────────────────────────────────────────
  useEffect(() => {
    let cancel = false;
    const load = async () => {
      try {
        const r = await window.storage?.get(MENU_KEY, true);
        if (cancel) return;
        if (r?.value) {
          const parsed = typeof r.value==="string" ? JSON.parse(r.value) : r.value;
          if (parsed.updatedAt > menuRef.current) { setMenuData({ ...initMenuData(), ...parsed }); menuRef.current = parsed.updatedAt; setSynced(Date.now()); }
        }
      } catch {}
      if (!cancel) setMenuLoaded(true);
    };
    load();
    const t = setInterval(load, 4000);
    return () => { cancel=true; clearInterval(t); };
  }, []);

  const saveMenu = useCallback(async d => {
    const s = { ...d, updatedAt:Date.now() };
    setMenuData(s); menuRef.current = s.updatedAt;
    try { await window.storage?.set(MENU_KEY, JSON.stringify(s), true); setSynced(Date.now()); } catch {}
  }, []);

  function showToast(msg, color="#22C55E") { setToast({msg,color}); setTimeout(()=>setToast(null),2500); }

  // ── Auth ─────────────────────────────────────────────────────────────────
  function selectUser(u) { setLoginStep({selectUser:false,selectedUser:u}); setPinInput(""); setPinError(false); }
  function pinDigit(d) {
    if (pinInput.length>=4) return;
    const next=pinInput+d; setPinInput(next);
    if (next.length===4) setTimeout(()=>{
      if (next===loginStep.selectedUser.pin) { setCurrentUser(loginStep.selectedUser); setLoginStep({selectUser:true,selectedUser:null}); setPinInput(""); setPinError(false); }
      else { setPinError(true); setPinInput(""); }
    },200);
  }
  function logout() { setCurrentUser(null); setLoginStep({selectUser:true,selectedUser:null}); setAppSection("family"); setFamilyScreen("home"); }

  const isAdmin = currentUser?.role==="admin";
  const totalIncome  = transactions.filter(t=>t.type==="income").reduce((a,t)=>a+t.amount,0);
  const totalExpense = transactions.filter(t=>t.type==="expense").reduce((a,t)=>a+t.amount,0);
  const balance      = totalIncome-totalExpense;
  const myTasks      = () => isAdmin ? tasks : tasks.filter(t=>t.assignedTo===currentUser?.id);
  const getUser      = id => users.find(u=>u.id===id);
  const expByCat     = () => { const m={}; transactions.filter(t=>t.type==="expense").forEach(t=>{ m[t.category]=(m[t.category]||0)+t.amount; }); return m; };

  // ── Menu actions ─────────────────────────────────────────────────────────
  const updateMealItem = useCallback((day,k,nm) => {
    setMenuData(c => {
      const old=c.menu[day][k]; let pm=c.pantryMenu;
      if(old.consumed) pm=applyDelta(pm,old.consumed,+1);
      if(nm.consumed)  pm=applyDelta(pm,nm.consumed,-1);
      const next={...c,menu:{...c.menu,[day]:{...c.menu[day],[k]:nm}},pantryMenu:pm};
      saveMenu(next); return next;
    });
  },[saveMenu]);

  const swapMealItem = useCallback((day,k,nm) => {
    setMenuData(c => {
      const old=c.menu[day][k]; let pm=c.pantryMenu;
      if(old.consumed) pm=applyDelta(pm,old.consumed,+1);
      const next={...c,menu:{...c.menu,[day]:{...c.menu[day],[k]:{...nm,status:"pending",consumed:null,improvisedName:""}}},pantryMenu:pm};
      saveMenu(next); return next;
    });
  },[saveMenu]);

  const updPantryMenu = useCallback((id,ch) => setMenuData(c=>{ const n={...c,pantryMenu:c.pantryMenu.map(p=>p.id===id?{...p,...ch}:p)}; saveMenu(n); return n; }),[saveMenu]);
  const addPantryMenu = useCallback(it => setMenuData(c=>{ const n={...c,pantryMenu:[...c.pantryMenu,it]}; saveMenu(n); return n; }),[saveMenu]);
  const delPantryMenu = useCallback(id => setMenuData(c=>{ const n={...c,pantryMenu:c.pantryMenu.filter(p=>p.id!==id)}; saveMenu(n); return n; }),[saveMenu]);
  const addReceiptMenu = useCallback(items => {
    setMenuData(c => {
      let pm=[...c.pantryMenu.map(x=>({...x}))];
      items.forEach(it=>{ const idx=pm.findIndex(p=>norm(p.name)===norm(it.name)); if(idx>=0) pm[idx].qty=+(pm[idx].qty+(+it.qty||0)).toFixed(2); else pm.push({id:norm(it.name).replace(/\s+/g,"-")+"-"+Date.now(),name:it.name,qty:+it.qty||1,unit:it.unit||"ud",threshold:+it.threshold||1,cat:it.cat||"Otros"}); });
      const n={...c,pantryMenu:pm}; saveMenu(n); return n;
    });
    setReceiptOpen(false);
  },[saveMenu]);
  const setPeople = useCallback(p=>setMenuData(c=>{ const n={...c,people:p}; saveMenu(n); return n; }),[saveMenu]);
  const resetMenu = useCallback(()=>{ if(window.confirm("¿Reiniciar la semana?")) saveMenu(initMenuData()); },[saveMenu]);
  const lowN = useMemo(()=>lowItems(menuData.pantryMenu).length,[menuData.pantryMenu]);

  const loading = fbLoading || !menuLoaded;

  if (loading) return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#F8FAFC"}}>
      <style>{MENU_STYLES}</style>
      <div style={{fontSize:56,marginBottom:16}}>🏡</div>
      <Loader2 className="w-6 h-6 animate-spin text-rose-500" />
      <p style={{color:"#64748B",marginTop:12,fontWeight:600}} className="fm">Cargando OrdenYourLife…</p>
    </div>
  );

  // ── LOGIN ────────────────────────────────────────────────────────────────
  if (!currentUser) return (
    <div style={S.root}>
      <style>{MENU_STYLES}</style>
      <div style={S.loginWrap}>
        <div style={S.loginBox}>
          <div style={{fontSize:56}}>🏡</div>
          <h1 style={S.loginTitle}>OrdenYourLife</h1>
          <p style={{color:"#64748B",fontSize:14,marginBottom:24}} className="fm">Tu organización familiar</p>
          {loginStep.selectUser ? (
            <>
              <p style={{color:"#64748B",marginBottom:14,fontSize:14}} className="fm">¿Quién eres tú?</p>
              {users.map(u=>(
                <button key={u.id} onClick={()=>selectUser(u)} style={{...S.userCard,borderColor:u.color}}>
                  <span style={{fontSize:32}}>{u.emoji}</span>
                  <div style={{flex:1,textAlign:"left"}}>
                    <div style={{fontWeight:700,color:"#1E293B"}} className="fb">{u.name}</div>
                    <div style={{fontSize:11,color:u.color}} className="fm">{u.role==="admin"?"Administrador":"Miembro"}</div>
                  </div>
                  <span style={{color:"#CBD5E1"}}>→</span>
                </button>
              ))}
            </>
          ) : (
            <>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
                <button onClick={()=>{setLoginStep({selectUser:true,selectedUser:null});setPinInput("");setPinError(false);}} style={{background:"transparent",border:"none",fontSize:20,cursor:"pointer",color:"#64748B"}}>←</button>
                <span style={{fontSize:28}}>{loginStep.selectedUser.emoji}</span>
                <span style={{fontWeight:700,fontSize:18,color:"#1E293B"}} className="fb">{loginStep.selectedUser.name}</span>
              </div>
              <p style={{color:"#64748B",marginBottom:16,fontSize:14}} className="fm">PIN de 4 dígitos</p>
              <div style={{display:"flex",gap:14,justifyContent:"center",marginBottom:16}}>
                {[0,1,2,3].map(i=><div key={i} style={{width:18,height:18,borderRadius:"50%",border:`2px solid ${pinError?"#EF4444":loginStep.selectedUser.color}`,background:i<pinInput.length?loginStep.selectedUser.color:"transparent",transition:"all 0.15s"}}/>)}
              </div>
              {pinError && <p style={{color:"#EF4444",fontSize:13,marginBottom:8}} className="fm">PIN incorrecto.</p>}
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,maxWidth:240,margin:"0 auto"}}>
                {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((d,i)=>(
                  <button key={i} onClick={()=>{ if(d==="⌫"){setPinInput(p=>p.slice(0,-1));setPinError(false);}else if(d!=="")pinDigit(String(d)); }} disabled={d===""}
                    style={{padding:"14px 0",fontSize:20,fontWeight:700,borderRadius:12,border:d===""?"none":`2px solid ${loginStep.selectedUser.color}`,background:d===""?"transparent":"#F8FAFC",cursor:d===""?"default":"pointer",color:"#1E293B"}} className="fd">{d}</button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  // ── MAIN APP ─────────────────────────────────────────────────────────────
  return (
    <div style={S.root}>
      <style>{MENU_STYLES}</style>
      {toast && <div style={{...S.toast,background:toast.color}} className="fm">{toast.msg}</div>}
      {modal && <FamilyModal modal={modal} setModal={setModal} users={users} budgets={budgets} currentUser={currentUser} showToast={showToast}/>}
      {openMeal && (
        <MealModal day={DAYS[dayIdx]} mt={MEAL_TYPES.find(m=>m.k===openMeal.k)} meal={menuData.menu[DAYS[dayIdx]][openMeal.k]}
          pantry={menuData.pantryMenu} people={menuData.people}
          onSave={nm=>{ updateMealItem(DAYS[dayIdx],openMeal.k,nm); setOpenMeal(null); }}
          onSwap={()=>setSwapMeal({d:DAYS[dayIdx],k:openMeal.k})}
          onClose={()=>setOpenMeal(null)}/>
      )}
      {swapMeal && (
        <SwapModal mt={MEAL_TYPES.find(m=>m.k===swapMeal.k)} current={menuData.menu[swapMeal.d][swapMeal.k]}
          pantry={menuData.pantryMenu} menu={menuData.menu}
          onPick={nm=>{ swapMealItem(swapMeal.d,swapMeal.k,nm); setSwapMeal(null); setOpenMeal(null); }}
          onClose={()=>setSwapMeal(null)}/>
      )}
      {receiptOpen && <ReceiptModal pantry={menuData.pantryMenu} onConfirm={addReceiptMenu} onClose={()=>setReceiptOpen(false)}/>}

      {/* Header */}
      <header style={{...S.header,background:currentUser.color}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:32}}>{currentUser.emoji}</span>
          <div>
            <div style={{fontWeight:700,fontSize:17,color:"#fff"}} className="fb">{currentUser.name}</div>
            <div style={{fontSize:11,opacity:0.8,color:"#fff"}} className="fm">{isAdmin?"Administrador":"Miembro"}</div>
          </div>
        </div>
        <button onClick={logout} style={{background:"rgba(255,255,255,0.2)",border:"none",borderRadius:10,padding:"6px 10px",fontSize:18,cursor:"pointer"}}>🚪</button>
      </header>

      {/* Section switcher */}
      <div style={{display:"flex",gap:0,background:"#fff",borderBottom:"2px solid #F1F5F9",position:"sticky",top:0,zIndex:50}}>
        {[["family","🏠 Familia"],["menu","🍽️ Menú"]].map(([k,l])=>(
          <button key={k} onClick={()=>setAppSection(k)}
            style={{flex:1,padding:"12px 0",border:"none",borderBottom:`3px solid ${appSection===k?currentUser.color:"transparent"}`,background:"transparent",fontWeight:700,fontSize:14,color:appSection===k?currentUser.color:"#94A3B8",cursor:"pointer",transition:"all 0.2s"}} className="fm">
            {l}
          </button>
        ))}
      </div>

      {/* ── FAMILY SECTION ── */}
      {appSection==="family" && (
        <div style={S.appWrap}>
          <main style={S.main}>
            {familyScreen==="home"     && <HomeScreen     currentUser={currentUser} isAdmin={isAdmin} balance={balance} totalIncome={totalIncome} totalExpense={totalExpense} myTasks={myTasks()} transactions={transactions} setScreen={setFamilyScreen} setModal={setModal} getUser={getUser} showToast={showToast}/>}
            {familyScreen==="finance"  && <FinanceScreen  currentUser={currentUser} isAdmin={isAdmin} balance={balance} totalIncome={totalIncome} totalExpense={totalExpense} transactions={transactions} budgets={budgets} expByCat={expByCat()} setModal={setModal} showToast={showToast} getUser={getUser}/>}
            {familyScreen==="tasks"    && <TasksScreen    currentUser={currentUser} isAdmin={isAdmin} myTasks={myTasks()} setModal={setModal} showToast={showToast} getUser={getUser}/>}
            {familyScreen==="settings" && <SettingsScreen currentUser={currentUser} isAdmin={isAdmin} users={users} showToast={showToast} setCurrentUser={setCurrentUser}/>}
          </main>
          <nav style={S.nav}>
            {[["home","🏠","Inicio"],["finance","💰","Finanzas"],["tasks","✅","Tareas"],["settings","⚙️","Ajustes"]].map(([k,ic,lb])=>(
              <button key={k} onClick={()=>setFamilyScreen(k)} style={{...S.navBtn,...(familyScreen===k?{color:currentUser.color,borderTop:`2px solid ${currentUser.color}`}:{})}}>
                <span style={{fontSize:20}}>{ic}</span><span style={{fontSize:10,fontWeight:600}}>{lb}</span>
              </button>
            ))}
          </nav>
        </div>
      )}

      {/* ── MENU SECTION ── */}
      {appSection==="menu" && (
        <div style={{...S.appWrap,background:"#FFF9F0"}}>
          <main style={{...S.main,paddingBottom:100}}>
            {/* Menu sub-nav */}
            <nav className="flex gap-1 mb-5 bg-white p-1.5 rounded-2xl border border-gray-200 shadow-sm" style={{marginTop:16}}>
              {[
                {k:"menu",l:"Menú",I:CalendarDays,c:"#FF5C4D"},
                {k:"pantry",l:"Despensa",I:Package,c:"#04A37C",b:lowN},
                {k:"shopping",l:"Compra",I:ShoppingBasket,c:"#8B5CF6"},
              ].map(t=>(
                <button key={t.k} onClick={()=>setMenuView(t.k)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl fm text-[10px] uppercase font-semibold relative transition-colors"
                  style={{background:menuView===t.k?t.c:"transparent",color:menuView===t.k?"white":"#6B6B82"}}>
                  <t.I className="w-3.5 h-3.5"/><span>{t.l}</span>
                  {t.b>0 && <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-400 text-white text-[10px] font-bold flex items-center justify-center shadow border-2 border-white">{t.b}</span>}
                </button>
              ))}
            </nav>

            {/* People slider */}
            <PeopleSlider people={menuData.people} onChange={setPeople}/>

            {menuView==="menu" && (
              <div className="fu">
                <div className="flex gap-1.5 overflow-x-auto sx mb-4 -mx-4 px-4 pb-1">
                  {DAYS.map((d,i)=>{
                    const dc=DAY_COLOR[i];
                    const done=Object.values(menuData.menu[d]).filter(m=>m.status!=="pending").length;
                    return (
                      <button key={d} onClick={()=>setDayIdx(i)} className="shrink-0 px-3 py-2 rounded-2xl text-center min-w-[58px] shadow-sm transition-all"
                        style={{background:dayIdx===i?dc:"white",color:dayIdx===i?"white":dc,border:`2px solid ${dayIdx===i?dc:dc+"30"}`}}>
                        <div className="fm text-[9px] uppercase opacity-80 font-bold">{DAY_SHORT[i]}</div>
                        <div className="fd text-lg leading-none mt-0.5">{i+1}</div>
                        <div className="flex justify-center gap-0.5 mt-1">{[0,1,2].map(j=><span key={j} className="w-1 h-1 rounded-full" style={{background:j<done?(dayIdx===i?"white":"#06C99B"):(dayIdx===i?"rgba(255,255,255,0.4)":"rgba(0,0,0,0.15)")}}/>)}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full" style={{background:DAY_COLOR[dayIdx]}}/>
                  <h2 className="fd text-3xl" style={{color:DAY_COLOR[dayIdx]}}>{DAYS[dayIdx]}</h2>
                  <button onClick={resetMenu} className="ml-auto fm text-[9px] uppercase text-gray-400 flex items-center gap-1"><RefreshCw className="w-2.5 h-2.5"/>Reiniciar</button>
                </div>
                <div className="space-y-3">
                  {MEAL_TYPES.map(mt=>(
                    <MealCard key={mt.k} meal={menuData.menu[DAYS[dayIdx]][mt.k]} mt={mt} onClick={()=>setOpenMeal({d:DAYS[dayIdx],k:mt.k})}/>
                  ))}
                </div>
              </div>
            )}
            {menuView==="pantry" && (
              <div className="fu">
                <PantryView pantry={menuData.pantryMenu} onUpd={updPantryMenu} onAdd={addPantryMenu} onDel={delPantryMenu} onReceipt={()=>setReceiptOpen(true)}/>
              </div>
            )}
            {menuView==="shopping" && (
              <div className="fu">
                <ShoppingView pantry={menuData.pantryMenu} menu={menuData.menu} people={menuData.people}/>
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// FAMILY SCREENS
// ══════════════════════════════════════════════════════════════════════════════
function HomeScreen({currentUser,isAdmin,balance,totalIncome,totalExpense,myTasks,transactions,setScreen,setModal,getUser}) {
  const pending=myTasks.filter(t=>!t.done); const done=myTasks.filter(t=>t.done);
  return (
    <div>
      <h2 style={S.title} className="fd">Hola, {currentUser.name} {currentUser.emoji}</h2>
      <p style={{color:"#64748B",marginBottom:20,fontSize:14}} className="fm">Resumen familiar</p>
      {isAdmin && (
        <div style={{...S.card,background:`linear-gradient(135deg,${currentUser.color},#1E293B)`,color:"#fff",marginBottom:16}}>
          <div style={{fontSize:12,opacity:0.8}} className="fm">Balance familiar</div>
          <div style={{fontSize:32,fontWeight:800,margin:"6px 0"}} className="fd">{balance>=0?"+":""}{balance.toLocaleString("es-ES")} €</div>
          <div style={{display:"flex",gap:24}}>
            <div><div style={{fontSize:11,opacity:0.7}} className="fm">Ingresos</div><div style={{fontWeight:700}} className="fb">+{totalIncome.toLocaleString("es-ES")} €</div></div>
            <div><div style={{fontSize:11,opacity:0.7}} className="fm">Gastos</div><div style={{fontWeight:700}} className="fb">-{totalExpense.toLocaleString("es-ES")} €</div></div>
          </div>
        </div>
      )}
      <div style={{display:"flex",gap:10,marginBottom:16}}>
        {isAdmin && <>
          <button style={{...S.qBtn,borderColor:currentUser.color}} onClick={()=>setModal({type:"addTx",data:{t:"income"}})}><span>📈</span><span className="fm">Ingreso</span></button>
          <button style={{...S.qBtn,borderColor:currentUser.color}} onClick={()=>setModal({type:"addTx",data:{t:"expense"}})}><span>📉</span><span className="fm">Gasto</span></button>
        </>}
        <button style={{...S.qBtn,borderColor:currentUser.color}} onClick={()=>setModal({type:"addTask"})}><span>✅</span><span className="fm">Tarea</span></button>
      </div>
      <div style={S.card}>
        <div style={S.cardHead}><span style={S.cardTitle} className="fb">Mis tareas</span>
          <button style={{...S.link,color:currentUser.color}} onClick={()=>setScreen("tasks")} className="fm">Ver todas →</button>
        </div>
        {pending.length===0 && <p style={S.empty} className="fm">🎉 ¡Sin tareas pendientes!</p>}
        {pending.slice(0,3).map(t=><TaskRow key={t.id} task={t} currentUser={currentUser} getUser={getUser} isAdmin={isAdmin} compact/>)}
        {done.length>0 && <div style={{fontSize:12,color:"#94A3B8",marginTop:8}} className="fm">✔️ {done.length} completada{done.length>1?"s":""}</div>}
      </div>
      {isAdmin && (
        <div style={S.card}>
          <div style={S.cardHead}><span style={S.cardTitle} className="fb">Últimos movimientos</span>
            <button style={{...S.link,color:currentUser.color}} onClick={()=>setScreen("finance")} className="fm">Ver todos →</button>
          </div>
          {[...transactions].sort((a,b)=>b.date>a.date?1:-1).slice(0,3).map(tx=>(
            <div key={tx.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #F1F5F9"}}>
              <div><div style={{fontWeight:600,fontSize:14,color:"#1E293B"}} className="fb">{tx.category}</div><div style={{fontSize:11,color:"#94A3B8"}} className="fm">{getUser(tx.userId)?.emoji} {tx.date}</div></div>
              <span style={{fontWeight:700,color:tx.type==="income"?"#22C55E":"#EF4444"}} className="fb">{tx.type==="income"?"+":"-"}{tx.amount.toLocaleString("es-ES")} €</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FinanceScreen({currentUser,isAdmin,balance,totalIncome,totalExpense,transactions,budgets,expByCat,setModal,showToast,getUser}) {
  const [tab,setTab]=useState("mov");
  if (!isAdmin) return <div style={{textAlign:"center",padding:60}}><div style={{fontSize:48}}>🔒</div><p style={{color:"#64748B",marginTop:12}} className="fm">Solo los administradores pueden ver las finanzas.</p></div>;
  async function delTx(id){ await deleteDoc(doc(db,"transactions",id)); showToast("Eliminado","#EF4444"); }
  return (
    <div>
      <div style={S.scrHead}>
        <h2 style={S.title} className="fd">Finanzas 💰</h2>
        <button style={{...S.addBtn,background:currentUser.color}} onClick={()=>setModal({type:"addTx"})}>＋</button>
      </div>
      <div style={{display:"flex",gap:10,marginBottom:16}}>
        {[["Ingresos","#22C55E",`+${totalIncome.toLocaleString("es-ES")} €`],["Gastos","#EF4444",`-${totalExpense.toLocaleString("es-ES")} €`],["Balance",currentUser.color,`${balance>=0?"+":""}${balance.toLocaleString("es-ES")} €`]].map(([l,c,v])=>(
          <div key={l} style={{flex:1,background:"#fff",borderRadius:14,padding:12,borderLeft:`3px solid ${c}`,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
            <div style={{fontSize:11,color:"#64748B"}} className="fm">{l}</div>
            <div style={{fontSize:16,fontWeight:800,color:c}} className="fd">{v}</div>
          </div>
        ))}
      </div>
      <div style={S.tabs}>
        {[["mov","Movimientos"],["bud","Presupuesto"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{...S.tabBtn,...(tab===k?{borderBottomColor:currentUser.color,color:currentUser.color}:{})}} className="fm">{l}</button>
        ))}
      </div>
      {tab==="mov" && (
        <div>
          {transactions.length===0 && <p style={S.empty} className="fm">Sin movimientos aún.</p>}
          {[...transactions].sort((a,b)=>b.date>a.date?1:-1).map(tx=>(
            <div key={tx.id} style={{...S.card,borderLeft:`4px solid ${tx.type==="income"?"#22C55E":"#EF4444"}`,padding:"12px 14px",marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontWeight:600,color:"#1E293B"}} className="fb">{tx.category}</div>
                  {tx.note && <div style={{fontSize:12,color:"#64748B"}} className="fm">{tx.note}</div>}
                  <div style={{fontSize:11,color:"#94A3B8",marginTop:2}} className="fm">{tx.date} · {getUser(tx.userId)?.emoji} {getUser(tx.userId)?.name}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontWeight:800,color:tx.type==="income"?"#22C55E":"#EF4444",fontSize:16}} className="fd">{tx.type==="income"?"+":"-"}{tx.amount.toLocaleString("es-ES")} €</span>
                  <button onClick={()=>delTx(tx.id)} style={S.iconBtn}>🗑️</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {tab==="bud" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <p style={{color:"#64748B",fontSize:13}} className="fm">Gasto por categoría</p>
            <button style={{...S.addBtn,background:currentUser.color,fontSize:12,padding:"4px 10px"}} onClick={()=>setModal({type:"editBudget",data:budgets})} className="fm">✏️ Editar</button>
          </div>
          {Object.entries(budgets).map(([cat,budget])=>{
            const spent=expByCat[cat]||0; const pct=Math.min((spent/budget)*100,100); const over=spent>budget;
            return (
              <div key={cat} style={{...S.card,marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                  <span style={{fontWeight:600,color:"#1E293B"}} className="fb">{cat}</span>
                  <span style={{fontSize:13,color:over?"#EF4444":"#64748B"}} className="fm">{spent.toLocaleString("es-ES")} / {budget.toLocaleString("es-ES")} €{over?" ⚠️":""}</span>
                </div>
                <div style={{height:8,background:"#F1F5F9",borderRadius:99,overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,borderRadius:99,background:over?"#EF4444":pct>80?"#F59E0B":"#22C55E",transition:"width 0.5s"}}/></div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TasksScreen({currentUser,isAdmin,myTasks,setModal,showToast,getUser}) {
  const [filter,setFilter]=useState("all");
  const filtered=myTasks.filter(t=>filter==="all"?true:filter==="pending"?!t.done:t.done);
  return (
    <div>
      <div style={S.scrHead}>
        <h2 style={S.title} className="fd">Tareas ✅</h2>
        {isAdmin && <button style={{...S.addBtn,background:currentUser.color}} onClick={()=>setModal({type:"addTask"})}>＋</button>}
      </div>
      <div style={S.tabs}>
        {[["all","Todas"],["pending","Pendientes"],["done","Hechas"]].map(([k,l])=>(
          <button key={k} onClick={()=>setFilter(k)} style={{...S.tabBtn,...(filter===k?{borderBottomColor:currentUser.color,color:currentUser.color}:{})}} className="fm">{l}</button>
        ))}
      </div>
      {filtered.length===0 && <p style={S.empty} className="fm">No hay tareas aquí.</p>}
      {filtered.map(t=><TaskRow key={t.id} task={t} currentUser={currentUser} getUser={getUser} isAdmin={isAdmin} showToast={showToast}/>)}
    </div>
  );
}

function TaskRow({task,currentUser,getUser,isAdmin,compact,showToast}) {
  const assignee=getUser(task.assignedTo);
  const overdue=!task.done&&task.dueDate<new Date().toISOString().slice(0,10);
  async function toggle(){ await updateDoc(doc(db,"tasks",task.id),{done:!task.done}); if(showToast) showToast(task.done?"Tarea reabierta":"¡Completada! 🎉"); }
  async function del(){ await deleteDoc(doc(db,"tasks",task.id)); if(showToast) showToast("Eliminada","#EF4444"); }
  return (
    <div style={{...S.card,borderLeft:`4px solid ${PCOLOR[task.priority]}`,opacity:task.done?0.6:1,marginBottom:10,padding:"12px 14px"}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
        <button onClick={toggle} style={{width:22,height:22,borderRadius:6,border:`2px solid ${currentUser.color}`,background:task.done?currentUser.color:"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,marginTop:2}}>
          {task.done && <span style={{color:"#fff",fontSize:12}}>✔</span>}
        </button>
        <div style={{flex:1}}>
          <div style={{fontWeight:600,color:"#1E293B",textDecoration:task.done?"line-through":"none"}} className="fb">{task.title}</div>
          {!compact && <div style={{display:"flex",gap:8,marginTop:4,flexWrap:"wrap"}}>
            <span style={{fontSize:11,color:"#64748B"}} className="fm">📅 {task.dueDate}</span>
            {overdue && <span style={{fontSize:11,color:"#EF4444",fontWeight:600}} className="fm">⚠️ Atrasada</span>}
            <span style={{fontSize:11,color:"#64748B"}} className="fm">{assignee?.emoji} {assignee?.name}</span>
            <span style={{fontSize:11,fontWeight:600,color:PCOLOR[task.priority]}} className="fm">● {task.priority}</span>
          </div>}
          {compact && assignee && <div style={{fontSize:11,color:"#64748B"}} className="fm">{assignee.emoji} {assignee.name} · {task.dueDate}</div>}
        </div>
        {isAdmin && !compact && <button onClick={del} style={S.iconBtn}>🗑️</button>}
      </div>
    </div>
  );
}

function SettingsScreen({currentUser,isAdmin,users,showToast,setCurrentUser}) {
  const [editUser,setEditUser]=useState(null); const [form,setForm]=useState({});
  const EMOJIS=["👩","👨","🧒","👧","👦","🧑","👴","👵","🧔","👱"];
  async function save(){
    if(!form.name||form.pin.length!==4){showToast("Nombre y PIN de 4 dígitos requeridos","#EF4444");return;}
    await updateDoc(doc(db,"users",editUser.id),form);
    if(editUser.id===currentUser.id) setCurrentUser(u=>({...u,...form}));
    setEditUser(null); showToast("Perfil actualizado ✅");
  }
  return (
    <div>
      <h2 style={S.title} className="fd">Ajustes ⚙️</h2>
      {editUser ? (
        <div style={S.card}>
          <h3 style={{marginBottom:16,color:"#1E293B"}} className="fb">Editar perfil</h3>
          <label style={S.lbl} className="fm">Nombre</label>
          <input style={S.inp} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} className="fb"/>
          <label style={S.lbl} className="fm">PIN (4 dígitos)</label>
          <input style={S.inp} type="password" maxLength={4} value={form.pin} onChange={e=>setForm(f=>({...f,pin:e.target.value.replace(/\D/g,"").slice(0,4)}))} className="fb"/>
          <label style={S.lbl} className="fm">Emoji</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
            {EMOJIS.map(em=><button key={em} onClick={()=>setForm(f=>({...f,emoji:em}))} style={{fontSize:22,padding:4,border:form.emoji===em?`2px solid ${currentUser.color}`:"2px solid transparent",borderRadius:8,background:"transparent",cursor:"pointer"}}>{em}</button>)}
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={save} style={{...S.saveBtn,background:currentUser.color,flex:1}} className="fm">Guardar</button>
            <button onClick={()=>setEditUser(null)} style={{...S.saveBtn,background:"#F1F5F9",color:"#64748B",flex:1}} className="fm">Cancelar</button>
          </div>
        </div>
      ) : (
        <div style={S.card}>
          <span style={S.cardTitle} className="fb">Perfiles de familia</span>
          {users.map(u=>(
            <div key={u.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #F1F5F9"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:28}}>{u.emoji}</span>
                <div><div style={{fontWeight:600,color:"#1E293B"}} className="fb">{u.name}</div><div style={{fontSize:11,color:u.color,fontWeight:500}} className="fm">{u.role==="admin"?"Admin":"Miembro"}</div></div>
              </div>
              {(isAdmin||u.id===currentUser.id) && <button onClick={()=>{setEditUser(u);setForm({name:u.name,pin:u.pin,emoji:u.emoji});}} style={S.iconBtn}>✏️</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FamilyModal({modal,setModal,users,budgets,currentUser,showToast}) {
  const close=()=>setModal(null);
  const W=({title,children})=>(
    <div style={S.overlay} onClick={e=>{if(e.target===e.currentTarget)close();}}>
      <div style={S.mbox}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <span style={{fontWeight:700,fontSize:17,color:"#1E293B"}} className="fb">{title}</span>
          <button onClick={close} style={{background:"#F1F5F9",border:"none",borderRadius:"50%",width:32,height:32,cursor:"pointer",fontSize:16,color:"#64748B"}}>✕</button>
        </div>{children}
      </div>
    </div>
  );
  if (modal.type==="addTx") return <AddTxModal W={W} close={close} currentUser={currentUser} showToast={showToast} initType={modal.data?.t}/>;
  if (modal.type==="addTask") return <AddTaskModal W={W} close={close} users={users} currentUser={currentUser} showToast={showToast}/>;
  if (modal.type==="editBudget") return <EditBudgetModal W={W} close={close} budgets={budgets} currentUser={currentUser} showToast={showToast}/>;
  return null;
}

function AddTxModal({W,close,currentUser,showToast,initType}) {
  const [form,setForm]=useState({type:initType||"expense",category:"",amount:"",note:"",date:new Date().toISOString().slice(0,10)});
  const cats=form.type==="income"?INCOME_CATS:EXPENSE_CATS;
  async function submit(){
    if(!form.category||!form.amount||isNaN(Number(form.amount))){showToast("Completa categoría e importe","#EF4444");return;}
    const id=`tx_${Date.now()}`;
    await setDoc(doc(db,"transactions",id),{...form,amount:Number(form.amount),userId:currentUser.id,id});
    showToast(form.type==="income"?"Ingreso añadido 📈":"Gasto registrado 📉"); close();
  }
  return (
    <W title={form.type==="income"?"Añadir ingreso":"Añadir gasto"}>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {["income","expense"].map(t=>(
          <button key={t} onClick={()=>setForm(f=>({...f,type:t,category:""}))} style={{flex:1,padding:"10px 0",border:"none",borderRadius:10,fontWeight:600,fontSize:14,cursor:"pointer",background:form.type===t?(t==="income"?"#22C55E":"#EF4444"):"#F1F5F9",color:form.type===t?"#fff":"#64748B"}} className="fm">
            {t==="income"?"📈 Ingreso":"📉 Gasto"}
          </button>
        ))}
      </div>
      <label style={S.lbl} className="fm">Categoría</label>
      <select style={S.inp} value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} className="fb"><option value="">Seleccionar…</option>{cats.map(c=><option key={c} value={c}>{c}</option>)}</select>
      <label style={S.lbl} className="fm">Importe (€)</label>
      <input style={S.inp} type="number" placeholder="0.00" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} className="fb"/>
      <label style={S.lbl} className="fm">Nota (opcional)</label>
      <input style={S.inp} placeholder="Descripción…" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} className="fb"/>
      <label style={S.lbl} className="fm">Fecha</label>
      <input style={S.inp} type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} className="fb"/>
      <button onClick={submit} style={{...S.saveBtn,background:currentUser.color,width:"100%"}} className="fm">Guardar</button>
    </W>
  );
}

function AddTaskModal({W,close,users,currentUser,showToast}) {
  const [form,setForm]=useState({title:"",assignedTo:users[0]?.id||"",dueDate:new Date().toISOString().slice(0,10),priority:"media"});
  async function submit(){
    if(!form.title){showToast("Escribe el título","#EF4444");return;}
    const id=`task_${Date.now()}`;
    await setDoc(doc(db,"tasks",id),{...form,done:false,createdBy:currentUser.id,id});
    showToast("Tarea añadida ✅"); close();
  }
  return (
    <W title="Nueva tarea">
      <label style={S.lbl} className="fm">Título</label>
      <input style={S.inp} placeholder="¿Qué hay que hacer?" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} className="fb"/>
      <label style={S.lbl} className="fm">Asignar a</label>
      <select style={S.inp} value={form.assignedTo} onChange={e=>setForm(f=>({...f,assignedTo:e.target.value}))} className="fb">{users.map(u=><option key={u.id} value={u.id}>{u.emoji} {u.name}</option>)}</select>
      <label style={S.lbl} className="fm">Fecha límite</label>
      <input style={S.inp} type="date" value={form.dueDate} onChange={e=>setForm(f=>({...f,dueDate:e.target.value}))} className="fb"/>
      <label style={S.lbl} className="fm">Prioridad</label>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {PRIORITIES.map(p=>(
          <button key={p} onClick={()=>setForm(f=>({...f,priority:p}))} style={{flex:1,padding:"8px 0",borderRadius:8,border:`2px solid ${PCOLOR[p]}`,background:form.priority===p?PCOLOR[p]:"transparent",color:form.priority===p?"#fff":PCOLOR[p],fontWeight:600,cursor:"pointer",fontSize:13}} className="fm">{p}</button>
        ))}
      </div>
      <button onClick={submit} style={{...S.saveBtn,background:currentUser.color,width:"100%"}} className="fm">Guardar tarea</button>
    </W>
  );
}

function EditBudgetModal({W,close,budgets,currentUser,showToast}) {
  const [form,setForm]=useState({...budgets});
  async function save(){ await setDoc(doc(db,"config","budgets"),form); showToast("Presupuestos actualizados ✅"); close(); }
  return (
    <W title="Editar presupuestos">
      {Object.keys(form).map(cat=>(
        <div key={cat}><label style={S.lbl} className="fm">{cat}</label><input style={S.inp} type="number" value={form[cat]} onChange={e=>setForm(f=>({...f,[cat]:Number(e.target.value)}))} className="fb"/></div>
      ))}
      <button onClick={save} style={{...S.saveBtn,background:currentUser.color,width:"100%"}} className="fm">Guardar</button>
    </W>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MENU COMPONENTS (from original)
// ══════════════════════════════════════════════════════════════════════════════
function Img({meal,gradient,aspect="aspect-[4/3]"}) {
  const [fail,setFail]=useState(false); const [load,setLoad]=useState(false);
  const seed=useMemo(()=>{ let h=0; for(let i=0;i<meal.name.length;i++) h=((h<<5)-h+meal.name.charCodeAt(i))|0; return Math.abs(h); },[meal.name]);
  const url=`https://loremflickr.com/400/300/${encodeURIComponent(meal.iq||"food")}?lock=${seed}`;
  if (fail) return <div className={`${aspect} w-full bg-gradient-to-br ${gradient} flex items-center justify-center`}><span className="text-5xl drop-shadow-lg">{meal.e||"🍽️"}</span></div>;
  return (
    <div className={`${aspect} w-full relative overflow-hidden bg-gradient-to-br ${gradient}`}>
      {!load && <span className="absolute inset-0 flex items-center justify-center text-5xl drop-shadow-lg">{meal.e||"🍽️"}</span>}
      <img src={url} alt="" loading="lazy" onLoad={()=>setLoad(true)} onError={()=>setFail(true)} className="w-full h-full object-cover relative" style={{opacity:load?1:0,transition:"opacity .3s"}}/>
    </div>
  );
}

function MealCard({meal,mt,onClick,compact}) {
  const Ic=mt.I; const name=meal.status==="improvised"&&meal.improvisedName?meal.improvisedName:meal.name;
  return (
    <button onClick={onClick} className="w-full text-left bg-white rounded-2xl overflow-hidden border-2 border-transparent hover:border-rose-300 active:scale-95 transition-transform shadow-sm">
      <div className="relative">
        <Img meal={meal} gradient={mt.g} aspect={compact?"aspect-[5/3]":"aspect-[4/3]"}/>
        <span className="absolute top-2 left-2 bg-white/90 rounded-full px-2 py-0.5 fm text-[9px] uppercase flex items-center gap-1 shadow"><Ic className="w-2.5 h-2.5" style={{color:mt.c}}/>{mt.l}</span>
        <span className="absolute top-2 right-2 bg-white/90 rounded-full p-1 shadow">{meal.status==="planned"?<Check style={{width:14,height:14,color:"#04A37C",strokeWidth:3}}/>:meal.status==="improvised"?<Shuffle style={{width:14,height:14,color:"#F59E0B"}}/>:<Circle style={{width:14,height:14,color:"#9CA3AF"}}/>}</span>
      </div>
      <div className="p-2.5">
        <div className="fb font-semibold text-sm leading-tight text-gray-900 line-clamp-2">{name}</div>
        <div className="flex items-center gap-1 mt-1 fm text-[10px] text-gray-500"><Clock className="w-2.5 h-2.5"/>{meal.mins} min</div>
      </div>
    </button>
  );
}

function PeopleSlider({people,onChange}) {
  const mult=people/BASE;
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-3 mb-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow"><Users className="w-4 h-4 text-white"/></div>
          <div><div className="fm text-[9px] uppercase text-gray-500 leading-none">Para</div><div className="fd text-2xl text-gray-900 leading-none mt-0.5">{people}</div></div>
        </div>
        <div className="flex-1 min-w-0">
          <input type="range" min="1" max="6" step="1" value={people} onChange={e=>onChange(+e.target.value)} className="ps"/>
          <div className="flex justify-between mt-1 px-0.5">
            {[1,2,3,4,5,6].map(n=><button key={n} onClick={()=>onChange(n)} className="fm text-[10px] font-bold py-0.5 px-1" style={{color:n===people?"#FF5C4D":"rgba(107,107,130,0.45)"}}>{n}</button>)}
          </div>
        </div>
        <div className="shrink-0 px-2 py-1.5 rounded-xl text-center" style={{background:"rgba(255,182,39,0.15)",opacity:mult===1?0.5:1}}>
          <div className="fm text-[8px] uppercase text-amber-700 leading-none">Escala</div>
          <div className="fd text-sm text-amber-700 leading-none mt-1">×{mult.toFixed(mult%1===0?0:1)}</div>
        </div>
      </div>
    </div>
  );
}

function SwapModal({mt,current,pantry,menu,onPick,onClose}) {
  const [mode,setMode]=useState(null); const [loading,setLoading]=useState(false); const [alts,setAlts]=useState([]); const [err,setErr]=useState("");
  const avail=pantry.filter(x=>x.qty>0).length;
  const fetch1=async(md)=>{ setMode(md); setLoading(true); setErr(""); setAlts([]); try{ setAlts(await getAlternatives(md,mt,current,pantry,menu)); }catch(e){ setErr("No se pudieron generar. Reintenta."); }finally{ setLoading(false); } };
  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-orange-50 w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl fu" onClick={e=>e.stopPropagation()}>
        <div className="sticky top-0 bg-orange-50/95 backdrop-blur border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2 min-w-0"><Wand2 className="w-5 h-5 text-purple-600 shrink-0"/><div className="min-w-0"><div className="fm text-[9px] uppercase text-gray-500">Cambiar plato</div><h2 className="fd text-lg text-gray-900 truncate leading-none">{current.name}</h2></div></div>
          <button onClick={onClose} className="bg-white hover:bg-gray-100 rounded-full p-2 shadow border border-gray-200"><X className="w-4 h-4"/></button>
        </div>
        <div className="p-4 space-y-3">
          {!mode && (
            <div className="space-y-3 fu">
              <button onClick={()=>fetch1("suggest")} className="w-full bg-gradient-to-br from-purple-500 to-pink-600 text-white rounded-2xl p-4 text-left shadow-md flex items-center gap-3 active:scale-95 transition-transform">
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0"><Sparkles className="w-6 h-6"/></div>
                <div><div className="fd text-lg leading-tight">Sugerencias nuevas</div><div className="fb text-xs opacity-90 mt-0.5">3 platos distintos.</div></div>
              </button>
              <button onClick={()=>fetch1("improvise")} disabled={avail===0} className="w-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-white rounded-2xl p-4 text-left shadow-md flex items-center gap-3 disabled:opacity-40 active:scale-95 transition-transform">
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0"><Lightbulb className="w-6 h-6"/></div>
                <div><div className="fd text-lg leading-tight">Improvisar con despensa</div><div className="fb text-xs opacity-90 mt-0.5">Solo con los {avail} ingredientes que tienes.</div></div>
              </button>
            </div>
          )}
          {mode && (
            <div>
              <button onClick={()=>{setMode(null);setAlts([]);setErr("");}} className="fm text-[10px] uppercase text-gray-500 mb-3 font-semibold">← Volver</button>
              {loading && <div className="space-y-3"><div className="flex items-center justify-center gap-2 py-2"><Loader2 className="w-4 h-4 animate-spin text-rose-500"/><span className="fm text-xs uppercase text-gray-500">Buscando...</span></div>{[1,2,3].map(i=><div key={i} className="bg-white rounded-2xl overflow-hidden border border-gray-200"><div className="sh aspect-[4/2]"/><div className="p-3 space-y-2"><div className="sh h-4 w-3/4 rounded"/><div className="sh h-3 w-1/2 rounded"/></div></div>)}</div>}
              {err && !loading && <div className="text-center py-6 bg-red-50 border-2 border-red-200 rounded-2xl"><p className="fb text-sm text-red-900 mb-3">{err}</p><button onClick={()=>fetch1(mode)} className="bg-rose-500 text-white fm text-[10px] uppercase px-4 py-2 rounded-full font-semibold">Reintentar</button></div>}
              {!loading && !err && alts.length>0 && (
                <div className="space-y-3 fu">
                  {alts.map((a,i)=>(
                    <div key={i} className="bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
                      <Img meal={a} gradient={mt.g} aspect="aspect-[4/2]"/>
                      <div className="p-3">
                        <div className="fd text-lg text-gray-900 leading-tight">{a.name}</div>
                        <div className="fm text-[10px] text-gray-500 mt-1 flex items-center gap-2"><Clock className="w-2.5 h-2.5"/>{a.mins} min · {a.ingredients.length} ingr.</div>
                        <div className="flex flex-wrap gap-1 my-2">{a.ingredients.slice(0,6).map((x,j)=><span key={j} className="fm text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{x.name}</span>)}{a.ingredients.length>6&&<span className="fm text-[10px] text-gray-400">+{a.ingredients.length-6}</span>}</div>
                        <button onClick={()=>onPick(a)} className="w-full py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white fm text-xs uppercase font-semibold flex items-center justify-center gap-1.5"><Check className="w-3.5 h-3.5"/>Usar este</button>
                      </div>
                    </div>
                  ))}
                  <button onClick={()=>fetch1(mode)} className="w-full py-2.5 rounded-xl border-2 border-gray-200 fm text-[10px] uppercase text-gray-500 font-semibold flex items-center justify-center gap-1.5"><RefreshCw className="w-3 h-3"/>Otras</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MealModal({day,mt,meal,pantry,people,onSave,onSwap,onClose}) {
  const [mode,setMode]=useState(meal.status); const [impName,setImpName]=useState(meal.improvisedName||meal.name);
  const scaled=useMemo(()=>scaleIs(meal.ingredients,people),[meal.ingredients,people]);
  const [impIngs,setImpIngs]=useState(meal.consumed&&meal.status==="improvised"?meal.consumed:scaled);
  const display=meal.status!=="pending"&&meal.consumed?meal.consumed:scaled;
  const upd=(xs,set,i,f,v)=>set(xs.map((x,j)=>j===i?{...x,[f]:f==="qty"?+v||0:v}:x));
  const save=()=>{ const u={...meal,status:mode}; u.improvisedName=mode==="improvised"?impName:""; u.consumed=mode==="planned"?scaled:mode==="improvised"?impIngs.filter(x=>x.name.trim()):null; onSave(u); };
  const dc=DAY_COLOR[DAYS.indexOf(day)];
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-orange-50 w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl fu" onClick={e=>e.stopPropagation()}>
        <div className="relative">
          <Img meal={meal} gradient={mt.g} aspect="aspect-[16/9]"/>
          <button onClick={onClose} className="absolute top-3 right-3 bg-white/95 hover:bg-white rounded-full p-2 shadow z-20"><X className="w-4 h-4"/></button>
          <div className="absolute top-3 left-3 flex gap-1.5">
            <span className="px-2.5 py-1 rounded-full fm text-[10px] uppercase text-white shadow" style={{background:dc}}>{day}</span>
            <span className="px-2.5 py-1 rounded-full fm text-[10px] uppercase shadow bg-white/90 text-gray-900">{mt.l}</span>
          </div>
        </div>
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="fd text-2xl text-gray-900 leading-tight">{meal.name}</h2>
          <div className="flex items-center gap-3 mt-1 fm text-xs text-gray-500">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3"/>{meal.mins} min</span>
            <span>·</span><span className="flex items-center gap-1"><Users className="w-3 h-3"/>{people} pers.</span>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <div className="fm text-[10px] uppercase text-gray-500 mb-2">¿Qué pasó?</div>
            <div className="grid grid-cols-3 gap-2">
              {[{v:"pending",l:"Pendiente",c:"#9CA3AF"},{v:"planned",l:"Como tocaba",c:"#06C99B"},{v:"improvised",l:"Improvisé",c:"#FFB627"}].map(o=>(
                <button key={o.v} onClick={()=>setMode(o.v)} className="p-3 rounded-2xl border-2 flex flex-col items-center gap-1.5 transition-all"
                  style={{borderColor:mode===o.v?o.c:"rgba(0,0,0,0.08)",background:mode===o.v?o.c+"20":"white",color:mode===o.v?o.c:"#6B6B82"}}>
                  <span style={{fontSize:18}}>{o.v==="pending"?"⏳":o.v==="planned"?"✅":"🔀"}</span>
                  <span className="fm text-[10px] uppercase font-semibold">{o.l}</span>
                </button>
              ))}
            </div>
          </div>
          {mode==="improvised" && (
            <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-3 space-y-2 fu">
              <input value={impName} onChange={e=>setImpName(e.target.value)} placeholder="¿Qué hiciste?" className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 fb outline-none focus:border-amber-500"/>
              <div className="flex justify-between items-center">
                <span className="fm text-[10px] uppercase text-amber-800">Lo que gastaste</span>
                <button onClick={()=>setImpIngs([...impIngs,{name:"",qty:1,unit:"g"}])} className="fm text-[10px] uppercase text-amber-700 flex items-center gap-0.5 font-semibold"><Plus className="w-3 h-3"/>Añadir</button>
              </div>
              <div className="space-y-1.5">
                {impIngs.map((x,i)=>(
                  <div key={i} className="flex items-center gap-1.5">
                    <input list="pl" value={x.name} onChange={e=>upd(impIngs,setImpIngs,i,"name",e.target.value)} className="flex-1 bg-white border border-amber-200 rounded-lg px-2 py-1.5 fb text-sm outline-none min-w-0"/>
                    <input type="number" value={x.qty} onChange={e=>upd(impIngs,setImpIngs,i,"qty",e.target.value)} className="w-14 bg-white border border-amber-200 rounded-lg px-2 py-1.5 fm text-sm outline-none"/>
                    <input value={x.unit} onChange={e=>upd(impIngs,setImpIngs,i,"unit",e.target.value)} className="w-12 bg-white border border-amber-200 rounded-lg px-1.5 py-1.5 fm text-xs outline-none"/>
                    <button onClick={()=>setImpIngs(impIngs.filter((_,j)=>j!==i))} className="text-amber-700/60 hover:text-red-600 p-1"><Trash2 className="w-3.5 h-3.5"/></button>
                  </div>
                ))}
              </div>
              <datalist id="pl">{pantry.map(x=><option key={x.id} value={x.name}/>)}</datalist>
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="fm text-[10px] uppercase text-gray-500">Receta</span>
              <button onClick={onSwap} className="fm text-[10px] uppercase flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold bg-purple-100 text-purple-700 hover:bg-purple-200"><Wand2 className="w-3 h-3"/>Cambiar plato</button>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-2">
              <div className="fm text-[10px] uppercase text-gray-500 mb-2">Ingredientes</div>
              <ul className="space-y-1.5">
                {display.map((i,idx)=>{ const pIdx=pantry.findIndex(x=>norm(x.name)===norm(i.name)); const has=pIdx>=0&&pantry[pIdx].qty>=i.qty; return (
                  <li key={idx} className="flex items-center gap-2 fb text-sm">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{background:has?"#06C99B":"#FF5C4D"}}/>
                    <span className="fm text-xs text-gray-500 w-16 shrink-0">{i.qty} {i.unit}</span>
                    <span className="flex-1">{i.name}</span>
                    {!has&&meal.status==="pending"&&<span className="fm text-[9px] uppercase text-red-700 bg-red-50 px-1.5 py-0.5 rounded">Falta</span>}
                  </li>
                ); })}
              </ul>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-4">
              <div className="fm text-[10px] uppercase text-gray-500 mb-2">Preparación</div>
              <ol className="space-y-2">
                {meal.steps.map((s,i)=>(
                  <li key={i} className="flex gap-3 fb text-sm leading-snug">
                    <span className="fm text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-rose-100 text-rose-700">{i+1}</span>
                    <span className="flex-1">{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
        <div className="sticky bottom-0 bg-orange-50 border-t border-gray-200 px-5 py-3 flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border-2 border-gray-200 fm text-xs uppercase text-gray-500 font-semibold">Cancelar</button>
          <button onClick={save} className="flex-1 py-3 rounded-xl bg-rose-500 text-white fm text-xs uppercase hover:bg-rose-600 flex items-center justify-center gap-1.5 font-semibold shadow"><Save className="w-3.5 h-3.5"/>Guardar</button>
        </div>
      </div>
    </div>
  );
}

function PantryView({pantry,onUpd,onAdd,onDel,onReceipt}) {
  const [add,setAdd]=useState(false); const [n,setN]=useState({name:"",qty:1,unit:"g",threshold:1,cat:"Otros"});
  const cats=useMemo(()=>[...new Set(pantry.map(x=>x.cat))],[pantry]);
  const low=lowItems(pantry);
  return (
    <div className="space-y-4">
      {low.length>0 && (
        <div className="bg-gradient-to-br from-amber-100 to-orange-100 border-2 border-amber-300 rounded-3xl p-4 fu shadow-sm">
          <div className="flex items-center gap-2 mb-2"><div className="w-7 h-7 rounded-full bg-amber-400 flex items-center justify-center"><AlertTriangle className="w-4 h-4 text-white"/></div><h3 className="fm text-xs uppercase text-amber-900 font-bold">Se está acabando ({low.length})</h3></div>
          <div className="flex flex-wrap gap-1.5">{low.map(x=><span key={x.id} className="bg-white rounded-full px-2.5 py-1 fb text-xs flex items-center gap-1.5 shadow-sm" style={{color:CAT_COLOR[x.cat]||"#9CA3AF",border:`1.5px solid ${CAT_COLOR[x.cat]||"#9CA3AF"}50`}}><span className="w-1.5 h-1.5 rounded-full" style={{background:CAT_COLOR[x.cat]||"#9CA3AF"}}/>{x.name} <span className="fm text-[10px] opacity-70">{x.qty}{x.unit}</span></span>)}</div>
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <h2 className="fd text-3xl text-gray-900">Despensa</h2>
        <div className="flex gap-2">
          <button onClick={onReceipt} className="fm text-[10px] uppercase text-white flex items-center gap-1 px-3 py-2 rounded-full bg-emerald-500 hover:bg-emerald-600 shadow font-semibold"><Receipt className="w-3 h-3"/>Tiquet</button>
          <button onClick={()=>setAdd(!add)} className="fm text-[10px] uppercase text-white flex items-center gap-1 px-3 py-2 rounded-full bg-rose-500 hover:bg-rose-600 shadow font-semibold"><Plus className="w-3 h-3"/>Añadir</button>
        </div>
      </div>
      {add && (
        <div className="bg-white border-2 border-dashed border-rose-300 rounded-2xl p-3 space-y-2 fu shadow-sm">
          <input value={n.name} onChange={e=>setN({...n,name:e.target.value})} placeholder="Producto" className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 fb outline-none focus:border-rose-400"/>
          <div className="grid grid-cols-4 gap-2">
            <input type="number" value={n.qty} onChange={e=>setN({...n,qty:+e.target.value})} className="bg-white border border-gray-200 rounded-lg px-2 py-1.5 fm text-sm outline-none"/>
            <select value={n.unit} onChange={e=>setN({...n,unit:e.target.value})} className="bg-white border border-gray-200 rounded-lg px-2 py-1.5 fm text-sm outline-none">{UNITS.map(u=><option key={u}>{u}</option>)}</select>
            <input type="number" value={n.threshold} onChange={e=>setN({...n,threshold:+e.target.value})} className="bg-white border border-gray-200 rounded-lg px-2 py-1.5 fm text-sm outline-none"/>
            <select value={n.cat} onChange={e=>setN({...n,cat:e.target.value})} className="bg-white border border-gray-200 rounded-lg px-2 py-1.5 fb text-sm outline-none">{PANTRY_CATS.map(x=><option key={x}>{x}</option>)}</select>
          </div>
          <div className="flex gap-2">
            <button onClick={()=>setAdd(false)} className="flex-1 py-2 rounded-lg border border-gray-200 fm text-[10px] uppercase text-gray-500 font-semibold">Cancelar</button>
            <button onClick={()=>{ if(n.name.trim()){ onAdd({...n,id:n.name.toLowerCase().replace(/\s+/g,"-")+"-"+Date.now()}); setN({name:"",qty:1,unit:"g",threshold:1,cat:"Otros"}); setAdd(false); }}} className="flex-1 py-2 rounded-lg bg-rose-500 text-white fm text-[10px] uppercase font-semibold shadow">Guardar</button>
          </div>
        </div>
      )}
      {cats.map(cat=>{ const items=pantry.filter(x=>x.cat===cat); const c=CAT_COLOR[cat]||"#9CA3AF"; return (
        <div key={cat}>
          <div className="flex items-center gap-2 mb-2"><span className="w-2 h-2 rounded-full" style={{background:c}}/><h3 className="fm text-[10px] uppercase font-bold" style={{color:c}}>{cat}</h3><span className="fm text-[10px] text-gray-400">· {items.length}</span></div>
          <div className="space-y-1.5">
            {items.map(x=>{ const isLow=x.qty<=x.threshold&&x.threshold>0; const empty=x.qty<=0; return (
              <div key={x.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 shadow-sm" style={{background:empty?"#FEE2E2":isLow?"#FEF3C7":"white",borderColor:empty?"#FCA5A5":isLow?"#FCD34D":"rgba(0,0,0,0.06)"}}>
                <div className="flex-1 min-w-0"><div className="fb text-sm font-medium text-gray-900 truncate">{x.name}</div><div className="fm text-[10px] text-gray-500">alerta a {x.threshold}{x.unit}</div></div>
                <div className="flex items-center gap-1">
                  <button onClick={()=>onUpd(x.id,{qty:Math.max(0,+(x.qty-1).toFixed(2))})} className="w-7 h-7 rounded-full bg-white hover:bg-gray-100 shadow-sm flex items-center justify-center text-gray-500 border border-gray-200"><Minus className="w-3 h-3"/></button>
                  <input type="number" value={x.qty} onChange={e=>onUpd(x.id,{qty:+e.target.value||0})} className="w-14 text-center bg-transparent fm text-sm font-semibold outline-none"/>
                  <span className="fm text-[10px] text-gray-500 w-6">{x.unit}</span>
                  <button onClick={()=>onUpd(x.id,{qty:+(x.qty+1).toFixed(2)})} className="w-7 h-7 rounded-full bg-emerald-500 hover:bg-emerald-600 shadow-sm flex items-center justify-center text-white"><Plus className="w-3 h-3"/></button>
                  <button onClick={()=>onDel(x.id)} className="w-7 h-7 rounded-full hover:bg-red-100 flex items-center justify-center text-gray-300 hover:text-red-600 ml-1"><Trash2 className="w-3 h-3"/></button>
                </div>
              </div>
            ); })}
          </div>
        </div>
      ); })}
    </div>
  );
}

function ShoppingView({pantry,menu,people}) {
  const low=lowItems(pantry);
  const items=useMemo(()=>{
    const need=new Map();
    Object.values(menu).forEach(d=>Object.values(d).forEach(m=>{ if(m.status==="pending") scaleIs(m.ingredients,people).forEach(i=>{ const k=norm(i.name); const cur=need.get(k)||{name:i.name,qty:0,unit:i.unit}; cur.qty+=i.qty; need.set(k,cur); }); }));
    const map=new Map();
    low.forEach(x=>map.set(norm(x.name),{name:x.name,qty:Math.max(1,+(x.threshold-x.qty).toFixed(2)),unit:x.unit,cat:x.cat,reason:"low"}));
    need.forEach((r,k)=>{ const pIdx=pantry.findIndex(x=>norm(x.name)===k); const stock=pIdx>=0?pantry[pIdx].qty:0; if(stock<r.qty){ if(!map.has(k)) map.set(k,{name:r.name,qty:+(r.qty-stock).toFixed(2),unit:r.unit,cat:pIdx>=0?pantry[pIdx].cat:"Otros",reason:"missing"}); } });
    return [...map.values()].sort((a,b)=>(a.cat||"").localeCompare(b.cat||""));
  },[pantry,menu,people,low]);
  const [check,setCheck]=useState({});
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="fd text-3xl text-gray-900">Lista de compra</h2><p className="fm text-[10px] uppercase text-gray-500 mt-0.5">Para {people} personas</p></div>
        <span className="fm text-sm text-white bg-rose-500 px-3 py-1.5 rounded-full font-bold shadow">{items.length}</span>
      </div>
      {items.length===0 ? (
        <div className="text-center py-12 bg-emerald-50 border-2 border-emerald-200 rounded-3xl"><div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center mx-auto mb-3 shadow-lg"><Check className="w-6 h-6 text-white"/></div><p className="fb text-emerald-900 font-medium">¡Tienes todo!</p></div>
      ) : (
        <div className="space-y-1.5">{items.map((x,i)=>{ const c=CAT_COLOR[x.cat]||"#9CA3AF"; return (
          <button key={i} onClick={()=>setCheck(o=>({...o,[x.name]:!o[x.name]}))} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 text-left shadow-sm transition-all"
            style={{background:check[x.name]?"#F9FAFB":"white",borderColor:check[x.name]?"#E5E7EB":c+"30",opacity:check[x.name]?0.5:1}}>
            <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0" style={{background:check[x.name]?c:"white",borderColor:check[x.name]?c:c+"60"}}>{check[x.name]&&<Check className="w-3.5 h-3.5 text-white"/>}</div>
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{background:c}}/>
            <div className="flex-1 min-w-0"><div className={`fb font-medium text-gray-900 ${check[x.name]?"line-through":""}`}>{x.name}</div><div className="fm text-[10px]" style={{color:c}}>{x.cat}</div></div>
            <span className="fm text-xs text-gray-500 font-semibold">~{x.qty}{x.unit}</span>
            {x.reason==="missing"&&<span className="fm text-[9px] uppercase text-white bg-rose-500 px-2 py-0.5 rounded-full font-bold">Falta</span>}
          </button>
        ); })}</div>
      )}
    </div>
  );
}

function ReceiptModal({pantry,onConfirm,onClose}) {
  const [img,setImg]=useState(null); const [preview,setPreview]=useState(null); const [proc,setProc]=useState(false); const [items,setItems]=useState(null); const [err,setErr]=useState("");
  const cR=useRef(null); const fR=useRef(null);
  const onFile=(f)=>{ if(!f||!f.type.startsWith("image/")){setErr("Sube una imagen.");return;} setErr(""); const r=new FileReader(); r.onload=e=>{setImg({base64:e.target.result.split(",")[1],mediaType:f.type});setPreview(e.target.result);setItems(null);}; r.readAsDataURL(f); };
  const analyze=async()=>{ setProc(true); setErr(""); setItems(null); try{ const det=await readReceipt(img,pantry); if(det.length===0) setErr("No se detectaron productos."); else setItems(det); }catch(e){ setErr("Error al analizar."); }finally{ setProc(false); } };
  const upd=(i,f,v)=>setItems(items.map((it,j)=>j===i?{...it,[f]:f==="qty"||f==="threshold"?+v||0:v}:it));
  const sel=items?.filter(x=>x.include&&x.name.trim())||[];
  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-orange-50 w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl fu" onClick={e=>e.stopPropagation()}>
        <div className="sticky top-0 bg-orange-50/95 backdrop-blur border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2"><Receipt className="w-5 h-5 text-emerald-600"/><div><div className="fm text-[9px] uppercase text-gray-500">Tiquet</div><h2 className="fd text-lg leading-none">Añadir a despensa</h2></div></div>
          <button onClick={onClose} className="bg-white hover:bg-gray-100 rounded-full p-2 shadow border border-gray-200"><X className="w-4 h-4"/></button>
        </div>
        <div className="p-4 space-y-3">
          {!img&&!proc&&(
            <div className="space-y-3 fu">
              <p className="fb text-sm text-gray-600">Sube una foto del tiquet y los productos se añaden automáticamente.</p>
              <input ref={cR} type="file" accept="image/*" capture="environment" className="hidden" onChange={e=>onFile(e.target.files[0])}/>
              <input ref={fR} type="file" accept="image/*" className="hidden" onChange={e=>onFile(e.target.files[0])}/>
              <button onClick={()=>cR.current?.click()} className="w-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-white rounded-2xl p-4 text-left shadow-md flex items-center gap-3 active:scale-95 transition-transform">
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0"><Camera className="w-6 h-6"/></div>
                <div><div className="fd text-lg leading-tight">Hacer foto</div><div className="fb text-xs opacity-90 mt-0.5">Abrir cámara ahora.</div></div>
              </button>
              <button onClick={()=>fR.current?.click()} className="w-full bg-white border-2 border-dashed border-gray-300 hover:border-emerald-400 rounded-2xl p-4 text-left flex items-center gap-3 active:scale-95 transition-transform">
                <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center shrink-0"><Upload className="w-6 h-6 text-gray-500"/></div>
                <div><div className="fd text-lg leading-tight">Subir foto</div><div className="fb text-xs text-gray-500 mt-0.5">Desde la galería.</div></div>
              </button>
              {err&&<div className="bg-red-50 border border-red-200 rounded-xl p-3 fb text-sm text-red-900">{err}</div>}
            </div>
          )}
          {img&&!items&&!proc&&(
            <div className="space-y-3 fu">
              <div className="relative rounded-2xl overflow-hidden border border-gray-200 bg-white"><img src={preview} alt="" className="w-full max-h-80 object-contain"/><button onClick={()=>{setImg(null);setPreview(null);}} className="absolute top-2 right-2 bg-white/95 rounded-full p-1.5 shadow"><X className="w-3.5 h-3.5"/></button></div>
              {err&&<div className="bg-red-50 border border-red-200 rounded-xl p-3 fb text-sm text-red-900">{err}</div>}
              <button onClick={analyze} className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white fm text-xs uppercase font-semibold flex items-center justify-center gap-2 shadow"><Sparkles className="w-4 h-4"/>Analizar</button>
            </div>
          )}
          {proc&&<div className="flex items-center justify-center gap-2 py-6"><Loader2 className="w-5 h-5 animate-spin text-emerald-600"/><span className="fm text-xs uppercase text-gray-500">Leyendo tiquet...</span></div>}
          {items&&!proc&&(
            <div className="space-y-3 fu">
              <p className="fm text-[10px] uppercase text-gray-500">{sel.length}/{items.length} seleccionados</p>
              <div className="space-y-1.5">
                {items.map((it,i)=>{ const c=CAT_COLOR[it.cat]||"#9CA3AF"; const exists=pantry.find(x=>norm(x.name)===norm(it.name)); return (
                  <div key={i} className="bg-white border-2 rounded-xl p-2.5" style={{borderColor:it.include?c+"60":"#E5E7EB",opacity:it.include?1:0.4}}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <button onClick={()=>upd(i,"include",!it.include)} className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0" style={{background:it.include?c:"#fff",borderColor:it.include?c:"#D1D5DB"}}>{it.include&&<Check className="w-3 h-3 text-white"/>}</button>
                      <input value={it.name} onChange={e=>upd(i,"name",e.target.value)} className="flex-1 bg-transparent fb font-semibold text-sm outline-none border-b border-transparent focus:border-gray-300 min-w-0"/>
                      <span className="fm text-[9px] uppercase px-1.5 py-0.5 rounded font-semibold shrink-0" style={{background:exists?"#DBEAFE":"#D1FAE5",color:exists?"#1E40AF":"#065F46"}}>{exists?`+${it.qty}${it.unit}`:"Nuevo"}</span>
                      <button onClick={()=>setItems(items.filter((_,j)=>j!==i))} className="text-gray-300 hover:text-red-500 shrink-0"><Trash2 className="w-3.5 h-3.5"/></button>
                    </div>
                    <div className="flex items-center gap-1.5 pl-7">
                      <input type="number" value={it.qty} onChange={e=>upd(i,"qty",e.target.value)} className="w-14 bg-gray-50 border border-gray-200 rounded px-2 py-1 fm text-xs outline-none"/>
                      <select value={it.unit} onChange={e=>upd(i,"unit",e.target.value)} className="bg-gray-50 border border-gray-200 rounded px-1.5 py-1 fm text-xs outline-none">{UNITS.map(u=><option key={u}>{u}</option>)}</select>
                      <select value={it.cat} onChange={e=>upd(i,"cat",e.target.value)} className="flex-1 bg-gray-50 border border-gray-200 rounded px-1.5 py-1 fm text-xs outline-none min-w-0">{PANTRY_CATS.map(x=><option key={x}>{x}</option>)}</select>
                    </div>
                  </div>
                ); })}
              </div>
              <button onClick={()=>setItems([...items,{name:"",qty:1,unit:"ud",cat:"Otros",threshold:1,include:true}])} className="w-full py-2 rounded-xl border-2 border-dashed border-gray-300 hover:border-emerald-400 fm text-[10px] uppercase text-gray-500 font-semibold flex items-center justify-center gap-1"><Plus className="w-3 h-3"/>Añadir manual</button>
            </div>
          )}
        </div>
        {items&&!proc&&(
          <div className="sticky bottom-0 bg-orange-50 border-t border-gray-200 px-4 py-3 flex gap-2">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl border-2 border-gray-200 fm text-xs uppercase text-gray-500 font-semibold">Cancelar</button>
            <button onClick={()=>onConfirm(sel)} disabled={sel.length===0} className="flex-1 py-3 rounded-xl bg-emerald-500 text-white fm text-xs uppercase hover:bg-emerald-600 disabled:opacity-40 flex items-center justify-center gap-1.5 font-semibold shadow"><Check className="w-3.5 h-3.5"/>Añadir {sel.length||""}</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════════════════════════
const S = {
  root:     { minHeight:"100vh", background:"#F8FAFC", fontFamily:"'Segoe UI',system-ui,sans-serif" },
  toast:    { position:"fixed", top:20, left:"50%", transform:"translateX(-50%)", padding:"10px 22px", borderRadius:24, color:"#fff", fontWeight:600, fontSize:14, zIndex:9999, boxShadow:"0 4px 16px rgba(0,0,0,0.2)" },
  loginWrap:{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"linear-gradient(135deg,#EEF2FF,#F0FDF4)", padding:16 },
  loginBox: { background:"#fff", borderRadius:24, padding:32, maxWidth:380, width:"100%", boxShadow:"0 8px 40px rgba(0,0,0,0.10)", textAlign:"center" },
  loginTitle:{ fontSize:28, fontWeight:800, color:"#1E293B", margin:"8px 0 4px" },
  userCard: { display:"flex", alignItems:"center", gap:14, padding:"14px 18px", border:"2px solid", borderRadius:14, cursor:"pointer", background:"#FAFAFA", width:"100%", textAlign:"left", marginBottom:10 },
  appWrap:  { display:"flex", flexDirection:"column", minHeight:"calc(100vh - 100px)", maxWidth:480, margin:"0 auto" },
  header:   { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 20px" },
  main:     { flex:1, padding:"20px 16px 100px", overflowY:"auto" },
  nav:      { position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, background:"#fff", borderTop:"1px solid #E2E8F0", display:"flex", zIndex:100 },
  navBtn:   { flex:1, display:"flex", flexDirection:"column", alignItems:"center", padding:"10px 0", border:"none", borderTop:"2px solid transparent", background:"transparent", cursor:"pointer", color:"#94A3B8", gap:2, transition:"all 0.15s" },
  card:     { background:"#fff", borderRadius:16, padding:16, marginBottom:14, boxShadow:"0 2px 10px rgba(0,0,0,0.06)" },
  cardHead: { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 },
  cardTitle:{ fontWeight:700, fontSize:15, color:"#1E293B", marginBottom:12, display:"block" },
  title:    { fontSize:22, fontWeight:800, color:"#1E293B", margin:"0 0 4px" },
  scrHead:  { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 },
  link:     { background:"transparent", border:"none", fontWeight:600, fontSize:13, cursor:"pointer" },
  addBtn:   { border:"none", borderRadius:12, padding:"8px 16px", color:"#fff", fontWeight:700, fontSize:18, cursor:"pointer" },
  iconBtn:  { background:"transparent", border:"none", cursor:"pointer", fontSize:16, padding:4 },
  empty:    { color:"#94A3B8", fontSize:14, textAlign:"center", padding:"16px 0" },
  lbl:      { display:"block", fontSize:12, fontWeight:600, color:"#64748B", marginBottom:4 },
  inp:      { width:"100%", padding:"10px 12px", border:"1.5px solid #E2E8F0", borderRadius:10, fontSize:14, color:"#1E293B", marginBottom:12, boxSizing:"border-box", outline:"none", background:"#F8FAFC" },
  saveBtn:  { border:"none", borderRadius:12, padding:"12px 0", color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer" },
  qBtn:     { flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4, padding:"12px 0", background:"#fff", border:"2px solid", borderRadius:14, cursor:"pointer", fontSize:13, fontWeight:600, color:"#1E293B", boxShadow:"0 2px 8px rgba(0,0,0,0.06)" },
  tabs:     { display:"flex", borderBottom:"2px solid #F1F5F9", marginBottom:16 },
  tabBtn:   { flex:1, background:"transparent", border:"none", borderBottom:"3px solid transparent", padding:"10px 0", fontWeight:600, fontSize:14, color:"#94A3B8", cursor:"pointer" },
  overlay:  { position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:1000 },
  mbox:     { background:"#fff", borderRadius:"20px 20px 0 0", padding:"24px 20px 32px", width:"100%", maxWidth:480, maxHeight:"85vh", overflowY:"auto" },
};
