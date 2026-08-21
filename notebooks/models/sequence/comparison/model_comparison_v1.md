# Pilot Model Comparison

> **CRITICAL**: `label_source=proxy_behavioral` / `label_validity=pilot_only`  
> 10 learners (8 train, 2 test). These are NOT final Chapter 4 conclusions.  
> Do NOT confirm H5 or claim model superiority based on this pilot.

Generated: 2026-08-19T06:30:31.981103+00:00  
Primary seed: 42  
Test learners: ['S0001', 'S0005', 'S0011', 'S0013', 'S0019', 'S0023', 'S0029', 'S0031', 'S0032', 'S0034', 'S0036', 'S0046', 'S0050', 'S0068', 'S0069', 'S0071']  
Test sequences: 117  
Test class distribution: {np.int64(0): np.int64(53), np.int64(1): np.int64(64)}  
ROC-AUC status: computed  

## Primary Comparison Table

| Model | Accuracy | Precision | Recall | F1 | ROC-AUC | PR-AUC | Training Time (s) | Inference Time (s/seq) | Parameters |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Dummy | 0.5470 | 0.5470 | 1.0000 | 0.7072 | 0.5000 | 0.5470 | 0.0003 | 1.79e-06 | NA |
| Logistic Regression | 0.6239 | 0.7632 | 0.4531 | 0.5686 | 0.6165 | 0.7191 | 0.0062 | 3.29e-06 | 18 |
| Random Forest | 0.6068 | 0.6406 | 0.6406 | 0.6406 | 0.6675 | 0.7504 | 0.1065 | 4.636e-05 | 2 |
| TAG-based Logistic Regression | 0.6068 | 0.7500 | 0.4219 | 0.5400 | 0.6414 | 0.7111 | 0.0093 | 1.84e-06 | 22 |
| LSTM | 0.6154 | 0.8065 | 0.3906 | 0.5263 | 0.6380 | 0.7369 | 5.7077 | 2.4e-05 | 5665 |
| GRU | 0.6154 | 0.7879 | 0.4062 | 0.5361 | 0.6468 | 0.7376 | 8.1831 | 2.2e-05 | 4257 |

## Seed Stability (LSTM / GRU)

| Model | Seed | Accuracy | F1 | ROC-AUC |
|---|---:|---:|---:|---:|
| LSTM | 11 | 0.6154 | 0.5714 | 0.6294 |
| LSTM | 22 | 0.6239 | 0.5769 | 0.6465 |
| LSTM | 33 | 0.6068 | 0.5000 | 0.6471 |
| LSTM | 42 | 0.6154 | 0.5263 | 0.6380 |
| LSTM | 55 | 0.6325 | 0.5567 | 0.6430 |
| GRU | 11 | 0.6068 | 0.5400 | 0.6330 |
| GRU | 22 | 0.6068 | 0.5400 | 0.6147 |
| GRU | 33 | 0.5641 | 0.4848 | 0.6445 |
| GRU | 42 | 0.6154 | 0.5361 | 0.6468 |
| GRU | 55 | 0.6325 | 0.5657 | 0.6433 |

## Pilot Limitations

- **Learner count**: 10 total (8 train, 2 test) -- thesis minimum is 60.
- **Labels**: `proxy_behavioral` derived from attempt stream; no teacher review.
- **Split**: GroupShuffleSplit by learner; no overlap; but only 2 test learners.
- **Class imbalance**: small cohort may produce single-class test sets.
- **Timing**: sklearn and PyTorch are different frameworks -- do not imply strict computational superiority.
- **No confirmatory statistics**: p-values, effect sizes, or H5 confirmation require the final validated dataset.
- **BSSA integration**: deferred to Phase 5.
