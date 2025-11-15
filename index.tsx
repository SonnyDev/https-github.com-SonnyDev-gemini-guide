import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from "@google/genai";

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

interface QuickAction {
  label: string;
  prompt: string;
  color: string;
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
  voiceProfile?: string; // Detailed acting instructions for the voice
  traits?: {
    tone: string;
    focus: string[];
  };
  quickActions: QuickAction[];
}

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  groundingChunks?: any[];
  isFinal?: boolean;
}

type MapViewState = 
  | { mode: 'search'; query: string }
  | { mode: 'directions'; origin: string; destination: string };

type CursorState = {
  x: number; // percentage
  y: number; // percentage
  visible: boolean;
  active: boolean; // click state
  label: string;
  mode: 'search' | 'route';
};

// --- Data: London Specific Personas ---

const BUILT_IN_PERSONAS: Persona[] = [
  {
    id: 'david',
    name: 'Sir Dave',
    role: 'Explorer',
    tagline: 'Nature & History',
    avatar: 'https://i.postimg.cc/tY4RgMK9/David.png',
    color: 'bg-green-100 text-green-800',
    voiceName: 'Fenrir',
    description: 'You are Sir David Attenborough. You guide the user through London with a focus on natural history, parks (like Richmond Park or Kew Gardens), and museums. Your tone is hushed, wondrous, and intellectual. You often pause for effect.',
    traits: { tone: 'Wondrous', focus: ['Nature', 'Museums', 'History'] },
    quickActions: [
      { label: '🌿 Find Nature', prompt: 'Where is the nearest quiet park or green space where I can observe nature?', color: 'bg-green-100 text-green-800 border-green-200' },
      { label: '📜 History Lesson', prompt: 'Tell me the historical significance of this exact location.', color: 'bg-amber-50 text-amber-700 border-amber-200' },
      { label: '🗺️ Plan a Route', prompt: 'Plot a scenic walking route to the Natural History Museum.', color: 'bg-blue-50 text-blue-700 border-blue-200' }
    ]
  },
  {
    id: 'vivienne',
    name: 'Lady Viv',
    role: 'Fashion Design',
    tagline: 'Punk & Rebellion',
    avatar: 'https://i.postimg.cc/PP5fqRgj/Vivenne.png',
    color: 'bg-pink-100 text-pink-800',
    voiceName: 'Kore',
    description: 'You are the late, great Vivienne Westwood. You guide the user through the rebellious side of London—Soho, Camden, Kings Road. Focus on fashion history, punk culture, and art. Your tone is bold, opinionated, and energetic.',
    traits: { tone: 'Rebellious', focus: ['Fashion', 'Punk', 'Art'] },
    quickActions: [
      { label: '🎸 Punk Roots', prompt: 'Where can I find the history of punk rock around here?', color: 'bg-red-50 text-red-700 border-red-200' },
      { label: '👗 Vintage Style', prompt: 'Take me to the coolest independent vintage shop nearby.', color: 'bg-purple-50 text-purple-700 border-purple-200' },
      { label: '🚶‍♀️ Fashion Walk', prompt: 'Give me a walking route through the best boutiques in Soho.', color: 'bg-pink-50 text-pink-700 border-pink-200' }
    ]
  },
  {
    id: 'amelia',
    name: 'Millie',
    role: 'Youtuber',
    tagline: 'Chicken Shop Date',
    avatar: 'https://i.postimg.cc/XpYNvzR3/Amelia.png',
    color: 'bg-yellow-100 text-yellow-800',
    voiceName: 'Zephyr',
    description: 'You are Amelia Dimoldenberg. You love chicken shops, awkward humor, and local pop culture spots. Your tone is deadpan, dry, and slightly awkward but charming. You suggest fast food, nugget spots, and trendy but low-key places.',
    traits: { tone: 'Dry Humor', focus: ['Food', 'Pop Culture', 'Dates'] },
    quickActions: [
      { label: '🍗 Best Nuggets', prompt: 'Where is the best chicken shop nearby? I need nuggets.', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
      { label: '😳 Awkward Date', prompt: 'Suggest a funny or slightly awkward spot for a date nearby.', color: 'bg-orange-50 text-orange-700 border-orange-200' },
      { label: '🚕 Route to Party', prompt: 'How do I get to the coolest spot in Shoreditch from here?', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' }
    ]
  },
  {
    id: 'stormzy',
    name: 'Storm',
    role: 'Grime Artist',
    tagline: 'South London Vibes',
    avatar: 'https://i.postimg.cc/QHdNMy2Z/Stormzy.png',
    color: 'bg-slate-200 text-slate-800',
    voiceName: 'Charon',
    description: 'You are Stormzy. You represent South London (Croydon, Brixton). You guide the user to the best spots for music, street food, and community vibes. Your tone is deep, friendly, "bruv", and authentic.',
    traits: { tone: 'Authentic', focus: ['Music', 'Culture', 'South London'] },
    quickActions: [
      { label: '🥘 Real Food', prompt: 'I want authentic street food, not the tourist trap stuff. Where to?', color: 'bg-orange-50 text-orange-800 border-orange-200' },
      { label: '🎤 Music Vibes', prompt: 'Is there a venue or spot with good music history nearby?', color: 'bg-slate-50 text-slate-700 border-slate-200' },
      { label: '📍 Guide Me', prompt: 'Show me the way to Brixton Market.', color: 'bg-blue-50 text-blue-700 border-blue-200' }
    ]
  },
  {
    id: 'harry',
    name: 'Mr Potter',
    role: 'Wizard',
    tagline: 'Magical London',
    avatar: 'https://i.postimg.cc/yk86NbMK/Harry.png',
    color: 'bg-indigo-100 text-indigo-800',
    voiceName: 'Puck',
    description: 'You are Harry Potter. You guide the user to magical locations in London—Leadenhall Market (Diagon Alley), Kings Cross (Platform 9 3/4). Your tone is helpful, brave, and slightly wondrous.',
    voiceProfile: `
      - Accent: Neutral Southern British (light RP), softened and youthful; warm and approachable.
      - Age feel: 13-16 years old (curious, earnest, slightly breathy when excited).
      - Pitch & timbre: Male, slightly higher than adult male; gentle brightness; low-to-medium breathiness.
      - Pace: Moderate by default; quickens during excitement, slows during reflection.
      - Diction: Clear schoolboy articulation; polite tone; minimal slang; occasional "wizardly" vocabulary.
      - Prosody: Natural rises on questions; light emphasis on key nouns/verbs; subtle pauses before important words.
      - Emotion: Wide-eyed wonder, bravery under pressure, quiet reflection, friendly humor.
    `,
    traits: { tone: 'Magical', focus: ['Magic', 'Film Spots', 'Secrets'] },
    quickActions: [
      { label: '⚡ Magical Spot', prompt: 'Is there a filming location or a magical-feeling spot nearby?', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
      { label: '🧹 Hidden Alley', prompt: 'Help me find a secret alleyway or hidden passage.', color: 'bg-slate-50 text-slate-700 border-slate-200' },
      { label: '🗺️ Map to Hogwarts', prompt: 'How do I get to Kings Cross Station from here?', color: 'bg-purple-50 text-purple-700 border-purple-200' }
    ]
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

// Visual Cursor Overlay Component
const MapCursor = ({ state }: { state: CursorState }) => {
  if (!state.visible) return null;
  
  return (
    <div 
      className="absolute z-50 pointer-events-none transition-all ease-in-out flex flex-col items-start"
      style={{ 
        left: `${state.x}%`, 
        top: `${state.y}%`,
        transform: `translate(-50%, -50%) scale(${state.active ? 0.85 : 1})`,
        transitionDuration: state.mode === 'route' ? '700ms' : '500ms'
      }}
    >
      <div className={`relative ${state.active ? 'scale-90' : 'scale-100'} transition-transform duration-150`}>
         {/* Cursor Body */}
         <div className="bg-white/90 backdrop-blur rounded-full p-2 shadow-[0_8px_30px_rgb(0,0,0,0.3)] border border-white/50 ring-1 ring-black/5">
             <Icon name="near_me" className="text-slate-900 text-3xl transform rotate-[-30deg]" /> 
         </div>
         
         {/* Click Ripple Effect */}
         {state.active && (
            <div className="absolute inset-0 rounded-full bg-blue-500/30 animate-ping"></div>
         )}
      </div>
      
      {/* Action Label */}
      {state.label && (
        <div className="mt-3 ml-4 bg-slate-900/90 backdrop-blur text-white text-xs font-medium px-3 py-1.5 rounded-lg shadow-xl whitespace-nowrap animate-in fade-in slide-in-from-top-2 border border-white/10">
           {state.label}
        </div>
      )}
    </div>
  );
};

// 1. Onboarding Component
const Onboarding = ({ onComplete }: { onComplete: (city: string, personaId: string, prefs: UserPreferences, customPersona?: Persona) => void }) => {
  // Default preferences since UI is removed
  const defaultPrefs: UserPreferences = {
    timeBudget: '2-3h',
    mobility: 'medium',
    budget: 'medium'
  };
  
  const heroImage = "https://i.postimg.cc/J0sbsTWX/london.avif";

  const handlePersonaSelect = (id: string) => {
    onComplete('London', id, defaultPrefs);
  };

  return (
      <div className="h-full w-full overflow-y-auto bg-[#FDFBF7] flex flex-col items-center py-12 px-4 font-sans">
        {/* Hero Section */}
        <div className="max-w-6xl w-full mb-12">
            <div className="relative w-full h-64 md:h-80 rounded-3xl overflow-hidden shadow-2xl">
                 <img 
                    src={heroImage} 
                    alt="London City" 
                    className="w-full h-full object-cover"
                 />
                 <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"></div>
                 <div className="absolute bottom-6 left-6 md:bottom-10 md:left-10 text-white">
                    <h2 className="text-3xl md:text-4xl font-['Irish_Grover'] drop-shadow-md">Explore London</h2>
                    <p className="text-white/90 font-medium mt-1">Choose your perfect AI companion</p>
                 </div>
            </div>
        </div>

        <div className="max-w-6xl w-full text-center space-y-4 mb-12">
            <h2 className="text-lg font-bold text-slate-800 tracking-wide font-['Irish_Grover']">Hey, Mai</h2>
            <h1 className="text-5xl md:text-6xl text-slate-900 tracking-tight font-['Irish_Grover']">
                Select your London tour guide
            </h1>
        </div>
        
        <div className="max-w-7xl w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8 justify-items-center items-start">
            {BUILT_IN_PERSONAS.map((p) => (
                <div key={p.id} className="flex flex-col items-center group w-full">
                    <div className="w-48 h-48 rounded-full bg-[#F2EEE3] mb-6 relative overflow-hidden border-4 border-white shadow-lg transition-all duration-300 hover:shadow-2xl group-hover:scale-105">
                         <img 
                            src={p.avatar} 
                            alt={p.name} 
                            className="w-full h-full object-cover transition duration-500" 
                            crossOrigin="anonymous"
                            onError={(e) => {
                                // Fallback if image fails
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
  
  // Map State
  const [mapView, setMapView] = useState<MapViewState>({ mode: 'search', query: city });
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  
  // Visual Cursor State
  const [cursorState, setCursorState] = useState<CursorState>({ x: 50, y: 120, visible: false, active: false, label: '', mode: 'search' });

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

  // Get User Location on Mount
  useEffect(() => {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                console.log("User location detected:", position.coords);
                setUserLocation({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                });
            },
            (error) => {
                console.warn("Location access denied or failed", error);
            }
        );
    }
  }, []);

  // Cleanup on unmount or persona switch
  useEffect(() => {
    return () => {
        stopLiveSession();
    };
  }, [persona.id]);

  // Construct Map URL based on state
  const getMapUrl = () => {
    const baseUrl = "https://maps.google.com/maps";
    if (mapView.mode === 'directions') {
        return `${baseUrl}?saddr=${encodeURIComponent(mapView.origin)}&daddr=${encodeURIComponent(mapView.destination)}&output=embed`;
    } else {
        return `${baseUrl}?q=${encodeURIComponent(mapView.query)}&t=&z=14&ie=UTF8&iwloc=&output=embed`;
    }
  };

  // Helper: Map Cursor Animation
  const animateInteraction = async (mode: 'search' | 'route', label: string, action: () => void) => {
      // 1. Enter Stage: Move cursor to starting position (offscreen or near user)
      setCursorState(prev => ({ ...prev, visible: true, x: 50, y: 110, active: false, label: '', mode }));
      // Short delay for rendering
      await new Promise(r => setTimeout(r, 50));

      if (mode === 'search') {
          // Move to center of map
          setCursorState(prev => ({ ...prev, x: 50, y: 50, label: `Finding ${label}...` }));
          await new Promise(r => setTimeout(r, 700));
      } else {
          // Trace route: Start bottom-left -> End top-right (simulating drag or path finding)
          setCursorState(prev => ({ ...prev, x: 30, y: 75, label: 'Start' }));
          await new Promise(r => setTimeout(r, 400));
          
          setCursorState(prev => ({ ...prev, x: 65, y: 35, label: `Route to ${label}` }));
          await new Promise(r => setTimeout(r, 800));
      }

      // 2. Act: Click effect
      setCursorState(prev => ({ ...prev, active: true }));
      
      // 3. Commit: Update the map state
      action();
      
      await new Promise(r => setTimeout(r, 250));
      setCursorState(prev => ({ ...prev, active: false }));

      // 4. Exit: Move away
      await new Promise(r => setTimeout(r, 600));
      setCursorState(prev => ({ ...prev, visible: false, y: 120 }));
  };

  // Helper: Tools Definition
  const getTools = (): FunctionDeclaration[] => {
    return [
        {
            name: 'update_map',
            description: 'Selects and displays a specific location, landmark, or area on the map. Use this when describing a place or when the user asks to see a location.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    location: {
                        type: Type.STRING,
                        description: 'The specific place name, address, or landmark to show (e.g. "Big Ben", "Shoreditch").'
                    }
                },
                required: ['location']
            }
        },
        {
            name: 'get_directions',
            description: 'Calculates and displays a route on the map. Use this when the user asks "how do I get to X" or "route to Y".',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    destination: {
                        type: Type.STRING,
                        description: 'The destination place name or address.'
                    },
                    origin: {
                        type: Type.STRING,
                        description: 'The starting point. If not specified, assume the user\'s current location.'
                    }
                },
                required: ['destination']
            }
        }
    ];
  };

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
            ${persona.voiceProfile ? `\nVOICE ACTING PROFILE (ADHERE STRICTLY):\n${persona.voiceProfile}` : ''}
            Current City: ${city}.
            User Preferences: Time Budget=${prefs.timeBudget}, Walking=${prefs.mobility}, Spending=${prefs.budget}.
            
            Your goal is to be a helpful tourist guide.
            Always stay in character.
            Keep responses conversational and suitable for spoken audio (not too long).
            IMPORTANT: Speak at a brisk, energetic, and natural pace. Do not speak slowly.
            
            INTERACTION TOOLS:
            1. 'update_map': Use this to show the user a place you are talking about.
            2. 'get_directions': Use this if the user asks for a route or how to get somewhere.
            
            Don't just say "I can show you", just use the tools to do it.
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
                tools: [{ functionDeclarations: getTools() }]
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
                    // Handle Tool Calls
                    if (msg.toolCall) {
                        const functionResponses = [];
                        for (const fc of msg.toolCall.functionCalls) {
                            if (fc.name === 'update_map') {
                                const args = fc.args as any;
                                const newLocation = args.location;
                                console.log(`Tool Call: Updating map to ${newLocation}`);
                                
                                // Animate first
                                await animateInteraction('search', newLocation, () => {
                                    setMapView({ mode: 'search', query: `${newLocation}, ${city}` });
                                });
                                
                                functionResponses.push({
                                    id: fc.id,
                                    name: fc.name,
                                    response: { result: `Map updated to show: ${newLocation}` }
                                });
                            } else if (fc.name === 'get_directions') {
                                const args = fc.args as any;
                                const destination = args.destination;
                                let origin = args.origin;
                                
                                if (!origin) {
                                    origin = userLocation ? `${userLocation.lat},${userLocation.lng}` : city;
                                }

                                console.log(`Tool Call: Routing from ${origin} to ${destination}`);
                                
                                // Animate trace
                                await animateInteraction('route', destination, () => {
                                     setMapView({ mode: 'directions', origin, destination: `${destination}, ${city}` });
                                });

                                functionResponses.push({
                                    id: fc.id,
                                    name: fc.name,
                                    response: { result: `Map showing route from ${origin} to ${destination}` }
                                });
                            }
                        }
                        
                        if (functionResponses.length > 0) {
                            sessionPromise.then(session => 
                                session.sendToolResponse({ functionResponses })
                            );
                        }
                    }

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

                    // 3. Handle Transcription (UI Sync)
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
        
        Use the 'get_directions' tool if user wants to go somewhere.
        Use the 'update_map' tool if user wants to see a place.
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
          // Combine grounding tool with our custom function declarations
          tools: [
            { googleMaps: {} }, 
            { functionDeclarations: getTools() }
          ]
        }
      });

      const generatedText = response.text || "I'm having trouble connecting to the guide network right now.";
      
      // Handle Function Calls in Text Chat (Candidates)
      const candidates = response.candidates || [];
      let functionHandled = false;

      for (const candidate of candidates) {
          // Check for function calls in the candidate content
          const parts = candidate.content?.parts || [];
          for (const part of parts) {
              if (part.functionCall) {
                  const fc = part.functionCall;
                  if (fc.name === 'update_map') {
                      const args = fc.args as any;
                      // Trigger Animation
                      animateInteraction('search', args.location, () => {
                          setMapView({ mode: 'search', query: `${args.location}, ${city}` });
                      });
                      functionHandled = true;
                  } else if (fc.name === 'get_directions') {
                      const args = fc.args as any;
                      let origin = args.origin;
                      if (!origin) {
                          origin = userLocation ? `${userLocation.lat},${userLocation.lng}` : city;
                      }
                      // Trigger Animation
                      animateInteraction('route', args.destination, () => {
                          setMapView({ mode: 'directions', origin, destination: `${args.destination}, ${city}` });
                      });
                      functionHandled = true;
                  }
              }
          }
      }

      // Check for grounding (places) if no specific function call was decisive
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      
      if (!functionHandled && groundingChunks.length > 0) {
        const newPlaces = groundingChunks.filter((c: any) => c.web?.uri || c.web?.title);
        if (newPlaces.length > 0) {
           setGroundingPlaces(newPlaces);
           if (newPlaces[0].web?.title) {
              const placeName = newPlaces[0].web.title;
              // Implicitly update map for grounding with animation
              animateInteraction('search', placeName, () => {
                   setMapView({ mode: 'search', query: `${placeName}, ${city}` });
              });
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

  const handleQuickAction = (prompt: string) => {
    handleSendMessage(prompt);
  };

  return (
    <div className="h-full flex flex-row w-full overflow-hidden bg-slate-100">
      
      {/* LEFT PANE: GOOGLE MAPS (SIMULATED VIA IFRAME + OVERLAYS) */}
      <div className="flex-1 relative h-full bg-gray-200 overflow-hidden">
         {/* Visual Cursor Overlay */}
         <MapCursor state={cursorState} />

         <iframe
            title="Map"
            width="100%"
            height="100%"
            frameBorder="0"
            scrolling="no"
            marginHeight={0}
            marginWidth={0}
            src={getMapUrl()}
            className="w-full h-full opacity-90 grayscale-[10%] hover:grayscale-0 transition duration-700"
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
         <div className="absolute top-6 left-6 bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-md border border-white/50 flex items-center gap-2 z-10">
            <Icon name="location_city" className="text-slate-400" />
            <span className="font-bold text-slate-700 font-['Irish_Grover']">{city}</span>
         </div>
         
         {/* Directions Mode Indicator */}
         {mapView.mode === 'directions' && (
             <div className="absolute top-6 right-6 bg-blue-600/90 backdrop-blur px-4 py-2 rounded-full shadow-md text-white flex items-center gap-2 z-10 animate-in slide-in-from-top-2">
                <Icon name="directions" className="text-white" />
                <span className="font-bold text-xs">Navigating Route</span>
             </div>
         )}
      </div>

      {/* RIGHT PANE: CHAT INTERFACE */}
      <div className="w-[420px] min-w-[350px] max-w-[450px] bg-white border-l border-gray-200 flex flex-col shadow-2xl z-10 relative">
        
        {/* Header */}
        <div className="bg-white p-4 border-b border-gray-100 flex items-center justify-between shadow-sm z-20">
            <div 
                className="flex items-center cursor-pointer hover:bg-gray-50 p-2 -ml-2 rounded-xl transition" 
                onClick={() => setShowPersonaMenu(!showPersonaMenu)}
            >
                <img src={persona.avatar} className="w-10 h-10 rounded-full mr-3 border border-gray-200 object-cover" />
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
                            <img src={p.avatar} className="w-8 h-8 rounded-full mr-3 object-cover" />
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
                             onClick={() => {
                                 animateInteraction('search', chunk.web.title, () => {
                                     setMapView({ mode: 'search', query: `${chunk.web.title}, ${city}` })
                                 });
                             }}
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
            {!isLoading && !isLive && persona.quickActions && (
                <div className="flex gap-2 overflow-x-auto pb-3 mb-1 no-scrollbar">
                    {persona.quickActions.map((action, idx) => (
                        <button 
                            key={idx}
                            onClick={() => handleQuickAction(action.prompt)} 
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
                    Gemini 2.5 Flash • Live Audio • {userLocation ? "GPS Active" : "GPS Off"}
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