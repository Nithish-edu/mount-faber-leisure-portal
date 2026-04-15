from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, request, session
from flask_cors import CORS
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "mount_faber.db"

TICKET_TYPES = [
    {
        "code": "skypass",
        "name": "Cable Car SkyPass",
        "adult_price": 35,
        "child_price": 25,
        "description": "Round-trip on both Mount Faber and Sentosa lines.",
    },
    {
        "code": "mount-faber-only",
        "name": "Mount Faber Line Only",
        "adult_price": 33,
        "child_price": 22,
        "description": "Round-trip access on Mount Faber Line.",
    },
    {
        "code": "mount-faber-unlimited",
        "name": "Mount Faber Line Unlimited",
        "adult_price": 43,
        "child_price": 32,
        "description": "Unlimited rides on Mount Faber Line for one day.",
    },
    {
        "code": "sentosa-only",
        "name": "Sentosa Line Only",
        "adult_price": 17,
        "child_price": 12,
        "description": "Round-trip access on Sentosa Line.",
    },
    {
        "code": "sentosa-unlimited",
        "name": "Sentosa Line Unlimited",
        "adult_price": 27,
        "child_price": 22,
        "description": "Unlimited rides on Sentosa Line for one day.",
    },
    {
        "code": "skyorb",
        "name": "SkyOrb Cabin",
        "adult_price": 48,
        "child_price": 37,
        "description": "Premium glass-floored SkyOrb cabin experience.",
    },
    {
        "code": "premium-package",
        "name": "Premium Package",
        "adult_price": 50,
        "child_price": 40,
        "description": "Cable Car SkyPass plus SkyOrb cabin add-on.",
    },
]

MEMBERSHIP_TYPES = [
    {
        "code": "individual",
        "name": "Individual",
        "price": 45,
        "capacity": "1 person",
        "highlights": [],
    },
    {
        "code": "individual-plus",
        "name": "Individual Plus",
        "price": 88,
        "capacity": "1 person",
        "highlights": ["Includes 6 SkyHelix tickets", "Unlimited Wings of Time"],
    },
    {
        "code": "family",
        "name": "Family",
        "price": 155,
        "capacity": "Up to 4 people",
        "highlights": [],
    },
    {
        "code": "family-plus",
        "name": "Family Plus",
        "price": 288,
        "capacity": "Up to 4 people",
        "highlights": [],
    },
]

MEMBERSHIP_BENEFITS = [
    "Unlimited cable car rides",
    "Up to 50% off attractions",
    "15% dining discounts",
    "20% retail discounts",
    "Birthday perks",
    "SkyOrb cabin discounts",
]

