# Pilot Model Comparison

> **CRITICAL**: `label_source=proxy_behavioral` / `label_validity=pilot_only`  
> 10 learners (8 train, 2 test). These are NOT final Chapter 4 conclusions.  
> Do NOT confirm H5 or claim model superiority based on this pilot.

Generated: 2026-07-21T14:00:58.154900+00:00  
Primary seed: 42  
Test learners: ['MOCK_VALID3_20260715_S002', 'MOCK_VALID3_20260715_S009']  
Test sequences: 18  
Test class distribution: {np.int64(0): np.int64(9), np.int64(1): np.int64(9)}  
ROC-AUC status: computed  

## Primary Comparison Table

| Model | Accuracy | Precision | Recall | F1 | ROC-AUC | PR-AUC | Training Time (s) | Inference Time (s/seq) | Parameters |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Dummy | 0.5000 | 0.0000 | 0.0000 | 0.0000 | 0.5000 | 0.5000 | 0.0002 | 1.391e-05 | NA |
| Logistic Regression | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 0.0022 | 5.6e-06 | 18 |
| Random Forest | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 0.0573 | 0.00020518 | 2 |
| TAG-based Logistic Regression | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 0.0024 | 5.45e-06 | 22 |
| LSTM | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 2.8237 | 2.8e-05 | 5665 |
| GRU | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 2.7551 | 2.6e-05 | 4257 |

## Seed Stability (LSTM / GRU)

| Model | Seed | Accuracy | F1 | ROC-AUC |
|---|---:|---:|---:|---:|
| LSTM | 11 | 1.0000 | 1.0000 | 1.0000 |
| LSTM | 22 | 1.0000 | 1.0000 | 1.0000 |
| LSTM | 33 | 1.0000 | 1.0000 | 1.0000 |
| LSTM | 42 | 1.0000 | 1.0000 | 1.0000 |
| LSTM | 55 | 1.0000 | 1.0000 | 1.0000 |
| GRU | 11 | 1.0000 | 1.0000 | 1.0000 |
| GRU | 22 | 1.0000 | 1.0000 | 1.0000 |
| GRU | 33 | 1.0000 | 1.0000 | 1.0000 |
| GRU | 42 | 1.0000 | 1.0000 | 1.0000 |
| GRU | 55 | 1.0000 | 1.0000 | 1.0000 |

## Pilot Limitations

- **Learner count**: 10 total (8 train, 2 test) -- thesis minimum is 60.
- **Labels**: `proxy_behavioral` derived from attempt stream; no teacher review.
- **Split**: GroupShuffleSplit by learner; no overlap; but only 2 test learners.
- **Class imbalance**: small cohort may produce single-class test sets.
- **Timing**: sklearn and PyTorch are different frameworks -- do not imply strict computational superiority.
- **No confirmatory statistics**: p-values, effect sizes, or H5 confirmation require the final validated dataset.
- **BSSA integration**: deferred to Phase 5.
