"""
Generate synthetic mock CSV datasets for Phase 3–5 notebook pipeline testing.

Purpose: local pipeline smoke-test only.
NOT for real research, thesis results, or model performance claims.

Output:
  notebooks/data/raw/session_20260710_MOCK001.csv
  notebooks/data/raw/attempt_20260710_MOCK001.csv
  notebooks/data/raw/event_20260710_MOCK001.csv   ← Phase 5 M5.2: sql_block journeys
"""

import random
import struct
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

# ── Reproducibility ───────────────────────────────────────────────────────────
SEED = 42
rng  = np.random.default_rng(SEED)
random.seed(SEED)

# ── Output paths ──────────────────────────────────────────────────────────────
# Use script-relative path so the script works from any CWD
# (project root OR notebooks/).
OUT_DIR = Path(__file__).resolve().parent / "data" / "raw"
OUT_DIR.mkdir(parents=True, exist_ok=True)
SESSION_FILE  = OUT_DIR / "session_20260710_MOCK001.csv"
ATTEMPT_FILE  = OUT_DIR / "attempt_20260710_MOCK001.csv"
EVENT_FILE    = OUT_DIR / "event_20260710_MOCK001.csv"
SEQUENCE_FILE = OUT_DIR / "sequence_20260710_MOCK001.csv"   # Phase 5 M5.6
OUTCOME_FILE  = OUT_DIR / "outcome_20260710_MOCK001.csv"    # Phase 5 M5.6

# ── Dataset constants ─────────────────────────────────────────────────────────
N_LEARNERS     = 80
BASE_DATE      = datetime(2026, 3, 1)
BATCHES        = ["MOCK_BATCH_001", "MOCK_BATCH_002"]
LEARNER_GROUPS = ["G1", "G2", "G3", "G4"]
ERROR_TYPES    = [
    "syntax_error", "semantic_error", "missing_where_clause",
    "wrong_join", "aggregation_error",
]

TASKS = [
    {"task_id": "T001", "task_type": "sql_text",  "difficulty": 1},
    {"task_id": "T002", "task_type": "sql_block", "difficulty": 2},
    {"task_id": "T003", "task_type": "sql_text",  "difficulty": 2},
    {"task_id": "T004", "task_type": "sql_block", "difficulty": 3},
    {"task_id": "T005", "task_type": "sql_text",  "difficulty": 3},
    {"task_id": "T006", "task_type": "sql_block", "difficulty": 4},
    {"task_id": "T007", "task_type": "sql_text",  "difficulty": 4},
    {"task_id": "T008", "task_type": "sql_block", "difficulty": 5},
]

# ── Tuning knobs ──────────────────────────────────────────────────────────────
AT_RISK_PRONE_RATE   = 0.26   # → at_risk rate ~35–40%
MISSING_SUB_RATE     = 0.07   # → missing submission rows ~6–8%
REVIEW_SCORE_RATE    = 0.30   # → review_score non-null ~28–32% of submitted rows
NO_ATTEMPT_FRAC      = 0.04   # → sessions without attempts ~3–5%
TASKS_PER_LEARNER    = (6, 9) # → 80 × avg 7.5 ≈ 600 sessions

# ── Learner profiles ──────────────────────────────────────────────────────────
learner_ids   = [f"S{i:04d}" for i in range(1, N_LEARNERS + 1)]
learner_group = {lid: rng.choice(LEARNER_GROUPS) for lid in learner_ids}
learner_batch = {lid: rng.choice(BATCHES)        for lid in learner_ids}

at_risk_prone = set(
    rng.choice(learner_ids, size=int(N_LEARNERS * AT_RISK_PRONE_RATE), replace=False).tolist()
)

# ── Helpers ───────────────────────────────────────────────────────────────────
def clamp(v, lo, hi):
    return max(lo, min(hi, v))

def c2l_score(base_ratio: float, noise: float = 0.10) -> float:
    return round(float(np.clip(base_ratio + rng.uniform(-noise, noise), 0.0, 1.0)), 3)

