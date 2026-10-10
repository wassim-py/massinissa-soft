#!/usr/bin/env python3
"""
merge_students.py — Massinissa School Management Student Merge Tool
Designed for execution on Android (Termux) and desktop environments.

REQUIREMENTS ON ANDROID (TERMUX):
  pkg install python
  python -m pip install pg8000

USAGE:
  # 1. Interactive wizard (search by name or number):
  python merge_students.py

  # 2. Fast 1-liner by Global Number (duplicate -> keeper):
  python merge_students.py 136 651

  # 3. Fast 1-liner with auto-confirm:
  python merge_students.py --source 136 --target 651 --yes

  # 4. Search student by name or number:
  python merge_students.py --search "ناردين"

  # 5. Scan database for all duplicate candidates:
  python merge_students.py --scan
"""

import sys
import os
import re
import json
import argparse
from urllib.parse import urlparse, parse_qs

# Ensure UTF-8 output encoding for Arabic text
if hasattr(sys.stdout, "buffer"):
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
if hasattr(sys.stderr, "buffer"):
    import io
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# Try importing pg8000 (pure python) or psycopg2
try:
    import pg8000.native
    HAS_PG8000 = True
except ImportError:
    HAS_PG8000 = False

try:
    import psycopg2
    import psycopg2.extras
    HAS_PSYCOPG2 = True
except ImportError:
    HAS_PSYCOPG2 = False


