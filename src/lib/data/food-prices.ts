export const FOOD_ITEMS = [
  {
    code: 1,
    name: "Chicken",
    unit: "1 kg",
    sourceUnit: "1kg",
    sourceName: "AYAM BERSIH - STANDARD",
  },
  {
    code: 1109,
    name: "Grade A eggs",
    unit: "30 eggs",
    sourceUnit: "30biji",
    sourceName: "TELUR AYAM GRED A",
  },
  {
    code: 1094,
    name: "Buruh cooking oil",
    unit: "1 kg",
    sourceUnit: "1kg",
    sourceName: "MINYAK MASAK TULEN CAP BURUH",
  },
  {
    code: 1589,
    name: "Coarse white sugar",
    unit: "1 kg",
    sourceUnit: "1kg",
    sourceName: "GULA PUTIH BERTAPIS KASAR (PELBAGAI JENAMA)",
  },
  {
    code: 917,
    name: "Sauh wheat flour",
    unit: "1 kg",
    sourceUnit: "1kg",
    sourceName: "TEPUNG GANDUM NGP (BERBUNGKUS, CAP SAUH)",
  },
  {
    code: 1432,
    name: "Local beef (lean cuts)",
    unit: "1 kg",
    sourceUnit: "1kg",
    sourceName: "DAGING LEMBU TEMPATAN (BAHAGIAN 2 DAGING PEJAL (KECUALI BATANG PINANG - TENDERLOIN)",
  },
  {
    code: 55,
    name: "Small ikan kembung (10–18 fish/kg)",
    unit: "1 kg",
    sourceUnit: "1kg",
    sourceName: "IKAN KEMBUNG KECIL/PELALING (ANTARA 10 HINGGA 18 EKOR SEKILOGRAM)",
  },
  {
    code: 88,
    name: "Ikan keli (2–5 fish/kg)",
    unit: "1 kg",
    sourceUnit: "1kg",
    sourceName: "IKAN KELI (ANTARA 2 HINGGA 5 EKOR SEKILOGRAM)",
  },
  {
    code: 92,
    name: "Green chillies",
    unit: "1 kg",
    sourceUnit: "1kg",
    sourceName: "CILI HIJAU",
  },
  {
    code: 95,
    name: "Mature ginger",
    unit: "1 kg",
    sourceUnit: "1kg",
    sourceName: "HALIA BASAH (TUA)",
  },
  {
    code: 105,
    name: "Local round cabbage",
    unit: "1 kg",
    sourceUnit: "1kg",
    sourceName: "KUBIS BULAT (TEMPATAN)",
  },
  {
    code: 109,
    name: "Carrots",
    unit: "1 kg",
    sourceUnit: "1kg",
    sourceName: "LOBAK MERAH",
  },
  {
    code: 113,
    name: "Cucumber",
    unit: "1 kg",
    sourceUnit: "1kg",
    sourceName: "TIMUN",
  },
  {
    code: 114,
    name: "Tomatoes",
    unit: "1 kg",
    sourceUnit: "1kg",
    sourceName: "TOMATO",
  },
  {
    code: 129,
    name: "Yellow onions (Holland)",
    unit: "1 kg",
    sourceUnit: "1kg",
    sourceName: "BAWANG BESAR KUNING/HOLLAND",
  },
  {
    code: 1564,
    name: "Garlic (China)",
    unit: "1 kg",
    sourceUnit: "1kg",
    sourceName: "BAWANG PUTIH IMPORT (CHINA)",
  },
  {
    code: 1556,
    name: "Green bayam",
    unit: "1 kg",
    sourceUnit: "1kg",
    sourceName: "BAYAM HIJAU",
  },
  {
    code: 1558,
    name: "Green sawi",
    unit: "1 kg",
    sourceUnit: "1kg",
    sourceName: "SAWI HIJAU",
  },
  {
    code: 1559,
    name: "Kangkung",
    unit: "1 kg",
    sourceUnit: "1kg",
    sourceName: "KANGKUNG",
  },
  {
    code: 18,
    name: "Berangan bananas",
    unit: "1 kg",
    sourceUnit: "1kg",
    sourceName: "PISANG BERANGAN",
  },
  {
    code: 16,
    name: "Papaya",
    unit: "1 kg",
    sourceUnit: "1kg",
    sourceName: "BETIK BIASA",
  },
] as const;

export interface FoodPricePoint {
  date: string;
  median: number;
  shops: number;
}
export interface FoodPriceCache {
  fetchedAt: string;
  items: {
    code: number;
    name: string;
    unit: string;
    states: Record<string, FoodPricePoint[]>;
  }[];
}