# ── Build sessions ────────────────────────────────────────────────────────────
session_rows = []

for lid in learner_ids:
    batch  = learner_batch[lid]
    lg     = learner_group[lid]
    prone  = lid in at_risk_prone

    n_tasks    = int(rng.integers(TASKS_PER_LEARNER[0], TASKS_PER_LEARNER[1]))
    task_sample = random.sample(TASKS, k=n_tasks)

    for task in task_sample:
        tid        = task["task_id"]
        ttype      = task["task_type"]
        difficulty = task["difficulty"]

        # ── Missing submission rows (rule 9) ──────────────────────────────
        if rng.random() < MISSING_SUB_RATE:
            # All score/time/2C3L columns are null
            total_run     = int(rng.integers(1, 4))
            total_attempt = int(rng.integers(1, 4))
            hint_viewed   = bool(rng.random() < 0.60)
            duration      = float(rng.integers(30, 300))

            session_rows.append({
                "academy_member_id":         lid,
                "batch_id":                  batch,
                "task_id":                   tid,
                "task_type":                 ttype,
                "learner_group":             lg,
                "task_difficulty_level":     difficulty,
                "max_score":                 100,
                "auto_score":                None,
                "review_score":              None,
                "total_run_count":           total_run,
                "total_attempt_count":       total_attempt,
                "time_to_first_correct_sec": None,
                "hint_viewed":               hint_viewed,
                "session_duration_sec":      duration,
                "submitted_at":              None,
                "c1_correctness_result":     None,
                "c2_semantic_consistency":   None,
                "l1_logical_reasoning":      None,
                "l2_learning_process":       None,
                "l3_difficulty_complexity":  None,
            })
            continue

        # ── Submitted session ─────────────────────────────────────────────
        if prone:
            # At-risk prone: lower scores, skewed toward failing range
            auto_score = float(rng.integers(15, 68))
        else:
            # Non-risk: most scores above pass threshold (60)
            lo = clamp(62 - difficulty * 3, 45, 72)
            auto_score = float(rng.integers(lo, 101))

        # review_score: ~30% of submitted rows (rule 7)
        if rng.random() < REVIEW_SCORE_RATE:
            delta        = int(rng.integers(-5, 6))
            review_score = float(clamp(auto_score + delta, 0, 100))
        else:
            review_score = None

        effective  = review_score if review_score is not None else auto_score
        is_at_risk = effective < 100 * 0.6

        # ── Behavioral signals correlated with risk ────────────────────────
        if is_at_risk:
            total_run     = int(rng.integers(6, 20))
            total_attempt = int(rng.integers(5, 18))
            ttfc          = float(rng.integers(200, 900))
            hint_viewed   = bool(rng.random() < 0.68)
            duration      = float(rng.integers(450, 1800))
        else:
            total_run     = int(rng.integers(1, 7))
            total_attempt = int(rng.integers(1, 5))
            ttfc          = float(rng.integers(20, 240))
            hint_viewed   = bool(rng.random() < 0.16)
            duration      = float(rng.integers(80, 580))

        session_start = BASE_DATE + timedelta(
            days=int(rng.integers(0, 60)),
            hours=int(rng.integers(8, 20)),
            minutes=int(rng.integers(0, 60)),
        )
        submitted_dt = session_start + timedelta(
            seconds=int(duration) + int(rng.integers(5, 30))
        )
        submitted_at = submitted_dt.strftime("%Y-%m-%d %H:%M:%S")

        # ── 2C3L oracle scores (post-submission only) ─────────────────────
        perf = effective / 100.0
        c1   = c2l_score(perf * 1.00)
        c2   = c2l_score(perf * 0.95)
        l1   = c2l_score(perf * 0.90)
        l2   = c2l_score(1.0 - clamp(total_attempt / 20.0, 0, 1))
        l3   = c2l_score(1.0 - (difficulty - 1) / 5.0)

        session_rows.append({
            "academy_member_id":         lid,
            "batch_id":                  batch,
            "task_id":                   tid,
            "task_type":                 ttype,
            "learner_group":             lg,
            "task_difficulty_level":     difficulty,
            "max_score":                 100,
            "auto_score":                auto_score,
            "review_score":              review_score,
            "total_run_count":           total_run,
            "total_attempt_count":       total_attempt,
            "time_to_first_correct_sec": ttfc,
            "hint_viewed":               hint_viewed,
            "session_duration_sec":      duration,
            "submitted_at":              submitted_at,
            "c1_correctness_result":     c1,
            "c2_semantic_consistency":   c2,
            "l1_logical_reasoning":      l1,
            "l2_learning_process":       l2,
            "l3_difficulty_complexity":  l3,
        })

