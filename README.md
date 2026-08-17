# 🧠 Task & Mood Matrix (NOVA)

A dynamic, production-ready productivity workspace based on the **Eisenhower Matrix** combined with real-time mood tracking and **NOVA**, an integrated AI Productivity Assistant.

---

## ✨ Main Features

- 📌 **Eisenhower Matrix Workload Management**: Categorize tasks into 4 distinct quadrants based on urgency and importance.
- 🎯 **Mood Ambiance Adapters**: Adapt the UI color scheme and ambient glow according to your current emotional or cognitive state (*Focused*, *Productive*, *Calm*, *Energized*, *Stressed*).
- 🤖 **NOVA AI Productivity Assistant**:
  - 📈 **Productivity Audit**: Real-time overload index, deep work ratio, and completion metrics.
  - ⚖️ **Matrix Auto-Balancing**: Detects Q1 overload (>3 active tasks) and proposes intelligent rebalancing moves.
  - 🧩 **Task Decomposition**: Automatically splits complex tasks into actionable subtasks.
  - ✏️ **Natural Language Updates & Diff Previews**: Modify task titles and priority with before/after visual diff previews.
  - 🛡️ **Action Guardrails**: 100% confirmation-gated execution model for single and batch AI actions.
- 🔍 **Real-time Task Search & Filtering**: Instant search across titles and notes.
- 🖱️ **HTML5 Drag and Drop**: Smooth drag-and-drop task movement between matrix quadrants.
- 🕒 **Relative Timestamps & Live Stats**: Dynamic task counters, productivity completion percentage, and time-ago indicators.
- ↩️ **Undo & Toast Notifications**: Non-disruptive user feedback with instant task restoration capabilities.
- 💾 **LocalStorage Persistence**: Full state retention across browser sessions.
- 📱 **Fully Responsive Layout**: Optimizing experience across Desktop, Laptop, Tablet, and Mobile devices.
- ♿ **Accessibility Compliant**: Built with visible focus rings (`:focus-visible`), full keyboard accessibility (`Tab`, `Space`, `Enter`, `Esc`), and `prefers-reduced-motion` support.

---

## 🗂️ Eisenhower Matrix Breakdown

| Quadrant | Name | Criteria | Recommendation |
|---|---|---|---|
| **Q1** | **Do First** | Urgent & Important | Handle immediately to prevent burnout and deadline slippage. |
| **Q2** | **Schedule** | Important, Not Urgent | Deep focus work. Proactively schedule to achieve long-term goals. |
| **Q3** | **Delegate** | Urgent, Not Important | Minimise or delegate routine distractions and secondary tickets. |
| **Q4** | **Eliminate** | Neither Urgent nor Important | Eliminate or deprioritize to protect focus. |

---

## 🤖 NOVA AI Assistant & Security Model

NOVA is an AI assistant powered by Google Gemini (or a fallback local rule engine when offline).

### 🛡️ API Key Security Architecture

- **No Client Exposure**: `GEMINI_API_KEY` is kept strictly on the local backend server (`server.ps1`). It is **never** transmitted to or embedded within the web browser.
- **Server Proxy**: The PowerShell listener acts as an authenticated backend proxy handling requests at `/api/chat`.
- **Confirmation Safety Guardrail**: NOVA cannot directly mutate task state without explicit user confirmation via interactive Action Cards.

---

## 🛠️ Technology Stack

- **Frontend**: HTML5, Vanilla CSS3 (Custom Properties & Glassmorphism design system), ES6 Modules
- **Backend / Proxy**: PowerShell `System.Net.HttpListener` (`server.ps1`)
- **AI Integration**: Google Gemini API (`gemini-2.5-flash`) with fallback rule engine
- **Fonts**: Outfit (Headings) & Inter (Body & Controls) via Google Fonts

---

## 📁 Project Structure

```text
task-mood-matrix/
│
├── css/
│   └── styles.css          # Graphite & Warm Ivory design system & responsive rules
│
├── js/
│   ├── app.js              # Application bootstrapper
│   ├── store.js            # Central state management & LocalStorage persistence
│   ├── ui.js               # DOM manipulation, drag-and-drop, modals & toast UI
│   └── nova.js             # NOVA AI assistant interface & action confirmation cards
│
├── index.html              # Main application markup & accessibility labels
├── server.ps1              # Static web server & Gemini AI API proxy
└── README.md               # Project documentation
```

---

## 🚀 How to Run Locally

### Prerequisites

- Windows OS with PowerShell 5.1+ or PowerShell Core 7+
- Node.js (for syntax verification testing)

### Step 1: Clone or Open the Workspace

Open PowerShell in the project directory.

### Step 2: (Optional) Set your Gemini API Key

To enable live Gemini AI integration, set the `GEMINI_API_KEY` environment variable in your PowerShell terminal before starting the server:

```powershell
$env:GEMINI_API_KEY="your-actual-gemini-api-key-here"
```

*Note: If no API key is set, NOVA will seamlessly operate using its built-in rule engine.*

### Step 3: Launch the Server

Run the PowerShell server script:

```powershell
.\server.ps1
```

The server will start listening at: `http://localhost:8080/`

### Step 4: Open in Browser

Open your browser and navigate to:

```text
http://localhost:8080/
```

---

## 🧪 Testing & Verification

### JavaScript Syntax Verification

Run syntax checks on all frontend scripts:

```powershell
node --check js/app.js js/store.js js/ui.js js/nova.js
```

### Manual Browser QA Checklist

- [x] Create, edit, toggle complete, and delete tasks manually.
- [x] Search tasks by title or notes.
- [x] Drag tasks between quadrants.
- [x] Change mood ambiance and verify background tint.
- [x] Ask NOVA for "Audit Matrix", "Insights", or "What's Next?".
- [x] Confirm single and batch NOVA action cards.
- [x] Verify responsive layout on desktop and mobile screens.
- [x] Test keyboard navigation (`Tab`, `Space`, `Enter`, `Esc`).

---

## 📄 License

Built with Antigravity • Task & Mood Matrix / NOVA