def load_env_database_url():
    """Load DATABASE_URL from environment or local .env file. Automatically strips -pooler."""
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
        raise ValueError(
            "DATABASE_URL not found! Set DATABASE_URL environment variable or place .env in the folder."
        )

    # Automatically strip -pooler to avoid PgBouncer prepared-statement caching collision
    if "-pooler." in db_url:
        db_url = db_url.replace("-pooler.", ".")

    parsed = urlparse(db_url)
    user = parsed.username
    password = parsed.password
    host = parsed.hostname
    port = parsed.port or 5432
    database = parsed.path.lstrip("/")

    # Check for sslmode in query params
    ssl_context = True

    if HAS_PG8000:
        import ssl
        from pg8000.native import State, literal, InterfaceError

        def inline_sql_params(query, params):
            if not params:
                return query
            in_quote_escape = False
            output_query = []
            state = State.OUT
            prev_c = None
            curr_param = ""
            for i, c in enumerate(query):
                next_c = query[i + 1] if i + 1 < len(query) else None
                if state == State.OUT:
                    if c == "'":
                        output_query.append(c)
                        state = State.IN_ES if prev_c == "E" else State.IN_SQ
                    elif c == '"':
                        output_query.append(c)
                        state = State.IN_QI
                    elif c == "-":
                        output_query.append(c)
                        if prev_c == "-":
                            state = State.IN_CO
                    elif c == "$":
                        output_query.append(c)
                        if prev_c == "$":
                            state = State.IN_DQ
                    elif c == ":" and (next_c is None or next_c not in ":=") and prev_c != ":":
                        state = State.IN_PN
                        curr_param = ""
                    else:
                        output_query.append(c)
                elif state == State.IN_SQ:
                    if c == "'":
                        if in_quote_escape:
                            in_quote_escape = False
                        elif next_c == "'":
                            in_quote_escape = True
                        else:
                            state = State.OUT
                    output_query.append(c)
                elif state == State.IN_QI:
                    if c == '"':
                        state = State.OUT
                    output_query.append(c)
                elif state == State.IN_ES:
                    if c == "'" and prev_c != "\\":
                        state = State.OUT
                    output_query.append(c)
                elif state == State.IN_PN:
                    curr_param += c
                    if next_c is None or (not next_c.isalnum() and next_c != "_"):
                        state = State.OUT
                        if curr_param not in params:
                            raise InterfaceError(f"Missing parameter: {curr_param}")
                        output_query.append(literal(params[curr_param]))
                elif state == State.IN_CO:
                    output_query.append(c)
                    if c == "\n":
                        state = State.OUT
                elif state == State.IN_DQ:
                    output_query.append(c)
                    if c == "$" and prev_c == "$":
                        state = State.OUT
                prev_c = c
            return "".join(output_query)

        class SafePg8000Connection(pg8000.native.Connection):
            """Executes queries via Simple Query Protocol to eliminate unnamed portal collisions."""
            def run(self, sql, stream=None, types=None, **params):
                final_sql = inline_sql_params(sql, params) if params else sql
                self._context = self.execute_simple(final_sql)
                return self._context.rows

        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        conn = SafePg8000Connection(
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
        raise RuntimeError(
            "No PostgreSQL driver found!\n"
            "Please run: python -m pip install pg8000"
        )


def normalize_arabic(text):
    """Normalize Arabic characters for fuzzy matching."""
    if not text:
        return ""
    text = text.strip()
    text = re.sub(r"[أإآٱ]", "ا", text)
    text = re.sub(r"[ة]", "ه", text)
    text = re.sub(r"[ى]", "ي", text)
    text = re.sub(r"[\u064B-\u065F]", "", text)  # Tashkeel / Harakat
    text = re.sub(r"\s+", " ", text)
    return text.lower()


class DBWrapper:
    def __init__(self, conn, driver_type):
        self.conn = conn
        self.driver = driver_type

    def query(self, sql, params=None):
        if self.driver == "pg8000":
            if params:
                # pg8000 uses :param or literal args
                return self.conn.run(sql, **(params if isinstance(params, dict) else {}))
            return self.conn.run(sql)
        else:
            with self.conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
                cur.execute(sql, params)
                if cur.description:
                    return cur.fetchall()
                return []

    def execute(self, sql, params=None):
        if self.driver == "pg8000":
            if params:
                return self.conn.run(sql, **(params if isinstance(params, dict) else {}))
            return self.conn.run(sql)
        else:
            with self.conn.cursor() as cur:
                cur.execute(sql, params)
            self.conn.commit()


def find_student(conn_type, conn, identifier):
    """Find a student by globalNumber or UUID id."""
    is_num = str(identifier).strip().isdigit()
    sql = """
        SELECT s.id, s."globalNumber", s.name, s.phone, s.address, s.birthday, s.sex,
               s."registeredBranchId", b.name as branch_name,
               (SELECT COUNT(*) FROM "Voucher" v WHERE v."studentId" = s.id) as vouchers_count,
               (SELECT COALESCE(SUM(amount), 0) FROM "Voucher" v WHERE v."studentId" = s.id) as vouchers_total,
               (SELECT COUNT(*) FROM "Enrollment" e WHERE e."studentId" = s.id) as enrollments_count,
               (SELECT COUNT(*) FROM "Attendance" a WHERE a."studentId" = s.id) as attendances_count
        FROM "Student" s
        LEFT JOIN "Branch" b ON b.id = s."registeredBranchId"
        WHERE """ + ('s."globalNumber" = :id' if is_num else "s.id = :id")

    res = conn.run(sql, id=int(identifier) if is_num else str(identifier))
    if not res:
        return None
    r = res[0]
    return {
        "id": r[0],
        "globalNumber": r[1],
        "name": r[2],
        "phone": r[3],
        "address": r[4],
        "birthday": r[5],
        "sex": r[6],
        "registeredBranchId": r[7],
        "branch_name": r[8],
        "vouchers_count": r[9],
        "vouchers_total": r[10],
        "enrollments_count": r[11],
        "attendances_count": r[12],
    }


def search_students(conn, term):
    """Search students by partial name or number."""
    term = str(term).strip()
    if term.isdigit():
        s = find_student("pg8000", conn, term)
        return [s] if s else []

    rows = conn.run("""
        SELECT s.id, s."globalNumber", s.name, s.phone, b.name as branch_name,
               (SELECT COUNT(*) FROM "Voucher" v WHERE v."studentId" = s.id) as vouchers_count,
               (SELECT COUNT(*) FROM "Enrollment" e WHERE e."studentId" = s.id) as enrollments_count
        FROM "Student" s
        LEFT JOIN "Branch" b ON b.id = s."registeredBranchId"
        LIMIT 1000
    """)

    norm_term = normalize_arabic(term)
    matches = []
    for r in rows:
        name = r[2] or ""
        if norm_term in normalize_arabic(name):
            matches.append({
                "id": r[0],
                "globalNumber": r[1],
                "name": r[2],
                "phone": r[3],
                "branch_name": r[4],
                "vouchers_count": r[5],
                "enrollments_count": r[6],
            })
    return matches[:10]


def print_card(title, s):
    print(f"\n--- {title} ---")
    print(f"  ID Number:  #{s['globalNumber']}")
    print(f"  Name:       {s['name']}")
    print(f"  Phone:      {s['phone'] or 'None'}")
    print(f"  Branch:     {s['branch_name'] or s['registeredBranchId']}")
    print(f"  Vouchers:   {s['vouchers_count']} (Total: {s['vouchers_total']} DZD)")
    print(f"  Enrollments:{s['enrollments_count']}")
    print(f"  Attendance: {s['attendances_count']}")


def execute_merge_transaction(conn, source, target, preferred_name=None, performed_by="termux_cli"):
    """
    Executes atomic merge inside a PostgreSQL transaction.
    Moves all foreign keys safely and removes duplicate student.
    """
    source_id = source["id"]
    target_id = target["id"]

    if source_id == target_id:
        raise ValueError("Source and target are the same student!")

    # Start transaction
    conn.run("BEGIN")
    try:
        summary = {
            "vouchersMoved": 0,
            "enrollmentsMoved": 0,
            "enrollmentsDeduped": 0,
            "attendancesMoved": 0,
            "attendancesDeduped": 0,
            "catchUpsMoved": 0,
            "catchUpsDeduped": 0,
            "parentPhonesMoved": 0,
            "parentPhonesDeduped": 0,
        }

        # 1. Parent Phone Numbers
        target_phones_res = conn.run(
            'SELECT phone FROM "ParentPhoneNumber" WHERE "studentId" = :tid',
            tid=target_id
        )
        target_phone_set = {r[0].strip().replace(" ", "") for r in target_phones_res if r[0]}

        source_phones_res = conn.run(
            'SELECT id, phone FROM "ParentPhoneNumber" WHERE "studentId" = :sid',
            sid=source_id
        )
        for pid, phone in source_phones_res:
            clean = (phone or "").strip().replace(" ", "")
            if clean in target_phone_set:
                conn.run('DELETE FROM "ParentPhoneNumber" WHERE id = :id', id=pid)
                summary["parentPhonesDeduped"] += 1
            else:
                conn.run(
                    'UPDATE "ParentPhoneNumber" SET "studentId" = :tid WHERE id = :id',
                    tid=target_id, id=pid
                )
                target_phone_set.add(clean)
                summary["parentPhonesMoved"] += 1

        # 2. Vouchers
        v_res = conn.run(
            'UPDATE "Voucher" SET "studentId" = :tid WHERE "studentId" = :sid RETURNING id',
            tid=target_id, sid=source_id
        )
        summary["vouchersMoved"] = len(v_res)

        # 3. Enrollments
        target_enr_res = conn.run(
            'SELECT id, "classId", "academicYearId", "inscriptionFeeCharged" FROM "Enrollment" WHERE "studentId" = :tid',
            tid=target_id
        )
        target_enr_map = {(r[1], r[2]): (r[0], r[3]) for r in target_enr_res}

        source_enr_res = conn.run(
            'SELECT id, "classId", "academicYearId", "inscriptionFeeCharged", "inscriptionFeeAmount" FROM "Enrollment" WHERE "studentId" = :sid',
            sid=source_id
        )
        for s_eid, s_cid, s_ayid, s_fee_charged, s_fee_amt in source_enr_res:
            key = (s_cid, s_ayid)
            if key in target_enr_map:
                t_eid, t_fee_charged = target_enr_map[key]
                if s_fee_charged and not t_fee_charged:
                    conn.run(
                        'UPDATE "Enrollment" SET "inscriptionFeeCharged" = true, "inscriptionFeeAmount" = :amt WHERE id = :id',
                        amt=s_fee_amt, id=t_eid
                    )
                # Re-point transfers
                conn.run(
                    'UPDATE "EnrollmentTransfer" SET "fromEnrollmentId" = :teid WHERE "fromEnrollmentId" = :seid',
                    teid=t_eid, seid=s_eid
                )
                conn.run(
                    'UPDATE "EnrollmentTransfer" SET "toEnrollmentId" = :teid WHERE "toEnrollmentId" = :seid',
                    teid=t_eid, seid=s_eid
                )
                conn.run('DELETE FROM "Enrollment" WHERE id = :id', id=s_eid)
                summary["enrollmentsDeduped"] += 1
            else:
                conn.run(
                    'UPDATE "Enrollment" SET "studentId" = :tid WHERE id = :id',
                    tid=target_id, id=s_eid
                )
                target_enr_map[key] = (s_eid, s_fee_charged)
                summary["enrollmentsMoved"] += 1

        # 4. Attendance
        target_att_res = conn.run(
            'SELECT id, "lessonId", status FROM "Attendance" WHERE "studentId" = :tid',
            tid=target_id
        )
        target_att_map = {r[1]: (r[0], r[2]) for r in target_att_res}

        source_att_res = conn.run(
            'SELECT id, "lessonId", status, justification FROM "Attendance" WHERE "studentId" = :sid',
            sid=source_id
        )
        for s_aid, s_lid, s_status, s_just in source_att_res:
            if s_lid in target_att_map:
                t_aid, t_status = target_att_map[s_lid]
                if t_status == "ABSENT" and s_status in ("PRESENT", "LATE"):
                    conn.run(
                        'UPDATE "Attendance" SET status = :st, justification = :jst WHERE id = :id',
                        st=s_status, jst=s_just, id=t_aid
                    )
                conn.run('DELETE FROM "Attendance" WHERE id = :id', id=s_aid)
                summary["attendancesDeduped"] += 1
            else:
                conn.run(
                    'UPDATE "Attendance" SET "studentId" = :tid WHERE id = :id',
                    tid=target_id, id=s_aid
                )
                target_att_map[s_lid] = (s_aid, s_status)
                summary["attendancesMoved"] += 1

        # 5. Catch-Up Attendance
        target_cups_res = conn.run(
            'SELECT "missedLessonId" FROM "CatchUpAttendance" WHERE "studentId" = :tid',
            tid=target_id
        )
        target_cup_set = {r[0] for r in target_cups_res}

        source_cups_res = conn.run(
            'SELECT id, "missedLessonId" FROM "CatchUpAttendance" WHERE "studentId" = :sid',
            sid=source_id
        )
        for s_cid, s_mlid in source_cups_res:
            if s_mlid in target_cup_set:
                conn.run('DELETE FROM "CatchUpAttendance" WHERE id = :id', id=s_cid)
                summary["catchUpsDeduped"] += 1
            else:
                conn.run(
                    'UPDATE "CatchUpAttendance" SET "studentId" = :tid WHERE id = :id',
                    tid=target_id, id=s_cid
                )
                target_cup_set.add(s_mlid)
                summary["catchUpsMoved"] += 1

        # 6. Workshop Participant
        target_wp_res = conn.run(
            'SELECT id, "workshopId", "totalPaid", "totalRefunded" FROM "WorkshopParticipant" WHERE "studentId" = :tid',
            tid=target_id
        )
        target_wp_map = {r[1]: (r[0], r[2], r[3]) for r in target_wp_res}

        source_wp_res = conn.run(
            'SELECT id, "workshopId", "totalPaid", "totalRefunded" FROM "WorkshopParticipant" WHERE "studentId" = :sid',
            sid=source_id
        )
        for s_wpid, s_wid, s_paid, s_ref in source_wp_res:
            if s_wid in target_wp_map:
                t_wpid, t_paid, t_ref = target_wp_map[s_wid]
                new_paid = float(t_paid or 0) + float(s_paid or 0)
                new_ref = float(t_ref or 0) + float(s_ref or 0)
                conn.run(
                    'UPDATE "WorkshopParticipant" SET "totalPaid" = :p, "totalRefunded" = :r WHERE id = :id',
                    p=new_paid, r=new_ref, id=t_wpid
                )
                conn.run('DELETE FROM "WorkshopParticipant" WHERE id = :id', id=s_wpid)
            else:
                conn.run(
                    'UPDATE "WorkshopParticipant" SET "studentId" = :tid WHERE id = :id',
                    tid=target_id, id=s_wpid
                )

        # 7. Workshop Attendance
        target_wa_res = conn.run(
            'SELECT "sessionId" FROM "WorkshopAttendance" WHERE "studentId" = :tid',
            tid=target_id
        )
        target_wa_set = {r[0] for r in target_wa_res}

        source_wa_res = conn.run(
            'SELECT id, "sessionId" FROM "WorkshopAttendance" WHERE "studentId" = :sid',
            sid=source_id
        )
        for s_waid, s_sid in source_wa_res:
            if s_sid in target_wa_set:
                conn.run('DELETE FROM "WorkshopAttendance" WHERE id = :id', id=s_waid)
            else:
                conn.run(
                    'UPDATE "WorkshopAttendance" SET "studentId" = :tid WHERE id = :id',
                    tid=target_id, id=s_waid
                )
                target_wa_set.add(s_sid)

        # 8. Book Receipts
        target_br_res = conn.run(
            'SELECT "bookId" FROM "BookReceipt" WHERE "studentId" = :tid',
            tid=target_id
        )
        target_br_set = {r[0] for r in target_br_res}

        source_br_res = conn.run(
            'SELECT id, "bookId" FROM "BookReceipt" WHERE "studentId" = :sid',
            sid=source_id
        )
        for s_brid, s_bid in source_br_res:
            if s_bid in target_br_set:
                conn.run('DELETE FROM "BookReceipt" WHERE id = :id', id=s_brid)
            else:
                conn.run(
                    'UPDATE "BookReceipt" SET "studentId" = :tid WHERE id = :id',
                    tid=target_id, id=s_brid
                )
                target_br_set.add(s_bid)

        # 9. Book Copy Distribution
        target_bcd_res = conn.run(
            'SELECT "bookDropId" FROM "BookCopyDistribution" WHERE "studentId" = :tid',
            tid=target_id
        )
        target_bcd_set = {r[0] for r in target_bcd_res}

        source_bcd_res = conn.run(
            'SELECT id, "bookDropId" FROM "BookCopyDistribution" WHERE "studentId" = :sid',
            sid=source_id
        )
        for s_bcdid, s_bdid in source_bcd_res:
            if s_bdid in target_bcd_set:
                conn.run('DELETE FROM "BookCopyDistribution" WHERE id = :id', id=s_bcdid)
            else:
                conn.run(
                    'UPDATE "BookCopyDistribution" SET "studentId" = :tid WHERE id = :id',
                    tid=target_id, id=s_bcdid
                )
                target_bcd_set.add(s_bdid)

        # 10. LevelTest
        conn.run(
            'UPDATE "LevelTest" SET "studentId" = :tid WHERE "studentId" = :sid',
            tid=target_id, sid=source_id
        )

        # 11. Family
        source_fam_payer = conn.run(
            'SELECT id FROM "Family" WHERE "payerStudentId" = :sid',
            sid=source_id
        )
        if source_fam_payer:
            fam_id = source_fam_payer[0][0]
            target_fam_payer = conn.run(
                'SELECT id FROM "Family" WHERE "payerStudentId" = :tid',
                tid=target_id
            )
            if not target_fam_payer:
                conn.run(
                    'UPDATE "Family" SET "payerStudentId" = :tid WHERE id = :id',
                    tid=target_id, id=fam_id
                )
            else:
                conn.run(
                    'UPDATE "Family" SET "payerStudentId" = NULL WHERE id = :id',
                    id=fam_id
                )

        # Backfill target familyId if empty
        conn.run(
            """UPDATE "Student" SET "familyId" = (SELECT "familyId" FROM "Student" WHERE id = :sid)
               WHERE id = :tid AND "familyId" IS NULL AND (SELECT "familyId" FROM "Student" WHERE id = :sid) IS NOT NULL""",
            tid=target_id, sid=source_id
        )

        # 12. Backfill target phone / address / info
        t_phone = target.get("phone")
        s_phone = source.get("phone")
        fill_phone = s_phone if (not t_phone or t_phone in ("غير متوفر", "None", "")) and s_phone not in ("غير متوفر", "None", "") else t_phone
        fill_addr = target.get("address") or source.get("address")
        fill_name = preferred_name if preferred_name else target.get("name")

        conn.run(
            """UPDATE "Student"
               SET phone = :phone, address = :addr, name = :name
               WHERE id = :tid""",
            phone=fill_phone, addr=fill_addr, name=fill_name, tid=target_id
        )

        # 13. AuditLog
        details_str = json.dumps({
            "source": {"id": source_id, "globalNumber": source["globalNumber"], "name": source["name"]},
            "target": {"id": target_id, "globalNumber": target["globalNumber"], "name": target["name"]},
            "summary": summary
        }, ensure_ascii=False)

        conn.run(
            """INSERT INTO "AuditLog" ("entityType", "entityId", action, "branchId", "userId", "userName", details, timestamp)
               VALUES ('Student', :tid, 'MERGE_STUDENT', :bid, :uid, :uname, :details, NOW())""",
            tid=target_id, bid=target["registeredBranchId"], uid=performed_by, uname=performed_by, details=details_str
        )

        # 14. Delete source student
        conn.run('DELETE FROM "Student" WHERE id = :sid', sid=source_id)

        # Commit transaction
        conn.run("COMMIT")
        return summary
    except Exception as e:
        conn.run("ROLLBACK")
        raise e


def run_scan(conn):
    """Scan the database for candidate duplicate student pairs."""
    print("\n🔍 Scanning database for duplicate candidates...")
    rows = conn.run("""
        SELECT s.id, s."globalNumber", s.name, s.phone, s."registeredBranchId", b.name,
               (SELECT COUNT(*) FROM "Voucher" v WHERE v."studentId" = s.id) as vouchers,
               (SELECT COUNT(*) FROM "Enrollment" e WHERE e."studentId" = s.id) as enrollments
        FROM "Student" s
        LEFT JOIN "Branch" b ON b.id = s."registeredBranchId"
    """)

    students = []
    for r in rows:
        students.append({
            "id": r[0],
            "globalNumber": r[1],
            "name": r[2],
            "phone": r[3],
            "registeredBranchId": r[4],
            "branch_name": r[5],
            "vouchers": r[6],
            "enrollments": r[7],
        })

    # Group by phone
    phone_map = {}
    for s in students:
        p = re.sub(r"[^0-9]", "", s["phone"] or "")
        if len(p) >= 8 and p not in ("00000000", "0000000000"):
            phone_map.setdefault(p, []).append(s)

    pairs = []
    for p, group in phone_map.items():
        if len(group) >= 2:
            for i in range(len(group)):
                for j in range(i + 1, len(group)):
                    a = group[i]
                    b = group[j]
                    pairs.append({
                        "source": a if a["vouchers"] <= b["vouchers"] else b,
                        "target": b if a["vouchers"] <= b["vouchers"] else a,
                        "reason": f"Same phone number ({p})"
                    })

    # Group by normalized name
    name_map = {}
    for s in students:
        n = normalize_arabic(s["name"])
        if n:
            name_map.setdefault(n, []).append(s)

    for n, group in name_map.items():
        if len(group) >= 2:
            for i in range(len(group)):
                for j in range(i + 1, len(group)):
                    a = group[i]
                    b = group[j]
                    if not any(p["source"]["id"] == a["id"] and p["target"]["id"] == b["id"] for p in pairs):
                        pairs.append({
                            "source": a if a["vouchers"] <= b["vouchers"] else b,
                            "target": b if a["vouchers"] <= b["vouchers"] else a,
                            "reason": f'Normalized name match ("{n}")'
                        })

    print(f"\nFound {len(pairs)} candidate duplicate pair(s).\n")
    for idx, pair in enumerate(pairs):
        print(f"\n========================================================")
        print(f"Candidate {idx + 1} of {len(pairs)} — Reason: {pair['reason']}")
        src = pair["source"]
        tgt = pair["target"]
        print(f"  [DELETE] Duplicate: #{src['globalNumber']} - {src['name']} (Phone: {src['phone']}, Vouchers: {src['vouchers']}, Enr: {src['enrollments']})")
        print(f"  [KEEP]   Keeper:    #{tgt['globalNumber']} - {tgt['name']} (Phone: {tgt['phone']}, Vouchers: {tgt['vouchers']}, Enr: {tgt['enrollments']})")

        try:
            choice = input("\nAction: [m]erge / [s]wap / [k]ip / [q]uit: ").strip().lower()
        except (KeyboardInterrupt, EOFError):
            print("\nExiting.")
            break

        if choice == "q":
            print("Scan aborted.")
            break
        elif choice == "m":
            try:
                summary = execute_merge_transaction(conn, src, tgt, performed_by="termux_scan")
                print(f"✅ Merged #{src['globalNumber']} into #{tgt['globalNumber']} successfully!")
            except Exception as e:
                print(f"❌ Error: {e}")
        elif choice == "s":
            try:
                summary = execute_merge_transaction(conn, tgt, src, performed_by="termux_scan")
                print(f"✅ Merged #{tgt['globalNumber']} into #{src['globalNumber']} successfully!")
            except Exception as e:
                print(f"❌ Error: {e}")
        else:
            print("Skipped.")


def main():
    parser = argparse.ArgumentParser(description="Massinissa School Student Merge CLI")
    parser.add_argument("source", nargs="?", help="Duplicate student Global Number or UUID to delete")
    parser.add_argument("target", nargs="?", help="Keeper student Global Number or UUID to keep")
    parser.add_argument("--source", dest="source_flag", help="Duplicate student identifier")
    parser.add_argument("--target", dest="target_flag", help="Keeper student identifier")
    parser.add_argument("--search", help="Search students by name or global number")
    parser.add_argument("--scan", action="store_true", help="Scan DB for duplicate candidates")
    parser.add_argument("--yes", "-y", action="store_true", help="Auto-confirm merge")
    parser.add_argument("--db", help="PostgreSQL connection string")

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

    if args.scan:
        run_scan(conn)
        return

    if args.search:
        results = search_students(conn, args.search)
        if not results:
            print(f"No students found matching '{args.search}'.")
        else:
            print(f"\nResults for '{args.search}':")
            for r in results:
                print(f"  #{r['globalNumber']} - {r['name']} | Phone: {r['phone'] or 'None'} | Branch: {r['branch_name']} | Vouchers: {r['vouchers_count']}")
        return

    source_arg = args.source_flag or args.source
    target_arg = args.target_flag or args.target

    # Interactive wizard
    if not source_arg or not target_arg:
        print("\n=============================================")
        print("      🎓 MASSINISSA STUDENT MERGE CLI        ")
        print("=============================================")

        if not source_arg:
            term = input("Enter DUPLICATE student to delete (Global # or name): ").strip()
            if not term:
                print("Cancelled.")
                return
            matches = search_students(conn, term)
            if not matches:
                print(f"❌ No student found for '{term}'.")
                return
            elif len(matches) == 1:
                source_arg = str(matches[0]["globalNumber"])
            else:
                print("\nMatches found:")
                for i, m in enumerate(matches):
                    print(f"  [{i+1}] #{m['globalNumber']} - {m['name']} ({m['branch_name']}, Vouchers: {m['vouchers_count']})")
                pick = input(f"Select duplicate (1-{len(matches)}): ").strip()
                try:
                    idx = int(pick) - 1
                    source_arg = str(matches[idx]["globalNumber"])
                except Exception:
                    print("Invalid selection.")
                    return

        if not target_arg:
            term = input("Enter KEEPER student to keep (Global # or name): ").strip()
            if not term:
                print("Cancelled.")
                return
            matches = search_students(conn, term)
            if not matches:
                print(f"❌ No student found for '{term}'.")
                return
            elif len(matches) == 1:
                target_arg = str(matches[0]["globalNumber"])
            else:
                print("\nMatches found:")
                for i, m in enumerate(matches):
                    print(f"  [{i+1}] #{m['globalNumber']} - {m['name']} ({m['branch_name']}, Vouchers: {m['vouchers_count']})")
                pick = input(f"Select keeper (1-{len(matches)}): ").strip()
                try:
                    idx = int(pick) - 1
                    target_arg = str(matches[idx]["globalNumber"])
                except Exception:
                    print("Invalid selection.")
                    return

    source_s = find_student(driver, conn, source_arg)
    target_s = find_student(driver, conn, target_arg)

    if not source_s:
        print(f"❌ Duplicate student '{source_arg}' not found.")
        sys.exit(1)
    if not target_s:
        print(f"❌ Keeper student '{target_arg}' not found.")
        sys.exit(1)

    print_card("DUPLICATE (Will be DELETED)", source_s)
    print_card("KEEPER (Will receive all records)", target_s)

    print("\n⚠️  MERGE PLAN:")
    print(f"  - Move {source_s['vouchers_count']} vouchers ({source_s['vouchers_total']} DZD)")
    print(f"  - Move/Deduplicate {source_s['enrollments_count']} enrollments")
    print(f"  - Move/Deduplicate {source_s['attendances_count']} attendances")
    print(f"  - Delete duplicate #{source_s['globalNumber']} permanently")

    if not args.yes:
        confirm = input("\nExecute merge now? [y/N]: ").strip().lower()
        if confirm not in ("y", "yes"):
            print("Merge aborted.")
            return

    print("\nExecuting atomic transaction...")
    try:
        summary = execute_merge_transaction(conn, source_s, target_s, performed_by="termux_cli")
        print("\n=============================================")
        print("🎉 MERGE COMPLETED SUCCESSFULLY!")
        print("=============================================")
        print(f"Keeper:  #{target_s['globalNumber']} - {target_s['name']}")
        print(f"Deleted: #{source_s['globalNumber']} - {source_s['name']}")
        print(f"  - Vouchers moved:      {summary['vouchersMoved']}")
        print(f"  - Enrollments moved:   {summary['enrollmentsMoved']} (Deduped: {summary['enrollmentsDeduped']})")
        print(f"  - Attendances moved:   {summary['attendancesMoved']} (Deduped: {summary['attendancesDeduped']})")
        print(f"  - Catch-ups moved:     {summary['catchUpsMoved']} (Deduped: {summary['catchUpsDeduped']})")
        print(f"  - Parent phones moved: {summary['parentPhonesMoved']}")
    except Exception as e:
        print(f"\n❌ Merge transaction failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
