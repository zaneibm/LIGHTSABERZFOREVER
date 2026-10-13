# Chronos AI - Smart Calendar Assistant

An interactive calendar prototype with integrated Gemini AI for natural language scheduling, conflict checking, and schedule management.

---

## 🚀 Quick Start Guide (Run Locally)

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **npm** or **pnpm** / **yarn**

---

### 2. Install Dependencies
Open your terminal in the project directory and run:

```bash
npm install
```

---

### 3. Set Up Environment Variables
1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and add your **Gemini API Key**:
   ```env
   GEMINI_API_KEY="your-gemini-api-key-here"
   ```
   > 💡 If you don't have a Gemini API key yet, you can get one for free from [Google AI Studio](https://aistudio.google.com/).  
   > *Note: Chronos also includes a built-in offline calendar engine, so it will continue working even if no key is configured.*

---

### 4. Start the Local Development Server
Run:

```bash
npm run dev
```

The application will start on **http://localhost:3000**. Open your browser and navigate to `http://localhost:3000` to start using Chronos AI!

---

### 5. Production Build (Optional)
To test the production build:

```bash
npm run build
npm start
```

---

## ✨ Key Features & Commands

### 📅 Calendar Interface
- **Multiple Views**: Month, Week (hourly grid with current-time marker), Day (detailed agenda with free gap detection), and Agenda view.
- **Event Controls**: Click on any time slot or day cell to create events, or click an existing event to edit/delete.
- **Color Coded Categories**: Meetings (Blue), Calls (Emerald), Focus Time (Purple), Personal (Amber), Work (Indigo).

### 🤖 AI Scheduling Assistant
Try typing commands into the AI Assistant chat window:
- **"What meetings do I have on tuesday?"** — Summarizes all meetings for that day.
- **"Schedule a call with Rob at 4:30"** — Automatically creates an event from 4:30 PM to 5:00 PM with Rob.
- **"Book 2 hours of focus time tomorrow"** — Finds and blocks focus time.
- **"Do I have any free time on Wednesday?"** — Inspects open gaps and suggests slots.
- **"Cancel my meeting with Rob"** — Deletes the event from the schedule.

---

## 🛠️ Project Architecture
- `src/App.tsx` — Main application state, views, and chat coordinator.
- `src/components/Header.tsx` — View switcher, date navigation, and modal toggles.
- `src/components/AIChatSidebar.tsx` — Conversational assistant interface with action cards and conflict alerts.
- `src/components/MonthView.tsx` / `WeekView.tsx` / `DayView.tsx` / `AgendaView.tsx` — View layouts.
- `src/components/EventModal.tsx` — Manual event creation and editing modal.
- `src/data/initialEvents.ts` — Pre-seeded realistic schedule.
- `server.ts` — Express full-stack backend with `@google/genai` integration and fallback engine.
















secret message below....


























hi :D