ATTRACTIONS = [
    "Singapore Cable Car with SkyOrb cabins",
    "SkyHelix Sentosa (79m panoramic ride)",
    "Wings of Time Fireworks Symphony",
    "Mount Faber Peak with dining options",
    "Central Beach Bazaar",
    "Cable Car SkyDining experience",
]


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "mount-faber-dev-secret")

    CORS(app, supports_credentials=True, origins=["http://localhost:5173", "http://localhost:3000"])

    def get_db() -> sqlite3.Connection:
        connection = sqlite3.connect(DB_PATH)
        connection.row_factory = sqlite3.Row
        return connection

    def init_db() -> None:
        with get_db() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS checklists (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    staff_name TEXT NOT NULL,
                    checklist_payload TEXT NOT NULL,
                    ticket_stock INTEGER NOT NULL,
                    notes TEXT,
                    signed_at TEXT NOT NULL,
                    created_by INTEGER,
                    FOREIGN KEY(created_by) REFERENCES users(id)
                );

                CREATE TABLE IF NOT EXISTS memberships (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    full_name TEXT NOT NULL,
                    email TEXT NOT NULL,
                    membership_code TEXT NOT NULL,
                    start_date TEXT NOT NULL,
                    end_date TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS bookings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ticket_code TEXT NOT NULL,
                    adult_qty INTEGER NOT NULL,
                    child_qty INTEGER NOT NULL,
                    visit_date TEXT NOT NULL,
                    total_amount REAL NOT NULL,
                    created_at TEXT NOT NULL
                );
                """
            )
            cur = conn.execute("SELECT id FROM users WHERE username = ?", ("staff",))
            if cur.fetchone() is None:
                conn.execute(
                    "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
                    ("staff", generate_password_hash("password123"), "ticketing"),
                )

    def login_required(handler):
        @wraps(handler)
        def wrapper(*args: Any, **kwargs: Any):
            if not session.get("user_id"):
                return jsonify({"error": "Authentication required"}), 401
            return handler(*args, **kwargs)

        return wrapper

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()})

    @app.post("/api/auth/login")
    def login():
        payload = request.get_json(silent=True) or {}
        username = payload.get("username", "").strip()
        password = payload.get("password", "")
        if not username or not password:
            return jsonify({"error": "Username and password are required"}), 400

        with get_db() as conn:
            user = conn.execute(
                "SELECT id, username, password_hash, role FROM users WHERE username = ?", (username,)
            ).fetchone()

        if user is None or not check_password_hash(user["password_hash"], password):
            return jsonify({"error": "Invalid credentials"}), 401

        session["user_id"] = user["id"]
        session["username"] = user["username"]
        session["role"] = user["role"]
        return jsonify({"username": user["username"], "role": user["role"]})

    @app.post("/api/auth/logout")
    def logout():
        session.clear()
        return jsonify({"message": "Logged out"})

    @app.get("/api/auth/me")
    def me():
        if not session.get("user_id"):
            return jsonify({"authenticated": False})
        return jsonify(
            {
                "authenticated": True,
                "username": session.get("username"),
                "role": session.get("role"),
            }
        )

    @app.get("/api/tickets")
    def list_tickets():
        recommendations = [
            "Use Premium Package for first-time visitors wanting SkyPass + SkyOrb.",
            "Families can maximize value with line-specific unlimited passes.",
            "Sentosa Line Only suits guests focused on Sentosa attractions.",
        ]
        return jsonify({"tickets": TICKET_TYPES, "recommendations": recommendations})

    @app.post("/api/tickets/book")
    def create_booking():
        payload = request.get_json(silent=True) or {}
        ticket_code = payload.get("ticket_code")
        visit_date = payload.get("visit_date")
        adult_qty = int(payload.get("adult_qty", 0))
        child_qty = int(payload.get("child_qty", 0))

        if not ticket_code or not visit_date or adult_qty < 0 or child_qty < 0 or (adult_qty + child_qty) <= 0:
            return jsonify({"error": "Invalid booking request"}), 400

        ticket = next((item for item in TICKET_TYPES if item["code"] == ticket_code), None)
        if ticket is None:
            return jsonify({"error": "Unknown ticket type"}), 404

        total_amount = (adult_qty * ticket["adult_price"]) + (child_qty * ticket["child_price"])
        now = datetime.now(timezone.utc).isoformat()

        with get_db() as conn:
            conn.execute(
                """
                INSERT INTO bookings (ticket_code, adult_qty, child_qty, visit_date, total_amount, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (ticket_code, adult_qty, child_qty, visit_date, total_amount, now),
            )

        return jsonify({"message": "Booking submitted", "total_amount": total_amount})

    @app.get("/api/memberships/types")
    def membership_types():
        return jsonify({"types": MEMBERSHIP_TYPES, "benefits": MEMBERSHIP_BENEFITS})

    @app.post("/api/memberships/signup")
    def signup_membership():
        payload = request.get_json(silent=True) or {}
        full_name = payload.get("full_name", "").strip()
        email = payload.get("email", "").strip().lower()
        membership_code = payload.get("membership_code", "")

        if not full_name or not email or "@" not in email:
            return jsonify({"error": "Valid name and email are required"}), 400

        selected_type = next((item for item in MEMBERSHIP_TYPES if item["code"] == membership_code), None)
        if selected_type is None:
            return jsonify({"error": "Invalid membership type"}), 400

        start_date = datetime.now(timezone.utc).date()
        end_date = start_date + timedelta(days=365)
        now = datetime.now(timezone.utc).isoformat()

        with get_db() as conn:
            conn.execute(
                """
                INSERT INTO memberships (full_name, email, membership_code, start_date, end_date, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (full_name, email, membership_code, start_date.isoformat(), end_date.isoformat(), "active", now),
            )

        return jsonify(
            {
                "message": "Membership registered",
                "member": {
                    "full_name": full_name,
                    "email": email,
                    "membership": selected_type["name"],
                    "renewal_date": end_date.isoformat(),
                },
            }
        )

    @app.get("/api/memberships/dashboard")
    def memberships_dashboard():
        email = request.args.get("email", "").strip().lower()
        if not email:
            return jsonify({"memberships": []})

        with get_db() as conn:
            rows = conn.execute(
                """
                SELECT full_name, email, membership_code, start_date, end_date, status
                FROM memberships
                WHERE email = ?
                ORDER BY created_at DESC
                """,
                (email,),
            ).fetchall()

        code_map = {item["code"]: item["name"] for item in MEMBERSHIP_TYPES}
        memberships = [
            {
                "full_name": row["full_name"],
                "email": row["email"],
                "membership": code_map.get(row["membership_code"], row["membership_code"]),
                "start_date": row["start_date"],
                "end_date": row["end_date"],
                "status": row["status"],
                "renewal_reminder": f"Renew by {row['end_date']}",
            }
            for row in rows
        ]
        return jsonify({"memberships": memberships})

    @app.post("/api/checklists")
    @login_required
    def create_checklist():
        payload = request.get_json(silent=True) or {}
        staff_name = payload.get("staff_name", "").strip()
        checklist = payload.get("checklist", {})
        ticket_stock = int(payload.get("ticket_stock", 0))
        notes = payload.get("notes", "").strip()

        if not staff_name or not isinstance(checklist, dict):
            return jsonify({"error": "Invalid checklist payload"}), 400

        signed_at = datetime.now(timezone.utc).isoformat()
        with get_db() as conn:
            conn.execute(
                """
                INSERT INTO checklists (staff_name, checklist_payload, ticket_stock, notes, signed_at, created_by)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (staff_name, json.dumps(checklist), ticket_stock, notes, signed_at, session.get("user_id")),
            )

        return jsonify({"message": "Checklist submitted", "signed_at": signed_at})

    @app.get("/api/checklists")
    @login_required
    def list_checklists():
        with get_db() as conn:
            rows = conn.execute(
                """
                SELECT id, staff_name, checklist_payload, ticket_stock, notes, signed_at
                FROM checklists
                ORDER BY signed_at DESC
                """
            ).fetchall()

        result = [
            {
                "id": row["id"],
                "staff_name": row["staff_name"],
                "checklist": json.loads(row["checklist_payload"]),
                "ticket_stock": row["ticket_stock"],
                "notes": row["notes"],
                "signed_at": row["signed_at"],
            }
            for row in rows
        ]
        return jsonify({"items": result})

    @app.get("/api/checklists/analytics")
    @login_required
    def checklist_analytics():
        with get_db() as conn:
            rows = conn.execute("SELECT checklist_payload, ticket_stock FROM checklists").fetchall()

        total = len(rows)
        completed = 0
        stock_alerts = 0
        for row in rows:
            checklist = json.loads(row["checklist_payload"])
            if checklist and all(bool(v) for v in checklist.values()):
                completed += 1
            if row["ticket_stock"] < 50:
                stock_alerts += 1

        completion_rate = round((completed / total) * 100, 1) if total else 0
        return jsonify(
            {
                "total_submissions": total,
                "fully_completed": completed,
                "completion_rate": completion_rate,
                "low_stock_alerts": stock_alerts,
            }
        )

    @app.get("/api/analytics/signup-improvement")
    def signup_improvement():
        with get_db() as conn:
            booking_count = conn.execute("SELECT COUNT(*) AS count FROM bookings").fetchone()["count"]
            membership_count = conn.execute("SELECT COUNT(*) AS count FROM memberships").fetchone()["count"]

        views = 5200
        clicks = 940
        conversions = max(membership_count, 77)

        bottlenecks = [
            "High drop-off from click to completed signup on mobile checkout.",
            "Membership benefits are not prominent on ticket pages.",
            "Limited follow-up reminders for cart abandonment.",
        ]

        recommendations = [
            "Deploy one-click signup CTA on ticket confirmation pages.",
            "Run A/B test for short vs. long membership form variants.",
            "Use segmented email nudges within 24 hours of first visit.",
            "Promote referral credits with QR code share links.",
        ]

        return jsonify(
            {
                "funnel": {
                    "views": views,
                    "clicks": clicks,
                    "conversions": conversions,
                    "click_through_rate": round((clicks / views) * 100, 1),
                    "conversion_rate": round((conversions / views) * 100, 1),
                    "ticket_bookings": booking_count,
                },
                "bottlenecks": bottlenecks,
                "recommendations": recommendations,
                "ab_testing_framework": [
                    "Test CTA color and placement",
                    "Compare member testimonial layouts",
                    "Evaluate 3-step vs single-page signup",
                ],
                "email_marketing": [
                    "Welcome journey for first-time ticket buyers",
                    "Renewal reminders at 60/30/7 days",
                    "Win-back campaign for expired members",
                ],
                "social_templates": [
                    "Weekend family bundle teaser",
                    "Sunset SkyDining + membership upsell",
                    "UGC contest with referral bonus",
                ],
                "referral_program": "Give S$8 voucher for both referrer and referred member.",
                "mobile_optimization": {
                    "avg_load_time_seconds": 1.9,
                    "form_completion_rate": 64,
                    "bounce_rate": 27,
                },
                "peak_visit_times": ["11:00-13:00", "16:00-19:00", "20:00-21:30"],
            }
        )

    @app.get("/api/attractions")
    def list_attractions():
        return jsonify({"attractions": ATTRACTIONS})

    init_db()
    return app


app = create_app()


if __name__ == "__main__":
    debug_mode = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=5000, debug=debug_mode)
