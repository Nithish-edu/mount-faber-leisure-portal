# Mount Faber Leisure Portal

Full-stack monorepo application for ticketing operations, admission tickets, membership management, and signup analytics.

## Stack
- **Frontend:** React + Vite + Tailwind CSS
- **Backend:** Flask REST API
- **Database:** SQLite
- **Auth:** Session-based staff login

## Structure
- `/frontend` React client UI
- `/backend` Flask API and SQLite database (`backend/mount_faber.db`)

## Run locally
### 1) Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```
Backend: `http://localhost:5000`

### 2) Frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend: `http://localhost:5173`

## Staff test account
- Username: `staff`
- Password: `password123`

## Implemented modules
1. **Pre-Shift Checklist** with workstation/equipment/HSE checks, sign-off timestamp, history and analytics.
2. **Admission Tickets** with all required ticket types/pricing, comparison table, booking form and package recommendations.
3. **Membership / Faber Licence** with all required tiers, benefit comparison, signup and renewal dashboard lookup.
4. **Sign-up Improvement Dashboard** with funnel metrics, bottlenecks, AI-style recommendations, A/B testing, email/social/referral/mobile/peak-time insights.

## API quick list
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/tickets`, `POST /api/tickets/book`
- `GET /api/memberships/types`, `POST /api/memberships/signup`, `GET /api/memberships/dashboard?email=`
- `POST /api/checklists`, `GET /api/checklists`, `GET /api/checklists/analytics`
- `GET /api/analytics/signup-improvement`, `GET /api/attractions`, `GET /api/health`
