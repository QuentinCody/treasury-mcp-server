# Treasury Fiscal Data MCP

Public Fiscal Data JSON resources through `treasury_search` and
`treasury_execute`, with `treasury_query_data` / `treasury_get_schema` for staged
responses. Each tool also has an `mcp_` alias. No upstream API key is required.

## Observation windows

`/observations` is a local adapter helper, not a Treasury endpoint. It discovers
the resource's native field types using one full-row sample, checks the selected
date and equality-filter fields, then retrieves one bounded page:

```js
const result = await api.get("/observations", {
  endpoint: "/v2/accounting/od/debt_to_penny",
  date_field: "record_date",
  start_date: "2026-09-01",
  end_date: "2026-09-29",
  page: 1,
  page_size: 100
});
return result;
```

Optional `filters` is JSON text such as
`{"security_type_desc":"Marketable"}` for the interest-rate resource.
Complex native filters remain available on raw resource paths. The helper
requests all fields, avoiding the API's implicit aggregation from projections.
It requires native `DATE` metadata, validates returned observation dates, rejects
schema changes during the two reads, and accepts an optional earlier
`expected_schema_hash`. That hash detects schema drift, not data revisions.

Native `data`, `meta` and `links` are retained. `_observation` adds retrieval time,
request context and hashes of the parsed schema/response. Decimal amounts and
identifiers remain strings. A date window selects observations in currently
served data: it does **not** recreate data known at that historical time.
Release, update and historical-vintage fields are explicitly unknown. Native
pagination is not a stable snapshot; even pages with unchanged schema may change.
Each helper call performs at most two upstream requests; page size is 1–1000.

## Provider corrections and native acceptance through October 4, 2026

The provider's [endpoint configuration](https://github.com/fedspendingtransparency/fiscal-data/blob/master/src/transform/endpointConfig.js)
confirms v1 auction routes, v2 gold reserves, annual historical debt totals and
savings-bond piece counts. TIPS has separate detail (`index_date`) and summary
(`original_issue_date`) resources. Old auction/gold version spellings remain
adapter aliases, including through the Code Mode catalog guard. The ambiguous old
TIPS and generic offset-program paths still fail explicitly. All native resource
catalog entries declare the common paging, sorting and projection parameters.