df_session = pd.DataFrame(session_rows)

# ── Build attempts ────────────────────────────────────────────────────────────
# Rule 13: ~4% of sessions have no matching attempt records
no_attempt_idx = set(
    df_session.sample(frac=NO_ATTEMPT_FRAC, random_state=SEED).index.tolist()
)

attempt_rows = []

for idx, sess in df_session.iterrows():
    if idx in no_attempt_idx:
        continue

    lid    = sess["academy_member_id"]
    tid    = sess["task_id"]
    batch  = sess["batch_id"]
    prone  = lid in at_risk_prone
    is_missing_sub = pd.isna(sess["submitted_at"])

    n_att = int(rng.integers(1, 4)) if is_missing_sub else max(1, int(sess["total_attempt_count"]))

    # Timeline
    if not is_missing_sub:
        submitted_dt  = datetime.strptime(sess["submitted_at"], "%Y-%m-%d %H:%M:%S")
        session_start = submitted_dt - timedelta(seconds=int(sess["session_duration_sec"]))
        session_end   = submitted_dt
    else:
        session_start = BASE_DATE + timedelta(days=int(rng.integers(0, 60)))
        session_end   = session_start + timedelta(seconds=int(sess["session_duration_sec"]))

    total_secs = max(1, int((session_end - session_start).total_seconds()))

    # Spread attempts evenly, then sort (rule 15: ordered by attempt_no)
    offsets = sorted(rng.integers(0, total_secs, size=n_att).tolist())

    for att_no, offset in enumerate(offsets, start=1):
        is_final = att_no == n_att

        # attempt_type: 'submit' only on final, mostly 'run' otherwise
        if is_final and not is_missing_sub:
            att_type = "submit"
        else:
            att_type = rng.choice(["run", "submit"], p=[0.88, 0.12])

        # Correct probability rises toward final attempt (rule 16)
        progress = att_no / n_att
        if is_final:
            p_correct = 0.80 if not prone else 0.38
        else:
            p_correct = (0.22 + 0.42 * progress) if not prone else (0.07 + 0.16 * progress)

        is_correct = bool(rng.random() < p_correct)

        if is_correct:
            error_type = None
            exec_ms    = float(rng.integers(80, 650))
        else:
            error_type = str(rng.choice(ERROR_TYPES))
            exec_ms    = float(rng.integers(40, 280))

        created_at = (session_start + timedelta(seconds=int(offset))).strftime(
            "%Y-%m-%d %H:%M:%S"
        )

        attempt_rows.append({
            "academy_member_id": lid,
            "batch_id":          batch,
            "task_id":           tid,
            "attempt_no":        att_no,
            "attempt_type":      att_type,
            "is_correct":        is_correct,
            "error_type":        error_type,
            "execution_time_ms": exec_ms,
            "created_at":        created_at,
        })

df_attempt = pd.DataFrame(attempt_rows)

# ── Save sessions + attempts ──────────────────────────────────────────────────
df_session.to_csv(SESSION_FILE, index=False)
# Phase 5 M5.6: add canonical aliases so NB05 can join on batch_code / task_code
df_attempt["batch_code"] = df_attempt["batch_id"]
df_attempt["task_code"]  = df_attempt["task_id"]
df_attempt.to_csv(ATTEMPT_FILE, index=False)

