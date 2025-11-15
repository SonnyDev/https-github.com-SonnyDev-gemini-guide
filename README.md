# Gemini City Guide 🇬🇧

An interactive, multimodal tour guide application powered by **Google Gemini 2.5** and **Google AI Studio**.

This application demonstrates the capabilities of the Gemini Live API to create a real-time, voice-interactive agent that not only converses naturally but also actively controls the user interface (Google Maps) to provide a rich, guided experience.

## 🤖 AI Implementation

We leverage the `@google/genai` SDK to integrate Gemini's advanced multimodal features:

### 1. Real-time Voice Interaction (Gemini Live)
The core experience is powered by the `gemini-2.5-flash-native-audio-preview` model via the Live API.
- **Bi-directional Streaming**: We establish a persistent WebSocket connection using `ai.live.connect`.
- **Audio Processing**: The app streams raw PCM audio input from the microphone and decodes the model's audio output using the Web Audio API for low-latency playback.
- **Voice Personalities**: We use `speechConfig` to assign distinct voices (e.g., 'Fenrir', 'Kore', 'Zephyr') to different guide personas, complete with custom system instructions for tone and style.

### 2. Visual Tool Calling (Agentic UI)
The model acts as an agent that can manipulate the UI. We define tools like `update_map` and `get_directions` in the session configuration.
- **Function Execution**: When the model decides to show a location (e.g., "I'll show you where Big Ben is"), it sends a `toolCall` instead of just text.
- **Visual Cursor Animation**: The app intercepts this call and triggers a **Map Cursor** animation. A virtual cursor moves across the screen, "clicks" on the location, or traces the route. This simulates a real human guide sharing their screen, providing visual confirmation of the AI's actions.
- **State Synchronization**: After the visual gesture, the map iframe is updated to the new coordinates or route logic.

### 3. Grounding & Knowledge
For text-based fallback and enhanced accuracy, we use `gemini-2.5-flash` with Google Search and Maps grounding tools.
- **Live Data**: The AI can look up real-time information about places, opening hours, and reviews.
- **Sources**: Grounding metadata is returned by the API and rendered as clickable "Place Cards" overlaying the map.

## 🛠️ Tech Stack

- **Framework**: React 19 + TypeScript
- **Styling**: Tailwind CSS
- **Map**: Google Maps Embed API (controlled dynamically via iframe URL generation)
- **AI SDK**: `@google/genai`

## 🚦 Getting Started

1. Obtain an API Key from [Google AI Studio](https://aistudio.google.com/).
2. Set the `API_KEY` environment variable in your build environment.
3. Start the application.

## 🎮 How to Use

1. **Select a Guide**: Choose from distinct personas like Sir Dave (Nature), Lady Viv (Fashion), or Storm (Grime).
2. **Start Talking**: Click the red microphone button to start a live voice session.
3. **Ask for Actions**:
   - *"Show me the nearest tube station."* (Triggers `update_map` + visual click)
   - *"How do I get to the Tate Modern from here?"* (Triggers `get_directions` + visual route trace)
4. **Observe**: Watch the AI cursor interact with the map in real-time as it speaks.