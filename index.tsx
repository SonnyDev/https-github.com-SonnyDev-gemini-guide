import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";

// --- Types & Interfaces ---

type Mobility = 'low' | 'medium' | 'high';
type Budget = 'low' | 'medium' | 'high';
type TimeBudget = '1h' | '2-3h' | 'half-day' | 'full-day';

// Type alias to avoid confusion with DOM Blob
type GenAIBlob = { data: string; mimeType: string };

interface UserPreferences {
  timeBudget: TimeBudget;
  mobility: Mobility;
  budget: Budget;
}

interface Persona {
  id: string;
  name: string;
  role: string;
  tagline: string;
  description: string;
  avatar: string;
  color: string;
  voiceName: string;
  isCustom?: boolean;
  traits?: {
    tone: string;
    focus: string[];
  };
}

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  groundingChunks?: any[];
  isFinal?: boolean;
}

// --- Data: London Specific Personas ---

const BUILT_IN_PERSONAS: Persona[] = [
  {
    id: 'david',
    name: 'David Attenborough',
    role: 'Explorer',
    tagline: 'Nature & History',
    // Young explorer vibe: Grey hair (d1d1d1), blazer, pale skin (ffdbb4)
    avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=David&top=shortFlat&hairColor=d1d1d1&clothing=blazerAndShirt&skinColor=ffdbb4&accessories=eyepatch&accessoriesProbability=0',
    color: 'bg-green-100 text-green-800',
    voiceName: 'Fenrir',
    description: 'You are Sir David Attenborough. You guide the user through London with a focus on natural history, parks (like Richmond Park or Kew Gardens), and museums. Your tone is hushed, wondrous, and intellectual. You often pause for effect.',
    traits: { tone: 'Wondrous', focus: ['Nature', 'Museums', 'History'] }
  },
  {
    id: 'vivienne',
    name: 'Vivienne Westwood',
    role: 'Fashion Design',
    tagline: 'Punk & Rebellion',
    // Red bun (f05639), punk vibe
    avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Vivienne&top=bun&hairColor=f05639&clothing=collarAndSweater&skinColor=ffdbb4&accessoriesProbability=0',
    color: 'bg-pink-100 text-pink-800',
    voiceName: 'Kore',
    description: 'You are the late, great Vivienne Westwood. You guide the user through the rebellious side of London—Soho, Camden, Kings Road. Focus on fashion history, punk culture, and art. Your tone is bold, opinionated, and energetic.',
    traits: { tone: 'Rebellious', focus: ['Fashion', 'Punk', 'Art'] }
  },
  {
    id: 'amelia',
    name: 'Amelia Dimoldenberg',
    role: 'Youtuber',
    tagline: 'Chicken Shop Date',
    // Blonde (e6c364), hoodie, deadpan
    avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Amelia&top=longHairStraight&hairColor=e6c364&clothing=hoodie&skinColor=ffdbb4&mouth=twinkle',
    color: 'bg-yellow-100 text-yellow-800',
    voiceName: 'Zephyr',
    description: 'You are Amelia Dimoldenberg. You love chicken shops, awkward humor, and local pop culture spots. Your tone is deadpan, dry, and slightly awkward but charming. You suggest fast food, nugget spots, and trendy but low-key places.',
    traits: { tone: 'Dry Humor', focus: ['Food', 'Pop Culture', 'Dates'] }
  },
  {
    id: 'stormzy',
    name: 'Stormzy',
    role: 'Grime Artist',
    tagline: 'South London Vibes',
    // Black hoodie, beard, cool, dark skin (614335), dark hair (2c2c2c)
    avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Stormzy&top=shortCurly&skinColor=614335&hairColor=2c2c2c&facialHair=beardLight&clothing=hoodie&mouth=smile',
    color: 'bg-slate-200 text-slate-800',
    voiceName: 'Charon',
    description: 'You are Stormzy. You represent South London (Croydon, Brixton). You guide the user to the best spots for music, street food, and community vibes. Your tone is deep, friendly, "bruv", and authentic.',
    traits: { tone: 'Authentic', focus: ['Music', 'Culture', 'South London'] }
  },
  {
    id: 'harry',
    name: 'Harry Potter',
    role: 'Wizard',
    tagline: 'Magical London',
    // Round glasses, scarf-like collar, black hair (2c2c2c)
    avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Harry&top=shortRound&hairColor=2c2c2c&accessories=prescription02&clothing=graphicShirt&skinColor=ffdbb4',
    color: 'bg-indigo-100 text-indigo-800',
    voiceName: 'Puck',
    description: 'You are Harry Potter. You guide the user to magical locations in London—Leadenhall Market (Diagon Alley), Kings Cross (Platform 9 3/4), and other wizarding world film locations. Your tone is helpful, brave, and slightly wondrous.',
    traits: { tone: 'Magical', focus: ['Magic', 'Film Spots', 'Secrets'] }
  }
];

