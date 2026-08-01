import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, onSnapshot, setDoc, deleteDoc, updateDoc, getDoc, getDocs, writeBatch, deleteField } from "firebase/firestore";
import { Coffee, UtensilsCrossed, Moon, ShoppingBasket, X, Clock, Check, CalendarDays, Package, AlertTriangle, Plus, Minus, Trash2, Shuffle, RefreshCw, Loader2, Circle, Save, Sparkles, Users, Wand2, Lightbulb, Receipt, Camera, Upload } from "lucide-react";

// ─── FIREBASE ─────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
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
const BOTE_COLORS  = ["#22C55E","#3B82F6","#F59E0B","#EF4444","#8B5CF6","#EC4899","#06C99B","#F97316"];
const MONTH_SHORT  = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MONTH_LONG   = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const DEFAULT_BOTES = [
  { name:"Ahorro",       pct:20, color:"#22C55E" },
  { name:"Gastos fijos", pct:50, color:"#3B82F6" },
  { name:"Ocio",         pct:20, color:"#F59E0B" },
  { name:"Imprevistos",  pct:10, color:"#EF4444" },
];

// ─── RECURRING EXPENSES CONSTANTS ──────────────────────────────────────────────
const REC_ICONS = ["🏠","💡","🚰","🌐","🛡️","🛒","⛽","👗","🎬","📱","🚗","🏥","🎓","💳","🏦","📺","🧴","🐶"];
const mkRec = (id,name,amount,day,category,tipo,icon,color) => ({ id,name,amount,day,category,boteId:null,tipo,icon,color,active:true });
const DEFAULT_RECURRENTES = [
  mkRec("rec_alquiler","Alquiler",600,1,"Servicios","fijo","🏠","#3B82F6"),
  mkRec("rec_luz","Luz",80,15,"Servicios","fijo","💡","#F59E0B"),
  mkRec("rec_agua","Agua",30,20,"Servicios","fijo","🚰","#06C99B"),
  mkRec("rec_internet","Internet",40,10,"Servicios","fijo","🌐","#8B5CF6"),
  mkRec("rec_compra","Compra semanal",400,1,"Supermercado","variable","🛒","#22C55E"),
  mkRec("rec_gasolina","Gasolina",100,1,"Transporte","variable","⛽","#EF4444"),
];

// Real vs projected month-end balance, accounting for active recurring expenses not yet paid.
function computeMonthlyBalance(transactions, recurrentes, ref=new Date()) {
  const monthPrefix = `${ref.getFullYear()}-${String(ref.getMonth()+1).padStart(2,"0")}`;
  const todayStr = ref.toISOString().slice(0,10);
  const todayNum = ref.getDate();
  const daysInMonth = new Date(ref.getFullYear(), ref.getMonth()+1, 0).getDate();
  const monthIncome = transactions.filter(t=>t.type==="income" && t.date?.startsWith(monthPrefix)).reduce((a,t)=>a+t.amount,0);
  const monthExpenseToDate = transactions.filter(t=>t.type==="expense" && t.date?.startsWith(monthPrefix) && t.date<=todayStr).reduce((a,t)=>a+t.amount,0);
  const currentBalance = +(monthIncome-monthExpenseToDate).toFixed(2);
  const pendingRecurrentes = (recurrentes||[]).filter(r=>{
    if (!r.active) return false;
    const effDay = Math.min(r.day, daysInMonth);
    if (effDay <= todayNum) return false;
    return !transactions.some(t=>t.recurrenteId===r.id && t.date && t.date.startsWith(monthPrefix));
  });
  const pendingTotal = +pendingRecurrentes.reduce((a,r)=>a+r.amount,0).toFixed(2);
  const projectedBalance = +(currentBalance-pendingTotal).toFixed(2);
  return { monthIncome, monthExpenseToDate, currentBalance, pendingRecurrentes, pendingTotal, projectedBalance };
}

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

