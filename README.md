# Fullintel — Review Report Feature

A full-featured media intelligence dashboard for creating, managing, and AI-verifying analysis reports. Built for **J&J Innovative Medicine - Japan**.

---

## 🚀 Tech Stack

| Layer       | Technology           |
|-------------|----------------------|
| Frontend    | React 18 + Vite 7    |
| Styling     | Vanilla CSS (custom design system) |
| Icons       | Lucide React         |
| Routing     | React Router DOM v6  |
| Database    | Supabase (PostgreSQL)|
| Date Utils  | date-fns             |

---

## ⚙️ Setup Instructions

### 1. Install dependencies
```bash
npm install
```

### 2. Configure Supabase
1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the full contents of `supabase_schema.sql`
3. Copy your project URL and anon key from **Settings > API**

### 3. Set environment variables in `.env.local`
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_OPENAI_API_KEY=sk-...   # Optional, for future AI integration
```

### 4. Run development server
```bash
npm run dev
```
App runs at → **http://localhost:5173**

---

## 📁 Project Structure

```
src/
├── components/
│   └── Navbar.jsx          # Dark sticky nav with timer & user profile
├── lib/
│   └── supabase.js         # Supabase client initialization
├── pages/
│   ├── Dashboard.jsx       # Main dashboard (recreates Fullintel UI)
│   ├── AddArticle.jsx      # Add new article with validation
│   ├── ViewArticles.jsx    # Article list with search/filter/pagination
│   ├── Reports.jsx         # Reports list with status & AI scores
│   ├── CreateReport.jsx    # Create report + article picker
│   └── ReviewReport.jsx    # Core review page with AI verification
├── App.jsx                 # Router setup
└── index.css               # Global design system & utilities
```

---

## 🗃️ Database Schema (supabase_schema.sql)

Three tables: `articles`, `reports`, `report_articles`

Run `supabase_schema.sql` in your Supabase SQL Editor to create all tables, indexes, RLS policies, and seed data.

---

## Routes

| Path               | Page            |
|--------------------|-----------------|
| `/`                | Dashboard       |
| `/articles`        | View Articles   |
| `/articles/add`    | Add Article     |
| `/reports`         | Reports List    |
| `/reports/create`  | Create Report   |
| `/reports/:id`     | Review Report   |

---

## AI Verification Algorithm

Each article in a report is scored across **8 criteria**:

| Check                  | Max Points | Criteria                         |
|------------------------|-----------|----------------------------------|
| Title Length           | 20        | 5-20 words = pass                |
| Content Completeness   | 25        | 300+ words = pass                |
| Source Attribution     | 15        | Source field present             |
| URL Verification       | 10        | Valid https:// URL               |
| Category Classification| 10        | Category assigned                |
| Content Freshness      | 10        | Published within 30 days = pass  |
| Sentiment Analysis     | 5         | Sentiment tagged                 |
| Summary / Abstract     | 5         | 30+ char summary present         |

Final score: `(earned / 100) * 100%`  
- **≥75%** → Approved  
- **50–74%** → Partial (revisions needed)  
- **<50%** → Needs Revision
