// ============================================================
// Elden Earth — Profanity Filter
// Shared between client and server for name/chat validation
// ============================================================

const ProfanityFilter = (() => {
  // Comprehensive profanity list (lowercase)
  const PROFANITY_LIST = [
    // Sexual/Anatomical
    "anal", "anus", "ass", "asshole", "bastard", "bitch", "boob", "boobs",
    "cock", "cunt", "dick", "dildo", "fag", "faggot", "fuck", "fucking",
    "pussy", "rape", "rapist", "sex", "sexual", "slut", "whore",
    
    // Racial/Ethnic Slurs
    "nigger", "nigga", "nigro", "negro", "kike", "spic", "wetback",
    "chink", "gook", "towelhead", "cracker", "honky",
    
    // Other Offensive
    "bitch", "bullshit", "crap", "damn", "dick", "douche", "fag",
    "faggot", "fuck", "fucking", "hell", "jackass", "jerk", "piss",
    "prick", "pussy", "retard", "shit", "slut", "whore",
    
    // Violence/Abuse
    "abuse", "kill", "murder", "rape", "rapist", "suicide",
    
    // Drugs
    "cocaine", "crack", "heroin", "meth", "weed"
  ];

  // Leetspeak character mapping
  const LEET_MAP = {
    '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b',
    '@': 'a', '$': 's', '!': 'i', '+': 't'
  };

  // Convert leetspeak to normal text
  function decodeLeetspeak(text) {
    return text.toLowerCase().split('').map(char => LEET_MAP[char] || char).join('');
  }

  // Check if text contains profanity
  function containsProfanity(text) {
    if (!text || typeof text !== 'string') return false;
    
    const normalized = text.toLowerCase().trim();
    const decoded = decodeLeetspeak(normalized);
    
    // Check direct match
    for (const word of PROFANITY_LIST) {
      if (normalized.includes(word) || decoded.includes(word)) {
        return true;
      }
    }
    
    return false;
  }

  // Filter profanity from text (replace with ****)
  function filterProfanity(text) {
    if (!text || typeof text !== 'string') return text;
    
    let filtered = text;
    const normalized = text.toLowerCase();
    const decoded = decodeLeetspeak(normalized);
    
    for (const word of PROFANITY_LIST) {
      // Replace direct matches
      const regex = new RegExp(word, 'gi');
      filtered = filtered.replace(regex, '****');
      
      // Replace leetspeak variants (simplified)
      // This is a basic implementation - production would need more sophisticated matching
    }
    
    return filtered;
  }

  // Check if text is entirely profanity (should be blocked entirely)
  function isEntirelyProfanity(text) {
    if (!text || typeof text !== 'string') return false;
    
    const filtered = filterProfanity(text);
    // If after filtering, the text is mostly ****, it's entirely profanity
    const profanityRatio = (filtered.match(/\*\*\*\*/g) || []).length * 4 / text.length;
    return profanityRatio > 0.7;
  }

  return {
    containsProfanity,
    filterProfanity,
    isEntirelyProfanity,
    PROFANITY_LIST
  };
})();
