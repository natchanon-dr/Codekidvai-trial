"""Run notebooks 02-04 for E2E mock validation."""
import json, subprocess, os, sys

# Force UTF-8 output on Windows so ± and other chars don't crash the runner
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SESSION_FILE = "session_20260710_SIM_E2E.csv"
ATTEMPT_FILE = "attempt_20260710_SIM_E2E.csv"
SNAPSHOT_DATE = "20260710"
BATCH_CODE_VAL = "SIM_E2E"

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
        # These notebooks also use "notebooks/data/..." prefix — fix to "data/..." (cwd=notebooks dir)
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
                'Path("notebooks/data/processed")',
                'Path("data/processed")'
            ).replace(
                '"notebooks/data/processed"',
                '"data/processed"'
            ).replace(
                'Path("notebooks/data")',
                'Path("data")'
            )
        # Pattern 3: NB04 hardcoded notebook/ prefix on processed/models/reports dirs
        patched = (patched
            .replace('Path("notebooks/data/processed")', 'Path("data/processed")')
            .replace('Path("notebooks/models")', 'Path("models")')
            .replace('Path("notebooks/reports")', 'Path("reports")')
            .replace('"notebooks/data/processed"', '"data/processed"')
            .replace('"notebooks/models"', '"models"')
            .replace('"notebooks/reports"', '"reports"')
        )
        # Pattern 4: Windows joblib issue — n_jobs=-1 triggers resource_tracker crash
        patched = patched.replace('n_jobs=-1', 'n_jobs=1')
        if patched != src:
            cell["source"] = [patched]

    tmp = "_tmp_" + nb_name
    out = "_out_" + nb_name
    with open(tmp, "w") as f:
        json.dump(nb, f)

    result = subprocess.run(
        ["jupyter", "nbconvert", "--to", "notebook", "--execute",
         "--ExecutePreprocessor.timeout=180", "--output", out, tmp],
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
           "LEAKAGE","SPLIT","logistic","random_forest","majority","WARNING","baseline","imbalance"]
    for line in "\n".join(output_lines).split("\n"):
        s = line.strip()
        if s and any(k in s for k in KEY):
            print(f"  > {s}")
    if result.returncode != 0:
        print("STDERR:", (result.stderr or "")[-1500:])

for nb in ["02_data_quality_check.ipynb", "03_feature_engineering.ipynb", "04_baseline_model_lr_rf.ipynb"]:
    patch_and_run(nb)

print("\n── Done ──")
