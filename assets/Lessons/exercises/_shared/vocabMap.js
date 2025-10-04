export const vocabMap = {
  ayubowan: { si: 'ආයුබෝවන්', translit: 'ayubowan' },
  bayi: { si: 'බයි', translit: 'bayi' },
  da: { si: 'ද?', translit: 'da' },
  dukthayi: { si: 'දුක්තයි', translit: 'dukthayi' },
  eya: { si: 'ඇය', translit: 'eya' },
  gaman: { si: 'ගමන්', translit: 'gaman' },
  gena: { si: 'ගෙන්', translit: 'gena' },
  haduwime: { si: 'හඳුවීමේ', translit: 'haduwime' },
  hondai: { si: 'හොඳයි', translit: 'hondai' },
  karunakar: { si: 'කරුණාකර', translit: 'karunakara' },
  kohenda: { si: 'කොහෙන්ද?', translit: 'kohenda' },
  kohomada: { si: 'කොහොමද', translit: 'kohomada' },
  mage: { si: 'මගේ', translit: 'mage' },
  mama: { si: 'මම', translit: 'mama' },
  mokakda: { si: 'මොකක්ද?', translit: 'mokakda' },
  nae: { si: 'නෑ', translit: 'nae' },
  naehae: { si: 'නැහැ', translit: 'naehae' },
  nama: { si: 'නම', translit: 'nama' },
  ohu: { si: 'ඔහු', translit: 'ohu' },
  oya: { si: 'ඔයා', translit: 'oya' },
  oyaage: { si: 'ඔයාගේ', translit: 'oyage' },
  oyaata: { si: 'ඔයාට', translit: 'oyata' },
  owu: { si: 'ඔව්', translit: 'owu' },
  rata: { si: 'රට', translit: 'rata' },
  raththiyek: { si: 'රාත්‍රියක්', translit: 'rathriyak' },
  samavenna: { si: 'සමාවෙන්න', translit: 'samavenna' },
  sanipen: { si: 'සනීපෙන්', translit: 'sanipen' },
  santhoshayi: { si: 'සන්තෝෂයි', translit: 'santhoshayi' },
  sathutak: { si: 'සතුටක්', translit: 'sathutak' },
  sthuthiyi: { si: 'ස්තුතියි', translit: 'sthuthiyi' },
  Sri_Lanka: { si: 'ශ්‍රී ලංකාව', translit: 'Sri Lanka' },
  Australia: { si: 'ඕස්ට්‍රේලියාව', translit: 'Australia' },
  India: { si: 'ඉන්දියාව', translit: 'India' },
  suba: { si: 'සුභ', translit: 'suba' },
  udek: { si: 'උදේක්', translit: 'udek' },
  vissara: { si: 'වයස', translit: 'vissara' },
  ganan: { si: 'ගණන්', translit: 'ganan' },
  dahaya: { si: 'දහය', translit: 'dahaya' },
  visi: { si: 'විසි', translit: 'visi' },
  tis: { si: 'තිස්', translit: 'tis' },
  kathaa: { si: 'කතා', translit: 'kathaa' },
  Sinhala: { si: 'සිංහල', translit: 'Sinhala' },
  English: { si: 'ඉංග්‍රීසි', translit: 'English' },
  Tamil: { si: 'දෙමළ', translit: 'Tamil' },
  yanna: { si: 'යන්න', translit: 'yanna' },
  yaluwa: { si: 'යාලුවා', translit: 'yaluwa' }
};

export function getVocabEntry(token) {
  const key = typeof token === 'string' ? token : '';
  if (!key) {
    return { si: '', translit: '' };
  }
  const entry = vocabMap[key];
  if (entry) {
    return {
      si: entry.si || key,
      translit: entry.translit || key
    };
  }
  const fallback = key.replace(/_/g, ' ');
  return {
    si: fallback,
    translit: fallback
  };
}

export default vocabMap;