# ── Phase 5 M5.2: Block event journeys for sql_block sessions ─────────────────
# Generates trn_event_logs-compatible rows for block_add / block_delete / block_move
# events. Uses synthetic session IDs and a seeded PRNG (Mulberry32) per session
# to guarantee reproducibility from SEED.
#
# Block vocabulary: 8 canonical SQL clause "blocks" used as mock block_ids.
# These do NOT need to exist in mst_blocks — they are stored in metadata_json.

BLOCK_VOCAB = [
    "BLK_SELECT",
    "BLK_FROM",
    "BLK_WHERE",
    "BLK_JOIN",
    "BLK_GROUP_BY",
    "BLK_HAVING",
    "BLK_ORDER_BY",
    "BLK_LIMIT",
]
CORRECT_SEQUENCE = ["BLK_SELECT", "BLK_FROM", "BLK_WHERE"]


def mulberry32(seed: int):
    """
    Mulberry32 PRNG — same algorithm used in e2e-sim-student-flow.mjs.
    Returns a callable () -> float in [0, 1).
    """
    state = [seed & 0xFFFFFFFF]

    def rand() -> float:
        state[0] = (state[0] + 0x6D2B79F5) & 0xFFFFFFFF
        z = state[0]
        z ^= (z >> 15)
        z = (z * (z | 1)) & 0xFFFFFFFF
        z ^= z + ((z ^ (z >> 7)) * (z | 61) & 0xFFFFFFFF) & 0xFFFFFFFF
        z ^= (z >> 14)
        return (z & 0xFFFFFFFF) / 4294967296.0

    return rand


def pseudo_uuid(rand) -> str:
    """Generate a UUID v4-like string from the provided PRNG (no real randomness needed)."""
    def h4() -> str:
        return format(int(rand() * 0x10000), "04x")
    variants = ["8", "9", "a", "b"]
    return (
        f"{h4()}{h4()}-{h4()}-4{h4()[1:]}"
        f"-{variants[int(rand() * 4)]}{h4()[1:]}-{h4()}{h4()}{h4()}"
    )


def generate_block_journey(
    is_at_risk: bool,
    rand,
    max_duration_sec: float = 600.0,
) -> list[dict]:
    """
    Generate a list of block events (block_add / block_delete / block_move)
    for one sql_block session.

    Non-risk: linear add of CORRECT_SEQUENCE, optional single reorder.
    At-risk:  mixed adds (correct+wrong), deletes, moves, incomplete result.
    """
    events: list[dict] = []
    workspace: list[dict] = []  # {"block_id": ..., "instance_id": ...}

    # Time allocation: spread events from 5–90% of session duration
    start_frac  = 0.05 + rand() * 0.15
    end_frac    = 0.60 + rand() * 0.30
    current_sec = start_frac * max_duration_sec
    time_end    = end_frac   * max_duration_sec

    def advance(min_gap: float, max_gap: float) -> float:
        nonlocal current_sec
        gap         = min_gap + rand() * (max_gap - min_gap)
        current_sec = min(current_sec + gap, time_end)
        return round(current_sec, 1)

    def add_block(block_id: str) -> None:
        iid = pseudo_uuid(rand)
        workspace.append({"block_id": block_id, "instance_id": iid})
        events.append({
            "event_type":        "block_add",
            "block_id":          block_id,
            "block_instance_id": iid,
            "position":          None,
            "duration_from_start": advance(3, 15),
        })

    def delete_block(idx: int) -> None:
        if idx >= len(workspace):
            return
        item = workspace.pop(idx)
        events.append({
            "event_type":        "block_delete",
            "block_id":          item["block_id"],
            "block_instance_id": item["instance_id"],
            "position":          None,
            "duration_from_start": advance(2, 10),
        })

    def move_block(from_idx: int, to_idx: int) -> None:
        if from_idx == to_idx or len(workspace) < 2:
            return
        item = workspace.pop(from_idx)
        workspace.insert(to_idx, item)
        events.append({
            "event_type":        "block_move",
            "block_id":          item["block_id"],
            "block_instance_id": item["instance_id"],
            "position":          to_idx,
            "duration_from_start": advance(2, 8),
        })

    if not is_at_risk:
        # Linear journey: add correct blocks in order
        for bid in CORRECT_SEQUENCE:
            add_block(bid)
        # 30% chance of one misplacement then correction
        if len(workspace) >= 2 and rand() < 0.3:
            last = len(workspace) - 1
            move_block(last, last - 1)
            if rand() < 0.7:
                move_block(last - 1, last)

    else:
        # Exploratory journey: add 4–8 blocks (mixed), delete some, move some
        target_adds = 4 + int(rand() * 5)
        wrong_pool  = [b for b in BLOCK_VOCAB if b not in CORRECT_SEQUENCE]

        for _ in range(target_adds):
            if wrong_pool and rand() < 0.4:
                add_block(wrong_pool[int(rand() * len(wrong_pool))])
            else:
                add_block(CORRECT_SEQUENCE[int(rand() * len(CORRECT_SEQUENCE))])

        delete_count = 1 + int(rand() * min(3, max(1, len(workspace) - 1)))
        for _ in range(delete_count):
            if len(workspace) > 1:
                delete_block(int(rand() * len(workspace)))

        move_count = 1 + int(rand() * 2)
        for _ in range(move_count):
            if len(workspace) >= 2:
                fi = int(rand() * len(workspace))
                ti = int(rand() * len(workspace))
                if fi != ti:
                    move_block(fi, ti)

    return events


