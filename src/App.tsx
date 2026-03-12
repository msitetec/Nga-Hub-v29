import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, onSnapshot, addDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { 
  FileText, AlertTriangle, CheckCircle2, RefreshCcw, Printer, 
  LayoutDashboard, Search, Info, Sparkles, Wand2, 
  Database, FolderOpen, Plus, Trash2, Filter, Scale, 
  Edit3, ChevronLeft, CheckCircle, Clock, 
  FileSearch, BookOpen, X, Save, Loader2, FileUp, Paperclip, History, FileCheck, Type, Download,
  MessageSquare, Send, Bot, Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Zap, BrainCircuit, ShieldAlert, UserCheck, Layers, CalendarCheck, GitMerge, Eraser, Quote
} from 'lucide-react';

// Scripts PDF.js para extracção de texto
const PDF_JS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDF_JS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// --- CONFIGURAÇÃO FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyApg5exWo4wKk6psIt63se_u4eGdWGoNPI",
  authDomain: "nga-data-hub.firebaseapp.com",
  projectId: "nga-data-hub",
  storageBucket: "nga-data-hub.firebasestorage.app",
  messagingSenderId: "590820357440",
  appId: "1:590820357440:web:74594dbe70282d8816b6a5"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'nga-data-hub-oficial';

// --- CONSTANTES IMUTÁVEIS ---
const LEGISLACOES = [
  { id: 'IN_002_2024', label: 'IN 002/2024 (Regra Geral)' },
  { id: 'PORT_069_2024', label: 'Portaria 069/2024 (SGTS)' },
  { id: 'PORT_067_2025', label: 'Portaria 067/2025 (Remanejo)' },
  { id: 'PORT_102_2025', label: 'Portaria 102/2025 (Dissídio)' },
  { id: 'PORT_136_2025', label: 'Portaria 136/2025 (RH-Retro)' },
  { id: 'PORT_008_2026', label: 'Portaria 008/2026 (SAICA Adicional)' }
];

const FONTS = [
  { id: "'Times New Roman', Times, serif", label: 'Times New Roman' },
  { id: "Arial, Helvetica, sans-serif", label: 'Arial' },
  { id: "'Calibri', sans-serif", label: 'Calibri' },
  { id: "Georgia, serif", label: 'Georgia' }
];

