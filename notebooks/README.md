# Notebook Module

1. Put exported CSV files from `/admin/dataset` into `notebooks/data/exports/`
2. Run notebooks in order:
   - `01_load_dataset.ipynb`
   - `02_data_quality_check.ipynb`
   - `03_feature_engineering.ipynb`
   - `04_baseline_model_lr_rf.ipynb`
   - `05_sequence_prepare_lstm_gru.ipynb`

Install packages:

```bash
pip install pandas numpy scikit-learn matplotlib openpyxl
```