# Derive seed per session from global SEED + row index (same derivation as mulberry32 mix)
def derive_seed(base: int, *parts: int) -> int:
    s = base & 0xFFFFFFFF
    for p in parts:
        s = ((s ^ (p & 0xFFFFFFFF)) * 0x9E3779B9) & 0xFFFFFFFF
        s = (s ^ (s >> 16)) & 0xFFFFFFFF
    return s


# Build block events for all sql_block sessions
sql_block_mask = df_session["task_type"] == "sql_block"
sql_block_df   = df_session[sql_block_mask].reset_index(drop=True)

event_rows = []
for row_idx, row in sql_block_df.iterrows():
    lid       = row["academy_member_id"]
    tid       = row["task_id"]
    batch     = row["batch_id"]
    prone     = lid in at_risk_prone

    effective_score = row["review_score"] if pd.notna(row["review_score"]) else row["auto_score"]
    is_at_risk = (
        pd.isna(effective_score)
        or effective_score < row["max_score"] * 0.6
    )

    # Synthetic session_id: stable per learner × task × row index
    syn_session_id = f"mock-ses-{lid}-{tid}-{row_idx:05d}"

    # Per-session seeded PRNG: combines global SEED with row position
    seed_val = derive_seed(SEED, hash(lid) & 0xFFFFFFFF, hash(tid) & 0xFFFFFFFF, int(row_idx))
    rand_fn  = mulberry32(seed_val)

    max_dur = float(row["session_duration_sec"]) if pd.notna(row["session_duration_sec"]) else 300.0

    journey = generate_block_journey(bool(is_at_risk), rand_fn, max_dur)

    for ev_order, ev in enumerate(journey, start=1):
        event_rows.append({
            "session_id":          syn_session_id,
            "academy_member_id":   lid,
            "batch_id":            batch,
            "task_id":             tid,
            "event_type":          ev["event_type"],
            "block_id":            ev["block_id"],
            "block_instance_id":   ev["block_instance_id"],
            "position":            ev["position"],
            "event_order":         ev_order,
            "duration_from_start": ev["duration_from_start"],
        })

df_event = pd.DataFrame(event_rows) if event_rows else pd.DataFrame(columns=[
    "session_id", "academy_member_id", "batch_id", "task_id",
    "event_type", "block_id", "block_instance_id", "position",
    "event_order", "duration_from_start",
])
df_event.to_csv(EVENT_FILE, index=False)

