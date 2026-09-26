/**
 * UK charging Clean Air Zones, as approximate circles around each zone.
 * Charges depend on the vehicle class and change over time, so none are
 * stored here; users are pointed to GOV.UK to check a vehicle.
 */
export const CLEAN_AIR_ZONES = [
  { id: "caz-london", lat: 51.5074, lng: -0.1278, radius: 20000, name: "London LEZ / ULEZ" },
  { id: "caz-birmingham", lat: 52.4862, lng: -1.8904, radius: 2500, name: "Birmingham Clean Air Zone" },
  { id: "caz-bristol", lat: 51.4545, lng: -2.5879, radius: 2000, name: "Bristol Clean Air Zone" },
  { id: "caz-sheffield", lat: 53.3811, lng: -1.4701, radius: 2000, name: "Sheffield Clean Air Zone" },
  { id: "caz-bradford", lat: 53.7950, lng: -1.7594, radius: 3000, name: "Bradford Clean Air Zone" },
  { id: "caz-bath", lat: 51.3811, lng: -2.3590, radius: 1500, name: "Bath Clean Air Zone" },
  { id: "caz-portsmouth", lat: 50.8198, lng: -1.0880, radius: 2500, name: "Portsmouth Clean Air Zone" },
  { id: "caz-newcastle", lat: 54.9738, lng: -1.6132, radius: 2500, name: "Newcastle & Gateshead Clean Air Zone" },
] as const;

export const CAZ_CHECK_URL = "https://www.gov.uk/clean-air-zones";
