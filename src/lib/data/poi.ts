/**
 * Points of Interest — airports, ports, and universities for map markers.
 * Airports: verified coordinates from OurAirports, deduplicated
 * Ports: Natural Earth + manually verified major Malaysian ports
 * Universities: 20 public universities (IPTA) main campuses
 */

export interface POI {
  name: string;
  lat: number;
  lon: number;
  type: "airport" | "port" | "university";
  code?: string; // IATA for airports, acronym for universities
  size: "large" | "medium";
}

export const AIRPORTS: POI[] = [
  // Large international airports
  { name: "KLIA", lat: 2.7456, lon: 101.710, type: "airport", code: "KUL", size: "large" },
  { name: "Kota Kinabalu International", lat: 5.9327, lon: 116.049, type: "airport", code: "BKI", size: "large" },
  { name: "Kuching International", lat: 1.4874, lon: 110.353, type: "airport", code: "KCH", size: "large" },
  { name: "Penang International", lat: 5.2963, lon: 100.276, type: "airport", code: "PEN", size: "large" },
  { name: "Senai International (JB)", lat: 1.6413, lon: 103.670, type: "airport", code: "JHB", size: "large" },
  { name: "Langkawi International", lat: 6.3297, lon: 99.729, type: "airport", code: "LGK", size: "large" },
  // Domestic airports
  { name: "Ipoh (Sultan Azlan Shah)", lat: 4.5673, lon: 101.092, type: "airport", code: "IPH", size: "medium" },
  { name: "Kuala Terengganu", lat: 5.3826, lon: 103.103, type: "airport", code: "TGG", size: "medium" },
  { name: "Kota Bharu", lat: 6.1669, lon: 102.293, type: "airport", code: "KBR", size: "medium" },
  { name: "Alor Setar", lat: 6.1897, lon: 100.398, type: "airport", code: "AOR", size: "medium" },
  { name: "Kuantan", lat: 3.7754, lon: 103.209, type: "airport", code: "KUA", size: "medium" },
  { name: "Miri", lat: 4.3220, lon: 113.987, type: "airport", code: "MYY", size: "medium" },
  { name: "Sibu", lat: 2.2616, lon: 111.985, type: "airport", code: "SBW", size: "medium" },
  { name: "Bintulu", lat: 3.1239, lon: 113.020, type: "airport", code: "BTU", size: "medium" },
  { name: "Sandakan", lat: 5.9009, lon: 118.059, type: "airport", code: "SDK", size: "medium" },
  { name: "Tawau", lat: 4.3134, lon: 118.122, type: "airport", code: "TWU", size: "medium" },
  { name: "Labuan", lat: 5.3017, lon: 115.248, type: "airport", code: "LBU", size: "medium" },
  { name: "Subang (Sultan Abdul Aziz Shah)", lat: 3.1306, lon: 101.549, type: "airport", code: "SZB", size: "medium" },
  { name: "Lahad Datu", lat: 5.0324, lon: 118.324, type: "airport", code: "LDU", size: "medium" },
  { name: "Limbang", lat: 4.8083, lon: 115.010, type: "airport", code: "LMN", size: "medium" },
  { name: "Mulu", lat: 4.0483, lon: 114.805, type: "airport", code: "MZV", size: "medium" },
];

export const PORTS: POI[] = [
  // Major container / cargo ports
  { name: "Port Klang", lat: 3.0000, lon: 101.390, type: "port", size: "large" },
  { name: "Tanjung Pelepas", lat: 1.3620, lon: 103.545, type: "port", size: "large" },
  { name: "Penang Port", lat: 5.4150, lon: 100.345, type: "port", size: "large" },
  { name: "Johor Port (Pasir Gudang)", lat: 1.4655, lon: 103.905, type: "port", size: "large" },
  { name: "Kuantan Port", lat: 3.9784, lon: 103.433, type: "port", size: "large" },
  // Regional ports
  { name: "Kemaman Port", lat: 4.3500, lon: 103.430, type: "port", size: "medium" },
  { name: "Bintulu Port", lat: 3.1700, lon: 113.040, type: "port", size: "medium" },
  { name: "Kuching Port", lat: 1.5600, lon: 110.390, type: "port", size: "medium" },
  { name: "Kota Kinabalu Port", lat: 5.9750, lon: 116.050, type: "port", size: "medium" },
  { name: "Sandakan Port", lat: 5.8400, lon: 118.100, type: "port", size: "medium" },
  { name: "Labuan Port", lat: 5.2800, lon: 115.250, type: "port", size: "medium" },
];

export const UNIVERSITIES: POI[] = [
  // Research universities (top 5)
  { name: "Universiti Malaya", lat: 3.1192, lon: 101.654, type: "university", code: "UM", size: "large" },
  { name: "Universiti Kebangsaan Malaysia", lat: 2.9217, lon: 101.783, type: "university", code: "UKM", size: "large" },
  { name: "Universiti Putra Malaysia", lat: 2.9928, lon: 101.705, type: "university", code: "UPM", size: "large" },
  { name: "Universiti Sains Malaysia", lat: 5.3567, lon: 100.302, type: "university", code: "USM", size: "large" },
  { name: "Universiti Teknologi Malaysia", lat: 1.5592, lon: 103.637, type: "university", code: "UTM", size: "large" },
  // Other public universities
  { name: "Universiti Islam Antarabangsa", lat: 3.2514, lon: 101.736, type: "university", code: "UIAM", size: "medium" },
  { name: "Universiti Teknologi MARA", lat: 3.0706, lon: 101.501, type: "university", code: "UiTM", size: "large" },
  { name: "Universiti Utara Malaysia", lat: 6.4547, lon: 100.503, type: "university", code: "UUM", size: "medium" },
  { name: "Universiti Malaysia Sarawak", lat: 1.4655, lon: 110.430, type: "university", code: "UNIMAS", size: "medium" },
  { name: "Universiti Malaysia Sabah", lat: 6.0334, lon: 116.120, type: "university", code: "UMS", size: "medium" },
  { name: "Universiti Pendidikan Sultan Idris", lat: 3.6845, lon: 101.522, type: "university", code: "UPSI", size: "medium" },
  { name: "Universiti Sains Islam Malaysia", lat: 2.8580, lon: 101.845, type: "university", code: "USIM", size: "medium" },
  { name: "Universiti Malaysia Terengganu", lat: 5.4057, lon: 103.070, type: "university", code: "UMT", size: "medium" },
  { name: "Universiti Malaysia Pahang Al-Sultan Abdullah", lat: 3.7232, lon: 103.121, type: "university", code: "UMPSA", size: "medium" },
  { name: "Universiti Malaysia Perlis", lat: 6.4435, lon: 100.205, type: "university", code: "UniMAP", size: "medium" },
  { name: "Universiti Malaysia Kelantan", lat: 6.1253, lon: 102.234, type: "university", code: "UMK", size: "medium" },
  { name: "Universiti Tun Hussein Onn", lat: 1.8580, lon: 103.085, type: "university", code: "UTHM", size: "medium" },
  { name: "Universiti Teknikal Malaysia Melaka", lat: 2.3139, lon: 102.319, type: "university", code: "UTeM", size: "medium" },
  { name: "Universiti Sultan Zainal Abidin", lat: 5.3050, lon: 103.085, type: "university", code: "UniSZA", size: "medium" },
  { name: "Universiti Pertahanan Nasional", lat: 2.9372, lon: 101.790, type: "university", code: "UPNM", size: "medium" },
];

export const ALL_POIS = [...AIRPORTS, ...PORTS, ...UNIVERSITIES];