# ── Phase 5 M5.6: Sequence CSV (NB05 input) ──────────────────────────────────
# Produces vw_dataset_sequence_level-compatible rows for all sessions:
#   sql_text  → sql_run / sql_error / sql_success / submit_answer / session_end
#   sql_block → block_add / block_delete / block_move / submit_answer / session_end

# Lookup: (academy_member_id, task_id) → sorted block events
_blk_ev: dict[tuple, list[dict]] = {}
if not df_event.empty:
    for (_lid, _tid), _grp in df_event.groupby(["academy_member_id", "task_id"]):
        _blk_ev[(_lid, _tid)] = _grp.sort_values("event_order").to_dict("records")

# Lookup: (academy_member_id, task_id) → sorted attempts
_att: dict[tuple, list[dict]] = {}
for _, _att_row in df_attempt.iterrows():
    _k = (_att_row["academy_member_id"], _att_row["task_id"])
    _att.setdefault(_k, []).append(_att_row)

_ev_ctr = 0

def _mk_ev(etype: str, d: float, sess_lid: str, sess_tid: str, sess_batch: str,
           sess_ttype: str, sess_id: str, sess_status: str, sess_start_str: str,
           sess_start_dt, sess_mode: str) -> dict:
    global _ev_ctr
    _ev_ctr += 1
    ts = (sess_start_dt + timedelta(seconds=d)).strftime("%Y-%m-%dT%H:%M:%S")
    return {
        "academy_member_id":   sess_lid,
        "batch_code":          sess_batch,
        "task_code":           sess_tid,
        "task_type":           sess_ttype,
        "session_id":          sess_id,
        "session_status":      sess_status,
        "session_started_at":  sess_start_str,
        "event_id":            f"mock-ev-{_ev_ctr:08d}",
        "event_order":         0,  # per-session counter assigned below
        "event_type":          etype,
        "event_value":         "",
        "duration_from_start": round(d, 1),
        "event_time":          ts,
        "metadata_json":       "{}",
        "set_family":          "assignment",
        "learning_mode":       sess_mode,
    }

seq_rows: list[dict] = []

for _si, _sess in df_session.iterrows():
    _lid    = _sess["academy_member_id"]
    _tid    = _sess["task_id"]
    _ttype  = _sess["task_type"]
    _batch  = _sess["batch_id"]
    _dur    = float(_sess["session_duration_sec"]) if pd.notna(_sess["session_duration_sec"]) else 300.0
    _sub_at = _sess["submitted_at"]
    _is_sub = pd.notna(_sub_at)

    _sess_id  = f"mock-ses-{_lid}-{_tid}-{_si:05d}"
    _mode     = "block_based" if _ttype == "sql_block" else "text_based"
    _status   = "completed" if _is_sub else "incomplete"

    if _is_sub:
        _sub_dt   = datetime.strptime(str(_sub_at), "%Y-%m-%d %H:%M:%S")
        _start_dt = _sub_dt - timedelta(seconds=_dur)
    else:
        _start_dt = BASE_DATE + timedelta(days=int(_si) % 60, hours=8 + int(_si) % 12)

    _start_str = _start_dt.strftime("%Y-%m-%dT%H:%M:%S")

    def _mke(et: str, d: float) -> dict:
        return _mk_ev(et, d, _lid, _tid, _batch, _ttype,
                      _sess_id, _status, _start_str, _start_dt, _mode)

    _sess_evs: list[dict] = []
    if _ttype == "sql_block":
        _bevs  = _blk_ev.get((_lid, _tid), [])
        _last  = 5.0
        for _bev in _bevs:
            _d = float(_bev["duration_from_start"])
            _sess_evs.append(_mke(_bev["event_type"], _d))
            _last = max(_last, _d)
        if _is_sub:
            _sess_evs.append(_mke("submit_answer", _last + 5.0))
        _sess_evs.append(_mke("session_end", min(_last + 10.0, _dur)))
    else:
        _atts = sorted(_att.get((_lid, _tid), []),
                       key=lambda _a: int(_a.get("attempt_no", 0)))
        _n = len(_atts)
        for _i, _a in enumerate(_atts):
            _d = _dur * (0.10 + 0.75 * (_i / max(_n, 1)))
            _sess_evs.append(_mke("sql_run", _d))
            _sess_evs.append(_mke("sql_success" if _a.get("is_correct") else "sql_error", _d + 1.5))
        if _is_sub:
            _sess_evs.append(_mke("submit_answer", _dur * 0.90))
        _sess_evs.append(_mke("session_end", _dur))

    # Assign per-session event_order (1-based, sequential)
    for _o, _r in enumerate(_sess_evs, start=1):
        _r["event_order"] = _o
    seq_rows.extend(_sess_evs)

