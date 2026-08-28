# LocalPulse 📍

LocalPulse is an automated AI Agent management platform designed for local businesses (such as dental practices, restaurants, and service providers) to boost their visibility in the Google Local 3-Pack. The application streamlines review responses, schedules GBP posts, manages customer Q&As, audits photo media, and generates competitive GeoGrid rank tracking insight maps.

---

## 🚀 How Its Core Features Work

### 1. Agent Hub Dashboard
* **Profile Completeness Index**: A circular progress gauge showing overall business profile health and optimization level.
* **Local Pack Visibility Dial**: Displays the aggregated local rank metric (the average rank across multiple neighborhood cells).
* **Autopilot Automation Feed**: A scrollable timeline showing simulated actions taken by the backend AI agents (e.g., auto-saved drafts, weekly keyword audits).

### 2. Profile Completeness & Audit Agent
* An interactive editor for the business's NAP (Name, Address, Phone) details, category, hours, and attributes.
* **AI Audit**: Checks local search completeness and auto-generates optimized business descriptions, along with secondary categories/metadata suggestions.

### 3. Post Automation & Scheduling Agent
* Create new posts targeting Google Business Profile (Offers, What's New, Events).
* Features AI copywriting with brand-tone adjustments (Professional, Urgent, Community-Focused).
* Simulates AI image generation for promotional creatives.
* Includes CTA selectors (Book, Call Now, Learn More) and scheduler inputs.

### 4. Reputation & Review Management Agent
* Monitors customer reviews, classifies them by sentiment (positive, neutral, negative), and generates context-aware replies according to selected brand tones.
* Allows batch review drafting and individual review approving/publishing.

### 5. Q&A Auto-Responder Agent
* Utilizes a customizable business knowledge base (parking rules, insurance policies, operational details) to auto-answer incoming customer questions contextually.

### 6. GeoGrid Rank Tracker & Competitor Intelligence
* Visualizes localized 3x3 grid neighborhood rankings for critical keywords like *"Dentist near me"*.
* Displays a detailed comparison matrix tracking reviews, ratings, posting frequency, and weekly photo volume of local competitors.
* Offers one-click AI Gap Analysis detailing recommended counter-strategies.

### 7. Media & Visuals Optimization Agent
* Standardized categories (Exterior, Interior, Team, Logo) showing completeness guides.
* Features EXIF geotagging simulations (latitude/longitude metadata embed) and automated alt-text generation.

### 8. Executive Strategy Report Generator
* Compiles current performance metrics, grading your business from A+ to C, and outlines a targeted 30-day AI roadmap and action plan.

### 9. Live Real-World Data Grounding
* Includes a simulation lookup console connected to Google Places data structure to let you query local businesses and establish a mock OAuth GBP integration.

---

## 🛠️ Technology Stack

### Frontend (`/client`)
* **React 18** (TypeScript version)
* **Tailwind CSS** (v4 theme preset)
* **Vite** (Build Tooling)
* **React Router Dom** (Client-side routing)
* **Lucide React** (Vector iconography)

### Backend (`/backend`)
* **Node.js**
* **Express.js** (API routing)
* **CORS** (Cross-Origin Resource Sharing enablement)
* **Dotenv** (Environment variables management)
* **Nodemon** (Development hot-reloading)

---

## 🏁 How to Run the App

Since dependencies and setups are separated into dedicated `/client` and `/backend` directories, follow these instructions to launch them:

### 1. Start the Backend API Server
* Open a terminal window configuration.
* Change directory into `/backend`:
  ```bash
  npm run dev
  ```
  *(Runs on http://localhost:5000)*

### 2. Start the Frontend Development Server
* Open a second terminal window.
* Change directory into `/client`:
  ```bash
  npm run dev
  ```
  *(Runs on http://localhost:5173)*

* Open your browser and navigate to `http://localhost:5173` to interact with LocalPulse.
