/**
 * Major Malaysian towns for pinning news headlines on the live map.
 * Matched against headline text (case-insensitive, whole word). Order matters:
 * longer / more specific names first so "Kota Kinabalu" wins over "Kota".
 */
export interface Town {
  name: string;
  lat: number;
  lon: number;
  aliases?: string[];
}

export const TOWNS: Town[] = [
  { name: "Kuala Lumpur", lat: 3.139, lon: 101.6869, aliases: ["KL", "Bukit Bintang", "Cheras", "Kepong", "Setapak", "Bangsar", "Mont Kiara", "Wangsa Maju", "Sentul"] },
  { name: "Putrajaya", lat: 2.9264, lon: 101.6964 },
  { name: "Cyberjaya", lat: 2.9213, lon: 101.6559 },
  { name: "Petaling Jaya", lat: 3.1073, lon: 101.6067, aliases: ["PJ", "Damansara"] },
  { name: "Shah Alam", lat: 3.0733, lon: 101.5185 },
  { name: "Subang Jaya", lat: 3.0567, lon: 101.5851, aliases: ["Subang", "USJ", "Puchong"] },
  { name: "Klang", lat: 3.0449, lon: 101.4455, aliases: ["Port Klang"] },
  { name: "Kajang", lat: 2.9935, lon: 101.7874, aliases: ["Bangi", "Semenyih"] },
  { name: "Ampang", lat: 3.1503, lon: 101.7622 },
  { name: "Gombak", lat: 3.2515, lon: 101.6513, aliases: ["Batu Caves", "Selayang", "Rawang"] },
  { name: "Sepang", lat: 2.6907, lon: 101.7496, aliases: ["KLIA", "Nilai"] },
  { name: "Seremban", lat: 2.7297, lon: 101.9381 },
  { name: "Port Dickson", lat: 2.5228, lon: 101.7962 },
  { name: "Melaka", lat: 2.1896, lon: 102.2501, aliases: ["Malacca", "Ayer Keroh"] },
  { name: "Johor Bahru", lat: 1.4927, lon: 103.7414, aliases: ["JB", "Iskandar Puteri", "Skudai", "Pasir Gudang", "Tebrau"] },
  { name: "Batu Pahat", lat: 1.8548, lon: 102.9325 },
  { name: "Muar", lat: 2.0442, lon: 102.5689 },
  { name: "Kluang", lat: 2.0251, lon: 103.3328 },
  { name: "Segamat", lat: 2.5148, lon: 102.8158 },
  { name: "Mersing", lat: 2.4312, lon: 103.8405 },
  { name: "Kota Tinggi", lat: 1.7381, lon: 103.8999, aliases: ["Desaru"] },
  { name: "Kuantan", lat: 3.8077, lon: 103.326 },
  { name: "Temerloh", lat: 3.4506, lon: 102.4176 },
  { name: "Bentong", lat: 3.5216, lon: 101.9082, aliases: ["Genting Highlands", "Genting"] },
  { name: "Cameron Highlands", lat: 4.4718, lon: 101.3767, aliases: ["Tanah Rata"] },
  { name: "Raub", lat: 3.7925, lon: 101.8574 },
  { name: "Pekan", lat: 3.4894, lon: 103.3906 },
  { name: "Kuala Terengganu", lat: 5.3302, lon: 103.1408, aliases: ["Terengganu"] },
  { name: "Kemaman", lat: 4.2333, lon: 103.4186, aliases: ["Chukai", "Kerteh"] },
  { name: "Dungun", lat: 4.7573, lon: 103.4222 },
  { name: "Kota Bharu", lat: 6.1254, lon: 102.2381, aliases: ["Kelantan"] },
  { name: "Pasir Mas", lat: 6.0434, lon: 102.1383 },
  { name: "Tanah Merah", lat: 5.8098, lon: 102.1474 },
  { name: "Gua Musang", lat: 4.8826, lon: 101.9686 },
  { name: "Ipoh", lat: 4.5975, lon: 101.0901 },
  { name: "Taiping", lat: 4.85, lon: 100.7333 },
  { name: "Teluk Intan", lat: 4.0259, lon: 101.0213 },
  { name: "Lumut", lat: 4.2333, lon: 100.6333, aliases: ["Manjung", "Sitiawan"] },
  { name: "Kuala Kangsar", lat: 4.7726, lon: 100.9406 },
  { name: "Tapah", lat: 4.1984, lon: 101.2622 },
  { name: "George Town", lat: 5.4141, lon: 100.3288, aliases: ["Georgetown", "Penang", "Pulau Pinang", "Bayan Lepas", "Gelugor"] },
  { name: "Butterworth", lat: 5.3992, lon: 100.3638, aliases: ["Seberang Perai", "Bukit Mertajam", "Seberang Jaya"] },
  { name: "Alor Setar", lat: 6.1248, lon: 100.3678, aliases: ["Kedah"] },
  { name: "Sungai Petani", lat: 5.6472, lon: 100.4877 },
  { name: "Kulim", lat: 5.3648, lon: 100.5617 },
  { name: "Langkawi", lat: 6.35, lon: 99.8 },
  { name: "Kangar", lat: 6.4414, lon: 100.1986, aliases: ["Perlis", "Padang Besar"] },
  { name: "Kota Kinabalu", lat: 5.9804, lon: 116.0735, aliases: ["KK", "Sabah", "Penampang", "Likas"] },
  { name: "Sandakan", lat: 5.8402, lon: 118.1179 },
  { name: "Tawau", lat: 4.2448, lon: 117.8911 },
  { name: "Lahad Datu", lat: 5.0268, lon: 118.3269 },
  { name: "Keningau", lat: 5.3378, lon: 116.1602 },
  { name: "Semporna", lat: 4.4813, lon: 118.6112, aliases: ["Sipadan"] },
  { name: "Kudat", lat: 6.8837, lon: 116.8456 },
  { name: "Ranau", lat: 5.9538, lon: 116.6642, aliases: ["Kinabalu", "Kundasang"] },
  { name: "Labuan", lat: 5.2831, lon: 115.2308 },
  { name: "Kuching", lat: 1.5535, lon: 110.3593, aliases: ["Sarawak", "Kota Samarahan", "Padawan"] },
  { name: "Miri", lat: 4.3995, lon: 113.9914 },
  { name: "Sibu", lat: 2.287, lon: 111.8306 },
  { name: "Bintulu", lat: 3.1714, lon: 113.0419 },
  { name: "Sri Aman", lat: 1.2374, lon: 111.4621 },
  { name: "Limbang", lat: 4.75, lon: 115.0 },
  { name: "Kapit", lat: 2.0167, lon: 112.9333 },
  { name: "Mukah", lat: 2.9, lon: 112.0833 },
];

const matchers = TOWNS.map((t) => ({
  town: t,
  re: new RegExp(`\\b(${[t.name, ...(t.aliases ?? [])].map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i"),
}));

/** First town mentioned in a headline, or null. */
export function matchTown(text: string): Town | null {
  for (const m of matchers) if (m.re.test(text)) return m.town;
  return null;
}
