"""Run notebooks 02-05 for E2E mock validation.

Usage:
  python run_e2e_notebooks.py                              # uses last CSV in data/raw/
  python run_e2e_notebooks.py --session-file session_X.csv --attempt-file attempt_X.csv
  python run_e2e_notebooks.py --batch-tag SIM_E2E --snapshot-date 20260710

Args:
  --session-file    session CSV filename (in data/raw/)
  --attempt-file    attempt CSV filename (in data/raw/)
  --event-file      block event CSV filename (in data/raw/) — optional, Phase 5 M5.4
  --sequence-file   sequence CSV filename (in data/raw/) — NB05, Phase 5 M5.6
  --outcome-file    outcome CSV filename (in data/raw/) — NB05, Phase 5 M5.6
  --batch-tag       BATCH_CODE_VAL for notebook substitution (default: auto-detect)
  --snapshot-date   SNAPSHOT_DATE for notebook substitution (default: today)
  --skip-nb05       skip NB05 (useful when sequence/outcome CSVs are absent)
"""
import json, subprocess, os, sys, argparse
from pathlib import Path

# Force UTF-8 output on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ── CLI args ──────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description="Run NB02-05 for E2E validation.")
parser.add_argument("--session-file",    default=None, help="Session CSV filename in data/raw/")
parser.add_argument("--attempt-file",    default=None, help="Attempt CSV filename in data/raw/")
parser.add_argument("--event-file",      default=None, help="Block event CSV filename in data/raw/ (Phase 5 M5.4)")
parser.add_argument("--sequence-file",   default=None, help="Sequence CSV filename in data/raw/ (Phase 5 M5.6)")
parser.add_argument("--outcome-file",    default=None, help="Outcome CSV filename in data/raw/ (Phase 5 M5.6)")
parser.add_argument("--batch-tag",       default=None, help="Batch code tag for notebook substitution")
parser.add_argument("--snapshot-date",   default=None, help="Snapshot date YYYYMMDD")
parser.add_argument("--skip-nb05",       action="store_true", help="Skip NB05 even if sequence/outcome CSVs exist")
args = parser.parse_args()

# ── Auto-detect latest CSV if not specified ───────────────────────────────────
RAW_DIR     = Path("data/raw")
ABS_RAW_DIR = RAW_DIR.resolve()   # absolute — used in Pattern 5 to make paths kernel-CWD-independent

def latest_csv(prefix: str) -> str | None:
    files = sorted(RAW_DIR.glob(f"{prefix}_*.csv"), reverse=True)
    return files[0].name if files else None

SESSION_FILE   = args.session_file   or latest_csv("session")
ATTEMPT_FILE   = args.attempt_file   or latest_csv("attempt")
EVENT_FILE     = args.event_file     or latest_csv("event")      # optional — None if absent
SEQUENCE_FILE  = args.sequence_file  or latest_csv("sequence")   # Phase 5 M5.6
OUTCOME_FILE   = args.outcome_file   or latest_csv("outcome")    # Phase 5 M5.6
SNAPSHOT_DATE  = args.snapshot_date  or (SESSION_FILE.split("_")[1] if SESSION_FILE else "20260101")

# Derive BATCH_CODE_VAL from filename if not provided:
# session_20260710_SIM_E2E.csv → batch_tag = SIM_E2E
if args.batch_tag:
    BATCH_CODE_VAL = args.batch_tag
elif SESSION_FILE:
    parts = SESSION_FILE.replace(".csv", "").split("_", 2)
    BATCH_CODE_VAL = parts[2] if len(parts) >= 3 else "SIM_E2E"
else:
    BATCH_CODE_VAL = "SIM_E2E"

print(f"Session file  : {SESSION_FILE}")
print(f"Attempt file  : {ATTEMPT_FILE}")
print(f"Event file    : {EVENT_FILE or '(none — block features zero-filled)'}")
print(f"Sequence file : {SEQUENCE_FILE or '(none — NB05 will be skipped)'}")
print(f"Outcome file  : {OUTCOME_FILE or '(none — NB05 will be skipped)'}")
print(f"Snapshot date : {SNAPSHOT_DATE}")
print(f"Batch tag     : {BATCH_CODE_VAL}")

if not SESSION_FILE or not ATTEMPT_FILE:
    print("ERROR: No CSV files found in data/raw/ — run e2e-sim-export-csv.mjs first")
    sys.exit(1)