// --- Audio Helper Functions ---

function createBlob(data: Float32Array): GenAIBlob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// --- Components ---

const Icon = ({ name, className = "" }: { name: string, className?: string }) => (
  <span className={`material-symbols-rounded ${className}`}>{name}</span>
);

// 1. Onboarding Component
const Onboarding = ({ onComplete }: { onComplete: (city: string, personaId: string, prefs: UserPreferences, customPersona?: Persona) => void }) => {
  // Default preferences since UI is removed
  const defaultPrefs: UserPreferences = {
    timeBudget: '2-3h',
    mobility: 'medium',
    budget: 'medium'
  };

  const handlePersonaSelect = (id: string) => {
    onComplete('London', id, defaultPrefs);
  };

  return (
      <div className="h-full w-full overflow-y-auto bg-[#FDFBF7] flex flex-col items-center justify-center py-12 px-4 font-sans">
        <div className="max-w-6xl w-full text-center space-y-4 mb-16">
            <h2 className="text-lg font-bold text-slate-800 tracking-wide font-['Irish_Grover']">Hey, Mai</h2>
            <h1 className="text-5xl md:text-6xl text-slate-900 tracking-tight font-['Irish_Grover']">
                Select your London tour guide
            </h1>
        </div>
        
        <div className="max-w-7xl w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8 justify-items-center items-start">
            {BUILT_IN_PERSONAS.map((p) => (
                <div key={p.id} className="flex flex-col items-center group w-full">
                    <div className="w-48 h-48 rounded-full bg-[#F2EEE3] mb-6 relative overflow-hidden border-4 border-transparent transition-all duration-300 shadow-lg">
                         <img 
                            src={p.avatar} 
                            alt={p.name} 
                            className="w-full h-full object-cover transform group-hover:scale-110 transition duration-500" 
                            crossOrigin="anonymous"
                            onError={(e) => {
                                // Fallback if DiceBear fails
                                (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${p.name}&background=random`;
                            }}
                         />
                    </div>
                    <div className="text-center mb-6 h-16">
                        <h3 className="text-xl font-bold text-slate-900 mb-1 leading-tight font-['Irish_Grover']">{p.name}</h3>
                        <p className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">{p.role}</p>
                    </div>
                    <button
                        onClick={() => handlePersonaSelect(p.id)}
                        className="bg-white text-slate-900 border-2 border-slate-900 px-10 py-2 rounded-full font-['Irish_Grover'] text-lg transition-all duration-200 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] active:bg-slate-50"
                    >
                        Select
                    </button>
                </div>
            ))}
        </div>
      </div>
  );
};

// 2. Main Split View Interface
const AppContent = ({ city, persona, prefs, allPersonas, onSwitchPersona }: { 
  city: string, 
  persona: Persona, 
  prefs: UserPreferences,
  allPersonas: Persona[],
  onSwitchPersona: (id: string) => void
}) => {
  const [messages, setMessages] = useState<Message[]>([
    { id: '0', role: 'model', text: `Hello! I'm ${persona.name}. I'm ready to show you around London. Where should we start?`, isFinal: true }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [groundingPlaces, setGroundingPlaces] = useState<any[]>([]);
  const [mapQuery, setMapQuery] = useState<string>(city);
  const [showPersonaMenu, setShowPersonaMenu] = useState(false);
  
  // Live API States
  const [isLive, setIsLive] = useState(false);
  
  // Live API Refs
  const audioContextsRef = useRef<{input?: AudioContext, output?: AudioContext}>({});
  const currentSessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  
  // Transcription accumulator for the current turn
  const currentTurnRef = useRef<{ input: string, output: string }>({ input: '', output: '' });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Cleanup on unmount or persona switch
  useEffect(() => {
    return () => {
        stopLiveSession();
    };
  }, [persona.id]);

  const startLiveSession = async () => {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        // 1. Audio Context Setup
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const inputAudioContext = new AudioContextClass({ sampleRate: 16000 });
        const outputAudioContext = new AudioContextClass({ sampleRate: 24000 });
        
        audioContextsRef.current = { input: inputAudioContext, output: outputAudioContext };
        const outputNode = outputAudioContext.createGain();
        outputNode.connect(outputAudioContext.destination);

        nextStartTimeRef.current = 0;
        audioSourcesRef.current.clear();

        // 2. Stream Setup
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        // 3. System Instruction
        const systemInstructionText = `
            You are currently acting as a specific persona: "${persona.name}".
            Description: ${persona.description}.
            Current City: ${city}.
            User Preferences: Time Budget=${prefs.timeBudget}, Walking=${prefs.mobility}, Spending=${prefs.budget}.
            
            Your goal is to be a helpful tourist guide.
            Always stay in character.
            Keep responses conversational and suitable for spoken audio (not too long).
            IMPORTANT: Speak at a brisk, energetic, and natural pace. Do not speak slowly.
        `;

        // 4. Connect
        const sessionPromise = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: persona.voiceName || 'Zephyr' } }
                },
                systemInstruction: { parts: [{ text: systemInstructionText }] },
            },
            callbacks: {
                onopen: async () => {
                    console.log("Live session connected");
                    setIsLive(true);
                    
                    // Send Audio Input
                    const source = inputAudioContext.createMediaStreamSource(stream);
                    const processor = inputAudioContext.createScriptProcessor(4096, 1, 1);
                    
                    processor.onaudioprocess = (e) => {
                        const inputData = e.inputBuffer.getChannelData(0);
                        const blob = createBlob(inputData);
                        sessionPromise.then(session => session.sendRealtimeInput({ media: blob }));
                    };
                    
                    source.connect(processor);
                    processor.connect(inputAudioContext.destination);
                    currentSessionRef.current = await sessionPromise;
                },
                onmessage: async (msg: LiveServerMessage) => {
                    // 1. Handle Audio Output
                    const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                    if (audioData) {
                        const audioCtx = audioContextsRef.current.output;
                        if (audioCtx) {
                            // Ensure exact timing
                            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, audioCtx.currentTime);
                            
                            const audioBuffer = await decodeAudioData(
                                decode(audioData),
                                audioCtx,
                                24000,
                                1
                            );
                            
                            const source = audioCtx.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(outputNode);
                            source.addEventListener('ended', () => {
                                audioSourcesRef.current.delete(source);
                            });
                            
                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += audioBuffer.duration;
                            audioSourcesRef.current.add(source);
                        }
                    }

                    // 2. Handle Interruptions
                    if (msg.serverContent?.interrupted) {
                        audioSourcesRef.current.forEach(s => s.stop());
                        audioSourcesRef.current.clear();
                        nextStartTimeRef.current = 0;
                        currentTurnRef.current = { input: '', output: '' };
                    }

                    // 3. Handle Transcription (UI Sync) - Optional check since we removed config
                    const outText = msg.serverContent?.outputTranscription?.text;
                    const inText = msg.serverContent?.inputTranscription?.text;

                    if (outText || inText) {
                        if (inText) currentTurnRef.current.input += inText;
                        if (outText) currentTurnRef.current.output += outText;
                    }

                    if (msg.serverContent?.turnComplete) {
                        // Commit turn to history
                        const inputT = currentTurnRef.current.input.trim();
                        const outputT = currentTurnRef.current.output.trim();
                        
                        if (inputT) {
                            setMessages(prev => [...prev, { id: Date.now().toString() + 'u', role: 'user', text: inputT, isFinal: true }]);
                        }
                        if (outputT) {
                            setMessages(prev => [...prev, { id: Date.now().toString() + 'm', role: 'model', text: outputT, isFinal: true }]);
                        }
                        
                        // Reset current turn
                        currentTurnRef.current = { input: '', output: '' };
                    }
                },
                onclose: () => {
                    console.log("Live session closed");
                    setIsLive(false);
                },
                onerror: (err) => {
                    console.error("Live session error:", err);
                    setIsLive(false);
                    stopLiveSession();
                }
            }
        });

    } catch (error) {
        console.error("Failed to start live session:", error);
        alert("Could not connect to Live API.");
        setIsLive(false);
    }
  };

  const stopLiveSession = () => {
    if (currentSessionRef.current) {
        currentSessionRef.current.close();
        currentSessionRef.current = null;
    }
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
    }
    if (audioContextsRef.current.input) {
        audioContextsRef.current.input.close();
    }
    if (audioContextsRef.current.output) {
        audioContextsRef.current.output.close();
    }
    audioContextsRef.current = {};
    setIsLive(false);
  };

  const toggleLive = () => {
    if (isLive) {
        stopLiveSession();
    } else {
        startLiveSession();
    }
  };

  // Fallback Text Message Handler
  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;
    
    // Stop live session if active to avoid conflict
    if (isLive) stopLiveSession();

    const newMessage: Message = { id: Date.now().toString(), role: 'user', text, isFinal: true };
    setMessages(prev => [...prev, newMessage]);
    setInputText('');
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const systemInstruction = `
        You are currently acting as a specific persona: "${persona.name}".
        Description: ${persona.description}.
        Current City: ${city}.
        User Preferences: Time Budget=${prefs.timeBudget}, Walking=${prefs.mobility}, Spending=${prefs.budget}.
        
        Your goal is to be a helpful tourist guide.
        Always stay in character.
        If the user asks for places, give specific recommendations.
        Keep responses concise and conversational.
        Use the Google Maps tool to find real places.
      `;

      const history = messages.filter(m => m.isFinal).slice(1).map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          ...history,
          { role: 'user', parts: [{ text }] }
        ],
        config: {
          systemInstruction,
          tools: [{ googleMaps: {} }]
        }
      });

      const generatedText = response.text || "I'm having trouble connecting to the city grid right now.";
      
      // Check for grounding (places)
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      
      let newMapQuery = mapQuery;
      if (groundingChunks.length > 0) {
        const newPlaces = groundingChunks.filter((c: any) => c.web?.uri || c.web?.title);
        if (newPlaces.length > 0) {
           setGroundingPlaces(newPlaces);
           if (newPlaces[0].web?.title) {
              newMapQuery = `${newPlaces[0].web.title}, ${city}`;
              setMapQuery(newMapQuery);
           }
        }
      }

      const modelMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: generatedText,
        groundingChunks: groundingChunks,
        isFinal: true
      };

      setMessages(prev => [...prev, modelMessage]);

    } catch (error) {
      console.error("AI Error:", error);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'model', text: "Sorry, I lost my connection to the guide network. Try again?", isFinal: true }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = (action: string) => {
    let prompt = "";
    switch(action) {
      case 'plan': prompt = `Plan a ${prefs.timeBudget} itinerary starting from here based on my preferences.`; break;
      case 'food': prompt = "I'm hungry. Suggest 3 options nearby suitable for my budget."; break;
      case 'highlight': prompt = "What is the single most important thing to see nearby?"; break;
    }
    handleSendMessage(prompt);
  };

  return (
    <div className="h-full flex flex-row w-full overflow-hidden bg-slate-100">
      
      {/* LEFT PANE: GOOGLE MAPS (SIMULATED VIA IFRAME + OVERLAYS) */}
      <div className="flex-1 relative h-full bg-gray-200">
         <iframe
            title="Map"
            width="100%"
            height="100%"
            frameBorder="0"
            scrolling="no"
            marginHeight={0}
            marginWidth={0}
            src={`https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&t=&z=14&ie=UTF8&iwloc=&output=embed`}
            className="w-full h-full opacity-90 grayscale-[20%] hover:grayscale-0 transition duration-700"
         />
         
         {/* Floating "Places" Cards Overlay on Map */}
         {groundingPlaces.length > 0 && (
            <div className="absolute bottom-6 left-6 right-6 flex gap-4 overflow-x-auto pb-2 no-scrollbar pointer-events-none">
               {groundingPlaces.map((place: any, idx: number) => (
                  <a 
                    key={idx} 
                    href={place.web?.uri} 
                    target="_blank" 
                    rel="noreferrer"
                    className="pointer-events-auto min-w-[280px] max-w-[280px] glass-panel p-4 rounded-xl shadow-lg border border-white/50 hover:scale-105 transition transform cursor-pointer"
                  >
                    <div className="flex items-start justify-between">
                        <h4 className="font-bold text-slate-800 truncate">{place.web?.title || "Unknown Place"}</h4>
                        <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                            #{idx + 1}
                        </span>
                    </div>
                    <div className="mt-2 flex items-center text-xs text-slate-500 font-medium">
                         <Icon name="location_on" className="text-sm mr-1 text-red-500" />
                         Tap to view details
                    </div>
                  </a>
               ))}
            </div>
         )}

         {/* City Overlay Badge */}
         <div className="absolute top-6 left-6 bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-md border border-white/50 flex items-center gap-2">
            <Icon name="location_city" className="text-slate-400" />
            <span className="font-bold text-slate-700 font-['Irish_Grover']">{city}</span>
         </div>
      </div>

      {/* RIGHT PANE: CHAT INTERFACE */}
      <div className="w-[420px] min-w-[350px] max-w-[450px] bg-white border-l border-gray-200 flex flex-col shadow-2xl z-10 relative">
        
        {/* Header */}
        <div className="bg-white p-4 border-b border-gray-100 flex items-center justify-between shadow-sm z-20">
            <div 
                className="flex items-center cursor-pointer hover:bg-gray-50 p-2 -ml-2 rounded-xl transition" 
                onClick={() => setShowPersonaMenu(!showPersonaMenu)}
            >
                <img src={persona.avatar} className="w-10 h-10 rounded-full mr-3 border border-gray-200" />
                <div>
                    <h1 className="text-xl leading-tight text-slate-800 font-['Irish_Grover']">{persona.name}</h1>
                    <p className="text-xs text-slate-500 flex items-center">
                        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isLive ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></span>
                        {isLive ? 'Live Conversation' : 'Online'}
                    </p>
                </div>
                <Icon name="expand_more" className="text-gray-300 ml-auto text-lg" />
            </div>
        </div>

        {/* Persona Menu Dropdown */}
        {showPersonaMenu && (
            <div className="absolute top-20 left-4 right-4 bg-white shadow-2xl border border-gray-100 rounded-2xl p-2 z-50 animate-in slide-in-from-top-5 duration-200">
                <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Switch Guide</div>
                <div className="max-h-60 overflow-y-auto space-y-1">
                    {allPersonas.map(p => (
                        <button 
                            key={p.id}
                            onClick={() => { onSwitchPersona(p.id); setShowPersonaMenu(false); }}
                            className={`w-full flex items-center p-3 rounded-xl hover:bg-gray-50 transition ${p.id === persona.id ? 'bg-blue-50 border-blue-100 ring-1 ring-blue-100' : ''}`}
                        >
                            <img src={p.avatar} className="w-8 h-8 rounded-full mr-3" />
                            <div className="text-left">
                                <div className={`text-sm font-bold ${p.id === persona.id ? 'text-blue-700' : 'text-gray-700'}`}>{p.name}</div>
                                <div className="text-xs text-gray-400 truncate">{p.tagline}</div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        )}

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-50/50 scroll-smooth" ref={chatContainerRef}>
            {messages.map((msg) => (
              <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div 
                  className={`max-w-[90%] p-4 text-sm shadow-sm ${
                    msg.role === 'user' 
                      ? 'bg-slate-800 text-white rounded-2xl rounded-br-none' 
                      : `bg-white text-slate-700 border border-gray-100 rounded-2xl rounded-tl-none`
                  }`}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                  {/* Inline Place Chips */}
                  {msg.groundingChunks && msg.groundingChunks.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-dashed border-gray-200/50 flex flex-col gap-2">
                       <span className="text-[10px] font-bold text-gray-400 uppercase">References</span>
                       {msg.groundingChunks.filter((c:any) => c.web?.title).map((chunk: any, i: number) => (
                           <button 
                             key={i}
                             onClick={() => setMapQuery(`${chunk.web.title}, ${city}`)}
                             className="text-xs text-left bg-blue-50 hover:bg-blue-100 text-blue-700 px-2 py-1.5 rounded-lg transition flex items-center gap-2"
                           >
                              <Icon name="map" className="text-sm" />
                              <span className="truncate">{chunk.web.title}</span>
                           </button>
                       ))}
                    </div>
                  )}
                </div>
                {/* Timestamp or Status */}
                <span className="text-[10px] text-gray-300 mt-1 px-1">
                    {msg.role === 'user' ? 'You' : persona.name}
                </span>
              </div>
            ))}
            {isLoading && (
               <div className="flex justify-start w-full">
                 <div className="bg-white p-4 rounded-2xl rounded-tl-none border border-gray-100 shadow-sm flex items-center space-x-2">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay:'150ms'}}></div>
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay:'300ms'}}></div>
                 </div>
               </div>
            )}
            {isLive && (
               <div className="flex justify-center w-full mt-4">
                 <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 shadow-sm animate-pulse">
                    <Icon name="mic" className="text-sm" />
                    Live Session Active
                 </div>
               </div>
            )}
            <div ref={messagesEndRef} />
        </div>

        {/* Input & Actions Area */}
        <div className="p-4 bg-white border-t border-gray-100">
             {/* Quick Actions */}
            {!isLoading && !isLive && (
                <div className="flex gap-2 overflow-x-auto pb-3 mb-1 no-scrollbar">
                    {[
                        { id: 'plan', label: '📅 Plan next hour', color: 'bg-blue-50 text-blue-600 border-blue-100' },
                        { id: 'food', label: '🍔 Food now', color: 'bg-orange-50 text-orange-600 border-orange-100' },
                        { id: 'highlight', label: '✨ Top Spot', color: 'bg-purple-50 text-purple-600 border-purple-100' }
                    ].map(action => (
                        <button 
                            key={action.id}
                            onClick={() => handleQuickAction(action.id)} 
                            className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold border transition hover:scale-105 ${action.color}`}
                        >
                            {action.label}
                        </button>
                    ))}
                </div>
            )}

            <div className={`relative flex items-end gap-2 p-2 rounded-3xl border transition duration-300 ${isLive ? 'bg-red-50 border-red-100 ring-1 ring-red-100' : 'bg-gray-50 border-gray-200 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500'}`}>
                <button 
                    onClick={toggleLive}
                    className={`p-2 transition rounded-full flex-shrink-0 ${
                        isLive ? 'text-white bg-red-500 shadow-md hover:bg-red-600' : 
                        'text-gray-400 hover:text-gray-600 hover:bg-gray-200'
                    }`}
                    title={isLive ? "Stop Conversation" : "Start Voice Chat"}
                >
                     <Icon name={isLive ? "call_end" : "mic"} className="text-xl" />
                </button>
                
                <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(inputText); }}}
                    placeholder={isLive ? "Listening... (Speak now)" : "Ask for tips, routes, or stories..."}
                    disabled={isLive}
                    className="w-full bg-transparent border-none focus:ring-0 text-sm py-2.5 resize-none max-h-32 outline-none text-slate-700 placeholder:text-slate-400 disabled:opacity-50 disabled:placeholder:text-red-300"
                    rows={1}
                    style={{ minHeight: '44px' }}
                />
                
                {!isLive && (
                    <button 
                        onClick={() => handleSendMessage(inputText)}
                        disabled={!inputText.trim() || isLoading}
                        className={`p-2 rounded-full transition-all duration-200 flex-shrink-0 ${inputText.trim() ? 'bg-blue-600 text-white shadow-md scale-100' : 'bg-gray-200 text-gray-400 scale-90'}`}
                    >
                        <Icon name="arrow_upward" className="text-lg" />
                    </button>
                )}
            </div>
            <div className="text-center mt-2">
                <p className="text-[10px] text-gray-300 font-medium">
                    Gemini 2.5 Flash • Live Audio
                </p>
            </div>
        </div>
      </div>
    </div>
  );
};

// 3. Root App Component
const App = () => {
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [userSetup, setUserSetup] = useState<{city: string, personaId: string, prefs: UserPreferences} | null>(null);
  const [personas, setPersonas] = useState<Persona[]>(BUILT_IN_PERSONAS);
  const [activePersonaId, setActivePersonaId] = useState<string>('david');

  const handleOnboardingComplete = (city: string, personaId: string, prefs: UserPreferences, customPersona?: Persona) => {
    if (customPersona) {
      setPersonas(prev => [...prev, customPersona as Persona]);
    }
    setUserSetup({ city, personaId, prefs });
    setActivePersonaId(personaId);
    setOnboardingComplete(true);
  };

  const handleSwitchPersona = (id: string) => {
    setActivePersonaId(id);
  };

  const activePersona = personas.find(p => p.id === activePersonaId) || personas[0];

  return (
    <div className="h-full font-sans text-slate-900 bg-[#FDFBF7]">
      {!onboardingComplete ? (
        <Onboarding onComplete={handleOnboardingComplete} />
      ) : (
        <AppContent 
          city={userSetup!.city} 
          persona={activePersona} 
          prefs={userSetup!.prefs}
          allPersonas={personas}
          onSwitchPersona={handleSwitchPersona}
        />
      )}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);