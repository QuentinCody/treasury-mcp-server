import { readWebsiteService } from "./website-service";

export { RELEASE_CALENDAR_URL } from "./website-service";

/** The website service returns a calendar, not historical data vintages. */
export async function releaseCalendar(params: Record<string, unknown>) {
  return readWebsiteService("calendar", params);
}