_SEQ_COLS = [
    "academy_member_id","batch_code","task_code","task_type","session_id",
    "session_status","session_started_at","event_id","event_order","event_type",
    "event_value","duration_from_start","event_time","metadata_json",
    "set_family","learning_mode",
]
df_sequence = pd.DataFrame(seq_rows, columns=_SEQ_COLS) if seq_rows else pd.DataFrame(columns=_SEQ_COLS)
df_sequence.to_csv(SEQUENCE_FILE, index=False)

# ── Phase 5 M5.6: Outcome CSV (NB05 target labels) ───────────────────────────
# One row per submitted session: total_2c3l_score + at_risk proxy label.
# label_source="auto_generated" / label_validity="pilot_only" mark this as mock.

df_session["_eff"]     = df_session["review_score"].combine_first(df_session["auto_score"])
df_session["_at_risk"] = (
    df_session["submitted_at"].isna() |
    (df_session["_eff"] < df_session["max_score"] * 0.6)
).astype(int)

_C1 = "c1_correctness_result"
_C2 = "c2_semantic_consistency"
_L1 = "l1_logical_reasoning"
_L2 = "l2_learning_process"
_L3 = "l3_difficulty_complexity"

outcome_rows: list[dict] = []
for _oi, (_orig_i, _s) in enumerate(df_session[df_session["submitted_at"].notna()].iterrows()):
    _eff  = float(_s["_eff"]) if pd.notna(_s["_eff"]) else 50.0
    _max  = float(_s["max_score"]) if float(_s["max_score"]) > 0 else 100.0
    _pct  = _eff / _max * 100

    def _sv(col: str, default: float) -> float:
        v = _s.get(col)
        return float(v) if v is not None and pd.notna(v) else default

    _total = round((_sv(_C1, _pct / 100)
                  + _sv(_C2, _pct / 100 * 0.95)
                  + _sv(_L1, _pct / 100 * 0.90)
                  + _sv(_L2, 0.70)
                  + _sv(_L3, 0.60)) / 5.0 * 100, 2)

    outcome_rows.append({
        "participant_code":   _s["academy_member_id"],
        "batch_code":         _s["batch_id"],
        "task_code":          _s["task_id"],
        "task_type":          _s["task_type"],
        "submission_id":      f"mock-sub-{_s['academy_member_id']}-{_s['task_id']}-{_oi:05d}",
        "submitted_at":       _s["submitted_at"],
        "total_2c3l_score":   _total,
        "at_risk":            int(_s["_at_risk"]),
        "label_source":       "auto_generated",
        "label_validity":     "pilot_only",
        "is_teacher_reviewed": bool(pd.notna(_s.get("review_score"))),
    })

_OUT_COLS = [
    "participant_code","batch_code","task_code","task_type","submission_id",
    "submitted_at","total_2c3l_score","at_risk","label_source","label_validity",
    "is_teacher_reviewed",
]
df_outcome = (pd.DataFrame(outcome_rows, columns=_OUT_COLS)
              if outcome_rows else pd.DataFrame(columns=_OUT_COLS))
df_outcome.to_csv(OUTCOME_FILE, index=False)

