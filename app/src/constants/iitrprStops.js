/**
 * IIT Ropar Bus Stop GPS Coordinates
 * Sourced from Google Maps for IIT Ropar campus and surrounding areas.
 * Campus location: ~30.9688°N, 76.4734°E (Bara Phool, Rupnagar, Punjab 140001)
 */

export const IIT_ROPAR_CENTER = {
  latitude: 30.9688,
  longitude: 76.4734,
};

export const IITRPR_STOPS = {
  // Campus Stops
  mainGate: {
    id: "stop_main_gate",
    name: "IIT Ropar Main Gate",
    latitude: 30.9712,
    longitude: 76.4731,
  },
  academicBlock: {
    id: "stop_academic_block",
    name: "Academic Block",
    latitude: 30.9695,
    longitude: 76.4752,
  },
  hostelArea: {
    id: "stop_hostel_area",
    name: "Hostel Area",
    latitude: 30.9672,
    longitude: 76.4768,
  },
  sportsComplex: {
    id: "stop_sports_complex",
    name: "Sports Complex",
    latitude: 30.9660,
    longitude: 76.4745,
  },
  transitCampus: {
    id: "stop_transit_campus",
    name: "Transit Campus",
    latitude: 30.9680,
    longitude: 76.4710,
  },
  adminBlock: {
    id: "stop_admin_block",
    name: "Admin Block",
    latitude: 30.9700,
    longitude: 76.4738,
  },

  // City Stops - Rupnagar
  rupnagarBusStand: {
    id: "stop_rupnagar_bus_stand",
    name: "Rupnagar Bus Stand",
    latitude: 30.9660,
    longitude: 76.5340,
  },
  rupnagarRailwayStation: {
    id: "stop_rupnagar_railway",
    name: "Rupnagar Railway Station",
    latitude: 30.9640,
    longitude: 76.5250,
  },
  belaChowk: {
    id: "stop_bela_chowk",
    name: "Bela Chowk",
    latitude: 30.9665,
    longitude: 76.5180,
  },
  civilHospital: {
    id: "stop_civil_hospital",
    name: "Civil Hospital Rupnagar",
    latitude: 30.9670,
    longitude: 76.5300,
  },
  dcOffice: {
    id: "stop_dc_office",
    name: "DC Office Rupnagar",
    latitude: 30.9655,
    longitude: 76.5280,
  },

  // Extended Stops
  morinda: {
    id: "stop_morinda",
    name: "Morinda",
    latitude: 30.7910,
    longitude: 76.5000,
  },
  kurali: {
    id: "stop_kurali",
    name: "Kurali",
    latitude: 30.7670,
    longitude: 76.5530,
  },
  chandigarhISBT: {
    id: "stop_chandigarh_isbt",
    name: "Chandigarh ISBT",
    latitude: 30.7260,
    longitude: 76.8000,
  },
};

/**
 * Get GPS coordinates for a stop name by fuzzy matching.
 * Falls back to IIT Ropar center if no match found.
 */
export function getStopCoordinates(stopName) {
  if (!stopName) return IIT_ROPAR_CENTER;

  const normalized = String(stopName).toLowerCase().trim();

  // Try exact match first
  for (const stop of Object.values(IITRPR_STOPS)) {
    if (stop.name.toLowerCase() === normalized) {
      return { latitude: stop.latitude, longitude: stop.longitude };
    }
  }

  // Fuzzy match
  const keywords = {
    gate: IITRPR_STOPS.mainGate,
    "main gate": IITRPR_STOPS.mainGate,
    academic: IITRPR_STOPS.academicBlock,
    hostel: IITRPR_STOPS.hostelArea,
    sport: IITRPR_STOPS.sportsComplex,
    transit: IITRPR_STOPS.transitCampus,
    admin: IITRPR_STOPS.adminBlock,
    "bus stand": IITRPR_STOPS.rupnagarBusStand,
    "bus station": IITRPR_STOPS.rupnagarBusStand,
    railway: IITRPR_STOPS.rupnagarRailwayStation,
    station: IITRPR_STOPS.rupnagarRailwayStation,
    bela: IITRPR_STOPS.belaChowk,
    chowk: IITRPR_STOPS.belaChowk,
    hospital: IITRPR_STOPS.civilHospital,
    civil: IITRPR_STOPS.civilHospital,
    dc: IITRPR_STOPS.dcOffice,
    morinda: IITRPR_STOPS.morinda,
    kurali: IITRPR_STOPS.kurali,
    chandigarh: IITRPR_STOPS.chandigarhISBT,
    isbt: IITRPR_STOPS.chandigarhISBT,
    rupnagar: IITRPR_STOPS.rupnagarBusStand,
    ropar: IITRPR_STOPS.rupnagarBusStand,
  };

  for (const [keyword, stop] of Object.entries(keywords)) {
    if (normalized.includes(keyword)) {
      return { latitude: stop.latitude, longitude: stop.longitude };
    }
  }

  return IIT_ROPAR_CENTER;
}

/**
 * Haversine distance in km between two GPS coordinates
 */
export function haversineKm(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const hav = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(hav));
}

/**
 * Estimate travel time in minutes based on distance.
 * Uses realistic average speeds for IIT Ropar campus buses.
 */
export function estimateTravelMinutes(distanceKm) {
  if (distanceKm <= 0) return 0;
  // Average bus speed on campus: ~20 km/h, city: ~25 km/h, highway: ~40 km/h
  const avgSpeedKmH = distanceKm < 2 ? 20 : distanceKm < 10 ? 25 : 40;
  return Math.ceil((distanceKm / avgSpeedKmH) * 60);
}