// ─── MENU HELPERS ─────────────────────────────────────────────────────────────
const mk  = (name,mins,ings,steps,e,iq) => ({ name,mins,ingredients:ings,steps,e,iq,status:"pending",consumed:null,improvisedName:"" });
const ing = (n,q,u) => ({ name:n,qty:q,unit:u });
const norm    = s => (s||"").toLowerCase().trim();
const scaleI  = (i,ppl) => ({ ...i, qty:+(i.qty*ppl/BASE).toFixed(2) });
const scaleIs = (xs,ppl) => xs.map(x=>scaleI(x,ppl));
async function applyPantryDelta(db, pantry, restock, consume) {
  const net = {};
  (restock||[]).forEach(i=>{ const k=norm(i.name); net[k]=net[k]||{name:i.name,unit:i.unit,qty:0}; net[k].qty += i.qty; });
  (consume||[]).forEach(i=>{ const k=norm(i.name); net[k]=net[k]||{name:i.name,unit:i.unit,qty:0}; net[k].qty -= i.qty; });
  const batch = writeBatch(db);
  let touched = false;
  Object.entries(net).forEach(([k,d])=>{
    if (d.qty===0) return;
    touched = true;
    const existing = pantry.find(x=>norm(x.name)===k);
    if (existing) batch.update(doc(db,"pantryMenu",existing.id), { qty:Math.max(0,+(existing.qty+d.qty).toFixed(2)) });
    else if (d.qty<0) { const id=k+"-"+Date.now(); batch.set(doc(db,"pantryMenu",id), { id,name:d.name,qty:0,unit:d.unit,threshold:0,cat:"Otros" }); }
  });
  if (touched) await batch.commit();
}
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
@keyframes toastIn{0%{opacity:0;transform:translate(-50%,-16px) scale(.9)}60%{opacity:1;transform:translate(-50%,2px) scale(1.03)}100%{opacity:1;transform:translate(-50%,0) scale(1)}}
.toastAnim{animation:toastIn .35s cubic-bezier(.34,1.56,.64,1) both}
@keyframes pulseRing{0%{box-shadow:0 0 0 0 rgba(124,58,237,.55)}70%{box-shadow:0 0 0 10px rgba(124,58,237,0)}100%{box-shadow:0 0 0 0 rgba(124,58,237,0)}}
.coachPulse{animation:pulseRing 1.8s ease-out infinite}
@keyframes popIn{0%{opacity:0;transform:scale(.85)}100%{opacity:1;transform:scale(1)}}
.popIn{animation:popIn .25s ease-out both}
.sx::-webkit-scrollbar{display:none}.sx{scrollbar-width:none}
input[type=range].ps{appearance:none;-webkit-appearance:none;width:100%;height:8px;border-radius:99px;outline:none;cursor:pointer;background:linear-gradient(to right,#FF5C4D,#E91E63,#8B5CF6)}
input[type=range].ps::-webkit-slider-thumb{appearance:none;-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:#fff;border:3px solid #FF5C4D;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.18)}
`;

// ══════════════════════════════════════════════════════════════════════════════
// SHARED UI HELPERS
// ══════════════════════════════════════════════════════════════════════════════
function ConfirmModal({title,message,confirmLabel="Eliminar",confirmColor="#EF4444",onConfirm,onCancel}) {
  return (
    <div style={{...S.overlay,alignItems:"center",zIndex:2000}} onClick={e=>{if(e.target===e.currentTarget)onCancel();}}>
      <div className="popIn" style={{background:"#fff",borderRadius:20,padding:"28px 24px",width:"100%",maxWidth:340,textAlign:"center",boxShadow:"0 12px 40px rgba(0,0,0,0.25)"}}>
        <div style={{fontSize:40,marginBottom:10}}>⚠️</div>
        <div style={{fontWeight:700,fontSize:16,color:"#1E293B",marginBottom:6}} className="fb">{title}</div>
        {message && <p style={{fontSize:13,color:"#64748B",marginBottom:20,lineHeight:1.4}} className="fm">{message}</p>}
        <div style={{display:"flex",gap:10,marginTop:message?0:16}}>
          <button onClick={onCancel} style={{...S.saveBtn,background:"#F1F5F9",color:"#64748B",flex:1}} className="fm">Cancelar</button>
          <button onClick={onConfirm} style={{...S.saveBtn,background:confirmColor,flex:1}} className="fm">{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ── Onboarding content ──────────────────────────────────────────────────────
const ONBOARD_KEY = "oyl_onboarded_v1";
const COACH_KEY = "oyl_coach_seen_v1";
const ONBOARD_SLIDES = [
  { emoji:"🏡", title:"¡Bienvenido a OrdenYourLife!", text:"Tu app para organizar el dinero, las tareas y las comidas de la familia, todo en un mismo sitio." },
  { emoji:"🏠", title:"Sección Familia", text:"Aquí llevas el dinero (Inicio, Finanzas y Botes), el Calendario, las Estadísticas y las Tareas de casa." },
  { emoji:"🍽️", title:"Sección Menú", text:"Aquí planificas el menú semanal, controlas la despensa y generas la lista de la compra automáticamente." },
  { emoji:"✨", title:"Así de fácil funciona el dinero", text:"3 pasos:", steps:["Añade tu sueldo","Se reparte solo en tus botes 💰","Controla lo que gastas"] },
];
function WelcomeOverlay({onFinish}) {
  const [step,setStep]=useState(0);
  const s=ONBOARD_SLIDES[step];
  const last = step===ONBOARD_SLIDES.length-1;
  return (
    <div style={{position:"fixed",inset:0,background:"linear-gradient(160deg,#EEF2FF,#F0FDF4)",zIndex:5000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div className="popIn" style={{background:"#fff",borderRadius:24,padding:"36px 28px",maxWidth:380,width:"100%",textAlign:"center",boxShadow:"0 8px 40px rgba(0,0,0,0.12)"}}>
        <div style={{fontSize:56,marginBottom:14}}>{s.emoji}</div>
        <h2 style={{fontSize:21,fontWeight:800,color:"#1E293B",marginBottom:10}} className="fd">{s.title}</h2>
        <p style={{color:"#64748B",fontSize:14,lineHeight:1.5,marginBottom:s.steps?14:22}} className="fm">{s.text}</p>
        {s.steps && (
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:24,textAlign:"left"}}>
            {s.steps.map((st,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,background:"#F8FAFC",borderRadius:12,padding:"10px 12px"}}>
                <span style={{width:24,height:24,borderRadius:"50%",background:"#7C3AED",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,flexShrink:0}} className="fb">{i+1}</span>
                <span style={{fontSize:13,fontWeight:600,color:"#1E293B"}} className="fb">{st}</span>
                {i<s.steps.length-1 && <span style={{marginLeft:"auto",color:"#CBD5E1"}}>↓</span>}
              </div>
            ))}
          </div>
        )}
        <div style={{display:"flex",justifyContent:"center",gap:6,marginBottom:20}}>
          {ONBOARD_SLIDES.map((_,i)=><span key={i} style={{width:i===step?18:6,height:6,borderRadius:99,background:i===step?"#7C3AED":"#E2E8F0",transition:"all .2s"}}/>)}
        </div>
        <div style={{display:"flex",gap:10}}>
          {step>0 && <button onClick={()=>setStep(s=>s-1)} style={{...S.saveBtn,background:"#F1F5F9",color:"#64748B",flex:1}} className="fm">Atrás</button>}
          {!last && <button onClick={()=>setStep(s=>s+1)} style={{...S.saveBtn,background:"#7C3AED",flex:2}} className="fm">Siguiente</button>}
          {last && <button onClick={()=>{ localStorage.setItem(ONBOARD_KEY,"1"); onFinish(); }} style={{...S.saveBtn,background:"#22C55E",flex:2}} className="fm">¡Empezar! 🚀</button>}
        </div>
        {!last && <button onClick={()=>{ localStorage.setItem(ONBOARD_KEY,"1"); onFinish(); }} style={{background:"transparent",border:"none",color:"#94A3B8",fontSize:12,marginTop:14,cursor:"pointer"}} className="fm">Saltar</button>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  // ── Family state (Firebase) ──────────────────────────────────────────────
  const [users, setUsers]               = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [tasks, setTasks]               = useState([]);
  const [budgets, setBudgets]           = useState(DEFAULT_BUDGETS);
  const [botes, setBotes]               = useState([]);
  const [botesLoaded, setBotesLoaded]   = useState(false);
  const [recurrentes, setRecurrentes]           = useState([]);
  const [recurrentesLoaded, setRecurrentesLoaded] = useState(false);
  const [fbLoading, setFbLoading]       = useState(true);
  const [currentUser, setCurrentUser]   = useState(null);
  const [loginStep, setLoginStep]       = useState({ selectUser:true, selectedUser:null });
  const [pinInput, setPinInput]         = useState("");
  const [pinError, setPinError]         = useState(false);

  // ── Menu state (Firebase) ────────────────────────────────────────────────
  const [menuData, setMenuData]     = useState(initMenuData);
  const [menuDocLoaded, setMenuDocLoaded]   = useState(false);
  const [pantryLoaded, setPantryLoaded]     = useState(false);

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
  const [showWelcome, setShowWelcome] = useState(false);
  const [showCoach, setShowCoach]     = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(()=>{ if (currentUser && !localStorage.getItem(ONBOARD_KEY)) setShowWelcome(true); },[currentUser]);
  useEffect(()=>{ if (currentUser && !showWelcome && !localStorage.getItem(COACH_KEY)) setShowCoach(true); },[currentUser, showWelcome]);
  function dismissCoach(){ localStorage.setItem(COACH_KEY,"1"); setShowCoach(false); }

  // ── Firebase init ────────────────────────────────────────────────────────
  useEffect(() => {
    const seed = async () => {
      const uSnap = await getDocs(collection(db,"users"));
      if (uSnap.empty) for (const u of DEFAULT_USERS) await setDoc(doc(db,"users",u.id), u);
      const bSnap = await getDocs(collection(db,"config"));
      if (bSnap.empty) await setDoc(doc(db,"config","budgets"), DEFAULT_BUDGETS);
      const mSnap = await getDoc(doc(db,"menuData","current"));
      if (!mSnap.exists()) await setDoc(doc(db,"menuData","current"), { menu:JSON.parse(JSON.stringify(DEFAULT_MENU)), people:2, updatedAt:Date.now() });
      const pSnap = await getDocs(collection(db,"pantryMenu"));
      if (pSnap.empty) for (const item of DEFAULT_PANTRY_MENU) await setDoc(doc(db,"pantryMenu",item.id), item);
      const boSnap = await getDocs(collection(db,"botes"));
      if (boSnap.empty) for (const b of DEFAULT_BOTES) { const id=`bote_${b.name.toLowerCase().replace(/\s+/g,"-")}`; await setDoc(doc(db,"botes",id), {...b,id,amount:0}); }
      const rSnap = await getDocs(collection(db,"recurrentes"));
      if (rSnap.empty) for (const r of DEFAULT_RECURRENTES) await setDoc(doc(db,"recurrentes",r.id), r);
    };
    seed();
    const u1 = onSnapshot(collection(db,"users"),        s=>setUsers(s.docs.map(d=>({...d.data(),id:d.id}))));
    const u2 = onSnapshot(collection(db,"transactions"), s=>setTransactions(s.docs.map(d=>({...d.data(),id:d.id}))));
    const u3 = onSnapshot(collection(db,"tasks"),        s=>setTasks(s.docs.map(d=>({...d.data(),id:d.id}))));
    const u4 = onSnapshot(doc(db,"config","budgets"),    s=>{ if(s.exists()) setBudgets(s.data()); setFbLoading(false); });
    const u5 = onSnapshot(doc(db,"menuData","current"),  s=>{ if(s.exists()){ const d=s.data(); setMenuData(c=>({...c,menu:d.menu||DEFAULT_MENU,people:d.people??2})); } setMenuDocLoaded(true); });
    const u6 = onSnapshot(collection(db,"pantryMenu"),   s=>{ setMenuData(c=>({...c,pantryMenu:s.docs.map(d=>({...d.data(),id:d.id}))})); setPantryLoaded(true); });
    const u7 = onSnapshot(collection(db,"botes"),        s=>{ setBotes(s.docs.map(d=>({...d.data(),id:d.id}))); setBotesLoaded(true); });
    const u8 = onSnapshot(collection(db,"recurrentes"),  s=>{ setRecurrentes(s.docs.map(d=>({...d.data(),id:d.id}))); setRecurrentesLoaded(true); });
    return () => { u1(); u2(); u3(); u4(); u5(); u6(); u7(); u8(); };
  }, []);

  function showToast(msg, color="#22C55E") { setToast({msg,color}); setTimeout(()=>setToast(null),2500); }

  // ── Recurring expenses automation ───────────────────────────────────────────
  const autoProcessedRef = useRef(new Set());
  useEffect(() => {
    if (!currentUser || !recurrentesLoaded || fbLoading) return;
    const now = new Date();
    const today = now.getDate();
    const todayStr = now.toISOString().slice(0,10);
    const monthPrefix = todayStr.slice(0,7);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
    recurrentes.forEach(async r => {
      if (!r.active) return;
      const effDay = Math.min(r.day, daysInMonth);
      if (effDay !== today) return;
      const key = `${r.id}_${monthPrefix}`;
      if (autoProcessedRef.current.has(key)) return;
      const already = transactions.some(t=>t.recurrenteId===r.id && t.date && t.date.startsWith(monthPrefix));
      if (already) { autoProcessedRef.current.add(key); return; }
      autoProcessedRef.current.add(key);
      const bote = botes.find(b=>b.id===r.boteId);
      const txId = `tx_auto_${r.id}_${monthPrefix}`;
      await setDoc(doc(db,"transactions",txId), {
        id:txId, type:"expense", category:r.category, amount:r.amount, note:`Gasto recurrente: ${r.name}`,
        date:todayStr, userId:currentUser.id, boteId:r.boteId||null, boteNombre:bote?bote.name:null, recurrenteId:r.id,
      });
      if (bote) await updateDoc(doc(db,"botes",bote.id), { amount:+((bote.amount||0)-r.amount).toFixed(2) });
      showToast(`Se ha registrado automáticamente: ${r.name} ${r.amount}€`, "#3B82F6");
    });
  }, [currentUser, recurrentesLoaded, fbLoading, recurrentes, transactions, botes]);

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
  const totalBotes   = botes.reduce((a,b)=>a+(b.amount||0),0);
  const available    = totalIncome-totalBotes;
  const balance      = available-totalExpense;
  const myTasks      = () => isAdmin ? tasks : tasks.filter(t=>t.assignedTo===currentUser?.id);
  const getUser      = id => users.find(u=>u.id===id);
  const expByCat     = () => { const m={}; transactions.filter(t=>t.type==="expense").forEach(t=>{ m[t.category]=(m[t.category]||0)+t.amount; }); return m; };

  // ── Menu actions (Firebase) ──────────────────────────────────────────────
  const updateMealItem = useCallback(async (day,k,nm) => {
    const old = menuData.menu[day][k];
    await applyPantryDelta(db, menuData.pantryMenu, old.consumed, nm.consumed);
    await updateDoc(doc(db,"menuData","current"), { [`menu.${day}.${k}`]:nm, updatedAt:Date.now() });
  },[menuData]);

  const swapMealItem = useCallback(async (day,k,nm) => {
    const old = menuData.menu[day][k];
    if (old.consumed) await applyPantryDelta(db, menuData.pantryMenu, old.consumed, null);
    const reset = {...nm,status:"pending",consumed:null,improvisedName:""};
    await updateDoc(doc(db,"menuData","current"), { [`menu.${day}.${k}`]:reset, updatedAt:Date.now() });
  },[menuData]);

  const updPantryMenu = useCallback(async (id,ch) => { await updateDoc(doc(db,"pantryMenu",id), ch); },[]);
  const addPantryMenu = useCallback(async it => { const {id,...rest}=it; await setDoc(doc(db,"pantryMenu",id), {id,...rest}); },[]);
  const delPantryMenu = useCallback(async id => { await deleteDoc(doc(db,"pantryMenu",id)); },[]);
  const addReceiptMenu = useCallback(async items => {
    const batch = writeBatch(db);
    items.forEach(it=>{
      const existing = menuData.pantryMenu.find(p=>norm(p.name)===norm(it.name));
      if (existing) batch.update(doc(db,"pantryMenu",existing.id), { qty:+(existing.qty+(+it.qty||0)).toFixed(2) });
      else { const id=norm(it.name).replace(/\s+/g,"-")+"-"+Date.now(); batch.set(doc(db,"pantryMenu",id), { id,name:it.name,qty:+it.qty||1,unit:it.unit||"ud",threshold:+it.threshold||1,cat:it.cat||"Otros" }); }
    });
    await batch.commit();
    setReceiptOpen(false);
  },[menuData]);
  const setPeople = useCallback(async p => { await updateDoc(doc(db,"menuData","current"), { people:p, updatedAt:Date.now() }); },[]);
  const resetMenu = useCallback(async () => {
    await setDoc(doc(db,"menuData","current"), { menu:JSON.parse(JSON.stringify(DEFAULT_MENU)), people:2, updatedAt:Date.now() });
    const batch = writeBatch(db);
    menuData.pantryMenu.forEach(p=>batch.delete(doc(db,"pantryMenu",p.id)));
    DEFAULT_PANTRY_MENU.forEach(p=>batch.set(doc(db,"pantryMenu",p.id), p));
    await batch.commit();
  },[menuData]);
  const lowN = useMemo(()=>lowItems(menuData.pantryMenu).length,[menuData.pantryMenu]);

  const loading = fbLoading || !menuDocLoaded || !pantryLoaded || !botesLoaded || !recurrentesLoaded;

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
      {toast && <div style={{...S.toast,background:toast.color}} className="fm toastAnim">{toast.msg}</div>}
      {modal && <FamilyModal modal={modal} setModal={setModal} users={users} budgets={budgets} botes={botes} currentUser={currentUser} showToast={showToast} transactions={transactions} recurrentes={recurrentes}/>}
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
      {showWelcome && <WelcomeOverlay onFinish={()=>setShowWelcome(false)}/>}
      {confirmReset && (
        <ConfirmModal title="¿Reiniciar la semana?" message="Se recuperará el menú por defecto y la despensa volverá a sus cantidades iniciales. Esta acción no se puede deshacer."
          confirmLabel="Sí, reiniciar" confirmColor="#EF4444"
          onCancel={()=>setConfirmReset(false)}
          onConfirm={()=>{ resetMenu(); setConfirmReset(false); }}/>
      )}

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
            {familyScreen==="home"     && <HomeScreen     currentUser={currentUser} isAdmin={isAdmin} balance={balance} totalIncome={totalIncome} totalExpense={totalExpense} totalBotes={totalBotes} available={available} myTasks={myTasks()} transactions={transactions} recurrentes={recurrentes} setScreen={setFamilyScreen} setModal={setModal} getUser={getUser} showToast={showToast} showCoach={showCoach&&isAdmin} dismissCoach={dismissCoach}/>}
            {familyScreen==="finance"  && <FinanceScreen  currentUser={currentUser} isAdmin={isAdmin} balance={balance} totalIncome={totalIncome} totalExpense={totalExpense} totalBotes={totalBotes} available={available} transactions={transactions} budgets={budgets} expByCat={expByCat()} setModal={setModal} showToast={showToast} getUser={getUser}/>}
            {familyScreen==="botes"    && <BotesScreen    currentUser={currentUser} isAdmin={isAdmin} botes={botes} transactions={transactions} setModal={setModal} showToast={showToast}/>}
            {familyScreen==="recurrentes" && <RecurrentesScreen currentUser={currentUser} isAdmin={isAdmin} recurrentes={recurrentes} transactions={transactions} botes={botes} setModal={setModal} showToast={showToast}/>}
            {familyScreen==="calendar" && <CalendarScreen currentUser={currentUser} isAdmin={isAdmin} transactions={transactions} menu={menuData.menu} recurrentes={recurrentes} setModal={setModal}/>}
            {familyScreen==="stats"    && <StatsScreen    currentUser={currentUser} isAdmin={isAdmin} transactions={transactions} recurrentes={recurrentes}/>}
            {familyScreen==="tasks"    && <TasksScreen    currentUser={currentUser} isAdmin={isAdmin} myTasks={myTasks()} setModal={setModal} showToast={showToast} getUser={getUser}/>}
            {familyScreen==="settings" && <SettingsScreen currentUser={currentUser} isAdmin={isAdmin} users={users} showToast={showToast} setCurrentUser={setCurrentUser}/>}
          </main>
          <nav style={S.nav}>
            {[["home","🏠","Inicio"],["finance","💰","Finanzas"],["botes","🪣","Botes"],["recurrentes","🔄","Recurrentes"],["calendar","📅","Calendario"],["stats","📊","Stats"],["tasks","✅","Tareas"],["settings","⚙️","Ajustes"]].map(([k,ic,lb])=>(
              <button key={k} onClick={()=>setFamilyScreen(k)} style={{...S.navBtn,...(familyScreen===k?{color:currentUser.color,borderTop:`2px solid ${currentUser.color}`,background:currentUser.color+"10"}:{})}}>
                <span style={{fontSize:22}}>{ic}</span><span style={{fontSize:10,fontWeight:700}} className="fm">{lb}</span>
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
                  <button onClick={()=>setConfirmReset(true)} className="ml-auto fm text-[9px] uppercase text-gray-400 flex items-center gap-1"><RefreshCw className="w-2.5 h-2.5"/>Reiniciar</button>
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
function smartSummary({balance,available,totalExpense,transactions}) {
  const msgs = [];
  if (available>0) {
    const usedPct = (totalExpense/available)*100;
    if (usedPct>=80) msgs.push({ icon:"⚠️", color:"#F59E0B", bg:"#FFFBEB", border:"#FDE68A", text:`Ya has gastado el ${Math.min(usedPct,999).toFixed(0)}% de tu dinero disponible. ¡Vigila los próximos gastos!` });
  }
  if (balance>=0) msgs.push({ icon:"🎉", color:"#166534", bg:"#F0FDF4", border:"#BBF7D0", text:`¡Vas bien! Te quedan ${balance.toLocaleString("es-ES")} € disponibles.` });
  else msgs.push({ icon:"🔴", color:"#991B1B", bg:"#FEF2F2", border:"#FECACA", text:`Este mes se ha gastado más de lo disponible. Te faltarían ${Math.abs(balance).toLocaleString("es-ES")} €.` });
  if (transactions.length===0) {
    msgs.push({ icon:"📝", color:"#3730A3", bg:"#EEF2FF", border:"#C7D2FE", text:"Aún no has registrado ningún movimiento. ¡Empieza añadiendo tu sueldo!" });
  } else {
    const last = [...transactions].sort((a,b)=>b.date>a.date?1:-1)[0];
    const days = Math.floor((Date.now()-new Date(last.date+"T00:00:00").getTime())/86400000);
    if (days>=7) msgs.push({ icon:"📝", color:"#3730A3", bg:"#EEF2FF", border:"#C7D2FE", text:`Llevas ${days} días sin registrar ningún movimiento. ¿Se te olvidó anotar algo?` });
  }
  return msgs;
}

function HomeScreen({currentUser,isAdmin,balance,totalIncome,totalExpense,totalBotes,available,myTasks,transactions,recurrentes,setScreen,setModal,getUser,showCoach,dismissCoach}) {
  const pending=myTasks.filter(t=>!t.done); const done=myTasks.filter(t=>t.done);
  const summary = isAdmin ? smartSummary({balance,available,totalExpense,transactions}) : [];
  const monthly = useMemo(()=>computeMonthlyBalance(transactions, recurrentes), [transactions, recurrentes]);
  return (
    <div>
      <h2 style={S.title} className="fd">Hola, {currentUser.name} {currentUser.emoji}</h2>
      <p style={{color:"#64748B",marginBottom:20,fontSize:14}} className="fm">Resumen familiar</p>
      {isAdmin && (
        <div style={{...S.card,background:`linear-gradient(135deg,${currentUser.color},#1E293B)`,color:"#fff",marginBottom:16}}>
          <div style={{fontSize:12,opacity:0.8}} className="fm">Lo que te queda</div>
          <div style={{fontSize:32,fontWeight:800,margin:"6px 0"}} className="fd">{balance>=0?"+":""}{balance.toLocaleString("es-ES")} €</div>
          <div style={{display:"flex",gap:20}}>
            <div><div style={{fontSize:11,opacity:0.7}} className="fm">Ingresos totales</div><div style={{fontWeight:700}} className="fb">+{totalIncome.toLocaleString("es-ES")} €</div></div>
            <div><div style={{fontSize:11,opacity:0.7}} className="fm">En sobres 💰</div><div style={{fontWeight:700}} className="fb">{totalBotes.toLocaleString("es-ES")} €</div></div>
            <div><div style={{fontSize:11,opacity:0.7}} className="fm">Disponible</div><div style={{fontWeight:700}} className="fb">{available.toLocaleString("es-ES")} €</div></div>
          </div>
        </div>
      )}
      {isAdmin && (
        <div style={{...S.card,marginBottom:16}}>
          <div style={{display:"flex",gap:12}}>
            <div style={{flex:1}}>
              <div style={{fontSize:11,color:"#64748B"}} className="fm">Saldo actual</div>
              <div style={{fontSize:21,fontWeight:800,color:monthly.currentBalance>=0?"#1E293B":"#EF4444"}} className="fd">{monthly.currentBalance>=0?"+":""}{monthly.currentBalance.toLocaleString("es-ES")} €</div>
            </div>
            <div style={{flex:1,borderLeft:"1.5px solid #F1F5F9",paddingLeft:12}}>
              <div style={{fontSize:11,color:"#64748B"}} className="fm">Saldo a fin de mes</div>
              <div style={{fontSize:21,fontWeight:800,color:monthly.projectedBalance>=0?"#1E293B":"#EF4444"}} className="fd">{monthly.projectedBalance>=0?"+":""}{monthly.projectedBalance.toLocaleString("es-ES")} €</div>
            </div>
          </div>
          {monthly.pendingTotal>0 && <div style={{fontSize:11,color:"#94A3B8",marginTop:10}} className="fm">🔄 Recurrentes pendientes este mes: -{monthly.pendingTotal.toLocaleString("es-ES")} €</div>}
          {monthly.projectedBalance<0 && (
            <div style={{marginTop:10,padding:"8px 12px",borderRadius:10,background:"#FEE2E2",border:"1.5px solid #FCA5A5",display:"flex",alignItems:"center",gap:8}}>
              <AlertTriangle className="w-4 h-4" style={{color:"#B91C1C",flexShrink:0}}/>
              <span style={{fontSize:12,color:"#B91C1C",fontWeight:600}} className="fm">Con los recurrentes pendientes, el saldo de fin de mes será negativo.</span>
            </div>
          )}
        </div>
      )}
      {summary.map((m,i)=>(
        <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,background:m.bg,border:`1.5px solid ${m.border}`,borderRadius:14,padding:"12px 14px",marginBottom:10}}>
          <span style={{fontSize:18,flexShrink:0}}>{m.icon}</span>
          <span style={{fontSize:13,color:m.color,fontWeight:600,lineHeight:1.4}} className="fm">{m.text}</span>
        </div>
      ))}
      <div style={{display:"flex",gap:10,marginBottom:16,marginTop:6}}>
        {isAdmin && <>
          <div style={{flex:1,position:"relative"}}>
            {showCoach && (
              <div className="popIn" style={{position:"absolute",bottom:"calc(100% + 10px)",left:"50%",transform:"translateX(-50%)",background:"#1E293B",color:"#fff",borderRadius:12,padding:"10px 12px",width:180,textAlign:"center",zIndex:200,boxShadow:"0 6px 20px rgba(0,0,0,0.25)"}}>
                <div style={{fontSize:12,fontWeight:600,marginBottom:8}} className="fm">👋 ¡Empieza aquí! Añade tu primer sueldo.</div>
                <button onClick={dismissCoach} style={{background:"#7C3AED",border:"none",color:"#fff",borderRadius:8,padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}} className="fm">Entendido</button>
                <div style={{position:"absolute",top:"100%",left:"50%",transform:"translateX(-50%)",width:0,height:0,borderLeft:"7px solid transparent",borderRight:"7px solid transparent",borderTop:"7px solid #1E293B"}}/>
              </div>
            )}
            <button className={showCoach?"coachPulse":""} style={{...S.qBtn,width:"100%",borderColor:"#22C55E",background:"#F0FDF4"}} onClick={()=>{ setModal({type:"addTx",data:{t:"income"}}); if(showCoach) dismissCoach(); }}><span style={{fontSize:22}}>📈</span><span className="fm" style={{color:"#166534",fontWeight:700}}>Ingreso</span></button>
          </div>
          <button style={{...S.qBtn,borderColor:"#EF4444",background:"#FEF2F2"}} onClick={()=>setModal({type:"addTx",data:{t:"expense"}})}><span style={{fontSize:22}}>📉</span><span className="fm" style={{color:"#991B1B",fontWeight:700}}>Gasto</span></button>
        </>}
        <button style={{...S.qBtn,borderColor:currentUser.color}} onClick={()=>setModal({type:"addTask"})}><span style={{fontSize:22}}>✅</span><span className="fm">Tarea</span></button>
      </div>
      <div style={S.card}>
        <div style={S.cardHead}><span style={S.cardTitle} className="fb">Mis tareas</span>
          <button style={{...S.link,color:currentUser.color}} onClick={()=>setScreen("tasks")} className="fm">Ver todas →</button>
        </div>
        {pending.length===0 && <p style={S.empty} className="fm">🎉 ¡Sin tareas pendientes! Todo bajo control.</p>}
        {pending.slice(0,3).map(t=><TaskRow key={t.id} task={t} currentUser={currentUser} getUser={getUser} isAdmin={isAdmin} compact/>)}
        {done.length>0 && <div style={{fontSize:12,color:"#94A3B8",marginTop:8}} className="fm">✔️ {done.length} completada{done.length>1?"s":""}</div>}
      </div>
      {isAdmin && (
        <div style={S.card}>
          <div style={S.cardHead}><span style={S.cardTitle} className="fb">Últimos movimientos</span>
            <button style={{...S.link,color:currentUser.color}} onClick={()=>setScreen("finance")} className="fm">Ver todos →</button>
          </div>
          {transactions.length===0 && <p style={S.empty} className="fm">Aún no hay movimientos. Toca "＋ Ingreso" arriba para añadir tu sueldo y empezar.</p>}
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

function FinanceScreen({currentUser,isAdmin,balance,totalIncome,totalExpense,totalBotes,available,transactions,budgets,expByCat,setModal,showToast,getUser}) {
  const [tab,setTab]=useState("mov");
  const [confirmDel,setConfirmDel]=useState(null);
  if (!isAdmin) return <div style={{textAlign:"center",padding:60}}><div style={{fontSize:48}}>🔒</div><p style={{color:"#64748B",marginTop:12}} className="fm">Solo los administradores pueden ver las finanzas.</p></div>;
  async function delTx(id){ await deleteDoc(doc(db,"transactions",id)); showToast("Movimiento eliminado","#EF4444"); }
  return (
    <div>
      {confirmDel && (
        <ConfirmModal title="¿Eliminar este movimiento?" message={`"${confirmDel.category}" · ${confirmDel.amount.toLocaleString("es-ES")} € — esta acción no se puede deshacer.`}
          onCancel={()=>setConfirmDel(null)} onConfirm={()=>{ delTx(confirmDel.id); setConfirmDel(null); }}/>
      )}
      <div style={S.scrHead}>
        <h2 style={S.title} className="fd">Finanzas 💰</h2>
        <button style={{...S.addBtnBig,background:"#22C55E"}} onClick={()=>setModal({type:"addTx"})}><Plus className="w-4 h-4"/><span className="fm">Añadir</span></button>
      </div>
      <div style={{display:"flex",gap:10,marginBottom:4}}>
        {[["Ingresos","Lo que entra","#22C55E",`+${totalIncome.toLocaleString("es-ES")} €`],["Gastos","Lo que sale","#EF4444",`-${totalExpense.toLocaleString("es-ES")} €`],["Balance","Lo que te queda",currentUser.color,`${balance>=0?"+":""}${balance.toLocaleString("es-ES")} €`]].map(([l,cap,c,v])=>(
          <div key={l} style={{flex:1,background:"#fff",borderRadius:14,padding:12,borderLeft:`3px solid ${c}`,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
            <div style={{fontSize:11,color:"#64748B"}} className="fm">{l}</div>
            <div style={{fontSize:16,fontWeight:800,color:c}} className="fd">{v}</div>
            <div style={{fontSize:10,color:"#94A3B8",marginTop:2}} className="fm">{cap}</div>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:10,marginBottom:16,marginTop:10}}>
        {[["Ingresos totales","#22C55E",`+${totalIncome.toLocaleString("es-ES")} €`],["En sobres 💰","#8B5CF6",`${totalBotes.toLocaleString("es-ES")} €`],["Disponible","#0EA5E9",`${available.toLocaleString("es-ES")} €`]].map(([l,c,v])=>(
          <div key={l} style={{flex:1,background:"#F8FAFC",borderRadius:14,padding:12,border:`1.5px solid ${c}30`}}>
            <div style={{fontSize:10,color:"#64748B"}} className="fm">{l}</div>
            <div style={{fontSize:14,fontWeight:800,color:c}} className="fd">{v}</div>
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
          {transactions.length===0 && (
            <div style={{textAlign:"center",padding:"32px 16px",background:"#F8FAFC",borderRadius:16}}>
              <div style={{fontSize:40,marginBottom:10}}>💸</div>
              <p style={{color:"#1E293B",fontWeight:700,marginBottom:4}} className="fb">Aún no hay movimientos</p>
              <p style={{color:"#64748B",fontSize:13,marginBottom:16}} className="fm">Registra tu primer ingreso o gasto para empezar a ver tu dinero claro.</p>
              <button style={{...S.saveBtn,background:"#22C55E",padding:"10px 24px"}} onClick={()=>setModal({type:"addTx"})} className="fm">＋ Añadir movimiento</button>
            </div>
          )}
          {[...transactions].sort((a,b)=>b.date>a.date?1:-1).map(tx=>(
            <div key={tx.id} style={{...S.card,borderLeft:`4px solid ${tx.type==="income"?"#22C55E":"#EF4444"}`,padding:"12px 14px",marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontWeight:600,color:"#1E293B"}} className="fb">{tx.category}</div>
                  {tx.note && <div style={{fontSize:12,color:"#64748B"}} className="fm">{tx.note}</div>}
                  {tx.type==="expense" && tx.boteNombre && <div style={{fontSize:11,color:"#8B5CF6",fontWeight:600}} className="fm">💰 {tx.boteNombre}</div>}
                  <div style={{fontSize:11,color:"#94A3B8",marginTop:2}} className="fm">{tx.date} · {getUser(tx.userId)?.emoji} {getUser(tx.userId)?.name}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontWeight:800,color:tx.type==="income"?"#22C55E":"#EF4444",fontSize:16}} className="fd">{tx.type==="income"?"+":"-"}{tx.amount.toLocaleString("es-ES")} €</span>
                  <button onClick={()=>setConfirmDel(tx)} style={S.iconBtn}>🗑️</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {tab==="bud" && (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <p style={{color:"#64748B",fontSize:13}} className="fm">Cuánto quieres gastar como máximo en cada categoría</p>
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
                {over && <div style={{fontSize:11,color:"#EF4444",marginTop:6,fontWeight:600}} className="fm">Te has pasado {(spent-budget).toLocaleString("es-ES")} € en {cat}.</div>}
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
  const EMPTY_MSG = { all:"No hay tareas todavía. Crea la primera para organizar la casa.", pending:"🎉 ¡No hay tareas pendientes! Todo al día.", done:"Todavía no has completado ninguna tarea." };
  return (
    <div>
      <div style={S.scrHead}>
        <h2 style={S.title} className="fd">Tareas ✅</h2>
        {isAdmin && <button style={{...S.addBtnBig,background:currentUser.color}} onClick={()=>setModal({type:"addTask"})}><Plus className="w-4 h-4"/><span className="fm">Añadir</span></button>}
      </div>
      <div style={S.tabs}>
        {[["all","Todas"],["pending","Pendientes"],["done","Hechas"]].map(([k,l])=>(
          <button key={k} onClick={()=>setFilter(k)} style={{...S.tabBtn,...(filter===k?{borderBottomColor:currentUser.color,color:currentUser.color}:{})}} className="fm">{l}</button>
        ))}
      </div>
      {filtered.length===0 && (
        <div style={{textAlign:"center",padding:"32px 16px",background:"#F8FAFC",borderRadius:16}}>
          <div style={{fontSize:36,marginBottom:8}}>{filter==="pending"?"🎉":"📋"}</div>
          <p style={{color:"#64748B",fontSize:13}} className="fm">{EMPTY_MSG[filter]}</p>
        </div>
      )}
      {filtered.map(t=><TaskRow key={t.id} task={t} currentUser={currentUser} getUser={getUser} isAdmin={isAdmin} showToast={showToast}/>)}
    </div>
  );
}

function TaskRow({task,currentUser,getUser,isAdmin,compact,showToast}) {
  const assignee=getUser(task.assignedTo);
  const overdue=!task.done&&task.dueDate<new Date().toISOString().slice(0,10);
  const [confirmDel,setConfirmDel]=useState(false);
  async function toggle(){ await updateDoc(doc(db,"tasks",task.id),{done:!task.done}); if(showToast) showToast(task.done?"Tarea reabierta":"¡Completada! 🎉"); }
  async function del(){ await deleteDoc(doc(db,"tasks",task.id)); if(showToast) showToast("Tarea eliminada","#EF4444"); }
  return (
    <div style={{...S.card,borderLeft:`4px solid ${PCOLOR[task.priority]}`,opacity:task.done?0.6:1,marginBottom:10,padding:"12px 14px"}}>
      {confirmDel && (
        <ConfirmModal title="¿Eliminar esta tarea?" message={`"${task.title}" se eliminará para siempre.`}
          onCancel={()=>setConfirmDel(false)} onConfirm={()=>{ del(); setConfirmDel(false); }}/>
      )}
      <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
        <button onClick={toggle} style={{width:26,height:26,borderRadius:8,border:`2px solid ${task.done?"#22C55E":currentUser.color}`,background:task.done?"#22C55E":"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,marginTop:2}}>
          {task.done && <span style={{color:"#fff",fontSize:14}}>✔</span>}
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
        {isAdmin && !compact && <button onClick={()=>setConfirmDel(true)} style={S.iconBtn}>🗑️</button>}
      </div>
    </div>
  );
}

const FAQ_ITEMS = [
  { q:"¿Cómo añado mi sueldo?", a:'Ve a "Inicio" o "Finanzas" y toca el botón verde "＋ Ingreso". Elige la categoría "Sueldo", escribe la cantidad y guarda. El dinero se repartirá automáticamente entre tus sobres (botes) según el % que hayas definido.' },
  { q:"¿Qué son los botes?", a:'Los botes son como "sobres de dinero" 💰: cada vez que registras un ingreso, se reparte solo entre ellos (por ejemplo 20% a Ahorro, 50% a Gastos fijos...). Así siempre sabes cuánto tienes disponible para cada cosa.' },
  { q:"¿Cómo funciona el menú semanal?", a:'En la pestaña "🍽️ Menú" tienes 3 comidas planificadas para cada día. Toca un plato para marcarlo como "hecho", decir que improvisaste otra cosa, o cambiarlo por otro con el botón "Cambiar plato".' },
  { q:"¿Cómo cambio mi PIN?", a:'Ve a "Ajustes", toca el lápiz ✏️ junto a tu nombre en "Perfiles de familia", escribe el nuevo PIN de 4 dígitos y pulsa "Guardar".' },
];
function HelpModal({onClose}) {
  const [open,setOpen]=useState(0);
  return (
    <div style={S.overlay} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={S.mbox}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <span style={{fontWeight:700,fontSize:17,color:"#1E293B"}} className="fb">Ayuda y preguntas frecuentes ❓</span>
          <button onClick={onClose} style={{background:"#F1F5F9",border:"none",borderRadius:"50%",width:32,height:32,cursor:"pointer",fontSize:16,color:"#64748B"}}>✕</button>
        </div>
        {FAQ_ITEMS.map((f,i)=>(
          <div key={i} style={{border:"1.5px solid #F1F5F9",borderRadius:14,marginBottom:10,overflow:"hidden"}}>
            <button onClick={()=>setOpen(open===i?-1:i)} style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",background:open===i?"#F8FAFC":"#fff",border:"none",cursor:"pointer",textAlign:"left"}}>
              <span style={{fontWeight:600,fontSize:14,color:"#1E293B"}} className="fb">{f.q}</span>
              <span style={{color:"#94A3B8",fontSize:14,transform:open===i?"rotate(180deg)":"none",transition:"transform .2s"}}>▾</span>
            </button>
            {open===i && <p style={{padding:"0 16px 14px",fontSize:13,color:"#64748B",lineHeight:1.5}} className="fm">{f.a}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsScreen({currentUser,isAdmin,users,showToast,setCurrentUser}) {
  const [editUser,setEditUser]=useState(null); const [form,setForm]=useState({});
  const [showHelp,setShowHelp]=useState(false);
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
      {showHelp && <HelpModal onClose={()=>setShowHelp(false)}/>}
      <button onClick={()=>setShowHelp(true)} style={{display:"flex",alignItems:"center",gap:12,width:"100%",background:"#EEF2FF",border:"1.5px solid #C7D2FE",borderRadius:16,padding:"14px 16px",marginTop:14,marginBottom:16,cursor:"pointer",textAlign:"left"}}>
        <span style={{width:40,height:40,borderRadius:12,background:"#7C3AED",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>❓</span>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:14,color:"#1E293B"}} className="fb">Ayuda y preguntas frecuentes</div>
          <div style={{fontSize:12,color:"#64748B"}} className="fm">¿Cómo añado mi sueldo? ¿Qué son los botes? y más</div>
        </div>
        <span style={{color:"#94A3B8"}}>→</span>
      </button>
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

function FamilyModal({modal,setModal,users,budgets,botes,currentUser,showToast,transactions,recurrentes}) {
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
  if (modal.type==="addTx") return <AddTxModal W={W} close={close} currentUser={currentUser} showToast={showToast} initType={modal.data?.t} initDate={modal.data?.date} botes={botes}/>;
  if (modal.type==="addTask") return <AddTaskModal W={W} close={close} users={users} currentUser={currentUser} showToast={showToast}/>;
  if (modal.type==="editBudget") return <EditBudgetModal W={W} close={close} budgets={budgets} currentUser={currentUser} showToast={showToast}/>;
  if (modal.type==="addBote") return <AddBoteModal W={W} close={close} currentUser={currentUser} showToast={showToast}/>;
  if (modal.type==="editBote") return <EditBoteModal W={W} close={close} currentUser={currentUser} showToast={showToast} bote={modal.data}/>;
  if (modal.type==="withdrawBote") return <WithdrawBoteModal W={W} close={close} currentUser={currentUser} showToast={showToast} bote={modal.data}/>;
  if (modal.type==="addRecurrente") return <RecurrenteModal W={W} close={close} currentUser={currentUser} showToast={showToast} botes={botes} recurrente={null} initTipo={modal.data?.tipo}/>;
  if (modal.type==="editRecurrente") return <RecurrenteModal W={W} close={close} currentUser={currentUser} showToast={showToast} botes={botes} recurrente={modal.data}/>;
  if (modal.type==="boteAvailability") return <BoteAvailabilityModal W={W} close={close} currentUser={currentUser} transactions={transactions} recurrentes={recurrentes}/>;
  return null;
}

function BoteAvailabilityModal({W,close,currentUser,transactions,recurrentes}) {
  const { monthIncome, monthExpenseToDate, pendingTotal, projectedBalance } = computeMonthlyBalance(transactions, recurrentes);
  const positive = projectedBalance>=0;
  return (
    <W title="Disponible para distribuir en botes">
      <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:13,color:"#64748B"}} className="fm">Ingresos del mes</span>
          <span style={{fontSize:14,fontWeight:700,color:"#22C55E"}} className="fb">+{monthIncome.toLocaleString("es-ES")} €</span>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:13,color:"#64748B"}} className="fm">Gastos registrados</span>
          <span style={{fontSize:14,fontWeight:700,color:"#EF4444"}} className="fb">-{monthExpenseToDate.toLocaleString("es-ES")} €</span>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:13,color:"#64748B"}} className="fm">🔄 Recurrentes pendientes</span>
          <span style={{fontSize:14,fontWeight:700,color:"#F59E0B"}} className="fb">-{pendingTotal.toLocaleString("es-ES")} €</span>
        </div>
        <div style={{height:1,background:"#E2E8F0",margin:"2px 0"}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:14,fontWeight:700,color:"#1E293B"}} className="fb">Disponible para botes</span>
          <span style={{fontSize:18,fontWeight:800,color:positive?"#22C55E":"#EF4444"}} className="fd">{positive?"+":""}{projectedBalance.toLocaleString("es-ES")} €</span>
        </div>
      </div>
      {!positive && (
        <div style={{padding:"10px 12px",borderRadius:12,background:"#FEE2E2",border:"1.5px solid #FCA5A5",marginBottom:16,display:"flex",alignItems:"flex-start",gap:8}}>
          <AlertTriangle className="w-4 h-4" style={{color:"#B91C1C",flexShrink:0,marginTop:1}}/>
          <span style={{fontSize:12,color:"#B91C1C",fontWeight:600,lineHeight:1.4}} className="fm">Con los recurrentes pendientes de pagar este mes, no queda dinero disponible para repartir en botes.</span>
        </div>
      )}
      <button onClick={close} style={{...S.saveBtn,background:currentUser.color,width:"100%"}} className="fm">Entendido</button>
    </W>
  );
}

function AddTxModal({W,close,currentUser,showToast,initType,initDate,botes}) {
  const [form,setForm]=useState({type:initType||"expense",category:"",amount:"",note:"",date:initDate||new Date().toISOString().slice(0,10),boteId:""});
  const cats=form.type==="income"?INCOME_CATS:EXPENSE_CATS;
  const amountNum = Number(form.amount)||0;
  const selectedBote = botes?.find(b=>b.id===form.boteId);
  const insufficientFunds = form.type==="expense" && selectedBote && amountNum>(selectedBote.amount||0);
  async function submit(){
    if(!form.category||!form.amount||isNaN(Number(form.amount))){showToast("Completa categoría e importe","#EF4444");return;}
    const id=`tx_${Date.now()}`;
    const amount=Number(form.amount);
    const bote = form.type==="expense" ? botes?.find(b=>b.id===form.boteId) : null;
    await setDoc(doc(db,"transactions",id),{
      type:form.type, category:form.category, amount, note:form.note, date:form.date, userId:currentUser.id, id,
      boteId: form.type==="expense" ? (form.boteId||null) : null,
      boteNombre: form.type==="expense" ? (bote?bote.name:null) : null,
    });
    if (form.type==="income" && botes?.length) {
      const batch=writeBatch(db);
      botes.forEach(b=>{ batch.update(doc(db,"botes",b.id), { amount:+(( b.amount||0)+amount*(b.pct||0)/100).toFixed(2) }); });
      await batch.commit();
    }
    if (form.type==="expense" && bote) {
      await updateDoc(doc(db,"botes",bote.id), { amount:+((bote.amount||0)-amount).toFixed(2) });
    }
    showToast(form.type==="income"?"Ingreso añadido 📈":"Gasto registrado 📉"); close();
  }
  return (
    <W title={form.type==="income"?"Añadir ingreso":"Añadir gasto"}>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {["income","expense"].map(t=>(
          <button key={t} onClick={()=>setForm(f=>({...f,type:t,category:"",boteId:""}))} style={{flex:1,padding:"10px 0",border:"none",borderRadius:10,fontWeight:600,fontSize:14,cursor:"pointer",background:form.type===t?(t==="income"?"#22C55E":"#EF4444"):"#F1F5F9",color:form.type===t?"#fff":"#64748B"}} className="fm">
            {t==="income"?"📈 Ingreso":"📉 Gasto"}
          </button>
        ))}
      </div>
      <label style={S.lbl} className="fm">Categoría</label>
      <select style={S.inp} value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} className="fb"><option value="">Seleccionar…</option>{cats.map(c=><option key={c} value={c}>{c}</option>)}</select>
      <label style={S.lbl} className="fm">Importe (€)</label>
      <input style={S.inp} type="number" placeholder="0.00" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} className="fb"/>
      {form.type==="expense" && botes?.length>0 && (
        <div style={{marginBottom:16}}>
          <label style={S.lbl} className="fm">¿De qué bote descontar?</label>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <button type="button" onClick={()=>setForm(f=>({...f,boteId:""}))} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:12,border:`2px solid ${form.boteId===""?"#94A3B8":"#E2E8F0"}`,background:form.boteId===""?"#F1F5F9":"#fff",cursor:"pointer",textAlign:"left"}}>
              <span style={{width:14,height:14,borderRadius:"50%",background:"#CBD5E1",flexShrink:0}}/>
              <span style={{flex:1,fontWeight:600,fontSize:14,color:"#1E293B"}} className="fb">Sin bote</span>
            </button>
            {botes.map(b=>(
              <button type="button" key={b.id} onClick={()=>setForm(f=>({...f,boteId:b.id}))} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:12,border:`2px solid ${form.boteId===b.id?b.color:"#E2E8F0"}`,background:form.boteId===b.id?b.color+"15":"#fff",cursor:"pointer",textAlign:"left"}}>
                <span style={{width:14,height:14,borderRadius:"50%",background:b.color,flexShrink:0}}/>
                <span style={{flex:1,fontWeight:600,fontSize:14,color:"#1E293B"}} className="fb">{b.name}</span>
                <span style={{fontSize:13,fontWeight:700,color:"#64748B"}} className="fd">{(b.amount||0).toLocaleString("es-ES")} €</span>
              </button>
            ))}
          </div>
          {insufficientFunds && (
            <div style={{marginTop:8,padding:"8px 12px",borderRadius:10,background:"#FEE2E2",border:"1.5px solid #FCA5A5"}}>
              <span style={{fontSize:12,color:"#B91C1C",fontWeight:600}} className="fm">⚠️ Este bote no tiene saldo suficiente ({(selectedBote.amount||0).toLocaleString("es-ES")} €), pero puedes continuar igualmente.</span>
            </div>
          )}
        </div>
      )}
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
// BOTES (SAVINGS JARS)
// ══════════════════════════════════════════════════════════════════════════════
function BotesScreen({currentUser,isAdmin,botes,transactions,setModal,showToast}) {
  const totalPct = botes.reduce((a,b)=>a+(b.pct||0),0);
  const totalBotes = botes.reduce((a,b)=>a+(b.amount||0),0);
  const [confirmDel,setConfirmDel]=useState(null);
  async function delBote(id){ await deleteDoc(doc(db,"botes",id)); showToast("Sobre eliminado","#EF4444"); }
  return (
    <div>
      {confirmDel && (
        <ConfirmModal title="¿Eliminar este sobre?" message={`"${confirmDel.name}" tiene ${(confirmDel.amount||0).toLocaleString("es-ES")} € guardados. Se perderá ese registro.`}
          onCancel={()=>setConfirmDel(null)} onConfirm={()=>{ delBote(confirmDel.id); setConfirmDel(null); }}/>
      )}
      <div style={S.scrHead}>
        <div>
          <h2 style={S.title} className="fd">Botes 🪣</h2>
          <p style={{color:"#64748B",fontSize:12,marginTop:2}} className="fm">Tus sobres de dinero 💰 — cada ingreso se reparte solo entre ellos</p>
        </div>
        <button style={{...S.addBtnBig,background:currentUser.color,flexShrink:0}} onClick={()=>setModal({type:"addBote"})}><Plus className="w-4 h-4"/><span className="fm">Añadir</span></button>
      </div>
      {botes.length>0 && (
        <div style={{...S.card,background:"linear-gradient(135deg,#8B5CF6,#1E293B)",color:"#fff",marginBottom:16,marginTop:14}}>
          <div style={{fontSize:12,opacity:0.8}} className="fm">Total en todos los sobres</div>
          <div style={{fontSize:28,fontWeight:800,margin:"4px 0"}} className="fd">{totalBotes.toLocaleString("es-ES")} €</div>
        </div>
      )}
      {botes.length>0 && (
        <button onClick={()=>setModal({type:"boteAvailability"})} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,width:"100%",background:"#EEF2FF",border:"1.5px solid #C7D2FE",borderRadius:14,padding:"12px 14px",marginBottom:16,cursor:"pointer",fontWeight:700,fontSize:13,color:"#3730A3"}} className="fm">📊 Ver disponible para distribuir en botes</button>
      )}
      {botes.length>0 && totalPct!==100 && (
        <div style={{background:"#FEF3C7",border:"2px solid #FCD34D",borderRadius:14,padding:"12px 14px",marginBottom:16,display:"flex",alignItems:"flex-start",gap:8}}>
          <AlertTriangle className="w-4 h-4" style={{color:"#B45309",flexShrink:0,marginTop:2}}/>
          <span style={{fontSize:13,color:"#92400E",fontWeight:600,lineHeight:1.4}} className="fm">
            Tus sobres reparten el {totalPct}% de cada ingreso, no el 100%.{totalPct<100?` Falta repartir el ${100-totalPct}%.`:` Te pasas por ${totalPct-100}%.`} Toca el ✏️ de cada sobre para ajustar su porcentaje hasta que sumen 100%.
          </span>
        </div>
      )}
      {botes.length===0 && (
        <div style={{textAlign:"center",padding:"36px 16px",background:"#F8FAFC",borderRadius:16}}>
          <div style={{fontSize:40,marginBottom:10}}>💰</div>
          <p style={{color:"#1E293B",fontWeight:700,marginBottom:4}} className="fb">Aún no tienes sobres de dinero</p>
          <p style={{color:"#64748B",fontSize:13,marginBottom:16}} className="fm">Crea sobres como "Ahorro" u "Ocio" y cada ingreso que registres se repartirá solo entre ellos, según el % que elijas.</p>
          <button style={{...S.saveBtn,background:currentUser.color,padding:"10px 24px"}} onClick={()=>setModal({type:"addBote"})} className="fm">＋ Crear mi primer sobre</button>
        </div>
      )}
      {botes.map(b=>{
        const history = transactions.filter(t=>t.type==="expense"&&t.boteId===b.id).sort((a,b2)=>b2.date>a.date?1:-1);
        return (
        <div key={b.id} style={S.card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
            <div>
              <div style={{fontWeight:700,fontSize:16,color:"#1E293B"}} className="fb">{b.name}</div>
              <div style={{fontSize:12,color:b.color,fontWeight:600}} className="fm">{b.pct}% de los ingresos</div>
            </div>
            <div style={{display:"flex",gap:2}}>
              <button onClick={()=>setModal({type:"editBote",data:b})} style={S.iconBtn}>✏️</button>
              {isAdmin && <button onClick={()=>setConfirmDel(b)} style={S.iconBtn}>🗑️</button>}
            </div>
          </div>
          <div style={{fontSize:26,fontWeight:800,color:"#1E293B",marginBottom:10}} className="fd">{(b.amount||0).toLocaleString("es-ES")} €</div>
          <div style={{height:8,background:"#F1F5F9",borderRadius:99,overflow:"hidden",marginBottom:12}}>
            <div style={{height:"100%",width:`${Math.min(b.pct||0,100)}%`,borderRadius:99,background:b.color,transition:"width 0.5s"}}/>
          </div>
          <button onClick={()=>setModal({type:"withdrawBote",data:b})} style={{...S.saveBtn,background:"#F1F5F9",color:"#64748B",width:"100%",fontSize:13,padding:"9px 0"}} className="fm">💸 Retirar dinero</button>
          {history.length>0 && (
            <div style={{marginTop:14,paddingTop:12,borderTop:"1px solid #F1F5F9"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:8}} className="fm">GASTOS DESCONTADOS ({history.length})</div>
              {history.slice(0,5).map(tx=>(
                <div key={tx.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0"}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:"#1E293B"}} className="fb">{tx.category}</div>
                    <div style={{fontSize:10,color:"#94A3B8"}} className="fm">{tx.date}</div>
                  </div>
                  <span style={{fontSize:13,fontWeight:700,color:"#EF4444"}} className="fb">-{tx.amount.toLocaleString("es-ES")} €</span>
                </div>
              ))}
              {history.length>5 && <div style={{fontSize:11,color:"#94A3B8",marginTop:4}} className="fm">+{history.length-5} más…</div>}
            </div>
          )}
        </div>
      );})}
    </div>
  );
}

function ColorPicker({value,onChange}) {
  return (
    <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
      {BOTE_COLORS.map(c=>(
        <button key={c} type="button" onClick={()=>onChange(c)} style={{width:32,height:32,borderRadius:"50%",background:c,border:value===c?"3px solid #1E293B":"3px solid transparent",cursor:"pointer",padding:0}}/>
      ))}
    </div>
  );
}

function AddBoteModal({W,close,currentUser,showToast}) {
  const [form,setForm]=useState({name:"",pct:"",color:BOTE_COLORS[0]});
  async function submit(){
    const pct=Number(form.pct);
    if(!form.name.trim()||!form.pct||isNaN(pct)||pct<=0||pct>100){ showToast("Nombre y porcentaje (1-100) requeridos","#EF4444"); return; }
    const id=`bote_${form.name.toLowerCase().trim().replace(/\s+/g,"-")}-${Date.now()}`;
    await setDoc(doc(db,"botes",id), { id,name:form.name.trim(),pct,color:form.color,amount:0 });
    showToast("Bote creado 🪣"); close();
  }
  return (
    <W title="Nuevo bote">
      <label style={S.lbl} className="fm">Nombre</label>
      <input style={S.inp} placeholder="Ej. Vacaciones" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} className="fb"/>
      <label style={S.lbl} className="fm">Porcentaje (%)</label>
      <input style={S.inp} type="number" min="0" max="100" placeholder="0" value={form.pct} onChange={e=>setForm(f=>({...f,pct:e.target.value}))} className="fb"/>
      <label style={S.lbl} className="fm">Color</label>
      <ColorPicker value={form.color} onChange={c=>setForm(f=>({...f,color:c}))}/>
      <button onClick={submit} style={{...S.saveBtn,background:currentUser.color,width:"100%"}} className="fm">Crear bote</button>
    </W>
  );
}

function EditBoteModal({W,close,currentUser,showToast,bote}) {
  const [form,setForm]=useState({name:bote.name,pct:String(bote.pct),color:bote.color});
  async function save(){
    const pct=Number(form.pct);
    if(!form.name.trim()||!form.pct||isNaN(pct)||pct<=0||pct>100){ showToast("Nombre y porcentaje (1-100) requeridos","#EF4444"); return; }
    await updateDoc(doc(db,"botes",bote.id), { name:form.name.trim(), pct, color:form.color });
    showToast("Bote actualizado ✅"); close();
  }
  return (
    <W title="Editar bote">
      <label style={S.lbl} className="fm">Nombre</label>
      <input style={S.inp} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} className="fb"/>
      <label style={S.lbl} className="fm">Porcentaje (%)</label>
      <input style={S.inp} type="number" min="0" max="100" value={form.pct} onChange={e=>setForm(f=>({...f,pct:e.target.value}))} className="fb"/>
      <label style={S.lbl} className="fm">Color</label>
      <ColorPicker value={form.color} onChange={c=>setForm(f=>({...f,color:c}))}/>
      <button onClick={save} style={{...S.saveBtn,background:currentUser.color,width:"100%"}} className="fm">Guardar</button>
    </W>
  );
}

function WithdrawBoteModal({W,close,currentUser,showToast,bote}) {
  const [amount,setAmount]=useState("");
  async function submit(){
    const n=Number(amount);
    if(!amount||isNaN(n)||n<=0){ showToast("Introduce un importe válido","#EF4444"); return; }
    const next=Math.max(0,+((bote.amount||0)-n).toFixed(2));
    await updateDoc(doc(db,"botes",bote.id), { amount:next });
    showToast(`Retirados ${n.toLocaleString("es-ES")} € de ${bote.name} 💸`); close();
  }
  return (
    <W title={`Retirar de ${bote.name}`}>
      <p style={{fontSize:13,color:"#64748B",marginBottom:12}} className="fm">Disponible: {(bote.amount||0).toLocaleString("es-ES")} €</p>
      <label style={S.lbl} className="fm">Importe a retirar (€)</label>
      <input style={S.inp} type="number" placeholder="0.00" value={amount} onChange={e=>setAmount(e.target.value)} className="fb"/>
      <button onClick={submit} style={{...S.saveBtn,background:currentUser.color,width:"100%"}} className="fm">Confirmar retiro</button>
    </W>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// RECURRING EXPENSES
// ══════════════════════════════════════════════════════════════════════════════
function RecurrentesScreen({currentUser,isAdmin,recurrentes,transactions,botes,setModal,showToast}) {
  const [tab,setTab] = useState("fijo");
  const [confirmDel,setConfirmDel] = useState(null);
  const today = new Date();
  const todayNum = today.getDate();
  const monthPrefix = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}`;
  const daysInMonth = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();
  const effDay = r => Math.min(r.day, daysInMonth);
  const isPaid = r => transactions.some(t=>t.recurrenteId===r.id && t.date && t.date.startsWith(monthPrefix));
  function daysLeftLabel(r) {
    const d = effDay(r)-todayNum;
    if (d>0) return `en ${d} día${d>1?"s":""}`;
    if (d===0) return "hoy";
    return "atrasado";
  }

  const allPendingTotal = useMemo(()=>recurrentes.filter(r=>r.active&&!isPaid(r)).reduce((a,r)=>a+r.amount,0), [recurrentes,transactions]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = recurrentes.filter(r=>r.tipo===tab).sort((a,b)=>a.day-b.day);
  const activeList = filtered.filter(r=>r.active);
  const pausedList = filtered.filter(r=>!r.active);
  const pendingList = activeList.filter(r=>!isPaid(r));
  const paidList = activeList.filter(isPaid);
  const monthTotal = activeList.reduce((a,r)=>a+r.amount,0);
  const pendingTabTotal = pendingList.reduce((a,r)=>a+r.amount,0);
  const getBote = id => botes.find(b=>b.id===id);
  async function delRec(id){ await deleteDoc(doc(db,"recurrentes",id)); showToast("Gasto recurrente eliminado","#EF4444"); }
  async function toggleActive(r){ await updateDoc(doc(db,"recurrentes",r.id), { active:!r.active }); showToast(r.active?"Pausado ⏸":"Activado ✅"); }

  const renderCard = (r,status) => {
    const bote = getBote(r.boteId);
    const paid = status==="paid";
    const paused = status==="paused";
    return (
      <div key={r.id} style={{...S.card,opacity:paused?0.55:1,borderLeft:`4px solid ${r.color}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <span style={{fontSize:26}}>{r.icon}</span>
            <div>
              <div style={{fontWeight:700,fontSize:15,color:"#1E293B",textDecoration:paid?"line-through":"none"}} className="fb">{r.name}{paused && " (pausado)"}</div>
              <div style={{fontSize:12,color:"#64748B"}} className="fm">Día {r.day} · {r.category}{bote?` · 🪣 ${bote.name}`:" · Sin bote"}</div>
              {!paused && (
                <div style={{fontSize:11,fontWeight:700,marginTop:2,color:paid?"#22C55E":"#F59E0B"}} className="fm">{paid?"✅ Pagado este mes":`🔄 Pendiente · ${daysLeftLabel(r)}`}</div>
              )}
            </div>
          </div>
          <div style={{fontSize:18,fontWeight:800,color:paid?"#94A3B8":r.color,whiteSpace:"nowrap",textDecoration:paid?"line-through":"none"}} className="fd">{r.amount.toLocaleString("es-ES")} €</div>
        </div>
        {isAdmin && (
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <button onClick={()=>toggleActive(r)} style={{...S.saveBtn,flex:1,fontSize:12,padding:"8px 0",background:r.active?"#F1F5F9":"#DCFCE7",color:r.active?"#64748B":"#166534"}} className="fm">{r.active?"⏸ Pausar":"▶️ Activar"}</button>
            <button onClick={()=>setModal({type:"editRecurrente",data:r})} style={{...S.iconBtn,border:"1.5px solid #E2E8F0",borderRadius:10,width:40}}>✏️</button>
            <button onClick={()=>setConfirmDel(r)} style={{...S.iconBtn,border:"1.5px solid #E2E8F0",borderRadius:10,width:40}}>🗑️</button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {confirmDel && (
        <ConfirmModal title="¿Eliminar este gasto recurrente?" message={`"${confirmDel.name}" se eliminará para siempre. No afecta a los movimientos ya registrados.`}
          onCancel={()=>setConfirmDel(null)} onConfirm={()=>{ delRec(confirmDel.id); setConfirmDel(null); }}/>
      )}
      <div style={S.scrHead}>
        <div>
          <h2 style={S.title} className="fd">Recurrentes 🔄</h2>
          <p style={{color:"#64748B",fontSize:12,marginTop:2}} className="fm">Gastos que se registran solos cada mes</p>
        </div>
        {isAdmin && <button style={{...S.addBtnBig,background:currentUser.color,flexShrink:0}} onClick={()=>setModal({type:"addRecurrente",data:{tipo:tab}})}><Plus className="w-4 h-4"/><span className="fm">Añadir</span></button>}
      </div>
      <div style={{...S.card,background:"linear-gradient(135deg,#EF4444,#1E293B)",color:"#fff",marginBottom:16,marginTop:14}}>
        <div style={{fontSize:12,opacity:0.8}} className="fm">Pendiente de pagar este mes (todos)</div>
        <div style={{fontSize:26,fontWeight:800,margin:"4px 0"}} className="fd">{allPendingTotal.toLocaleString("es-ES")} €</div>
      </div>
      <div style={S.tabs}>
        {[["fijo","Gastos fijos"],["variable","Gastos variables"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{...S.tabBtn,...(tab===k?{borderBottomColor:currentUser.color,color:currentUser.color}:{})}} className="fm">{l}</button>
        ))}
      </div>
      <div style={{...S.card,background:"linear-gradient(135deg,#3B82F6,#1E293B)",color:"#fff",marginBottom:16}}>
        <div style={{display:"flex",gap:20}}>
          <div>
            <div style={{fontSize:12,opacity:0.8}} className="fm">Total mensual ({tab==="fijo"?"fijos":"variables"})</div>
            <div style={{fontSize:22,fontWeight:800,margin:"4px 0"}} className="fd">{monthTotal.toLocaleString("es-ES")} €</div>
          </div>
          <div>
            <div style={{fontSize:12,opacity:0.8}} className="fm">Pendiente en esta pestaña</div>
            <div style={{fontSize:22,fontWeight:800,margin:"4px 0"}} className="fd">{pendingTabTotal.toLocaleString("es-ES")} €</div>
          </div>
        </div>
      </div>
      {filtered.length===0 && (
        <div style={{textAlign:"center",padding:"32px 16px",background:"#F8FAFC",borderRadius:16}}>
          <div style={{fontSize:40,marginBottom:10}}>🔄</div>
          <p style={{color:"#1E293B",fontWeight:700,marginBottom:4}} className="fb">Sin gastos {tab==="fijo"?"fijos":"variables"} todavía</p>
          <p style={{color:"#64748B",fontSize:13}} className="fm">Añade uno y se registrará solo cada mes en su día de pago.</p>
        </div>
      )}
      {pendingList.length>0 && (
        <div style={{marginBottom:6}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:8}} className="fm">🔄 PENDIENTES DE PAGAR ({pendingList.length})</div>
          {pendingList.map(r=>renderCard(r,"pending"))}
        </div>
      )}
      {paidList.length>0 && (
        <div style={{marginBottom:6}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:8}} className="fm">✅ YA PAGADOS ({paidList.length})</div>
          {paidList.map(r=>renderCard(r,"paid"))}
        </div>
      )}
      {pausedList.length>0 && (
        <div style={{marginBottom:6}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:8}} className="fm">⏸ PAUSADOS ({pausedList.length})</div>
          {pausedList.map(r=>renderCard(r,"paused"))}
        </div>
      )}
    </div>
  );
}

function RecurrenteModal({W,close,currentUser,showToast,botes,recurrente,initTipo}) {
  const isEdit = !!recurrente;
  const [form,setForm] = useState(()=> isEdit
    ? { name:recurrente.name, amount:String(recurrente.amount), day:String(recurrente.day), category:recurrente.category, boteId:recurrente.boteId||"", tipo:recurrente.tipo, icon:recurrente.icon, color:recurrente.color, active:recurrente.active }
    : { name:"", amount:"", day:"1", category:EXPENSE_CATS[0], boteId:"", tipo:initTipo||"fijo", icon:REC_ICONS[0], color:BOTE_COLORS[0], active:true }
  );
  async function submit(){
    const amount=Number(form.amount), day=Number(form.day);
    if(!form.name.trim()||!form.amount||isNaN(amount)||amount<=0||!day||day<1||day>31){ showToast("Completa nombre, importe y día (1-31) válidos","#EF4444"); return; }
    const data = { name:form.name.trim(), amount, day, category:form.category, boteId:form.boteId||null, tipo:form.tipo, icon:form.icon, color:form.color, active:form.active };
    if (isEdit) { await updateDoc(doc(db,"recurrentes",recurrente.id), data); showToast("Gasto recurrente actualizado ✅"); }
    else { const id=`rec_${form.name.toLowerCase().trim().replace(/\s+/g,"-")}-${Date.now()}`; await setDoc(doc(db,"recurrentes",id), {...data,id}); showToast("Gasto recurrente creado 🔄"); }
    close();
  }
  return (
    <W title={isEdit?"Editar gasto recurrente":"Nuevo gasto recurrente"}>
      <label style={S.lbl} className="fm">Nombre</label>
      <input style={S.inp} placeholder="Ej. Alquiler" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} className="fb"/>
      <label style={S.lbl} className="fm">Importe mensual (€)</label>
      <input style={S.inp} type="number" placeholder="0.00" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} className="fb"/>
      <label style={S.lbl} className="fm">Día del mes (1-31)</label>
      <input style={S.inp} type="number" min="1" max="31" value={form.day} onChange={e=>setForm(f=>({...f,day:e.target.value.replace(/\D/g,"").slice(0,2)}))} className="fb"/>
      <label style={S.lbl} className="fm">Tipo</label>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {[["fijo","Fijo"],["variable","Variable"]].map(([k,l])=>(
          <button type="button" key={k} onClick={()=>setForm(f=>({...f,tipo:k}))} style={{flex:1,padding:"10px 0",border:"none",borderRadius:10,fontWeight:600,fontSize:14,cursor:"pointer",background:form.tipo===k?currentUser.color:"#F1F5F9",color:form.tipo===k?"#fff":"#64748B"}} className="fm">{l}</button>
        ))}
      </div>
      <label style={S.lbl} className="fm">Categoría</label>
      <select style={S.inp} value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} className="fb">{EXPENSE_CATS.map(c=><option key={c} value={c}>{c}</option>)}</select>
      <label style={S.lbl} className="fm">Bote del que se descuenta</label>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
        <button type="button" onClick={()=>setForm(f=>({...f,boteId:""}))} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:12,border:`2px solid ${form.boteId===""?"#94A3B8":"#E2E8F0"}`,background:form.boteId===""?"#F1F5F9":"#fff",cursor:"pointer",textAlign:"left"}}>
          <span style={{width:14,height:14,borderRadius:"50%",background:"#CBD5E1",flexShrink:0}}/>
          <span style={{flex:1,fontWeight:600,fontSize:14,color:"#1E293B"}} className="fb">Sin bote</span>
        </button>
        {botes.map(b=>(
          <button type="button" key={b.id} onClick={()=>setForm(f=>({...f,boteId:b.id}))} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:12,border:`2px solid ${form.boteId===b.id?b.color:"#E2E8F0"}`,background:form.boteId===b.id?b.color+"15":"#fff",cursor:"pointer",textAlign:"left"}}>
            <span style={{width:14,height:14,borderRadius:"50%",background:b.color,flexShrink:0}}/>
            <span style={{flex:1,fontWeight:600,fontSize:14,color:"#1E293B"}} className="fb">{b.name}</span>
            <span style={{fontSize:13,fontWeight:700,color:"#64748B"}} className="fd">{(b.amount||0).toLocaleString("es-ES")} €</span>
          </button>
        ))}
      </div>
      <label style={S.lbl} className="fm">Icono</label>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
        {REC_ICONS.map(ic=><button type="button" key={ic} onClick={()=>setForm(f=>({...f,icon:ic}))} style={{fontSize:22,padding:6,border:form.icon===ic?`2px solid ${currentUser.color}`:"2px solid transparent",borderRadius:8,background:form.icon===ic?"#F1F5F9":"transparent",cursor:"pointer"}}>{ic}</button>)}
      </div>
      <label style={S.lbl} className="fm">Color</label>
      <ColorPicker value={form.color} onChange={c=>setForm(f=>({...f,color:c}))}/>
      {isEdit && (
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#F8FAFC",borderRadius:12,padding:"10px 14px",marginBottom:16}}>
          <span style={{fontWeight:600,fontSize:14,color:"#1E293B"}} className="fb">Activo</span>
          <button type="button" onClick={()=>setForm(f=>({...f,active:!f.active}))} style={{width:44,height:26,borderRadius:99,border:"none",background:form.active?"#22C55E":"#CBD5E1",position:"relative",cursor:"pointer"}}>
            <span style={{position:"absolute",top:3,left:form.active?21:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .15s"}}/>
          </button>
        </div>
      )}
      <button onClick={submit} style={{...S.saveBtn,background:currentUser.color,width:"100%"}} className="fm">Guardar</button>
    </W>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CALENDAR SCREEN
// ══════════════════════════════════════════════════════════════════════════════
function CalendarScreen({currentUser,isAdmin,transactions,menu,recurrentes,setModal}) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0,10);
  const [cursor,setCursor] = useState({y:today.getFullYear(), m:today.getMonth()});
  const [selectedDate,setSelectedDate] = useState(null);

  const first = new Date(cursor.y, cursor.m, 1);
  const numDays = new Date(cursor.y, cursor.m+1, 0).getDate();
  const startOffset = (first.getDay()+6)%7;
  const monthPrefix = `${cursor.y}-${String(cursor.m+1).padStart(2,"0")}`;

  const txByDay = useMemo(()=>{
    const m={};
    transactions.forEach(t=>{ if(t.date && t.date.startsWith(monthPrefix)) (m[t.date]=m[t.date]||[]).push(t); });
    return m;
  },[transactions,monthPrefix]);

  const monthIncome  = useMemo(()=>transactions.filter(t=>t.type==="income"&&t.date?.startsWith(monthPrefix)).reduce((a,t)=>a+t.amount,0),[transactions,monthPrefix]);
  const monthExpense = useMemo(()=>transactions.filter(t=>t.type==="expense"&&t.date?.startsWith(monthPrefix)).reduce((a,t)=>a+t.amount,0),[transactions,monthPrefix]);
  const monthBalance = monthIncome-monthExpense;

  const recByDay = useMemo(()=>{
    const m={};
    (recurrentes||[]).filter(r=>r.active).forEach(r=>{
      const effDay = Math.min(r.day, numDays);
      (m[effDay]=m[effDay]||[]).push(r);
    });
    return m;
  },[recurrentes,numDays]);

  const isRecPaid = r => transactions.some(t=>t.recurrenteId===r.id && t.date && t.date.startsWith(monthPrefix));

  function changeMonth(delta){
    let m=cursor.m+delta, y=cursor.y;
    if(m<0){m=11;y--;} else if(m>11){m=0;y++;}
    setCursor({y,m}); setSelectedDate(null);
  }

  const cells=[];
  for(let i=0;i<startOffset;i++) cells.push(null);
  for(let d=1;d<=numDays;d++) cells.push(d);

  const selTx = selectedDate ? (txByDay[selectedDate]||[]) : [];
  const selIncome = selTx.filter(t=>t.type==="income").reduce((a,t)=>a+t.amount,0);
  const selExpense = selTx.filter(t=>t.type==="expense").reduce((a,t)=>a+t.amount,0);
  const selWeekday = selectedDate ? DAYS[(new Date(selectedDate+"T00:00:00").getDay()+6)%7] : null;
  const selMeals = selWeekday ? menu[selWeekday] : null;
  const selDayNum = selectedDate ? +selectedDate.slice(8,10) : null;
  const selRecurrentes = selDayNum ? (recByDay[selDayNum]||[]) : [];

  return (
    <div>
      <h2 style={S.title} className="fd">Calendario 📅</h2>
      {isAdmin && (
        <div style={{display:"flex",gap:10,marginBottom:16,marginTop:12}}>
          {[["Ingresos","#22C55E",`+${monthIncome.toLocaleString("es-ES")} €`],["Gastos","#EF4444",`-${monthExpense.toLocaleString("es-ES")} €`],["Balance",currentUser.color,`${monthBalance>=0?"+":""}${monthBalance.toLocaleString("es-ES")} €`]].map(([l,c,v])=>(
            <div key={l} style={{flex:1,background:"#fff",borderRadius:14,padding:12,borderLeft:`3px solid ${c}`,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
              <div style={{fontSize:11,color:"#64748B"}} className="fm">{l}</div>
              <div style={{fontSize:15,fontWeight:800,color:c}} className="fd">{v}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <button onClick={()=>changeMonth(-1)} style={{background:"#F1F5F9",border:"none",borderRadius:10,width:36,height:36,fontSize:16,cursor:"pointer",color:"#1E293B"}}>←</button>
        <span style={{fontWeight:700,fontSize:16,color:"#1E293B",textTransform:"capitalize"}} className="fb">{MONTH_LONG[cursor.m]} {cursor.y}</span>
        <button onClick={()=>changeMonth(1)} style={{background:"#F1F5F9",border:"none",borderRadius:10,width:36,height:36,fontSize:16,cursor:"pointer",color:"#1E293B"}}>→</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:4}}>
        {DAY_SHORT.map(d=><div key={d} style={{textAlign:"center",fontSize:10,fontWeight:700,color:"#94A3B8"}} className="fm">{d}</div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
        {cells.map((d,i)=>{
          if(d===null) return <div key={i}/>;
          const dateStr=`${monthPrefix}-${String(d).padStart(2,"0")}`;
          const dayTx = txByDay[dateStr]||[];
          const hasIncome = isAdmin && dayTx.some(t=>t.type==="income");
          const hasExpense = isAdmin && dayTx.some(t=>t.type==="expense");
          const isToday = dateStr===todayStr;
          const dayRecurrentes = recByDay[d]||[];
          let dayPaidSum=0, dayPendingSum=0;
          dayRecurrentes.forEach(r=>{ if(isRecPaid(r)) dayPaidSum+=r.amount; else dayPendingSum+=r.amount; });
          return (
            <button key={i} onClick={()=>setSelectedDate(dateStr)} style={{position:"relative",aspectRatio:"1",borderRadius:10,border:isToday?`2px solid ${currentUser.color}`:"1.5px solid #F1F5F9",background:selectedDate===dateStr?currentUser.color+"15":"#fff",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,padding:2}}>
              {dayRecurrentes.length>0 && <span style={{position:"absolute",top:-4,right:-2,fontSize:10,lineHeight:1}}>🔄</span>}
              <span style={{fontSize:12,fontWeight:600,color:"#1E293B"}} className="fb">{d}</span>
              <div style={{display:"flex",gap:2}}>
                {hasIncome && <span style={{width:5,height:5,borderRadius:"50%",background:"#22C55E"}}/>}
                {hasExpense && <span style={{width:5,height:5,borderRadius:"50%",background:"#EF4444"}}/>}
                <span style={{width:5,height:5,borderRadius:"50%",background:"#F59E0B"}}/>
              </div>
              {(dayPaidSum>0||dayPendingSum>0) && (
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",lineHeight:1.1}}>
                  {dayPaidSum>0 && <span style={{fontSize:7,fontWeight:700,color:"#22C55E",textDecoration:"line-through"}} className="fm">{dayPaidSum}€</span>}
                  {dayPendingSum>0 && <span style={{fontSize:7,fontWeight:700,color:"#94A3B8"}} className="fm">{dayPendingSum}€</span>}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <div style={S.overlay} onClick={e=>{if(e.target===e.currentTarget)setSelectedDate(null);}}>
          <div style={S.mbox}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <span style={{fontWeight:700,fontSize:16,color:"#1E293B",textTransform:"capitalize"}} className="fb">{new Date(selectedDate+"T00:00:00").toLocaleDateString("es-ES",{day:"numeric",month:"long",year:"numeric"})}</span>
              <button onClick={()=>setSelectedDate(null)} style={{background:"#F1F5F9",border:"none",borderRadius:"50%",width:32,height:32,cursor:"pointer",fontSize:16,color:"#64748B"}}>✕</button>
            </div>
            {isAdmin && (
              <>
                <div style={{display:"flex",gap:10,marginBottom:16}}>
                  <div style={{flex:1,background:"#F0FDF4",borderRadius:12,padding:10,textAlign:"center"}}>
                    <div style={{fontSize:11,color:"#166534"}} className="fm">Ingresos</div>
                    <div style={{fontSize:16,fontWeight:800,color:"#22C55E"}} className="fd">+{selIncome.toLocaleString("es-ES")} €</div>
                  </div>
                  <div style={{flex:1,background:"#FEF2F2",borderRadius:12,padding:10,textAlign:"center"}}>
                    <div style={{fontSize:11,color:"#991B1B"}} className="fm">Gastos</div>
                    <div style={{fontSize:16,fontWeight:800,color:"#EF4444"}} className="fd">-{selExpense.toLocaleString("es-ES")} €</div>
                  </div>
                </div>
                {selTx.length>0 && (
                  <div style={{marginBottom:16}}>
                    {selTx.map(tx=>(
                      <div key={tx.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #F1F5F9"}}>
                        <div>
                          <div style={{fontWeight:600,fontSize:13,color:"#1E293B"}} className="fb">{tx.category}</div>
                          {tx.type==="expense" && tx.boteNombre && <div style={{fontSize:11,color:"#8B5CF6"}} className="fm">🪣 {tx.boteNombre}</div>}
                        </div>
                        <span style={{fontWeight:700,fontSize:13,color:tx.type==="income"?"#22C55E":"#EF4444"}} className="fb">{tx.type==="income"?"+":"-"}{tx.amount.toLocaleString("es-ES")} €</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {selMeals && (
              <div style={{marginBottom:16}}>
                <div style={{fontSize:12,fontWeight:700,color:"#64748B",marginBottom:8}} className="fm">🍽️ Menú del día ({selWeekday})</div>
                {MEAL_TYPES.map(mt=>{ const meal=selMeals[mt.k]; const name=meal.status==="improvised"&&meal.improvisedName?meal.improvisedName:meal.name; return (
                  <div key={mt.k} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0"}}>
                    <span style={{fontSize:16}}>{meal.e}</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,color:"#94A3B8"}} className="fm">{mt.l}</div>
                      <div style={{fontSize:13,fontWeight:600,color:"#1E293B"}} className="fb">{name}</div>
                    </div>
                  </div>
                ); })}
              </div>
            )}
            {selRecurrentes.length>0 && (
              <div style={{marginBottom:16}}>
                <div style={{fontSize:12,fontWeight:700,color:"#64748B",marginBottom:8}} className="fm">🔄 Gastos recurrentes programados</div>
                {selRecurrentes.map(r=>{ const paid=isRecPaid(r); return (
                  <div key={r.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0"}}>
                    <span style={{fontSize:16}}>{r.icon}</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:600,color:"#1E293B",textDecoration:paid?"line-through":"none"}} className="fb">{r.name}</div>
                      <div style={{fontSize:11,color:paid?"#22C55E":"#94A3B8"}} className="fm">{paid?"✅ Pagado":(r.tipo==="fijo"?"Fijo":"Variable")}</div>
                    </div>
                    <span style={{fontSize:13,fontWeight:700,color:paid?"#22C55E":r.color,textDecoration:paid?"line-through":"none"}} className="fb">{r.amount.toLocaleString("es-ES")} €</span>
                  </div>
                ); })}
              </div>
            )}
            {isAdmin && (
              <button onClick={()=>{ setModal({type:"addTx",data:{t:"expense",date:selectedDate}}); setSelectedDate(null); }} style={{...S.saveBtn,background:currentUser.color,width:"100%"}} className="fm">＋ Añadir movimiento</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// STATS SCREEN (pure SVG charts)
// ══════════════════════════════════════════════════════════════════════════════
function polarToCartesian(cx,cy,r,angleDeg) {
  const a=(angleDeg-90)*Math.PI/180;
  return { x:cx+r*Math.cos(a), y:cy+r*Math.sin(a) };
}
function arcPath(cx,cy,r,startAngle,endAngle) {
  const start = polarToCartesian(cx,cy,r,startAngle);
  const end   = polarToCartesian(cx,cy,r,endAngle);
  const largeArc = endAngle-startAngle>180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
}

function GroupedBarChart({data,keys,colors,height=160}) {
  const max = Math.max(1, ...data.flatMap(d=>keys.map(k=>Math.abs(d[k]||0))));
  const barW=8, gap=2, groupW=keys.length*barW+(keys.length-1)*gap+18;
  const chartW = Math.max(data.length*groupW, 280);
  return (
    <div style={{overflowX:"auto"}} className="sx">
      <svg width={chartW} height={height+30} viewBox={`0 0 ${chartW} ${height+30}`}>
        {[0.25,0.5,0.75,1].map(f=><line key={f} x1={0} x2={chartW} y1={height-height*f+8} y2={height-height*f+8} stroke="#F1F5F9" strokeWidth="1"/>)}
        {data.map((d,i)=>{
          const gx = i*groupW+9;
          return (
            <g key={i}>
              {keys.map((k,j)=>{
                const val=d[k]||0;
                const h=(Math.abs(val)/max)*height;
                const x=gx+j*(barW+gap);
                const y=height-h+8;
                return <rect key={k} x={x} y={y} width={barW} height={Math.max(h,1)} rx={2} fill={colors[j]}/>;
              })}
              <text x={gx+(keys.length*(barW+gap))/2-1} y={height+24} textAnchor="middle" fontSize="9" fill="#64748B" className="fm">{d.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function LineChartMulti({data,keys,colors,height=140,width=300}) {
  const max = Math.max(1, ...data.flatMap(d=>keys.map(k=>d[k]||0)));
  const stepX = data.length>1 ? width/(data.length-1) : width;
  const pts = keys.map(k=>data.map((d,i)=>({x:i*stepX, y:height-(d[k]/max)*height})));
  return (
    <svg width="100%" height={height+26} viewBox={`0 0 ${width} ${height+26}`} preserveAspectRatio="none">
      {[0.25,0.5,0.75].map(f=><line key={f} x1={0} x2={width} y1={height*f} y2={height*f} stroke="#F1F5F9" strokeWidth="1"/>)}
      {pts.map((p,ki)=>(
        <polyline key={ki} points={p.map(pt=>`${pt.x},${pt.y}`).join(" ")} fill="none" stroke={colors[ki]} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
      ))}
      {pts.map((p,ki)=>p.map((pt,i)=><circle key={ki+"-"+i} cx={pt.x} cy={pt.y} r={3} fill={colors[ki]}/>))}
      {data.map((d,i)=><text key={i} x={i*stepX} y={height+18} textAnchor="middle" fontSize="9" fill="#64748B" className="fm">{d.label}</text>)}
    </svg>
  );
}

function PieChart({data,size=160}) {
  const total = data.reduce((a,d)=>a+d.value,0);
  const r=size/2;
  if (total<=0) return <p style={{color:"#94A3B8",fontSize:13,textAlign:"center",padding:"16px 0"}} className="fm">Sin gastos este mes</p>;
  let angle=0;
  const slices = data.map(d=>{ const pct=d.value/total; const start=angle; const end=angle+pct*360; angle=end; return {...d,start,end,pct}; });
  return (
    <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{flexShrink:0}}>
        {slices.length===1
          ? <circle cx={r} cy={r} r={r} fill={slices[0].color}/>
          : slices.map((s,i)=><path key={i} d={arcPath(r,r,r,s.start,s.end)} fill={s.color}/>)}
        <circle cx={r} cy={r} r={r*0.55} fill="#fff"/>
      </svg>
      <div style={{flex:1,minWidth:120}}>
        {slices.map((s,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:s.color,flexShrink:0}}/>
            <span style={{fontSize:12,color:"#1E293B",flex:1}} className="fm">{s.label}</span>
            <span style={{fontSize:12,fontWeight:700,color:"#64748B"}} className="fb">{Math.round(s.pct*100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatsScreen({currentUser,isAdmin,transactions,recurrentes}) {
  const today = new Date();
  const [statMonth,setStatMonth] = useState(`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}`);
  const curMonthPrefix = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}`;
  const fixedMonthly = useMemo(()=>(recurrentes||[]).filter(r=>r.active&&r.tipo==="fijo").reduce((a,r)=>a+r.amount,0),[recurrentes]);
  const variableMonthly = useMemo(()=>(recurrentes||[]).filter(r=>r.active&&r.tipo==="variable").reduce((a,r)=>a+r.amount,0),[recurrentes]);
  const recurringSpentMonth = useMemo(()=>transactions.filter(t=>t.type==="expense"&&t.recurrenteId&&t.date?.startsWith(curMonthPrefix)).reduce((a,t)=>a+t.amount,0),[transactions,curMonthPrefix]);
  const oneOffSpentMonth = useMemo(()=>transactions.filter(t=>t.type==="expense"&&!t.recurrenteId&&t.date?.startsWith(curMonthPrefix)).reduce((a,t)=>a+t.amount,0),[transactions,curMonthPrefix]);

  const last6 = useMemo(()=>{
    const arr=[];
    for(let i=5;i>=0;i--){
      const d=new Date(today.getFullYear(), today.getMonth()-i, 1);
      const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      const income=transactions.filter(t=>t.type==="income"&&t.date?.startsWith(key)).reduce((a,t)=>a+t.amount,0);
      const expense=transactions.filter(t=>t.type==="expense"&&t.date?.startsWith(key)).reduce((a,t)=>a+t.amount,0);
      arr.push({ key, label:MONTH_SHORT[d.getMonth()], income, expense, savings:income-expense });
    }
    return arr;
  },[transactions]); // eslint-disable-line react-hooks/exhaustive-deps

  const yearMonths = useMemo(()=>{
    const arr=[]; const y=today.getFullYear();
    for(let m=0;m<=today.getMonth();m++){
      const key=`${y}-${String(m+1).padStart(2,"0")}`;
      const income=transactions.filter(t=>t.type==="income"&&t.date?.startsWith(key)).reduce((a,t)=>a+t.amount,0);
      const expense=transactions.filter(t=>t.type==="expense"&&t.date?.startsWith(key)).reduce((a,t)=>a+t.amount,0);
      arr.push({ key, label:MONTH_SHORT[m], income, expense });
    }
    return arr;
  },[transactions]); // eslint-disable-line react-hooks/exhaustive-deps

  const monthOptions = useMemo(()=>{
    const set=new Set(transactions.map(t=>t.date?.slice(0,7)).filter(Boolean));
    set.add(`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}`);
    return [...set].sort().reverse();
  },[transactions]); // eslint-disable-line react-hooks/exhaustive-deps

  const catData = useMemo(()=>{
    const m={};
    transactions.filter(t=>t.type==="expense"&&t.date?.startsWith(statMonth)).forEach(t=>{ m[t.category]=(m[t.category]||0)+t.amount; });
    return Object.entries(m).sort((a,b)=>b[1]-a[1]).map(([cat,val],i)=>({label:cat,value:val,color:BOTE_COLORS[i%BOTE_COLORS.length]}));
  },[transactions,statMonth]);

  const yearIncome = yearMonths.reduce((a,m)=>a+m.income,0);
  const yearExpense = yearMonths.reduce((a,m)=>a+m.expense,0);
  const yearSavings = yearIncome-yearExpense;
  const yearSavingsPct = yearIncome>0 ? (yearSavings/yearIncome*100) : 0;

  const cur=last6[5], prev=last6[4];
  const diffIncome = cur.income-prev.income;
  const diffExpense = cur.expense-prev.expense;

  if (!isAdmin) return <div style={{textAlign:"center",padding:60}}><div style={{fontSize:48}}>🔒</div><p style={{color:"#64748B",marginTop:12}} className="fm">Solo los administradores pueden ver las estadísticas.</p></div>;

  return (
    <div>
      <h2 style={S.title} className="fd">Estadísticas 📊</h2>
      <div style={{...S.card,marginTop:12}}>
        <span style={S.cardTitle} className="fb">Ingresos, gastos y ahorro (6 meses)</span>
        <GroupedBarChart data={last6} keys={["income","expense","savings"]} colors={["#22C55E","#EF4444","#3B82F6"]}/>
        <div style={{display:"flex",gap:14,marginTop:10,justifyContent:"center",flexWrap:"wrap"}}>
          {[["Ingresos","#22C55E"],["Gastos","#EF4444"],["Ahorro","#3B82F6"]].map(([l,c])=>(
            <div key={l} style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:8,height:8,borderRadius:2,background:c}}/><span style={{fontSize:11,color:"#64748B"}} className="fm">{l}</span></div>
          ))}
        </div>
      </div>
      <div style={S.card}>
        <span style={S.cardTitle} className="fb">Evolución {today.getFullYear()}</span>
        <LineChartMulti data={yearMonths} keys={["income","expense"]} colors={["#22C55E","#EF4444"]}/>
        <div style={{display:"flex",gap:14,marginTop:6,justifyContent:"center"}}>
          {[["Ingresos","#22C55E"],["Gastos","#EF4444"]].map(([l,c])=>(
            <div key={l} style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:8,height:8,borderRadius:2,background:c}}/><span style={{fontSize:11,color:"#64748B"}} className="fm">{l}</span></div>
          ))}
        </div>
      </div>
      <div style={S.card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <span style={{fontWeight:700,fontSize:15,color:"#1E293B"}} className="fb">Gastos por categoría</span>
          <select value={statMonth} onChange={e=>setStatMonth(e.target.value)} style={{fontSize:12,padding:"4px 8px",borderRadius:8,border:"1.5px solid #E2E8F0",color:"#1E293B"}} className="fb">
            {monthOptions.map(k=>{ const [y,m]=k.split("-"); return <option key={k} value={k}>{MONTH_SHORT[+m-1]} {y}</option>; })}
          </select>
        </div>
        <PieChart data={catData}/>
      </div>
      <div style={S.card}>
        <span style={S.cardTitle} className="fb">Totales anuales {today.getFullYear()}</span>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div><div style={{fontSize:11,color:"#64748B"}} className="fm">Ingresos totales</div><div style={{fontSize:16,fontWeight:800,color:"#22C55E"}} className="fd">+{yearIncome.toLocaleString("es-ES")} €</div></div>
          <div><div style={{fontSize:11,color:"#64748B"}} className="fm">Gastos totales</div><div style={{fontSize:16,fontWeight:800,color:"#EF4444"}} className="fd">-{yearExpense.toLocaleString("es-ES")} €</div></div>
          <div><div style={{fontSize:11,color:"#64748B"}} className="fm">Ahorro total</div><div style={{fontSize:16,fontWeight:800,color:"#3B82F6"}} className="fd">{yearSavings>=0?"+":""}{yearSavings.toLocaleString("es-ES")} €</div></div>
          <div><div style={{fontSize:11,color:"#64748B"}} className="fm">% de ahorro</div><div style={{fontSize:16,fontWeight:800,color:"#8B5CF6"}} className="fd">{yearSavingsPct.toFixed(1)}%</div></div>
        </div>
      </div>
      <div style={S.card}>
        <span style={S.cardTitle} className="fb">Gastos fijos vs variables (recurrentes activos)</span>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          <div><div style={{fontSize:11,color:"#64748B"}} className="fm">Fijos / mes</div><div style={{fontSize:16,fontWeight:800,color:"#3B82F6"}} className="fd">{fixedMonthly.toLocaleString("es-ES")} €</div></div>
          <div><div style={{fontSize:11,color:"#64748B"}} className="fm">Variables / mes</div><div style={{fontSize:16,fontWeight:800,color:"#F59E0B"}} className="fd">{variableMonthly.toLocaleString("es-ES")} €</div></div>
        </div>
        <PieChart data={[{label:"Fijos",value:fixedMonthly,color:"#3B82F6"},{label:"Variables",value:variableMonthly,color:"#F59E0B"}]}/>
      </div>
      <div style={S.card}>
        <span style={S.cardTitle} className="fb">Recurrentes 🔄 vs gastos puntuales (este mes)</span>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          <div><div style={{fontSize:11,color:"#64748B"}} className="fm">Recurrentes</div><div style={{fontSize:16,fontWeight:800,color:"#8B5CF6"}} className="fd">{recurringSpentMonth.toLocaleString("es-ES")} €</div></div>
          <div><div style={{fontSize:11,color:"#64748B"}} className="fm">Puntuales</div><div style={{fontSize:16,fontWeight:800,color:"#EC4899"}} className="fd">{oneOffSpentMonth.toLocaleString("es-ES")} €</div></div>
        </div>
        <PieChart data={[{label:"Recurrentes",value:recurringSpentMonth,color:"#8B5CF6"},{label:"Puntuales",value:oneOffSpentMonth,color:"#EC4899"}]}/>
      </div>
      <div style={S.card}>
        <span style={S.cardTitle} className="fb">Este mes vs. anterior</span>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:13,color:"#64748B"}} className="fm">Ingresos</span>
            <span style={{fontSize:14,fontWeight:700,color:diffIncome>=0?"#22C55E":"#EF4444"}} className="fb">{cur.income.toLocaleString("es-ES")} € ({diffIncome>=0?"+":""}{diffIncome.toLocaleString("es-ES")} €)</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:13,color:"#64748B"}} className="fm">Gastos</span>
            <span style={{fontSize:14,fontWeight:700,color:diffExpense<=0?"#22C55E":"#EF4444"}} className="fb">{cur.expense.toLocaleString("es-ES")} € ({diffExpense>=0?"+":""}{diffExpense.toLocaleString("es-ES")} €)</span>
          </div>
        </div>
      </div>
    </div>
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
  const [confirmDel,setConfirmDel]=useState(null);
  const cats=useMemo(()=>[...new Set(pantry.map(x=>x.cat))],[pantry]);
  const low=lowItems(pantry);
  return (
    <div className="space-y-4">
      {confirmDel && (
        <ConfirmModal title="¿Eliminar este producto?" message={`"${confirmDel.name}" se quitará de la despensa.`}
          onCancel={()=>setConfirmDel(null)} onConfirm={()=>{ onDel(confirmDel.id); setConfirmDel(null); }}/>
      )}
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
                  <button onClick={()=>setConfirmDel(x)} className="w-7 h-7 rounded-full hover:bg-red-100 flex items-center justify-center text-gray-300 hover:text-red-600 ml-1"><Trash2 className="w-3 h-3"/></button>
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
  useEffect(() => onSnapshot(doc(db,"shoppingChecks","current"), s=>setCheck(s.exists()?(s.data().items||{}):{})), []);

  useEffect(() => {
    const validNames = new Set(items.map(x=>x.name));
    const stale = Object.keys(check).filter(k=>!validNames.has(k));
    if (stale.length) {
      const patch = {}; stale.forEach(k=>{ patch[k]=deleteField(); });
      setDoc(doc(db,"shoppingChecks","current"), { items:patch }, { merge:true });
    }
  }, [items, check]);

  const toggleCheck = name => setDoc(doc(db,"shoppingChecks","current"), { items:{ [name]:!check[name] } }, { merge:true });

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
          <button key={i} onClick={()=>toggleCheck(x.name)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 text-left shadow-sm transition-all"
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
  addBtnBig:{ border:"none", borderRadius:14, padding:"10px 18px", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:6, boxShadow:"0 3px 10px rgba(0,0,0,0.15)" },
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
