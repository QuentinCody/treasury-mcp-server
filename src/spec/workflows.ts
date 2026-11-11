import type { WorkflowRecipe } from "@bio-mcp/shared/codemode/catalog";

export const workflows: WorkflowRecipe[] = [
  {
    title: "Inspect current TOP metadata before reading observations",
    keywords: ["TOP", "metadata", "update", "schema"],
    description: "Preserve the complete metadata handle and inspect the advertised TOP resource and its separate update/coverage dates. Current native metadata is not a historical data vintage. The bounded SQL continuation also works when the metadata stages.",
    code: `const metadata = await api.get("/dataset-metadata");
if (metadata.__api_error || metadata.__stage_error) return metadata;
if (metadata.__staged) return {metadata, resources: await api.query(metadata.data_access_id, "SELECT native_json FROM dataset_apis WHERE parent_dataset_id = '015-BFS-2014Q3-052'")};
return {metadata, resources: metadata.native.filter(row => row.dataset_id === "015-BFS-2014Q3-052")};`,
  },
  {
    title: "Inspect the debt publication schedule separately from observations",
    keywords: ["calendar", "release", "debt"],
    description: "Keep duplicate events and original date/time/released strings for the Debt to the Penny dataset. Scheduled events and released flags do not independently prove data availability or a historical as-known date.",
    code: `const calendar = await api.get("/release-calendar");
if (calendar.__api_error || calendar.__stage_error) return calendar;
if (calendar.__staged) return {calendar, events: await api.query(calendar.data_access_id, "SELECT native_json FROM release_calendar WHERE datasetId = '015-BFS-2014Q3-065' ORDER BY source_index LIMIT 20")};
return {calendar, events: calendar.native.filter(row => row.datasetId === "015-BFS-2014Q3-065").slice(0, 20)};`,
  },
  {
    title: "Read a schema-checked TOP observation window",
    keywords: ["TOP", "observation", "state", "date"],
    description: "Example observation window for native State records, with full exact string amounts and identifiers. Replace dates deliberately after inspecting metadata. One page only; schema guards detect schema drift, not amount revisions, complete coverage or historical vintages.",
    code: 'return await api.get("/observations", {endpoint:"/v1/debt/treasury_offset_program",date_field:"record_date",start_date:"2026-09-07",end_date:"2026-09-11",filters:{state_or_agency:"State"},page_size:10});',
  },
];