def patch_and_run(nb_name):
    with open(nb_name, encoding="utf-8") as f:
        nb = json.load(f)
    for cell in nb["cells"]:
        if cell["cell_type"] != "code":
            continue
        src = "".join(cell["source"])
        patched = src
        # Pattern 1: SESSION_CSV = None (NB01)
        if 'SESSION_CSV = None' in patched:
            patched = patched.replace(
                'SESSION_CSV = None  # Example: RAW_DIR / "session_20260710_batch001.csv"',
                f'SESSION_CSV = RAW_DIR / "{SESSION_FILE}"'
            ).replace(
                'ATTEMPT_CSV = None  # Example: RAW_DIR / "attempt_20260710_batch001.csv"',
                f'ATTEMPT_CSV = RAW_DIR / "{ATTEMPT_FILE}"'
            )
        # Pattern 2: SNAPSHOT_DATE / BATCH_CODE placeholders (NB02, NB03)
        if 'SNAPSHOT_DATE' in patched and 'YYYY-MM-DD' in patched:
            patched = patched.replace(
                'SNAPSHOT_DATE = "YYYY-MM-DD"', f'SNAPSHOT_DATE = "{SNAPSHOT_DATE}"'
            ).replace(
                'BATCH_CODE    = "BATCH_XXX"', f'BATCH_CODE    = "{BATCH_CODE_VAL}"'
            ).replace(
                'BATCH_CODE = "BATCH_XXX"', f'BATCH_CODE = "{BATCH_CODE_VAL}"'
            ).replace(
                'f"notebooks/data/raw/session_{SNAPSHOT_DATE}_{BATCH_CODE}.csv"',
                'f"data/raw/session_{SNAPSHOT_DATE}_{BATCH_CODE}.csv"'
            ).replace(
                'f"notebooks/data/raw/attempt_{SNAPSHOT_DATE}_{BATCH_CODE}.csv"',
                'f"data/raw/attempt_{SNAPSHOT_DATE}_{BATCH_CODE}.csv"'
            ).replace(
                # Phase 5 M5.4: fix event file path (NB03 EVENT_FILE)
                'f"notebooks/data/raw/event_{SNAPSHOT_DATE}_{BATCH_CODE}.csv"',
                'f"data/raw/event_{SNAPSHOT_DATE}_{BATCH_CODE}.csv"'
            ).replace(
                'Path("notebooks/data/processed")', 'Path("data/processed")'
            ).replace(
                '"notebooks/data/processed"', '"data/processed"'
            ).replace(
                'Path("notebooks/data")', 'Path("data")'
            )
        # Pattern 3: strip "notebooks/" prefix from data/processed, models, reports paths.
        # Handles both Path("notebooks/X") and string literals "notebooks/X" (with/without
        # trailing slash, which determines whether a closing quote appears right after "X").
        patched = (patched
            .replace('Path("notebooks/data/processed")', 'Path("data/processed")')
            .replace('Path("notebooks/models")',         'Path("models")')
            .replace('Path("notebooks/reports")',        'Path("reports")')
            # String literals — must replace trailing-slash form first (more specific)
            .replace('"notebooks/data/processed/',      '"data/processed/')
            .replace('"notebooks/models/',              '"models/')
            .replace('"notebooks/reports/',             '"reports/')
            # Then match exact directory strings (no trailing slash / closing-quote form)
            .replace('"notebooks/data/processed"',      '"data/processed"')
            .replace('"notebooks/models"',              '"models"')
            .replace('"notebooks/reports"',             '"reports"')
        )
        # Pattern 4: Windows joblib crash
        patched = patched.replace('n_jobs=-1', 'n_jobs=1')
        # Pattern 5: NB05 CSV pin overrides — replace None with filenames so the
        # notebook skips auto-detect and uses the exact files we generated.
        # NB05 cfg-01 uses: SEQUENCE_CSV : str | None = None  (typed annotation)
        # Use absolute paths so NB05 works regardless of where nbconvert sets the kernel CWD.
        # ABS_RAW_DIR is resolved once from the runner's CWD (notebooks/).
        if SEQUENCE_FILE and 'SEQUENCE_CSV : str | None = None' in patched:
            _abs_seq = str(ABS_RAW_DIR / SEQUENCE_FILE).replace("\\", "/")
            patched = patched.replace(
                'SEQUENCE_CSV : str | None = None',
                f'SEQUENCE_CSV : str | None = "{_abs_seq}"'
            )
        if ATTEMPT_FILE and 'ATTEMPT_CSV  : str | None = None' in patched:
            _abs_att = str(ABS_RAW_DIR / ATTEMPT_FILE).replace("\\", "/")
            patched = patched.replace(
                'ATTEMPT_CSV  : str | None = None',
                f'ATTEMPT_CSV  : str | None = "{_abs_att}"'
            )
        if OUTCOME_FILE and 'OUTCOME_CSV  : str | None = None' in patched:
            _abs_out = str(ABS_RAW_DIR / OUTCOME_FILE).replace("\\", "/")
            patched = patched.replace(
                'OUTCOME_CSV  : str | None = None',
                f'OUTCOME_CSV  : str | None = "{_abs_out}"'
            )
        # Phase 5 M5.6: fix NB05 data/sequences output path if it contains notebooks/ prefix
        patched = (patched
            .replace('Path("notebooks/data/sequences")', 'Path("data/sequences")')
            .replace('"notebooks/data/sequences"',       '"data/sequences"')
        )
        if patched != src:
            cell["source"] = [patched]

    tmp = "_tmp_" + nb_name
    out = "_out_" + nb_name
    with open(tmp, "w") as f:
        json.dump(nb, f)

    result = subprocess.run(
        ["jupyter", "nbconvert", "--to", "notebook", "--execute",
         "--ExecutePreprocessor.timeout=300",
         "--output", out, tmp],
        capture_output=True, text=True, encoding="utf-8", errors="replace"
    )

    output_lines = []
    if os.path.exists(out):
        with open(out, encoding="utf-8", errors="replace") as f:
            out_nb = json.load(f)
        for cell in out_nb["cells"]:
            if cell["cell_type"] == "code" and cell.get("outputs"):
                for o in cell["outputs"]:
                    if o.get("output_type") == "stream":
                        output_lines.append("".join(o.get("text", [])))
                    elif o.get("output_type") == "error":
                        output_lines.append(f'ERROR: {o.get("ename")}: {o.get("evalue")}')

    for f in [tmp, out]:
        try: os.remove(f)
        except: pass

    status = "PASS" if result.returncode == 0 else "FAIL"
    print(f"\n=== {nb_name} [{status}] rc={result.returncode} ===")
    KEY = ["PASS","FAIL","ERROR","gate","AUC","F1","missing","Missing","[OK]",
           "LEAKAGE","SPLIT","logistic","random_forest","majority","WARNING","baseline","imbalance",
           "sequence","tensor","vocab","token","NB05","sequence_tensors","Loaded","sequences",
           "sessions","events","outcome"]
    for line in "\n".join(output_lines).split("\n"):
        s = line.strip()
        if s and any(k in s for k in KEY):
            print(f"  > {s}")
    if result.returncode != 0:
        print("STDERR:", (result.stderr or "")[-2000:])
    return result.returncode == 0

results = {}
for nb in ["02_data_quality_check.ipynb", "03_feature_engineering.ipynb", "04_baseline_model_lr_rf.ipynb"]:
    results[nb] = patch_and_run(nb)

# Phase 5 M5.6: run NB05 if sequence + outcome CSVs are available
NB05 = "05_sequence_dataset.ipynb"
if args.skip_nb05:
    print(f"\n[skip] {NB05} — --skip-nb05 flag set")
elif not SEQUENCE_FILE:
    print(f"\n[skip] {NB05} — no sequence_*.csv found in data/raw/ (run generate_mock_data.py first)")
elif not OUTCOME_FILE:
    print(f"\n[skip] {NB05} — no outcome_*.csv found in data/raw/ (run generate_mock_data.py first)")
elif not Path(NB05).exists():
    print(f"\n[skip] {NB05} — notebook not found in notebooks/")
else:
    results[NB05] = patch_and_run(NB05)

print("\n── Notebook Run Summary ──")
for nb, ok in results.items():
    print(f"  {'✅' if ok else '❌'}  {nb}: {'PASS' if ok else 'FAIL'}")
print("\n── Done ──")

if not all(results.values()):
    sys.exit(1)
