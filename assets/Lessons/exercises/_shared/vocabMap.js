export const vocabMap = {
  ayubowan: { si: 'ආයුබෝවන්', translit: 'ayubowan' },
  oya: { si: 'ඔයා', translit: 'oya' },
  kohomada: { si: 'කොහොමද', translit: 'kohomada' },
  mama: { si: 'මම', translit: 'mama' },
  hondai: { si: 'හොඳයි', translit: 'hondai' },
  owu: { si: 'ඔව්', translit: 'owu' },
  nae: { si: 'නෑ', translit: 'nae' },
  ohu: { si: 'ඔහු', translit: 'ohu' },
  eya: { si: 'ඇය', translit: 'eya' },
  mage: { si: 'මගේ', translit: 'mage' },
  nama: { si: 'නම', translit: 'nama' },
  yaluwa: { si: 'යාලුවා', translit: 'yaluwa' },
  rata: { si: 'රට', translit: 'rata' },
  gena: { si: 'ගැන', translit: 'gena' },
  Sri_Lanka: { si: 'ශ්‍රී ලංකාව', translit: 'Sri Lanka' },
  Australia: { si: 'ඕස්ට්‍රේලියාව', translit: 'Australia' },
  India: { si: 'ඉන්දියාව', translit: 'India' },
  vissara: { si: 'වයස', translit: 'vissara' },
  ganan: { si: 'ගණන්', translit: 'ganan' },
  dahaya: { si: 'දහය', translit: 'dahaya' },
  visi: { si: 'විසි', translit: 'visi' },
  tis: { si: 'තිස්', translit: 'tis' },
  kathaa: { si: 'කතා', translit: 'kathaa' },
  Sinhala: { si: 'සිංහල', translit: 'Sinhala' },
  English: { si: 'ඉංග්‍රීසි', translit: 'English' },
  Tamil: { si: 'දෙමළ', translit: 'Tamil' }
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
