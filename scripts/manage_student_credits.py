#!/usr/bin/env python3
"""
manage_student_credits.py — Student Financial & Academic Credit Alignment Tool
Designed for Android (Termux) and Desktop.

# Allows administrators to:
#   1. Inspect student profile, enrolled classes, payments, and credit balance.
#   2. List all vouchers with full metadata.
#   3. Create custom vouchers with any date, branch, amount, and class.
#   4. Edit existing vouchers (amount, date, branch, class, payment type, void status).
#   5. Delete or soft-void vouchers (with automatic Daily Ledger reconciliation).
#   6. View and fix lesson attendances (flip PRESENT / ABSENT / EXCUSED to fix session credit).
#   7. Toggle inscription fee charged & payer status (NORMAL / NON_PAYER / SCHOOL_FEES_ONLY).
#   8. Reconcile / Sync Daily Ledger with all vouchers and refunds.
# 
# REQUIREMENTS IN TERMUX:
#   pkg install python -y
#   python -m pip install pg8000
# 
# USAGE:
#   python manage_student_credits.py               # Interactive search
#   python manage_student_credits.py 136           # Direct by Global Number
#   python manage_student_credits.py "ناردين"      # Direct by name search
#   python manage_student_credits.py --sync-ledger # Sync Daily Ledger and exit
# """

import sys
import os
import re
import json
import time
import argparse
from datetime import datetime, date
from urllib.parse import urlparse

# Ensure UTF-8 output encoding for Arabic text
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

# PostgreSQL Drivers: pg8000 (pure Python) or psycopg2
try:
    import pg8000.native
    HAS_PG8000 = True
except ImportError:
    HAS_PG8000 = False

try:
    import psycopg2
    HAS_PSYCOPG2 = True
except ImportError:
    HAS_PSYCOPG2 = False


