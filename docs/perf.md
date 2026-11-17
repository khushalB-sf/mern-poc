# Query performance (T-20, partial)

**Status:** measured once on 5,004 rows. Not yet measured at 10k (optional item O-01), and this is **not a load test**: one warm run each, local Docker Postgres 17 on an Apple-silicon Mac.

Method: `EXPLAIN (ANALYZE, BUFFERS)` of the exact query shape built by `question.repo.ts` (visibility + keyword + tag filters + ranking + `LIMIT 20`), user granted for one client, on the seeded dev database.

| Query | Execution | Plan highlights |
|---|---|---|
| Visibility + keyword `cache` (matches 1,297 of 5,004 rows, i.e. a deliberately unselective word) + 2 tag categories, ranked | **19.5 ms** (planning 10.8 ms) | Bitmap Index Scan on `question_search_idx` (GIN); Index Only Scans on `question_tag_tag_id_question_id_idx` (0 heap fetches) for both tag categories; visibility is a hashed lookup of the user's granted client ids; top-N heapsort |
| Visibility + one tag category, newest first (most common UI request) | **1.3 ms** | Ordered Index Scan on `question_created_at_id_idx`, semi-join probes into `question_tag` index-only; stops after 20 rows |
| Duplicate check (`%` trigram) | 5.7 ms with the index forced vs **72 ms** as the planner chooses | The planner under-estimates `%` selectivity and seq-scans. `findSimilarQuestions` therefore sets `enable_seqscan=off` locally inside its transaction (commented `ponytail:` in the code) |

What this does and does not show:
- It shows the filter, keyword and visibility predicates are index-backed and run in one statement, with nothing fetched broadly and filtered in application code.
- It does not show behaviour under concurrency, cold cache, or at 10k+ rows. The remaining unselective-keyword cost is dominated by an index-only scan over a low-selectivity tag (2,907 rows, ~12 ms); at 10k rows I expect it to scale roughly linearly and would then consider a combined partial index or paging earlier. That is a prediction, not a measurement.
- Planning time (10.8 ms) is significant relative to execution on the combined query; Prisma issues it as a simple query on every request. Not optimised.

No indexes were added in response to these plans; the ones in the init migration were sufficient at this size.

## Re-check after roles and review status (visibility predicate changed)

Same method, 5,007 rows seeded (5,000 generated, 4 fixtures, 3 pending/rejected demo rows), one warm run each, `ANALYZE` first, users granted Acme. Execution times in ms:

| Role | Newest first | Keyword `cache` | `status=PENDING` queue |
|---|---|---|---|
| USER | 0.07 | 24.2 | 0.02 (planner proves it empty: approved-only AND pending) |
| AUTHOR | 0.05 | 23.6 | 0.03 (`question_status_idx`) |
| REVIEWER | 0.05 | 27.8 | 0.04 (`question_status_idx`) |
| ADMIN | 0.03 | 26.2 | 0.03 (`question_status_idx`) |

The role and status terms did not change the plans: newest-first still walks `question_created_at_id_idx` and stops at 20 rows, keyword search still uses the GIN `question_search_idx`, and the grant check is still a lookup into the tiny `client_grant` table. The keyword numbers are a little above the earlier 19.5 ms, but that earlier run also had tag filters and a different machine state, so this is not a like-for-like regression claim. Duplicate-check (`%` trigram) was not re-measured; its predicate only gained the same status term.