# ── Summary ───────────────────────────────────────────────────────────────────
df_session["effective_score"] = df_session["review_score"].combine_first(df_session["auto_score"])
df_session["at_risk"] = (
    df_session["submitted_at"].isna() |
    (df_session["effective_score"] < df_session["max_score"] * 0.6)
).astype(int)

balance      = df_session["at_risk"].value_counts().sort_index()
ratio        = balance.get(0, 0) / max(balance.get(1, 1), 1)
missing_sub  = int(df_session["submitted_at"].isna().sum())
no_att_count = len(no_attempt_idx)
batch_dist   = df_session["batch_id"].value_counts().sort_index()
lg_dist      = df_session["learner_group"].value_counts().sort_index()
submitted    = df_session["submitted_at"].notna()
rv_nonnull   = int(df_session.loc[submitted, "review_score"].notna().sum())
rv_rate      = rv_nonnull / max(submitted.sum(), 1) * 100

print("=" * 58)
print("Mock dataset generated")
print("=" * 58)
print(f"  Session rows              : {len(df_session):,}")
print(f"  Attempt rows              : {len(df_attempt):,}")
print(f"  Unique learners           : {df_session['academy_member_id'].nunique()}")
print(f"  Unique tasks              : {df_session['task_id'].nunique()}")
print()
print("  Batch distribution:")
for b, cnt in batch_dist.items():
    print(f"    {b} : {cnt} ({cnt/len(df_session)*100:.1f}%)")
print()
print("  Learner group distribution:")
for g, cnt in lg_dist.items():
    print(f"    {g} : {cnt} ({cnt/len(df_session)*100:.1f}%)")
print()
print(f"  at_risk=0 (not at risk)   : {balance.get(0,0):,} ({balance.get(0,0)/len(df_session)*100:.1f}%)")
print(f"  at_risk=1 (at risk)       : {balance.get(1,0):,} ({balance.get(1,0)/len(df_session)*100:.1f}%)")
print(f"  Imbalance ratio           : {ratio:.2f} : 1")
print()
print(f"  Missing submissions       : {missing_sub} ({missing_sub/len(df_session)*100:.1f}%)")
print(f"  Sessions without attempts : {no_att_count} ({no_att_count/len(df_session)*100:.1f}%)")
print(f"  review_score non-null     : {rv_nonnull} / {submitted.sum()} submitted "
      f"({rv_rate:.1f}% of submitted rows)")
print()
n_block_sessions = int(sql_block_mask.sum())
n_event_rows     = len(df_event)
add_count  = int((df_event["event_type"] == "block_add").sum())   if n_event_rows else 0
del_count  = int((df_event["event_type"] == "block_delete").sum()) if n_event_rows else 0
move_count = int((df_event["event_type"] == "block_move").sum())  if n_event_rows else 0
print()
print(f"  sql_block sessions         : {n_block_sessions}")
print(f"  Block event rows           : {n_event_rows}")
print(f"    block_add                : {add_count}")
print(f"    block_delete             : {del_count}")
print(f"    block_move               : {move_count}")
print()
n_seq_rows  = len(df_sequence)
n_out_rows  = len(df_outcome)
seq_etypes  = df_sequence["event_type"].value_counts().sort_index() if n_seq_rows else {}
print(f"  Sequence event rows        : {n_seq_rows:,}")
for et, cnt in (seq_etypes.items() if hasattr(seq_etypes, "items") else []):
    print(f"    {et:<28}: {cnt}")
print(f"  Outcome rows (submitted)   : {n_out_rows:,}")
if n_out_rows:
    _risk_dist = df_outcome["at_risk"].value_counts().sort_index()
    print(f"    at_risk=0                : {_risk_dist.get(0, 0)}")
    print(f"    at_risk=1                : {_risk_dist.get(1, 0)}")
print()
print("  Output files:")
print(f"    {SESSION_FILE}")
print(f"    {ATTEMPT_FILE}")
print(f"    {EVENT_FILE}")
print(f"    {SEQUENCE_FILE}")
print(f"    {OUTCOME_FILE}")
print("=" * 58)
print("NOTE: synthetic mock data only — do NOT commit to git")