def load_env_database_url():
    """Load DATABASE_URL from environment or local .env file. Automatically strips -pooler."""
    # Check DIRECT_URL first (bypasses PgBouncer pooler collision)
    if os.environ.get("DIRECT_URL"):
        return os.environ.get("DIRECT_URL")
    if os.environ.get("DATABASE_URL"):
        url = os.environ.get("DATABASE_URL")
        return url.replace("-pooler.", ".")

    # Search common .env locations
    candidates = [
        ".env",
        os.path.join(os.path.dirname(__file__), ".env"),
        os.path.join(os.path.dirname(__file__), "..", ".env"),
    ]
    for path in candidates:
        if os.path.isfile(path):
            try:
                env_dict = {}
                with open(path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("DIRECT_URL="):
                            val = line.split("=", 1)[1].strip().strip('"').strip("'")
                            env_dict["DIRECT_URL"] = val
                        elif line.startswith("DATABASE_URL="):
                            val = line.split("=", 1)[1].strip().strip('"').strip("'")
                            env_dict["DATABASE_URL"] = val
                if "DIRECT_URL" in env_dict:
                    return env_dict["DIRECT_URL"]
                if "DATABASE_URL" in env_dict:
                    return env_dict["DATABASE_URL"].replace("-pooler.", ".")
            except Exception:
                pass
    return None


def get_db_connection(db_url):
    """Create a database connection to PostgreSQL (Neon direct or local)."""
    if not db_url:
        raise ValueError("DATABASE_URL not found! Set DATABASE_URL or run inside the school software folder.")

    # Automatically strip -pooler to avoid PgBouncer prepared-statement caching collision
    if "-pooler." in db_url:
        db_url = db_url.replace("-pooler.", ".")

    parsed = urlparse(db_url)
    user = parsed.username
    password = parsed.password
    host = parsed.hostname
    port = parsed.port or 5432
    database = parsed.path.lstrip("/")

    if HAS_PG8000:
        import ssl
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        conn = pg8000.native.Connection(
            user=user,
            password=password,
            host=host,
            port=port,
            database=database,
            ssl_context=ctx
        )
        return conn, "pg8000"
    elif HAS_PSYCOPG2:
        conn = psycopg2.connect(db_url)
        return conn, "psycopg2"
    else:
        raise RuntimeError("No PostgreSQL driver found!\nPlease run: python -m pip install pg8000")


def normalize_arabic(text):
    """Normalize Arabic characters for fuzzy search."""
    if not text:
        return ""
    text = text.strip()
    text = re.sub(r"[أإآٱ]", "ا", text)
    text = re.sub(r"[ة]", "ه", text)
    text = re.sub(r"[ى]", "ي", text)
    text = re.sub(r"[\u064B-\u065F]", "", text)  # Tashkeel / Harakat
    text = re.sub(r"\s+", " ", text)
    return text.lower()


def format_money(amount):
    """Format decimal money nicely."""
    try:
        val = float(amount or 0)
        return f"{val:,.0f} DZD".replace(",", " ")
    except Exception:
        return f"{amount} DZD"


def format_date(dt):
    """Format datetime or date object."""
    if not dt:
        return "—"
    if isinstance(dt, (datetime, date)):
        return dt.strftime("%Y-%m-%d")
    return str(dt)[:10]


# ── Database Queries ──────────────────────────────────────────────────

def search_students(conn, query):
    """Search students by number or Arabic name."""
    query = str(query).strip()
    if query.isdigit():
        rows = conn.run(
            """SELECT s.id, s."globalNumber", s.name, s.phone, b.name as branch_name
               FROM "Student" s
               LEFT JOIN "Branch" b ON b.id = s."registeredBranchId"
               WHERE s."globalNumber" = :num""",
            num=int(query)
        )
    else:
        norm_q = normalize_arabic(query)
        rows_all = conn.run(
            """SELECT s.id, s."globalNumber", s.name, s.phone, b.name as branch_name
               FROM "Student" s
               LEFT JOIN "Branch" b ON b.id = s."registeredBranchId"
               LIMIT 1000"""
        )
        rows = [r for r in rows_all if norm_q in normalize_arabic(r[2] or "")]

    matches = []
    for r in rows[:15]:
        matches.append({
            "id": r[0],
            "globalNumber": r[1],
            "name": r[2],
            "phone": r[3],
            "branch_name": r[4],
        })
    return matches


def get_student_full_profile(conn, student_id):
    """Fetch student profile, enrollments, vouchers, and attendance stats."""
    # Student basic info
    s_rows = conn.run(
        """SELECT s.id, s."globalNumber", s.name, s.phone, s.address, s.sex,
                  s."payerStatus", s."registeredBranchId", b.name as branch_name, s."createdAt"
           FROM "Student" s
           LEFT JOIN "Branch" b ON b.id = s."registeredBranchId"
           WHERE s.id = :sid""",
        sid=student_id
    )
    if not s_rows:
        return None
    sr = s_rows[0]
    student = {
        "id": sr[0],
        "globalNumber": sr[1],
        "name": sr[2],
        "phone": sr[3],
        "address": sr[4],
        "sex": sr[5],
        "payerStatus": sr[6] or "NORMAL",
        "registeredBranchId": sr[7],
        "branch_name": sr[8],
        "createdAt": sr[9],
    }

    # Enrollments & Classes
    e_rows = conn.run(
        """SELECT e.id, e."classId", c.name as class_name, c."pricePerCycle", c."inscriptionFee",
                  e."inscriptionFeeCharged", e."inscriptionFeeAmount", e."payerStatus",
                  t.name as teacher_name, b.name as class_branch, c."isFormation"
           FROM "Enrollment" e
           JOIN "Class" c ON c.id = e."classId"
           LEFT JOIN "Teacher" t ON t.id = c."teacherId"
           LEFT JOIN "Branch" b ON b.id = c."branchId"
           WHERE e."studentId" = :sid""",
        sid=student_id
    )
    student["enrollments"] = [
        {
            "id": r[0],
            "classId": r[1],
            "class_name": r[2],
            "pricePerCycle": float(r[3] or 0),
            "inscriptionFee": float(r[4] or 0),
            "inscriptionFeeCharged": bool(r[5]),
            "inscriptionFeeAmount": float(r[6] or 0),
            "payerStatus": r[7] or "NORMAL",
            "teacher_name": r[8] or "Unassigned",
            "class_branch": r[9] or "—",
            "isFormation": bool(r[10]),
        }
        for r in e_rows
    ]

    # Vouchers
    v_rows = conn.run(
        """SELECT v.id, v.number, v."seriesId", v."paymentType", v.amount, v."isVoided",
                  v."issuedAt", v."issuedBy", v."classId", c.name as class_name,
                  ib.name as issuing_branch, tb.name as target_branch,
                  v."isPartial", v."remainingBalance",
                  v."issuingBranchId", v."targetBranchId"
           FROM "Voucher" v
           LEFT JOIN "Class" c ON c.id = v."classId"
           LEFT JOIN "Branch" ib ON ib.id = v."issuingBranchId"
           LEFT JOIN "Branch" tb ON tb.id = v."targetBranchId"
           WHERE v."studentId" = :sid
           ORDER BY v."issuedAt" DESC, v.number DESC""",
        sid=student_id
    )
    student["vouchers"] = [
        {
            "id": r[0],
            "number": r[1],
            "seriesId": r[2],
            "paymentType": r[3],
            "amount": float(r[4] or 0),
            "isVoided": bool(r[5]),
            "issuedAt": r[6],
            "issuedBy": r[7],
            "classId": r[8],
            "class_name": r[9] or "General / All",
            "issuing_branch": r[10] or "—",
            "target_branch": r[11] or "—",
            "isPartial": bool(r[12]),
            "remainingBalance": float(r[13] or 0) if r[13] is not None else None,
            "issuingBranchId": r[14],
            "targetBranchId": r[15],
        }
        for r in v_rows
    ]

    # Attendance stats per class
    student["class_stats"] = {}
    for enr in student["enrollments"]:
        cid = enr["classId"]
        is_formation = enr.get("isFormation", False)
        # Tuition / Formation paid specifically for this class (or unassigned distributed)
        valid_types = ("FORMATION", "TUITION_4SESSION") if is_formation else ("TUITION_4SESSION",)
        class_vouchers = [
            v for v in student["vouchers"]
            if not v["isVoided"] and v["paymentType"] in valid_types and (v["classId"] == cid or v["classId"] is None)
        ]
        class_paid = sum(v["amount"] for v in class_vouchers)

        # Total lessons attended
        att_rows = conn.run(
            """SELECT a.status, COUNT(*)
               FROM "Attendance" a
               JOIN "Lesson" l ON l.id = a."lessonId"
               WHERE a."studentId" = :sid AND l."classId" = :cid
               GROUP BY a.status""",
            sid=student_id, cid=cid
        )
        att_counts = {r[0]: r[1] for r in att_rows}
        present_count = att_counts.get("PRESENT", 0) + att_counts.get("LATE", 0)
        absent_count = att_counts.get("ABSENT", 0)
        excused_count = att_counts.get("NOT_DEFINED", 0)

        # Consumed = present + unexcused absence
        consumed_sessions = present_count + absent_count

        # Credit calculation
        cycle_price = enr["pricePerCycle"]
        session_price = cycle_price / 4 if cycle_price > 0 else 0
        purchased_sessions = (class_paid / session_price) if session_price > 0 else 0
        net_credit_sessions = purchased_sessions - consumed_sessions

        student["class_stats"][cid] = {
            "class_name": enr["class_name"],
            "is_formation": is_formation,
            "cycle_price": cycle_price,
            "session_price": session_price,
            "tuition_paid": class_paid,
            "purchased_sessions": round(purchased_sessions, 1),
            "present_count": present_count,
            "absent_count": absent_count,
            "excused_count": excused_count,
            "consumed_sessions": consumed_sessions,
            "net_credit_sessions": round(net_credit_sessions, 1),
        }

    return student


def get_all_branches(conn):
    """Fetch list of branches."""
    rows = conn.run('SELECT id, name FROM "Branch" ORDER BY id ASC')
    return [{"id": r[0], "name": r[1]} for r in rows]


def get_or_create_voucher_series(conn, branch_id):
    """Find or create an active voucher series for this branch and return (series_id, next_number)."""
    rows = conn.run(
        'SELECT id, "currentNumber" FROM "VoucherSeries" WHERE "issuingBranchId" = :bid ORDER BY id ASC LIMIT 1',
        bid=branch_id
    )
    if rows:
        series_id, current_num = rows[0]
        next_num = (current_num or 0) + 1
        conn.run(
            'UPDATE "VoucherSeries" SET "currentNumber" = :num WHERE id = :sid',
            num=next_num, sid=series_id
        )
        return series_id, next_num
    else:
        # Create new series
        created = conn.run(
            """INSERT INTO "VoucherSeries" ("issuingBranchId", scope, "currentNumber")
               VALUES (:bid, 'LOCAL_BRANCH', 1) RETURNING id""",
            bid=branch_id
        )
        return created[0][0], 1


# ── Daily Ledger Reconciliation ────────────────────────────────────────

def reconcile_daily_ledger_for_branch_date(conn, branch_id, date_val):
    """
    Reconciles the DailyLedger table for a specific branch and calendar day.
    Re-aggregates active vouchers and refunds for (branch_id, date) and updates DailyLedger atomically.
    Ensures that adding, editing, voiding, or deleting vouchers never leaves drift in DailyLedger.
    """
    if not branch_id or not date_val:
        return

    # Normalize date to calendar day
    if isinstance(date_val, datetime):
        d = date_val.date()
    elif isinstance(date_val, date):
        d = date_val
    else:
        d = datetime.strptime(str(date_val)[:10], "%Y-%m-%d").date()

    norm_dt = datetime(d.year, d.month, d.day, 0, 0, 0)
    dt_start = datetime(d.year, d.month, d.day, 0, 0, 0)
    dt_end = datetime(d.year, d.month, d.day, 23, 59, 59, 999999)

    # 1. Clear existing summary records for that branch and calendar day
    conn.run(
        'DELETE FROM "DailyLedger" WHERE "branchId" = :bid AND date = :norm_dt',
        bid=branch_id, norm_dt=norm_dt
    )

    # 2. Insert freshly calculated aggregates matching src/lib/ledger.ts
    insert_sql = """
    INSERT INTO "DailyLedger" ("branchId", date, type, amount)
    WITH voucher_agg AS (
        SELECT
            v."issuingBranchId" as "branchId",
            :norm_dt::timestamp as date,
            CASE
                WHEN v."paymentType" = 'INSCRIPTION' THEN 'INSCRIPTION'
                WHEN v."paymentType" = 'BOOK' THEN 'BOOK'
                WHEN c."isFormation" = true OR v."paymentType" IN ('WORKSHOP', 'FORMATION') THEN 'ATELIER_FORMATION'
                ELSE 'TUITION'
            END as type,
            SUM(v.amount) as amount
        FROM "Voucher" v
        LEFT JOIN "Class" c ON c.id = v."classId"
        WHERE v."issuingBranchId" = :bid
          AND v."issuedAt" >= :dt_start AND v."issuedAt" <= :dt_end
          AND v."isVoided" = false
          AND v."isRefund" = false
          AND v.amount > 0
        GROUP BY 1, 2, 3
    ),
    refund_agg AS (
        SELECT
            v."issuingBranchId" as "branchId",
            :norm_dt::timestamp as date,
            'REFUND'::text as type,
            SUM(r.amount) as amount
        FROM "Refund" r
        JOIN "Voucher" v ON v.id = r."voucherId"
        WHERE v."issuingBranchId" = :bid
          AND r."refundedAt" >= :dt_start AND r."refundedAt" <= :dt_end
          AND r.amount > 0
        GROUP BY 1, 2, 3
    ),
    combined AS (
        SELECT * FROM voucher_agg
        UNION ALL
        SELECT * FROM refund_agg
    )
    SELECT "branchId", date, type, SUM(amount)
    FROM combined
    GROUP BY "branchId", date, type
    """

    conn.run(
        insert_sql,
        bid=branch_id, norm_dt=norm_dt, dt_start=dt_start, dt_end=dt_end
    )


def sync_all_daily_ledger(conn):
    """
    Re-synchronize the entire DailyLedger table from all active vouchers and refunds.
    Guarantees zero drift between raw vouchers and DailyLedger summaries across all branches and history.
    """
    t0 = time.time()
    conn.run("BEGIN")
    try:
        conn.run('DELETE FROM "DailyLedger"')
        sync_sql = """
        INSERT INTO "DailyLedger" ("branchId", date, type, amount)
        WITH voucher_agg AS (
            SELECT
                v."issuingBranchId" as "branchId",
                DATE_TRUNC('day', v."issuedAt") as date,
                CASE
                    WHEN v."paymentType" = 'INSCRIPTION' THEN 'INSCRIPTION'
                    WHEN v."paymentType" = 'BOOK' THEN 'BOOK'
                    WHEN c."isFormation" = true OR v."paymentType" IN ('WORKSHOP', 'FORMATION') THEN 'ATELIER_FORMATION'
                    ELSE 'TUITION'
                END as type,
                SUM(v.amount) as amount
            FROM "Voucher" v
            LEFT JOIN "Class" c ON c.id = v."classId"
            WHERE v."isVoided" = false
              AND v."isRefund" = false
              AND v.amount > 0
            GROUP BY 1, 2, 3
        ),
        refund_agg AS (
            SELECT
                v."issuingBranchId" as "branchId",
                DATE_TRUNC('day', r."refundedAt") as date,
                'REFUND'::text as type,
                SUM(r.amount) as amount
            FROM "Refund" r
            JOIN "Voucher" v ON v.id = r."voucherId"
            WHERE r.amount > 0
            GROUP BY 1, 2, 3
        ),
        combined AS (
            SELECT * FROM voucher_agg
            UNION ALL
            SELECT * FROM refund_agg
        )
        SELECT "branchId", date, type, SUM(amount)
        FROM combined
        GROUP BY "branchId", date, type
        """
        conn.run(sync_sql)
        conn.run("COMMIT")
        count = conn.run('SELECT COUNT(*) FROM "DailyLedger"')[0][0]
        elapsed = (time.time() - t0) * 1000
        return True, count, elapsed
    except Exception as e:
        conn.run("ROLLBACK")
        return False, str(e), 0


# ── Action Handlers ───────────────────────────────────────────────────

def handle_create_voucher(conn, student):
    """Create a new voucher with custom date, branch, amount, and class."""
    print("\n" + "═" * 50)
    print("  ➕ CREATE NEW VOUCHER")
    print("═" * 50)

    branches = get_all_branches(conn)
    print("\nSelect Issuing Branch:")
    for i, b in enumerate(branches, 1):
        def_tag = " (Student Default)" if b["id"] == student["registeredBranchId"] else ""
        print(f"  [{i}] {b['name']}{def_tag}")

    b_choice = input(f"Choose branch (1-{len(branches)}) [default 1]: ").strip()
    try:
        b_idx = int(b_choice) - 1 if b_choice else 0
        issuing_branch_id = branches[b_idx]["id"]
    except Exception:
        issuing_branch_id = student["registeredBranchId"]

    # Class selection
    print("\nSelect Class:")
    print("  [0] General / No specific class")
    for i, enr in enumerate(student["enrollments"], 1):
        print(f"  [{i}] {enr['class_name']} ({format_money(enr['pricePerCycle'])} / cycle)")

    c_choice = input("Choose class: ").strip()
    class_id = None
    if c_choice and c_choice != "0":
        try:
            c_idx = int(c_choice) - 1
            class_id = student["enrollments"][c_idx]["classId"]
        except Exception:
            class_id = None

    # Payment Type
    types = ["FORMATION", "TUITION_4SESSION", "INSCRIPTION", "BOOK", "WORKSHOP"]
    default_type_idx = 1  # default to TUITION_4SESSION
    if class_id:
        selected_enr = next((e for e in student["enrollments"] if e["classId"] == class_id), None)
        if selected_enr and selected_enr.get("isFormation"):
            default_type_idx = 0  # default to FORMATION for formation groups

    print("\nPayment Type:")
    for i, t in enumerate(types, 1):
        def_tag = " [RECOMMENDED FOR THIS FORMATION]" if (i - 1) == default_type_idx and default_type_idx == 0 else ""
        print(f"  [{i}] {t}{def_tag}")
    t_choice = input(f"Choose type [default {default_type_idx + 1}]: ").strip()
    try:
        payment_type = types[int(t_choice) - 1] if t_choice else types[default_type_idx]
    except Exception:
        payment_type = types[default_type_idx]

    # Amount
    default_amt = "2500"
    if class_id:
        for enr in student["enrollments"]:
            if enr["classId"] == class_id and enr["pricePerCycle"] > 0:
                default_amt = str(int(enr["pricePerCycle"]))
    amt_input = input(f"\nEnter Amount in DZD [default {default_amt}]: ").strip()
    amount = float(amt_input if amt_input else default_amt)

    # Date
    today_str = datetime.now().strftime("%Y-%m-%d")
    date_input = input(f"Issue Date (YYYY-MM-DD) [default {today_str}]: ").strip()
    issue_date_str = date_input if date_input else today_str

    confirm = input(f"\nCreate voucher of {format_money(amount)} on {issue_date_str}? [y/N]: ").strip().lower()
    if confirm not in ("y", "yes"):
        print("Cancelled.")
        return

    # Execute insert in transaction
    conn.run("BEGIN")
    try:
        series_id, v_number = get_or_create_voucher_series(conn, issuing_branch_id)
        issued_at_dt = datetime.strptime(issue_date_str, "%Y-%m-%d")

        v_res = conn.run(
            """INSERT INTO "Voucher" ("seriesId", number, "studentId", "classId", "issuingBranchId",
                                      "targetBranchId", "paymentType", amount, "issuedBy", "issuedAt", "isVoided", status)
               VALUES (:sid, :num, :stid, :cid, :ibid, :tbid, :ptype, :amt, 'termux_admin', :iat, false, 'ACTIVE')
               RETURNING id""",
            sid=series_id, num=v_number, stid=student["id"], cid=class_id, ibid=issuing_branch_id,
            tbid=issuing_branch_id, ptype=payment_type, amt=amount, iat=issued_at_dt
        )
        new_v_id = v_res[0][0]

        # AuditLog
        conn.run(
            """INSERT INTO "AuditLog" ("entityType", "entityId", action, "branchId", "userId", "userName", details, timestamp)
               VALUES ('Voucher', :vid, 'CREATE_VOUCHER_TERMUX', :bid, 'termux', 'Termux Admin', :dtl, NOW())""",
            vid=str(new_v_id), bid=issuing_branch_id,
            dtl=f"Created voucher #{v_number} for student #{student['globalNumber']} ({format_money(amount)}) on {issue_date_str}"
        )

        # Reconcile DailyLedger immediately
        reconcile_daily_ledger_for_branch_date(conn, issuing_branch_id, issued_at_dt)

        conn.run("COMMIT")
        print(f"\n✅ Voucher #{v_number} created successfully and Daily Ledger updated! (ID: {new_v_id})")
    except Exception as e:
        conn.run("ROLLBACK")
        print(f"\n❌ Error creating voucher: {e}")


def handle_edit_voucher(conn, student):
    """Edit fields of an existing voucher."""
    if not student["vouchers"]:
        print("\nNo vouchers found for this student.")
        return

    print("\nSelect Voucher to Edit:")
    for i, v in enumerate(student["vouchers"], 1):
        v_date = format_date(v["issuedAt"])
        void_str = " [VOIDED]" if v["isVoided"] else ""
        print(f"  [{i}] #{v['number']} | {format_money(v['amount'])} | {v['paymentType']} | {v['class_name']} | {v_date}{void_str}")

    choice = input(f"\nChoose voucher (1-{len(student['vouchers'])}): ").strip()
    try:
        idx = int(choice) - 1
        voucher = student["vouchers"][idx]
    except Exception:
        print("Invalid choice.")
        return

    print(f"\nEditing Voucher #{voucher['number']} (Current Amount: {format_money(voucher['amount'])}, Date: {format_date(voucher['issuedAt'])})")
    print("  [1] Change Amount")
    print("  [2] Change Date (YYYY-MM-DD)")
    print("  [3] Change Class")
    print("  [4] Change Branch")
    print("  [5] Change Payment Type")
    print("  [6] Toggle Void / Active Status")
    print("  [0] Cancel")

    issuing_bid = voucher.get("issuingBranchId") or student.get("registeredBranchId") or 1
    issued_dt = voucher["issuedAt"]

    action = input("\nSelect field to edit: ").strip()

    if action == "1":
        new_amt_str = input(f"Enter new amount in DZD [current {voucher['amount']}]: ").strip()
        if not new_amt_str:
            return
        new_amt = float(new_amt_str)
        conn.run("BEGIN")
        try:
            conn.run(
                """UPDATE "Voucher" SET amount = :amt, "lastEditedAt" = NOW(), "lastEditedBy" = 'termux'
                   WHERE id = :vid""",
                amt=new_amt, vid=voucher["id"]
            )
            reconcile_daily_ledger_for_branch_date(conn, issuing_bid, issued_dt)
            conn.run("COMMIT")
            print(f"✅ Amount updated to {format_money(new_amt)} and Daily Ledger reconciled.")
        except Exception as e:
            conn.run("ROLLBACK")
            print(f"❌ Error updating amount: {e}")

    elif action == "2":
        new_date_str = input(f"Enter new date (YYYY-MM-DD) [current {format_date(voucher['issuedAt'])}]: ").strip()
        if not new_date_str:
            return
        try:
            new_date = datetime.strptime(new_date_str, "%Y-%m-%d")
        except Exception as e:
            print(f"❌ Invalid date format: {e}")
            return
        conn.run("BEGIN")
        try:
            conn.run(
                """UPDATE "Voucher" SET "issuedAt" = :dt, "lastEditedAt" = NOW(), "lastEditedBy" = 'termux'
                   WHERE id = :vid""",
                dt=new_date, vid=voucher["id"]
            )
            reconcile_daily_ledger_for_branch_date(conn, issuing_bid, issued_dt)
            reconcile_daily_ledger_for_branch_date(conn, issuing_bid, new_date)
            conn.run("COMMIT")
            print(f"✅ Date updated to {new_date_str} and Daily Ledger reconciled.")
        except Exception as e:
            conn.run("ROLLBACK")
            print(f"❌ Error updating date: {e}")

    elif action == "3":
        print("\nSelect new class:")
        print("  [0] General / No class")
        for i, enr in enumerate(student["enrollments"], 1):
            print(f"  [{i}] {enr['class_name']}")
        c_choice = input("Choose: ").strip()
        new_cid = None
        if c_choice and c_choice != "0":
            try:
                new_cid = student["enrollments"][int(c_choice) - 1]["classId"]
            except Exception:
                pass
        conn.run("BEGIN")
        try:
            conn.run(
                """UPDATE "Voucher" SET "classId" = :cid, "lastEditedAt" = NOW(), "lastEditedBy" = 'termux'
                   WHERE id = :vid""",
                cid=new_cid, vid=voucher["id"]
            )
            reconcile_daily_ledger_for_branch_date(conn, issuing_bid, issued_dt)
            conn.run("COMMIT")
            print("✅ Class updated and Daily Ledger reconciled.")
        except Exception as e:
            conn.run("ROLLBACK")
            print(f"❌ Error updating class: {e}")

    elif action == "4":
        branches = get_all_branches(conn)
        print("\nSelect new branch:")
        for i, b in enumerate(branches, 1):
            print(f"  [{i}] {b['name']}")
        b_choice = input("Choose: ").strip()
        try:
            new_bid = branches[int(b_choice) - 1]["id"]
        except Exception:
            print("Invalid branch.")
            return
        conn.run("BEGIN")
        try:
            conn.run(
                """UPDATE "Voucher" SET "issuingBranchId" = :bid, "targetBranchId" = :bid, "lastEditedAt" = NOW()
                   WHERE id = :vid""",
                bid=new_bid, vid=voucher["id"]
            )
            reconcile_daily_ledger_for_branch_date(conn, issuing_bid, issued_dt)
            reconcile_daily_ledger_for_branch_date(conn, new_bid, issued_dt)
            conn.run("COMMIT")
            print(f"✅ Branch updated to {branches[int(b_choice) - 1]['name']} and Daily Ledger reconciled.")
        except Exception as e:
            conn.run("ROLLBACK")
            print(f"❌ Error updating branch: {e}")

    elif action == "5":
        types = ["FORMATION", "TUITION_4SESSION", "INSCRIPTION", "BOOK", "WORKSHOP"]
        for i, t in enumerate(types, 1):
            print(f"  [{i}] {t}")
        t_choice = input("Choose type: ").strip()
        if t_choice in ("1", "2", "3", "4", "5"):
            new_type = types[int(t_choice) - 1]
            conn.run("BEGIN")
            try:
                conn.run(
                    """UPDATE "Voucher" SET "paymentType" = :pt, "lastEditedAt" = NOW()
                       WHERE id = :vid""",
                    pt=new_type, vid=voucher["id"]
                )
                reconcile_daily_ledger_for_branch_date(conn, issuing_bid, issued_dt)
                conn.run("COMMIT")
                print(f"✅ Type updated to {new_type} and Daily Ledger reconciled.")
            except Exception as e:
                conn.run("ROLLBACK")
                print(f"❌ Error updating type: {e}")

    elif action == "6":
        new_void = not voucher["isVoided"]
        status_str = "VOIDED" if new_void else "ACTIVE"
        conn.run("BEGIN")
        try:
            conn.run(
                """UPDATE "Voucher" SET "isVoided" = :v, status = :st, "lastEditedAt" = NOW()
                   WHERE id = :vid""",
                v=new_void, st=status_str, vid=voucher["id"]
            )
            reconcile_daily_ledger_for_branch_date(conn, issuing_bid, issued_dt)
            conn.run("COMMIT")
            print(f"✅ Voucher status toggled to {status_str} and Daily Ledger reconciled.")
        except Exception as e:
            conn.run("ROLLBACK")
            print(f"❌ Error toggling void status: {e}")


def handle_delete_voucher(conn, student):
    """Delete or void a voucher."""
    if not student["vouchers"]:
        print("\nNo vouchers found for this student.")
        return

    print("\nSelect Voucher to Delete:")
    for i, v in enumerate(student["vouchers"], 1):
        v_date = format_date(v["issuedAt"])
        void_str = " [VOIDED]" if v["isVoided"] else ""
        print(f"  [{i}] #{v['number']} | {format_money(v['amount'])} | {v['paymentType']} | {v['class_name']} | {v_date}{void_str}")

    choice = input(f"\nChoose voucher (1-{len(student['vouchers'])}): ").strip()
    try:
        idx = int(choice) - 1
        voucher = student["vouchers"][idx]
    except Exception:
        print("Invalid choice.")
        return

    print(f"\nVoucher #{voucher['number']} ({format_money(voucher['amount'])}) selected.")
    print("  [1] Soft-Void (Keeps row in DB marked VOIDED — recommended for accounting)")
    print("  [2] Permanent Delete (Permanently removes row from database)")
    print("  [0] Cancel")

    mode = input("Choose action: ").strip()
    issuing_bid = voucher.get("issuingBranchId") or student.get("registeredBranchId") or 1
    issued_dt = voucher["issuedAt"]

    if mode == "1":
        conn.run("BEGIN")
        try:
            conn.run(
                'UPDATE "Voucher" SET "isVoided" = true, status = \'VOIDED\', "lastEditedAt" = NOW(), "lastEditedBy" = \'termux\' WHERE id = :id',
                id=voucher["id"]
            )
            reconcile_daily_ledger_for_branch_date(conn, issuing_bid, issued_dt)
            conn.run(
                """INSERT INTO "AuditLog" ("entityType", "entityId", action, "branchId", "userId", "userName", details, timestamp)
                   VALUES ('Voucher', :vid, 'VOID_VOUCHER_TERMUX', :bid, 'termux', 'Termux Admin', :dtl, NOW())""",
                vid=str(voucher["id"]), bid=issuing_bid,
                dtl=f"Voided voucher #{voucher['number']} for student #{student['globalNumber']} ({format_money(voucher['amount'])})"
            )
            conn.run("COMMIT")
            print("✅ Voucher marked as VOIDED and Daily Ledger reconciled.")
        except Exception as e:
            conn.run("ROLLBACK")
            print(f"❌ Error voiding voucher: {e}")

    elif mode == "2":
        confirm = input(f"Are you ABSOLUTELY sure you want to permanently delete voucher #{voucher['number']}? (yes/no): ").strip().lower()
        if confirm in ("yes", "y"):
            conn.run("BEGIN")
            try:
                # 1. Clean up VoucherEdit records referencing this voucher
                conn.run('DELETE FROM "VoucherEdit" WHERE "voucherId" = :id', id=voucher["id"])
                # 2. Delete the voucher
                conn.run('DELETE FROM "Voucher" WHERE id = :id', id=voucher["id"])
                # 3. Reconcile DailyLedger immediately so the voucher value is removed from the daily ledger
                reconcile_daily_ledger_for_branch_date(conn, issuing_bid, issued_dt)
                # 4. Audit log
                conn.run(
                    """INSERT INTO "AuditLog" ("entityType", "entityId", action, "branchId", "userId", "userName", details, timestamp)
                       VALUES ('Voucher', :vid, 'DELETE_VOUCHER_TERMUX', :bid, 'termux', 'Termux Admin', :dtl, NOW())""",
                    vid=str(voucher["id"]), bid=issuing_bid,
                    dtl=f"Permanently deleted voucher #{voucher['number']} for student #{student['globalNumber']} ({format_money(voucher['amount'])})"
                )
                conn.run("COMMIT")
                print(f"✅ Voucher #{voucher['number']} permanently deleted and Daily Ledger reconciled.")
            except Exception as e:
                conn.run("ROLLBACK")
                print(f"❌ Error permanently deleting voucher: {e}")
        else:
            print("Cancelled.")


def handle_fix_attendances(conn, student):
    """View and modify lesson attendance records to fix credit calculations."""
    print("\n" + "═" * 50)
    print("  📅 LESSON ATTENDANCES & CREDIT ALIGNMENT")
    print("═" * 50)

    if not student["enrollments"]:
        print("Student has no enrolled classes.")
        return

    print("\nSelect Class to inspect lessons:")
    for i, enr in enumerate(student["enrollments"], 1):
        print(f"  [{i}] {enr['class_name']}")

    c_choice = input("Choose class: ").strip()
    try:
        class_id = student["enrollments"][int(c_choice) - 1]["classId"]
        class_name = student["enrollments"][int(c_choice) - 1]["class_name"]
    except Exception:
        print("Invalid choice.")
        return

    # Fetch lessons and attendances for this class
    lessons = conn.run(
        """SELECT l.id, l."startsAt", l."isCatchUp", l."isFree", a.id as att_id, a.status, a.justification
           FROM "Lesson" l
           LEFT JOIN "Attendance" a ON a."lessonId" = l.id AND a."studentId" = :sid
           WHERE l."classId" = :cid
           ORDER BY l."startsAt" DESC
           LIMIT 25""",
        sid=student["id"], cid=class_id
    )

    if not lessons:
        print(f"\nNo lessons recorded for {class_name}.")
        return

    print(f"\nRecent Lessons for {class_name}:")
    print(f"{'#':<3} {'Date':<11} {'Status':<12} {'Notes'}")
    print("-" * 45)
    for i, l in enumerate(lessons, 1):
        l_date = format_date(l[1])
        status = l[5] or "NOT_RECORDED"
        notes = "Free" if l[3] else ("Catch-up" if l[2] else "")
        print(f"[{i:<2}] {l_date:<11} {status:<12} {notes}")

    l_pick = input(f"\nSelect lesson to edit (1-{len(lessons)}) or [0] to exit: ").strip()
    if not l_pick or l_pick == "0":
        return

    try:
        lesson = lessons[int(l_pick) - 1]
    except Exception:
        print("Invalid choice.")
        return

    lesson_id = lesson[0]
    att_id = lesson[4]
    current_status = lesson[5] or "NOT_RECORDED"

    print(f"\nSelected Lesson on {format_date(lesson[1])} (Current status: {current_status}):")
    print("  [1] Mark PRESENT (Consumes 1 session credit)")
    print("  [2] Mark ABSENT (Consumes 1 session credit per school rules)")
    print("  [3] Mark EXCUSED / NOT_DEFINED (0 session credit deducted — restores student credit!)")
    print("  [4] Delete attendance record")
    print("  [0] Cancel")

    st_choice = input("Choose: ").strip()
    new_status = None
    if st_choice == "1":
        new_status = "PRESENT"
    elif st_choice == "2":
        new_status = "ABSENT"
    elif st_choice == "3":
        new_status = "NOT_DEFINED"
    elif st_choice == "4":
        if att_id:
            conn.run('DELETE FROM "Attendance" WHERE id = :id', id=att_id)
            print("✅ Attendance record deleted.")
        return
    else:
        return

    if new_status:
        if att_id:
            conn.run(
                'UPDATE "Attendance" SET status = :st WHERE id = :id',
                st=new_status, id=att_id
            )
        else:
            conn.run(
                """INSERT INTO "Attendance" ("studentId", "lessonId", status)
                   VALUES (:sid, :lid, :st)""",
                sid=student["id"], lid=lesson_id, st=new_status
            )
        print(f"✅ Lesson attendance updated to {new_status}!")


def handle_toggle_inscription_and_payer(conn, student):
    """Toggle inscription fee charged or student payer status."""
    print("\n" + "═" * 50)
    print("  🏷️ INSCRIPTION FEE & PAYER STATUS")
    print("═" * 50)

    print(f"\nCurrent Payer Status: {student['payerStatus']}")
    print("Enrollments Inscription Status:")
    for enr in student["enrollments"]:
        fee_str = "CHARGED" if enr["inscriptionFeeCharged"] else "WAIVED / UNCHARGED"
        print(f"  • {enr['class_name']}: {fee_str}")

    print("\nOptions:")
    print("  [1] Change Payer Status (NORMAL / NON_PAYER / SCHOOL_FEES_ONLY)")
    print("  [2] Toggle Inscription Fee Charged flag on Class Enrollment")
    print("  [0] Cancel")

    choice = input("Select option: ").strip()

    if choice == "1":
        statuses = ["NORMAL", "NON_PAYER", "SCHOOL_FEES_ONLY"]
        for i, s in enumerate(statuses, 1):
            print(f"  [{i}] {s}")
        s_choice = input("Choose: ").strip()
        if s_choice in ("1", "2", "3"):
            new_p_status = statuses[int(s_choice) - 1]
            conn.run(
                'UPDATE "Student" SET "payerStatus" = :ps WHERE id = :id',
                ps=new_p_status, id=student["id"]
            )
            print(f"✅ Student payer status updated to {new_p_status}.")

    elif choice == "2":
        for i, enr in enumerate(student["enrollments"], 1):
            state = "Currently Charged" if enr["inscriptionFeeCharged"] else "Currently NOT charged"
            print(f"  [{i}] {enr['class_name']} ({state})")
        e_choice = input("Choose class: ").strip()
        try:
            enr_to_flip = student["enrollments"][int(e_choice) - 1]
            new_charged = not enr_to_flip["inscriptionFeeCharged"]
            conn.run(
                'UPDATE "Enrollment" SET "inscriptionFeeCharged" = :c WHERE id = :id',
                c=new_charged, id=enr_to_flip["id"]
            )
            print(f"✅ Inscription fee charged toggled to {new_charged} for {enr_to_flip['class_name']}.")
        except Exception:
            print("Invalid choice.")


# ── Main Dashboard Display ───────────────────────────────────────────

def display_dashboard(student):
    """Display clean mobile-responsive student dashboard in terminal."""
    print("\n" + "═" * 60)
    print(f"  🎓 STUDENT: #{student['globalNumber']} - {student['name']}")
    print(f"  📍 Branch: {student['branch_name']} | 📱 Phone: {student['phone'] or 'None'} | Payer: {student['payerStatus']}")
    print("═" * 60)

    # Class & Credit Balance Table
    print("\n📊 CLASS ENROLLMENTS & SESSIONS BALANCE:")
    if not student["enrollments"]:
        print("  (No enrolled classes)")
    else:
        for enr in student["enrollments"]:
            cid = enr["classId"]
            stats = student["class_stats"].get(cid, {})
            net_bal = stats.get("net_credit_sessions", 0)

            if net_bal > 0:
                bal_str = f"🟢 +{net_bal} Sessions Credit"
            elif net_bal < 0:
                bal_str = f"🔴 {net_bal} Sessions Debt"
            else:
                bal_str = "⚪ Balanced (0 Sessions)"

            if enr.get("isFormation"):
                level_price = enr["pricePerCycle"]
                paid = stats.get("tuition_paid", 0)
                owed = max(0, level_price - paid)
                if paid >= level_price and level_price > 0:
                    status_badge = "🟢 Paid in Full / خالص (Rest: 0 DZD)"
                elif paid > 0:
                    status_badge = f"🟡 Partial / دفع جزئي (Rest: {format_money(owed)})"
                else:
                    status_badge = f"🔴 Unpaid / غير مدفوع (Rest: {format_money(owed)})"

                print(f"\n  ▶ {enr['class_name']} [FORMATION / دورة تدريبية] (Teacher: {enr['teacher_name']})")
                print(f"    • Level Price: {format_money(level_price)}")
                print(f"    • Paid Amount: {format_money(paid)}  -->  {status_badge}")
                print(f"    • Attendance: {stats.get('present_count', 0)} Present, {stats.get('absent_count', 0)} Absent, {stats.get('excused_count', 0)} Excused")
                print(f"    • Inscription Fee: {fee_status}")
            else:
                print(f"\n  ▶ {enr['class_name']} (Teacher: {enr['teacher_name']})")
                print(f"    • Price: {format_money(enr['pricePerCycle'])}/cycle (4 sessions)")
                print(f"    • Tuition Paid: {format_money(stats.get('tuition_paid', 0))}  -->  {stats.get('purchased_sessions', 0)} sessions purchased")
                print(f"    • Attendance: {stats.get('present_count', 0)} Present, {stats.get('absent_count', 0)} Absent, {stats.get('excused_count', 0)} Excused")
                print(f"    • Current Balance: {bal_str}")
                print(f"    • Inscription Fee: {fee_status}")

    # Vouchers summary
    total_paid = sum(v["amount"] for v in student["vouchers"] if not v["isVoided"])
    active_vouchers = [v for v in student["vouchers"] if not v["isVoided"]]
    voided_vouchers = [v for v in student["vouchers"] if v["isVoided"]]

    print(f"\n💰 FINANCIAL TOTALS: {format_money(total_paid)} across {len(active_vouchers)} active voucher(s)")
    if voided_vouchers:
        print(f"   (plus {len(voided_vouchers)} voided vouchers)")
    print("-" * 60)


def list_all_vouchers(student):
    """List detailed voucher table."""
    print("\n" + "═" * 60)
    print(f"  🎟️ VOUCHERS LIST FOR #{student['globalNumber']} {student['name']}")
    print("═" * 60)

    if not student["vouchers"]:
        print("\nNo vouchers found for this student.")
        return

    for i, v in enumerate(student["vouchers"], 1):
        v_date = format_date(v["issuedAt"])
        void_tag = " ❌ [VOIDED]" if v["isVoided"] else " ✅ [ACTIVE]"
        print(f"\n[{i}] Voucher #{v['number']}{void_tag}")
        print(f"    Amount:   {format_money(v['amount'])}")
        print(f"    Type:     {v['paymentType']}")
        print(f"    Class:    {v['class_name']}")
        print(f"    Date:     {v_date} (by {v['issuedBy'] or 'system'})")
        print(f"    Branches: Issuing: {v['issuing_branch']} | Target: {v['target_branch']}")
    print("-" * 60)


def student_action_loop(conn, student_id):
    """Interactive loop for a specific student."""
    while True:
        student = get_student_full_profile(conn, student_id)
        if not student:
            print("Student not found.")
            return

        display_dashboard(student)

        print("\nACTIONS:")
        print("  [1] List All Vouchers & Details")
        print("  [2] Create New Voucher (Custom Date / Branch / Amount)")
        print("  [3] Edit a Voucher (Amount, Date, Class, Branch, Void)")
        print("  [4] Delete or Void a Voucher")
        print("  [5] View & Fix Lesson Attendances (Presence / Absence / Excused)")
        print("  [6] Toggle Inscription Fee & Payer Status")
        print("  [7] Reconcile / Sync Daily Ledger (Fix any discrepancies)")
        print("  [8] Switch Student")
        print("  [0] Exit")

        cmd = input("\nSelect action (0-8): ").strip()

        if cmd == "1":
            list_all_vouchers(student)
            input("\nPress Enter to return to menu...")
        elif cmd == "2":
            handle_create_voucher(conn, student)
            input("\nPress Enter to return to menu...")
        elif cmd == "3":
            handle_edit_voucher(conn, student)
            input("\nPress Enter to return to menu...")
        elif cmd == "4":
            handle_delete_voucher(conn, student)
            input("\nPress Enter to return to menu...")
        elif cmd == "5":
            handle_fix_attendances(conn, student)
            input("\nPress Enter to return to menu...")
        elif cmd == "6":
            handle_toggle_inscription_and_payer(conn, student)
            input("\nPress Enter to return to menu...")
        elif cmd == "7":
            print("\nSynchronizing DailyLedger from all vouchers and refunds...")
            ok, res, el = sync_all_daily_ledger(conn)
            if ok:
                print(f"✅ DailyLedger fully synchronized ({res} entries in {el:.0f}ms).")
            else:
                print(f"❌ Error syncing DailyLedger: {res}")
            input("\nPress Enter to return to menu...")
        elif cmd == "8":
            return "SWITCH"
        elif cmd in ("0", "q", "exit"):
            return "EXIT"


def main():
    parser = argparse.ArgumentParser(description="Student Credit & Voucher Alignment Tool")
    parser.add_argument("identifier", nargs="?", help="Student Global Number or Name")
    parser.add_argument("--db", help="PostgreSQL connection string")
    parser.add_argument("--sync-ledger", action="store_true", help="Sync DailyLedger table from all vouchers and exit")
    args = parser.parse_args()

    db_url = args.db or load_env_database_url()
    if not db_url:
        print("❌ Error: DATABASE_URL not found!")
        print("Please set DATABASE_URL or run inside the school software folder.")
        sys.exit(1)

    try:
        conn, driver = get_db_connection(db_url)
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        sys.exit(1)

    if args.sync_ledger:
        print("\nSynchronizing DailyLedger from all vouchers and refunds...")
        ok, res, el = sync_all_daily_ledger(conn)
        if ok:
            print(f"✅ DailyLedger fully synchronized ({res} entries in {el:.0f}ms).")
        else:
            print(f"❌ Error syncing DailyLedger: {res}")
        return

    initial_query = args.identifier

    while True:
        if not initial_query:
            print("\n" + "═" * 50)
            print("  🎓 STUDENT CREDIT & VOUCHER MANAGER")
            print("═" * 50)
            initial_query = input("Enter Student Global # or Name (or 'sync' to reconcile ledger, 'q' to quit): ").strip()
            if not initial_query or initial_query.lower() in ("q", "quit", "exit"):
                break
            if initial_query.lower() in ("sync", "sync-ledger", "ledger"):
                print("\nSynchronizing DailyLedger from all vouchers and refunds...")
                ok, res, el = sync_all_daily_ledger(conn)
                if ok:
                    print(f"✅ DailyLedger fully synchronized ({res} entries in {el:.0f}ms).")
                else:
                    print(f"❌ Error syncing DailyLedger: {res}")
                initial_query = None
                continue

        matches = search_students(conn, initial_query)
        if not matches:
            print(f"❌ No student found matching '{initial_query}'.")
            initial_query = None
            continue

        if len(matches) == 1:
            selected_student_id = matches[0]["id"]
        else:
            print(f"\nMultiple students found for '{initial_query}':")
            for i, m in enumerate(matches, 1):
                print(f"  [{i}] #{m['globalNumber']} - {m['name']} ({m['branch_name'] or 'No branch'})")
            pick = input(f"\nChoose student (1-{len(matches)}) or [0] to cancel: ").strip()
            if not pick or pick == "0":
                initial_query = None
                continue
            try:
                selected_student_id = matches[int(pick) - 1]["id"]
            except Exception:
                print("Invalid choice.")
                initial_query = None
                continue

        result = student_action_loop(conn, selected_student_id)
        if result == "EXIT":
            break
        initial_query = None

    print("\nGoodbye!")


if __name__ == "__main__":
    main()