const App = () => {
  // --- ESTADOS ---
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('explorer');
  const [selectedLegislação, setSelectedLegislação] = useState('IN_002_2024');
  const [opinionMode, setOpinionMode] = useState('completo'); 
  const [projects, setProjects] = useState([]);
  const [customLaws, setCustomLaws] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [editableOpinion, setEditableOpinion] = useState("");
  const [selectedFont, setSelectedFont] = useState(FONTS[0].id);
  const [fontSize, setFontSize] = useState("12pt");
  const [pdfLibReady, setPdfLibReady] = useState(false);
  
  const [flowSteps, setFlowSteps] = useState({
    docConf: { status: false, comment: "" },
    saldoProv: { status: false, comment: "" },
    sgtsInput: { status: false, comment: "" },
    sintese: "",
    despacho: "Favorável à liberação da Programação de Liberação (PL) no sistema SGTS."
  });

  const editorRef = useRef(null);
  const fileInputRef = useRef(null);
  const [uploadTarget, setUploadTarget] = useState(null);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([
    { role: 'bot', text: 'Assistente NGA ✨ ativo. Regra aplicada: Tarifas só são reportadas se >= R$ 1,00. Analisando resgates e empréstimos atípicos no fundo provisionado.' }
  ]);
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProject, setNewProject] = useState({ nome: "", sei: "" });

  const [showLawModal, setShowLawModal] = useState(false);
  const [newLaw, setNewLaw] = useState({ label: "", content: "" });

  const [parecerDraft, setParecerDraft] = useState({
    osc: "",
    termo: "",
    processo: "",
    analista: "",
    cargo: "Analista de Gestão Administrativa",
    competencia: "FEVEREIRO/2026"
  });

  const apiKey = import.meta.env.VITE_API_KEY;

  const allLegislations = [...LEGISLACOES, ...customLaws];

  // --- GEMINI API CORE ---
  const callGemini = async (prompt, systemInstruction = "Você é um Analista de Auditoria do NGA/SMADS.") => {
    let delay = 1000;
    for (let i = 0; i < 5; i++) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: String(prompt) }] }],
            systemInstruction: { parts: [{ text: String(systemInstruction) }] }
          })
        });
        const res = await response.json();
        const text = res.candidates?.[0]?.content?.parts?.[0]?.text;
        return typeof text === 'string' ? text : "IA retornou um formato inesperado.";
      } catch (e) {
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
      }
    }
    return "Erro: Falha na conexão com a IA após tentativas.";
  };

  // --- FUNÇÕES DE NEGÓCIO ---

  const handleCreateProject = async () => {
    if (!newProject.nome || !user) return;
    const projectData = {
      nome: String(newProject.nome),
      status: 'Pendente',
      legislacao: String(selectedLegislação),
      processo: String(newProject.sei || "6024.2024/0000000-0"),
      termo: "TC 000/2024",
      docs: {
        ext: { name: 'Relatório de Conciliação (Ext)', status: 'missing' },
        conf: { name: 'Pontos de Conformidade (Conf)', status: 'missing' },
        eo: { name: 'Execução Orçamentária (EO)', status: 'missing' },
        rd: { name: 'Receitas e Despesas (R&D)', status: 'missing' },
        anual: { name: 'Fechamento Anualidade', status: 'missing' },
        anterior: { name: 'Parecer Anterior', status: 'missing' }
      },
      createdAt: new Date().toISOString()
    };
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'parcerias'), projectData);
      setNewProject({ nome: "", sei: "" });
      setShowCreateModal(false);
    } catch (e) { console.error("Erro ao criar projeto:", e); }
  };

  const handleCreateLaw = async () => {
    if (!newLaw.label || !user) return;
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'laws'), {
        id: `CUSTOM_${Date.now()}`,
        label: String(newLaw.label),
        content: String(newLaw.content),
        createdAt: new Date().toISOString()
      });
      setNewLaw({ label: "", content: "" });
      setShowLawModal(false);
    } catch (e) { console.error("Erro ao salvar lei:", e); }
  };

  const sanitizeData = () => {
    if (window.confirm("Deseja sanitizar a base de análise?")) {
      setEditableOpinion("");
      if (editorRef.current) editorRef.current.innerHTML = "";
      setFlowSteps({
        docConf: { status: false, comment: "" },
        saldoProv: { status: false, comment: "" },
        sgtsInput: { status: false, comment: "" },
        sintese: "",
        despacho: "Favorável à liberação da Programação de Liberação (PL) no sistema SGTS."
      });
      setChatMessages(prev => [...prev, { role: 'bot', text: '🧹 Dados sanitizados.' }]);
    }
  };

  const generateExecutiveSummary = async () => {
    if (!currentProject) return;
    setAiLoading(true);
    const docs = Object.entries(currentProject.docs || {})
      .filter(([k, v]) => v.status === 'success')
      .map(([k, v]) => `[${k.toUpperCase()}]: ${String(v.content || "").substring(0, 15000)}`)
      .join("\n\n");
    const prompt = `Analise prioritariamente o FUNDO PROVISIONADO cruzando Fechamento de Anualidade e repasses. Identifique explicitamente indícios de irregularidades ou trapaças, como "resgates" indevidos, "empréstimos" ou movimentações atípicas. Aponte riscos graves de glosa.\n\n${docs}`;
    const summary = await callGemini(prompt, "Auditor especialista.");
    setChatMessages(prev => [...prev, { role: 'bot', text: `✨ Panorama:\n\n${String(summary)}` }]);
    setChatOpen(true);
    setAiLoading(false);
  };

  const processFlowJustifications = async () => {
    if (!currentProject) return;
    setAiLoading(true);
    
    const docs = Object.entries(currentProject.docs || {})
      .filter(([k, v]) => v.status === 'success')
      .map(([k, v]) => `[${k.toUpperCase()}]: ${String(v.content || "").substring(0, 80000)}`)
      .join("\n\n");

    const textLower = docs.toLowerCase();
    const hasTarifa = textLower.includes("tarifa") || textLower.includes("taxa") || textLower.includes("manuten");
    const alertaTarifa = hasTarifa 
      ? "ALERTA: O sistema detectou possíveis tarifas/taxas bancárias. SÓ aponte na 'sintese' e exija restituição se o valor descontado for IGUAL OU SUPERIOR a R$ 1,00." 
      : "";

    const currentLaw = allLegislations.find(l => l.id === selectedLegislação);
    const customLawInjection = currentLaw?.content ? `DIRETRIZES DA NORMATIVA SELECIONADA (${currentLaw.label}):\n${currentLaw.content}\n\n` : "";

    const prompt = `
      INSTRUÇÃO DE AUDITORIA:
      Gere justificativas curtas para o Fluxo PL em JSON: {"conferencia": "...", "provisao": "...", "sintese": "..."}.
      
      ${customLawInjection}
      Análise de Dados: ${docs}.
      
      ${alertaTarifa}
      
      REGRAS:
      1. FUNDO PROVISIONADO E IRREGULARIDADES: Verifique o saldo de provisão (Férias/13º) e aponte no campo "provisao" qualquer movimentação suspeita, como "resgates", "empréstimos" ou uso indevido do fundo provisionado para custeio.
      2. SÍNTESE E TARIFAS: Na "sintese", resuma a análise. Destaque obrigatoriamente a necessidade de restituição de tarifas bancárias APENAS se o valor identificado no desconto for >= R$ 1,00. Valores nulos ignore.
    `;

    try {
      const response = await callGemini(prompt, "Especialista em auditoria NGA antifraude.");
      const cleanJson = response.replace(/```json|```/g, '').trim();
      const data = JSON.parse(cleanJson);
      setFlowSteps(prev => ({
        ...prev,
        docConf: { ...prev.docConf, comment: String(data.conferencia || "") },
        saldoProv: { ...prev.saldoProv, comment: String(data.provisao || "") },
        sintese: String(data.sintese || "")
      }));
    } catch (e) {
      console.error(e);
    } finally {
      setAiLoading(false);
      setActiveTab('flow');
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;
    const userText = chatInput;
    setChatMessages(prev => [...prev, { role: 'user', text: String(userText) }]);
    setChatInput("");
    setAiLoading(true);
    const docContext = currentProject ? Object.entries(currentProject.docs || {})
      .filter(([k, v]) => v.status === 'success')
      .map(([k, v]) => `${k}: ${String(v.content || "").substring(0, 15000)}`)
      .join("\n") : "";
    const response = await callGemini(`Pergunta: ${userText}\nContexto: ${docContext}`, "Assistente NGA.");
    setChatMessages(prev => [...prev, { role: 'bot', text: String(response) }]);
    setAiLoading(false);
  };

  const handleSuggestLaw = async () => {
    const selection = window.getSelection().toString();
    if (!selection) return;
    setAiLoading(true);
    const law = await callGemini(`Sugira base legal (IN 02/2024) para: "${selection}"`, "Consultor Jurídico.");
    setChatMessages(prev => [...prev, { role: 'bot', text: String(law) }]);
    setChatOpen(true);
    setAiLoading(false);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !uploadTarget || !currentProject) return;
    setExtracting(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        fullText += content.items.map(item => item.str).join(" ") + "\n";
      }
      const newDocs = { ...currentProject.docs };
      newDocs[uploadTarget] = { 
        status: 'success', 
        name: String(currentProject.docs[uploadTarget].name),
        fileName: String(file.name),
        content: String(fullText), 
        updatedAt: new Date().toISOString() 
      };
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'parcerias', currentProject.id), { docs: newDocs, status: 'Em Análise' });
    } catch (e) { console.error(e); }
    finally { setExtracting(false); setUploadTarget(null); }
  };

  const processFinalAnalysis = async () => {
    setAiLoading(true);
    
    const currentLaw = allLegislations.find(l => l.id === selectedLegislação);
    const legLabel = currentLaw?.label || selectedLegislação;
    const customLawInjection = currentLaw?.content ? `DIRETRIZES TÉCNICAS DA NORMATIVA SELECIONADA (${legLabel}):\n${currentLaw.content}\n\n` : "";

    const docs = currentProject?.docs || {};
    const currentData = Object.entries(docs)
      .filter(([k, v]) => k !== 'anterior' && v.status === 'success')
      .map(([k, v]) => `[${String(k).toUpperCase()}]: ${String(v.content || "").substring(0, 80000)}`)
      .join("\n\n");

    const textLower = currentData.toLowerCase();
    const hasTarifa = textLower.includes("tarifa") || textLower.includes("taxa") || textLower.includes("manuten");
    const alertaTarifa = hasTarifa 
      ? "ALERTA DO SISTEMA: O pré-filtro localizou possíveis TARIFAS/TAXAS bancárias nos dados. Verifique os valores. Só aponte infração se o valor descontado for IGUAL OU SUPERIOR a R$ 1,00. Se confirmado (>= R$ 1,00), é OBRIGATÓRIO gerar um parágrafo destacando a cobrança e SOLICITAR A RESTITUIÇÃO IMEDIATA." 
      : "Verifique atentamente se existem tarifas escondidas e peça restituição apenas se o valor descontado for >= R$ 1,00.";
    
    const prompt = `
      Gere uma manifestação técnica rigorosa (${opinionMode}) utilizando formatação HTML básica (<p>, <br>, <strong>).
      
      ${customLawInjection}
      ${alertaTarifa}
      
      DIRETRIZES GERAIS DE AUDITORIA:
      1. FUNDO PROVISIONADO (ATENÇÃO A FRAUDES): Analise rigorosamente os saldos retidos para Férias, 13º e Rescisões. Procure especificamente por termos como "resgates", "empréstimos", "transferências indevidas" ou saques injustificados. Identifique, concilie e aponte essas movimentações como irregularidades graves.
      2. TARIFAS BANCÁRIAS: Só aponte infração e exija restituição se o valor descontado for IGUAL OU MAIOR que R$ 1,00. Valores zerados ou citações nominais sem desconto financeiro real devem ser ignorados no parecer.
      
      Legislação aplicável referenciada: ${legLabel}. 
      Dados Extraídos dos PDFs: 
      ${currentData}
    `;
    
    const text = await callGemini(prompt, "Auditor Sênior NGA e Detetive de Fraudes. Ignora tarifas < 1.00 e caça resgates indevidos.");
    const formatted = text ? String(text).replace(/\n/g, '') : "Falha na geração.";
    setEditableOpinion(formatted);
    if (editorRef.current) editorRef.current.innerHTML = formatted;
    setAiLoading(false);
    setActiveTab('editor'); 
  };

  const applyFormatting = (cmd, val = null) => {
    document.execCommand(cmd, false, val);
    if (editorRef.current) setEditableOpinion(editorRef.current.innerHTML);
  };

  const downloadDocument = () => {
    const currentLaw = allLegislations.find(l => l.id === selectedLegislação);
    const legLabel = currentLaw?.label || selectedLegislação;
    const finalHTML = editorRef.current?.innerHTML || editableOpinion;
    const htmlContent = `
      <!DOCTYPE html>
      <html><head><meta charset="UTF-8"><style>
        body { font-family: ${selectedFont}; padding: 2.5cm; line-height: 1.6; color: #111; font-size: ${fontSize}; }
        .header { text-align: center; border-bottom: 2.5px solid black; padding-bottom: 15px; margin-bottom: 40px; }
        .info { border: 1px solid #aaa; padding: 20px; border-radius: 12px; margin-bottom: 30px; background: #fafafa; }
        .content { text-align: justify; white-space: pre-wrap; }
        .signature { margin-top: 100px; text-align: center; border-top: 1.5px solid black; width: 350px; margin: 80px auto 0; padding-top: 10px; }
        h2 { margin: 0; text-transform: uppercase; font-size: 16pt; font-weight: bold; }
        .btn-print { position: fixed; top: 20px; right: 20px; background: #3b82f6; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-family: sans-serif; font-weight: bold; }
        @media print { .btn-print { display: none; } body { padding: 0.5cm; } }
      </style></head><body>
        <button class="btn-print" onclick="window.print()">IMPRIMIR / PDF</button>
        <div class="header"><h2>Parecer Técnico NGA</h2><p>Prefeitura de São Paulo - SMADS</p></div>
        <div class="info">
          <p><strong>OSC:</strong> ${String(parecerDraft.osc).toUpperCase()}</p>
          <p><strong>PROCESSO:</strong> ${String(parecerDraft.processo)}</p>
          <p><strong>LEGISLAÇÃO:</strong> ${String(legLabel)}</p>
          <p><strong>COMPETÊNCIA:</strong> ${String(parecerDraft.competencia).toUpperCase()}</p>
        </div>
        <div class="content">${finalHTML}</div>
        <div class="signature"><p><strong>${String(parecerDraft.analista || "AUDITOR")}</strong></p><p>${String(parecerDraft.cargo)}</p></div>
      </body></html>`;
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `PARECER_${String(parecerDraft.osc).replace(/\s+/g, '_')}.html`;
    link.click();
  };

  const exportFlow = () => {
    const content = `FLUXO NGA PL - OSC: ${parecerDraft.osc}\n\n1. Conferência: ${flowSteps.docConf.comment}\n2. Provisão/Tarifas: ${flowSteps.saldoProv.comment}\n\nSíntese: ${flowSteps.sintese}\n\nManifestação Final: ${flowSteps.despacho}\n\nAuditor: ${parecerDraft.analista}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `FLUXO_PL_${String(parecerDraft.osc).replace(/\s+/g, '_')}.txt`;
    link.click();
  };

  // --- EFEITOS DE INICIALIZAÇÃO ---
  useEffect(() => {
    const loadPdfJs = () => {
      if (window.pdfjsLib) { setPdfLibReady(true); return; }
      const script = document.createElement('script');
      script.src = PDF_JS_URL;
      script.async = true;
      script.onload = () => { 
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_URL; 
        setPdfLibReady(true); 
      };
      document.head.appendChild(script);
    };
    loadPdfJs();
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Erro Auth", err);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = collection(db, 'artifacts', appId, 'public', 'data', 'parcerias');
    const qLaws = collection(db, 'artifacts', appId, 'public', 'data', 'laws');

    const unsubProjects = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setProjects(data);
      if (currentProject) {
        const up = data.find(p => p.id === currentProject.id);
        if (up) setCurrentProject(up);
      }
    });

    const unsubLaws = onSnapshot(qLaws, (snap) => {
      const data = snap.docs.map(d => ({ fb_id: d.id, ...d.data() }));
      setCustomLaws(data);
    });

    return () => { unsubProjects(); unsubLaws(); };
  }, [user, currentProject?.id]);

  useEffect(() => {
    if (currentProject) {
      setParecerDraft(prev => ({
        ...prev,
        osc: String(currentProject.nome || ""),
        processo: String(currentProject.processo || ""),
        termo: String(currentProject.termo || "TC 000/2024")
      }));
    }
  }, [currentProject?.id]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 overflow-hidden relative">
      <header className="bg-indigo-950 text-white p-5 shadow-2xl flex justify-between items-center px-10 border-b border-indigo-800 shrink-0">
        <div className="flex items-center gap-4">
          <Layers className="text-indigo-400" size={28} />
          <h1 className="text-xl font-black uppercase tracking-tighter leading-none">NGA Master AI V29 ✨</h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="bg-indigo-900/60 p-1.5 rounded-2xl border border-indigo-700 flex items-center gap-2">
             <button onClick={() => setOpinionMode('simples')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase ${opinionMode === 'simples' ? 'bg-indigo-500 text-white shadow-md' : 'text-indigo-300'}`}>Simples</button>
             <button onClick={() => setOpinionMode('completo')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase ${opinionMode === 'completo' ? 'bg-indigo-500 text-white' : 'text-indigo-300'}`}>Técnico</button>
          </div>
          <select value={selectedLegislação} onChange={(e) => setSelectedLegislação(e.target.value)} className="bg-indigo-900 border border-indigo-700 text-xs font-black p-2.5 rounded-xl text-white outline-none cursor-pointer max-w-[250px] truncate">
            {allLegislations.map(l => <option key={l.id} value={l.id} className="text-slate-900">{l.label}</option>)}
          </select>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <nav className="w-24 bg-white border-r border-slate-200 flex flex-col items-center py-10 gap-10 shadow-lg z-20">
          <button onClick={() => setActiveTab('explorer')} className={`p-4 rounded-[1.5rem] transition-all ${activeTab === 'explorer' ? 'bg-indigo-600 text-white shadow-xl scale-110' : 'text-slate-300 hover:text-indigo-600'}`} title="Bases"><FolderOpen size={30} /></button>
          <button onClick={() => setActiveTab('laws')} className={`p-4 rounded-[1.5rem] transition-all ${activeTab === 'laws' ? 'bg-indigo-600 text-white shadow-xl scale-110' : 'text-slate-300 hover:text-indigo-600'}`} title="Base Legal"><BookOpen size={30} /></button>
          <button disabled={!currentProject} onClick={() => setActiveTab('dashboard')} className={`p-4 rounded-[1.5rem] transition-all ${!currentProject ? 'opacity-20' : activeTab === 'dashboard' ? 'bg-indigo-600 text-white shadow-xl scale-110' : 'text-slate-300 hover:text-indigo-600'}`} title="Análise"><LayoutDashboard size={30} /></button>
          <button disabled={!currentProject} onClick={() => setActiveTab('flow')} className={`p-4 rounded-[1.5rem] transition-all ${!currentProject ? 'opacity-20' : activeTab === 'flow' ? 'bg-indigo-600 text-white shadow-xl scale-110' : 'text-slate-300 hover:text-indigo-600'}`} title="Fluxo NGA"><GitMerge size={30} /></button>
          <button disabled={!currentProject} onClick={() => setActiveTab('editor')} className={`p-4 rounded-[1.5rem] transition-all ${!currentProject ? 'opacity-20' : activeTab === 'editor' ? 'bg-indigo-600 text-white shadow-xl scale-110' : 'text-slate-300 hover:text-indigo-600'}`} title="Parecer"><Edit3 size={30} /></button>
          <button onClick={() => setChatOpen(!chatOpen)} className={`mt-auto p-4 rounded-[1.5rem] transition-all ${chatOpen ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-300 hover:text-indigo-600'}`} title="IA Consultoria ✨"><BrainCircuit size={30} /></button>
        </nav>

        <section className="flex-1 overflow-y-auto relative custom-scrollbar">
          
          {/* TELA: GESTÃO NORMATIVA (NOVA) */}
          {activeTab === 'laws' && (
             <div className="p-12 max-w-6xl mx-auto animate-in fade-in duration-500">
               <div className="flex justify-between items-center mb-12">
                 <div>
                    <h2 className="text-4xl font-black text-slate-800 tracking-tighter flex items-center gap-3"><BookOpen className="text-indigo-600"/> Base Legal Customizada</h2>
                    <p className="text-slate-400 font-medium">Integre as diretrizes do NotebookLM diretamente na IA do sistema.</p>
                 </div>
                 <button onClick={() => setShowLawModal(true)} className="bg-indigo-600 text-white px-8 py-4 rounded-[2rem] font-black flex items-center gap-3 shadow-2xl hover:bg-indigo-700 transition-all"><Plus size={20} /> Nova Diretriz</button>
               </div>
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 {customLaws.map(law => (
                   <div key={law.id} className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm relative group overflow-hidden">
                      <div className="flex justify-between items-start mb-4">
                          <h4 className="font-black text-indigo-900 text-xl">{law.label}</h4>
                          <button onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'laws', law.fb_id))} className="text-slate-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={18}/></button>
                      </div>
                      <div className="text-sm text-slate-600 line-clamp-4 italic bg-slate-50 p-4 rounded-2xl">{law.content}</div>
                   </div>
                 ))}
                 {customLaws.length === 0 && (
                   <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-200 rounded-[3rem] text-slate-400">
                      Nenhuma diretriz customizada cadastrada. A base padrão (IN 02/2024, etc) está operacional.
                   </div>
                 )}
               </div>
             </div>
          )}

          {/* TELA EXPLORADOR */}
          {activeTab === 'explorer' && (
            <div className="p-12 max-w-6xl mx-auto animate-in fade-in duration-500">
              <div className="flex justify-between items-center mb-12">
                <h2 className="text-4xl font-black text-slate-800">Parcerias</h2>
                <button onClick={() => setShowCreateModal(true)} className="bg-indigo-600 text-white px-10 py-4 rounded-[2.5rem] font-black flex items-center gap-3 shadow-2xl hover:bg-indigo-700 transition-all"><Plus size={24} /> Nova Parceria</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {projects.map(p => (
                  <div key={p.id} onClick={() => { setCurrentProject(p); setActiveTab('dashboard'); }} className="bg-white p-8 rounded-[3.5rem] border border-slate-100 hover:border-indigo-400 hover:shadow-2xl transition-all cursor-pointer group shadow-sm relative">
                    <div className="p-4 bg-indigo-50 text-indigo-600 rounded-[2rem] group-hover:bg-indigo-600 group-hover:text-white mb-6 w-fit"><FileSearch size={36} /></div>
                    <h4 className="font-black text-slate-800 text-2xl truncate leading-tight">{String(p.nome)}</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-2">{String(p.processo)}</p>
                    <button onClick={(e) => { e.stopPropagation(); deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'parcerias', p.id)); }} className="absolute top-4 right-4 p-2 text-slate-200 hover:text-red-500 opacity-0 group-hover:opacity-100"><Trash2 size={16}/></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'dashboard' && currentProject && (
            <div className="p-12 max-w-6xl mx-auto space-y-12 animate-in slide-in-from-right duration-500">
              <div className="flex justify-between items-center">
                <button onClick={() => setActiveTab('explorer')} className="flex items-center gap-2 text-slate-500 font-black text-sm uppercase">Voltar</button>
                <div className="flex gap-4">
                    <button onClick={sanitizeData} className="bg-red-50 text-red-600 border border-red-200 px-6 py-4 rounded-[3rem] font-black flex items-center gap-3 shadow-lg hover:bg-red-100">
                        <Eraser size={22} /> Sanitizar
                    </button>
                    <button onClick={processFlowJustifications} disabled={aiLoading || extracting} className="bg-amber-50 text-amber-700 border border-amber-200 px-8 py-4 rounded-[3rem] font-black flex items-center gap-3 shadow-lg hover:bg-amber-100 italic">
                        <GitMerge size={22} /> ✨ Preparar PL
                    </button>
                    <button onClick={processFinalAnalysis} disabled={aiLoading || extracting} className="bg-indigo-600 text-white px-12 py-4 rounded-[3rem] font-black flex items-center gap-4 shadow-2xl hover:bg-indigo-700">
                    {aiLoading ? <RefreshCcw size={22} className="animate-spin" /> : <Sparkles size={22} className="text-amber-400" />} Gerar Parecer
                    </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-10">
                <div className="bg-white p-10 rounded-[4rem] border border-slate-100 shadow-sm space-y-4 overflow-y-auto max-h-[700px]">
                  <h3 className="text-2xl font-black text-slate-800 flex items-center gap-4"><FileUp size={32} className="text-indigo-600" /> Relatórios</h3>
                  {['ext', 'conf', 'eo', 'rd', 'anual', 'anterior'].map(key => {
                    const docInfo = currentProject.docs?.[key] || {};
                    return (
                      <div key={key} className={`p-5 rounded-[2rem] border transition-all flex justify-between items-center ${docInfo.status === 'success' ? 'bg-indigo-50/50 border-indigo-100 shadow-inner' : 'bg-slate-50 border-slate-50'}`}>
                        <div className="flex items-center gap-3">
                          {docInfo.status === 'success' ? <CheckCircle size={20} className="text-indigo-600" /> : <Clock size={20} className="text-slate-300" />}
                          <span className={`text-sm font-black truncate`}>{String(docInfo.name || key.toUpperCase())}</span>
                        </div>
                        <button disabled={!pdfLibReady} onClick={() => { setUploadTarget(key); fileInputRef.current.click(); }} className={`px-5 py-2 rounded-xl text-[9px] font-black uppercase transition-all shadow-sm ${docInfo.status === 'success' ? 'bg-white text-indigo-600 border border-indigo-100 shadow-sm' : 'bg-indigo-600 text-white'}`}>Anexar</button>
                      </div>
                    );
                  })}
                </div>
                <div className="bg-indigo-950 p-16 rounded-[5rem] text-white shadow-2xl relative overflow-hidden min-h-[500px] flex flex-col justify-center border border-white/10">
                  <h3 className="text-3xl font-black mb-8 flex items-center gap-5 text-indigo-400 font-serif"><Wand2 size={40} /> Consultoria IA ✨</h3>
                  <div className="text-lg leading-relaxed text-indigo-100 italic whitespace-pre-wrap text-justify overflow-y-auto max-h-[600px] pr-4 font-serif">
                    {aiLoading ? "Cruzando regras legais e caçando resgates indevidos no fundo provisionado..." : "Base limpa. A IA agora exige tarifas apenas se o valor cobrado for superior a R$ 1,00."}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'flow' && currentProject && (
            <div className="p-12 max-w-6xl mx-auto space-y-12 animate-in zoom-in-95 duration-500">
               <div className="flex justify-between items-center">
                  <h2 className="text-4xl font-black text-slate-800 tracking-tighter flex items-center gap-4"><GitMerge className="text-indigo-600" size={36}/> Fluxo de Liberação</h2>
                  <button onClick={exportFlow} className="bg-indigo-600 text-white px-10 py-4 rounded-[2.5rem] font-black flex items-center gap-3 shadow-2xl hover:bg-indigo-700 transition-all"><Download size={24} /> Exportar</button>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm space-y-4">
                    <div className="flex justify-between items-start">
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl font-black">01. Conferência</div>
                        <input type="checkbox" className="w-8 h-8 rounded-xl border-slate-200 text-indigo-600" checked={flowSteps.docConf.status} onChange={() => setFlowSteps({...flowSteps, docConf: {...flowSteps.docConf, status: !flowSteps.docConf.status}})} />
                    </div>
                    <textarea className="w-full p-4 bg-slate-50 border-none rounded-2xl text-sm italic shadow-inner" value={String(flowSteps.docConf.comment)} onChange={e => setFlowSteps({...flowSteps, docConf: {...flowSteps.docConf, comment: e.target.value}})} rows={3} />
                  </div>
                  <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm space-y-4">
                    <div className="flex justify-between items-start">
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl font-black">02. Fundo & Tarifas</div>
                        <input type="checkbox" className="w-8 h-8 rounded-xl border-slate-200 text-indigo-600" checked={flowSteps.saldoProv.status} onChange={() => setFlowSteps({...flowSteps, saldoProv: {...flowSteps.saldoProv, status: !flowSteps.saldoProv.status}})} />
                    </div>
                    <textarea className="w-full p-4 bg-slate-50 border-none rounded-2xl text-sm italic shadow-inner" value={String(flowSteps.saldoProv.comment)} onChange={e => setFlowSteps({...flowSteps, saldoProv: {...flowSteps.saldoProv, comment: e.target.value}})} rows={3} />
                  </div>
                  <div className="col-span-full bg-indigo-50 p-10 rounded-[3rem] border border-indigo-100 space-y-4 shadow-sm">
                    <div className="flex items-center gap-3 text-indigo-900"><Quote size={24} /><h3 className="text-xl font-black uppercase">Síntese Técnica</h3></div>
                    <textarea className="w-full p-6 bg-white border-none rounded-3xl text-sm font-bold shadow-sm text-indigo-900 outline-indigo-500" value={String(flowSteps.sintese)} onChange={e => setFlowSteps({...flowSteps, sintese: e.target.value})} rows={4} />
                  </div>
                  <div className="bg-white p-10 rounded-[3rem] border border-indigo-600 shadow-xl space-y-4 col-span-full">
                    <h3 className="text-xl font-black text-indigo-600">Manifestação Final</h3>
                    <textarea className="w-full p-4 bg-indigo-50 border-none rounded-2xl text-sm font-black text-indigo-900 shadow-inner" value={String(flowSteps.despacho)} onChange={e => setFlowSteps({...flowSteps, despacho: e.target.value})} rows={2} />
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'editor' && currentProject && (
            <div className="p-12 max-w-7xl mx-auto flex gap-10">
               <div className="w-80 space-y-8 shrink-0">
                  <div className="bg-white p-8 rounded-[3.5rem] border border-slate-200 space-y-4 shadow-sm">
                    <h4 className="text-[10px] font-black uppercase text-indigo-600 border-b pb-2">Identificação</h4>
                    <input className="w-full p-2 bg-slate-50 border-none text-xs font-bold shadow-inner rounded-lg" value={String(parecerDraft.osc)} onChange={e => setParecerDraft({...parecerDraft, osc: e.target.value})} placeholder="OSC"/>
                    <input className="w-full p-2 bg-slate-50 border-none text-xs font-bold shadow-inner rounded-lg" value={String(parecerDraft.processo)} onChange={e => setParecerDraft({...parecerDraft, processo: e.target.value})} placeholder="Processo"/>
                    <input className="w-full p-2 bg-slate-50 border-none text-xs font-bold shadow-inner rounded-lg" value={String(parecerDraft.competencia)} onChange={e => setParecerDraft({...parecerDraft, competencia: e.target.value})} placeholder="Competência"/>
                  </div>
                  <div className="bg-white p-8 rounded-[3.5rem] border border-slate-200 space-y-4 shadow-sm">
                    <h4 className="text-[10px] font-black uppercase text-indigo-600 border-b pb-2 tracking-widest">Elaboração</h4>
                    <input className="w-full p-2 bg-slate-50 border-none text-xs font-bold shadow-inner rounded-lg" value={String(parecerDraft.analista)} onChange={e => setParecerDraft({...parecerDraft, analista: e.target.value})} placeholder="Nome"/>
                    <input className="w-full p-2 bg-slate-50 border-none text-xs font-bold shadow-inner rounded-lg" value={String(parecerDraft.cargo)} onChange={e => setParecerDraft({...parecerDraft, cargo: e.target.value})} placeholder="Cargo"/>
                  </div>
                  <div className="bg-white p-6 rounded-[3rem] border border-slate-200 shadow-xl space-y-4">
                    <select value={selectedFont} onChange={(e) => setSelectedFont(e.target.value)} className="w-full p-3 bg-slate-50 border-none rounded-2xl text-xs font-bold shadow-inner outline-indigo-500">
                        {FONTS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                    </select>
                    <div className="grid grid-cols-4 gap-2 border-t pt-4">
                        <button onClick={() => applyFormatting('bold')} className="p-3 bg-slate-50 rounded-xl hover:bg-indigo-50"><Bold size={16}/></button>
                        <button onClick={() => applyFormatting('justifyFull')} className="p-3 bg-slate-50 rounded-xl hover:bg-indigo-50"><AlignJustify size={16}/></button>
                        <button onClick={handleSuggestLaw} className="p-3 bg-indigo-50 rounded-xl hover:bg-indigo-100 text-indigo-600"><Scale size={16}/></button>
                        <button onClick={downloadDocument} className="p-3 bg-green-50 rounded-xl hover:bg-green-100 text-green-700"><Download size={16}/></button>
                    </div>
                  </div>
               </div>
               <div className="flex-1 bg-white p-[2cm] shadow-2xl min-h-[29.7cm] border border-slate-100 flex flex-col" style={{ fontFamily: selectedFont, fontSize: fontSize }}>
                  <div className="text-center border-b-4 border-slate-900 pb-8 mb-16"><h2 className="text-3xl font-bold uppercase tracking-tight">Parecer Técnico NGA</h2><p className="text-sm font-sans font-bold text-slate-400">SAS Guaianazes - SMADS</p></div>
                  <div className="space-y-2 text-[12.5pt] mb-10 bg-slate-50/50 p-10 rounded-[2.5rem] border border-slate-100 shadow-sm">
                    <p><strong>OSC:</strong> {String(parecerDraft.osc).toUpperCase() || "---"}</p>
                    <p><strong>PROCESSO SEI:</strong> {String(parecerDraft.processo) || "---"}</p>
                    <p><strong>COMPETÊNCIA ANALISADA:</strong> {String(parecerDraft.competencia).toUpperCase() || "---"}</p>
                  </div>
                  <div ref={editorRef} contentEditable onInput={(e) => setEditableOpinion(e.currentTarget.innerHTML)} className="w-full border-none p-4 text-[12pt] text-slate-800 italic leading-[1.8] bg-transparent resize-none flex-1 outline-none min-h-[600px] text-justify" dangerouslySetInnerHTML={{ __html: editableOpinion }} />
                  <div className="mt-20 pt-6 border-t-4 border-slate-900 text-center mx-auto w-[10cm]"><p className="font-bold text-[15pt] uppercase leading-tight">{String(parecerDraft.analista || "AUDITOR")}</p><p className="text-[10pt] uppercase font-sans font-bold text-slate-500">{String(parecerDraft.cargo)}</p></div>
               </div>
            </div>
          )}
        </section>

        {chatOpen && (
          <aside className="w-96 bg-white border-l border-slate-200 flex flex-col shadow-2xl animate-in slide-in-from-right-8 z-30">
            <div className="p-6 bg-indigo-950 text-white flex justify-between items-center shadow-lg"><div className="flex items-center gap-3"><Bot className="text-indigo-400" /><h3 className="font-black uppercase text-xs">Auditor Virtual ✨</h3></div><button onClick={() => setChatOpen(false)}><X /></button></div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50 custom-scrollbar">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] p-4 rounded-3xl text-xs leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-100 text-slate-700'}`}>{String(msg.text)}</div></div>
              ))}
              {aiLoading && <div className="flex items-center gap-2 text-[10px] font-bold text-indigo-400 animate-pulse pl-2"><Sparkles size={12}/> ✨ Analisando...</div>}
            </div>
            <div className="p-6 border-t bg-white flex gap-2 shadow-inner"><input className="flex-1 bg-slate-100 border-none p-4 rounded-2xl text-sm font-medium outline-none focus:ring-2 ring-indigo-100 transition-all shadow-inner" placeholder="Dúvidas?" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && sendChatMessage()} /><button onClick={sendChatMessage} className="p-4 bg-indigo-600 text-white rounded-2xl shadow-xl hover:scale-105 active:scale-95 transition-all"><Send size={18}/></button></div>
          </aside>
        )}
      </main>

      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept="application/pdf" />

      {showCreateModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-indigo-950/50 backdrop-blur-md animate-in zoom-in-95 duration-200">
           <div className="bg-white w-full max-w-md rounded-[4.5rem] shadow-2xl p-16 space-y-12 border border-white/20 relative">
              <button onClick={() => setShowCreateModal(false)} className="absolute top-8 right-8 text-slate-300 hover:text-red-500 transition-all hover:rotate-90"><X size={32}/></button>
              <h3 className="text-4xl font-black text-slate-800 tracking-tighter leading-none">Novo Registro</h3>
              <div className="space-y-6">
                <input className="w-full p-6 bg-slate-50 border-none rounded-3xl font-bold shadow-inner outline-indigo-500" placeholder="Nome da OSC" value={newProject.nome} onChange={e => setNewProject({...newProject, nome: e.target.value})} />
                <input className="w-full p-6 bg-slate-50 border-none rounded-3xl font-bold shadow-inner outline-indigo-500" placeholder="Processo SEI" value={newProject.sei} onChange={e => setNewProject({...newProject, sei: e.target.value})} />
              </div>
              <button onClick={handleCreateProject} className="w-full bg-indigo-600 text-white py-6 rounded-3xl font-black shadow-xl hover:bg-indigo-700 transition-all uppercase text-xs tracking-widest">Ativar Parceria</button>
           </div>
        </div>
      )}

      {showLawModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-indigo-950/50 backdrop-blur-md animate-in zoom-in-95 duration-200">
           <div className="bg-white w-full max-w-lg rounded-[4.5rem] shadow-2xl p-12 space-y-8 border border-white/20 relative">
              <button onClick={() => setShowLawModal(false)} className="absolute top-8 right-8 text-slate-300 hover:text-red-500 transition-all hover:rotate-90"><X size={32}/></button>
              <h3 className="text-2xl font-black text-slate-800 tracking-tighter">Inserir Diretriz Normativa</h3>
              <div className="space-y-4">
                <input className="w-full p-5 bg-slate-50 border-none rounded-2xl font-bold shadow-inner outline-indigo-500" placeholder="Ex: Portaria 123/2026" value={newLaw.label} onChange={e => setNewLaw({...newLaw, label: e.target.value})} />
                <textarea className="w-full p-5 bg-slate-50 border-none rounded-2xl font-medium shadow-inner outline-indigo-500 text-sm" placeholder="Cole aqui os resumos ou artigos importantes do NotebookLM..." rows={6} value={newLaw.content} onChange={e => setNewLaw({...newLaw, content: e.target.value})} />
              </div>
              <button onClick={handleCreateLaw} className="w-full bg-indigo-600 text-white py-5 rounded-3xl font-black shadow-xl hover:bg-indigo-700 transition-all uppercase text-xs tracking-widest">Salvar Base Legal</button>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;