Current [native metadata](https://api.fiscaldata.treasury.gov/services/dtg/metadata/)
advertises TOP at **`/v1/debt/treasury_offset_program`** under dataset
`015-BFS-2014Q3-052`. Native State and Agency samples both pass local acceptance.
Inspect `state_or_agency`, `debt_category`, payment streams and field definitions
before combining measures; do not infer separate federal/state APIs from the
older data.gov entry. Offset, reversal and net amounts/counts remain separate.
Leading-zero IDs, trailing spaces and exact decimal strings survive SQL.

The [website build source](https://github.com/fedspendingtransparency/fiscal-data/blob/master/gatsby-node.js)
uses separate `/services/dtg/metadata/` and `/services/calendar/release` services.
October 4 captures contain **56 datasets / 183 resources / 2,988 field definitions**
in a **1,268,106-byte** metadata document and **738 calendar events** in 65,312
bytes. Both documents match their later native rereads and local staged recovery.
That equality does not prove atomic snapshots. Scheduled dates and `released`
flags do not independently prove data availability. No new dated API announcement
or historical-vintage API was established by this review.

## Dataset and endpoint metadata

```javascript
return await api.get('/dataset-metadata');
```

This reads the website's `/services/dtg/metadata/` document from the fixed Treasury
host, preserving its complete native array and source evidence. The provider's
[website transform](https://github.com/fedspendingtransparency/fiscal-data/blob/master/src/transform/metadata-transform.js)
renames fields and derives display dates; this adapter retains the original keys,
per-endpoint dates, nulls, definitions and unknown fields. It checks the array/object
envelope without claiming to validate every native metadata field.

Inspect the returned identifier and endpoint fields before joining to calendar
`datasetId` or an observation resource. Metadata-declared update dates, coverage
dates, the HTTP `Last-Modified` header and retrieval time are separate evidence.
No dataset-wide date or historical availability is inferred, and listed endpoints
are not automatically fetched. Code Mode can retain the metadata alongside an
explicit observation request; the calls do not form an atomic snapshot.

The optional `expected_snapshot_hash` checks `source.snapshot_sha256` over the
complete parsed metadata document. It detects metadata changes, not revisions to
the data. Reads share the calendar's bounds, direct-host routing and lossless
staging. A document over 4 MiB fails explicitly; no partial metadata is returned.

SQL exposes `dataset_metadata` (dataset fields except `apis`), `dataset_apis`
(API fields except `fields`), and `dataset_fields`. Native identifiers and parent
indexes retain their relationships without cross-products. Each row has its
original `native_json`; `discovery_snapshot` retains the complete source evidence
and guard hash. `payloads` retains the full original document, including nested
arrays. Catalog recipes continue through staged metadata using `api.query`.
Hash mismatches return HTTP-style status 409 with the observed document and both
hashes, rather than silently discarding the changed evidence.

## Release calendar

```javascript
return await api.get('/release-calendar');
```

This local helper reads the website's `/services/calendar/release` service on the
[production API host](https://github.com/fedspendingtransparency/fiscal-data/blob/master/env/prod.js).
It returns the complete `native` array and `source` evidence: retrieval time,
HTTP validators, row count and SHA-256 of the parsed response. Dataset IDs,
dates, times, string-valued `released` flags and unknown fields retain their native
values and order. Filter by `datasetId` in Code Mode, or inspect the staged schema
and query the stored rows when the response is large.

Pass a previous `source.snapshot_sha256` as `expected_snapshot_hash` to reject a
changed schedule. This detects changes to the calendar response, not revisions to
underlying observations. No timezone, historical vintage or data availability is
inferred. HTTP errors and invalid response envelopes fail without mock fallback.

The calendar uses the fixed Treasury service directly; `TREASURY_PROXY_URL` is
only for Fiscal Data resource paths. It reuses the 25-second deadline and 4 MiB
body limit, with Code Mode staging. The `release_calendar` SQL table preserves all
rows, duplicate IDs, original order and string-valued flags. Local Worker acceptance
checks both execute aliases against every native event. No timezone is inferred.
No new binding, dependency, database or scheduled task is required.

## Transport and validation

Reads enforce a 25-second deadline, 4 MiB decoded-body limit, JSON and GET, and
reject redirects and partial responses. Cancellation does not extend the deadline.
Complete bounded public HTTP error bodies/statuses survive MCP; configured proxy
diagnostics remain private. Reduce page size when the body limit is reached.
All eight aliases cite successes/errors and stage complete composed responses
above 30 KiB, with a 100 KB structured-content guard. Observation SQL retains
native rows, metadata, pagination and `_observation` in `response_context`.
Native strings stay TEXT; avoid floating-point casts for exact decimal arithmetic.
`/readyz` checks tool construction, not upstream availability.

`TREASURY_PROXY_URL` optionally supplies an HTTPS base that accepts the same
relative Fiscal Data resource paths. It is captured per server instance. Previous
egress failures do not establish that a proxy is currently necessary.

October 4 validation: **78 focused tests + 206 catalog checks**, TypeScript,
direct lint and seven static checks pass. Native/local acceptance covers all
13 existing resource routes, three compatibility aliases, TOP, discovery helpers,
all three recipes, errors, staging and canonical hashes. **2,643 MCP calls** include
19,400 exact projected SQL cell comparisons across both 500-row debt aliases and
two 100-row TOP samples. The standard local contract passes eight checks, with
its heuristic data/staging checks skipped; separate acceptance verifies both.
Full Vitest passes **13,783 tests / 109 skipped**; terminal `check:affected` passes.
Manual review retains four warnings about intentional native error evidence; an
adversarial check verifies fixed error fields and proxy redaction. Formatting remains
unvalidated because the manual formatter output was unparsed; direct lint passes.
See the
[verification receipt](../../../scratch/2026-10-04-treasury/verification.json)
for affected-workspace and manual-check results. The local Worker uses verified
TLS with browser and installed Node public CA roots; production TLS is unchanged.

Actual mid-request source drift, stable snapshot pagination, historical vintages
and whole-source coverage remain unverified. Schema/hash changes are tested with
fixtures and stale guards. Nothing is committed, pushed or deployed.

<!-- license-and-data-terms:start -->
## License and data terms

The code in this repository is licensed under the Apache License 2.0 (see `LICENSE`).
If you use it in your work, please cite it (see `CITATION.cff`). Citation is requested, not required.

The license covers the code only. Data that this server returns comes from Treasury Fiscal Data and stays under the terms of that source: US public domain.
You are responsible for your use of the data under those terms.
<!-- license-and-data-terms:end -->
