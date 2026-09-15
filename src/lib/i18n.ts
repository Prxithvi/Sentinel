// i18n strings (English + Hindi) — lightweight dictionary for the SPA
export type Lang = 'en' | 'hi';

export const dict = {
  // Common
  appName: { en: 'MPLAD Sentinel', hi: 'एमपीलैड सेंटिनल' },
  tagline: {
    en: 'AI-powered fraud detection for the MPLAD Scheme',
    hi: 'एमपीलैड योजना के लिए एआई-संचालित धोखाधड़ी पहचान',
  },
  signIn: { en: 'Sign In', hi: 'साइन इन करें' },
  signOut: { en: 'Sign Out', hi: 'साइन आउट' },
  search: { en: 'Search…', hi: 'खोजें…' },
  loading: { en: 'Loading…', hi: 'लोड हो रहा है…' },
  save: { en: 'Save', hi: 'सहेजें' },
  cancel: { en: 'Cancel', hi: 'रद्द करें' },
  submit: { en: 'Submit', hi: 'जमा करें' },
  export: { en: 'Export', hi: 'निर्यात' },
  verify: { en: 'Verify Chain', hi: 'चेन सत्यापित करें' },
  reveal: { en: 'Reveal PII', hi: 'पीआईआई देखें' },

  // Nav
  nav_dashboard: { en: 'Dashboard', hi: 'डैशबोर्ड' },
  nav_map: { en: 'India Map', hi: 'भारत मानचित्र' },
  nav_graph: { en: 'Vendor Graph', hi: 'विक्रेता ग्राफ' },
  nav_cases: { en: 'Cases', hi: 'मामले' },
  nav_leaderboard: { en: 'Leaderboard', hi: 'लीडरबोर्ड' },
  nav_transparency: { en: 'Transparency', hi: 'पारदर्शिता' },
  nav_report: { en: 'Report Fraud', hi: 'धोखाधड़ी रिपोर्ट करें' },
  nav_field: { en: 'Field Verify', hi: 'फील्ड सत्यापन' },
  nav_adminConfig: { en: 'Scoring Config', hi: 'स्कोरिंग कॉन्फ़िग' },
  nav_adminMetrics: { en: 'Model Metrics', hi: 'मॉडल मेट्रिक्स' },
  nav_adminBlacklist: { en: 'Blacklist', hi: 'ब्लैकलिस्ट' },
  nav_health: { en: 'System Health', hi: 'सिस्टम स्वास्थ्य' },

  // Dashboard
  kpi_totalWorks: { en: 'Total Works', hi: 'कुल कार्य' },
  kpi_sanctioned: { en: 'Funds Sanctioned', hi: 'स्वीकृत धन' },
  kpi_utilized: { en: 'Funds Utilized', hi: 'उपयोग किया गया धन' },
  kpi_utilizationRate: { en: 'Utilization %', hi: 'उपयोग दर %' },
  kpi_critical: { en: 'Critical Flags', hi: 'गंभीर झंडे' },
  kpi_openCases: { en: 'Open Cases', hi: 'खुले मामले' },
  kpi_citizenReports: { en: 'Citizen Reports', hi: 'नागरिक रिपोर्ट' },
  kpi_flaggedVendors: { en: 'Flagged Vendors', hi: 'चिह्नित विक्रेता' },
  topRiskWorks: { en: 'Top Risk Works', hi: 'शीर्ष जोखिम कार्य' },
  riskTrend: { en: 'Risk Trend (12 months)', hi: 'जोखिम रुझान (12 माह)' },
  tierDistribution: { en: 'Risk Tier Distribution', hi: 'जोखिम स्तर वितरण' },
  liveFeed: { en: 'Live Fund Releases', hi: 'लाइव फंड विमोचन' },

  // Cases
  case_open: { en: 'Open', hi: 'खुला' },
  case_investigating: { en: 'Investigating', hi: 'जांच चल रही' },
  case_escalated: { en: 'Escalated', hi: 'बढ़ाया गया' },
  case_resolved: { en: 'Resolved', hi: 'हल किया गया' },
  case_closed: { en: 'Closed', hi: 'बंद' },

  // Case Detail
  case_timeline: { en: 'Case Timeline', hi: 'मामला समयरेखा' },
  case_shap: { en: 'SHAP Explanation', hi: 'SHAP व्याख्या' },
  case_audit: { en: 'Audit Trail', hi: 'ऑडिट ट्रेल' },
  case_copilot: { en: 'Investigator Copilot', hi: 'अन्वेषक सहायक' },
  case_exportPdf: { en: 'Export Signed PDF', hi: 'हस्ताक्षरित पीडीएफ निर्यात' },

  // Map
  map_title: { en: 'State-wise Fund Utilization', hi: 'राज्यवार धन उपयोग' },

  // Graph
  graph_title: { en: 'Vendor Network — Collusion Ring Detection', hi: 'विक्रेता नेटवर्क — साठगर्दी रिंग पहचान' },

  // Transparency
  transparency_title: { en: 'Public Transparency Portal', hi: 'सार्वजनिक पारदर्शिता पोर्टल' },
  transparency_subtitle: {
    en: 'Aggregate, no-login view of MPLAD fund flows across India',
    hi: 'भारत भर में एमपीलैड धन प्रवाह का समग्र, बिना लॉगिन दृश्य',
  },

  // Citizen Report
  report_title: { en: 'Report a Suspicious Work', hi: 'संदिग्ध कार्य की रिपोर्ट करें' },
  report_workId: { en: 'Work ID (if known)', hi: 'कार्य आईडी (यदि ज्ञात)' },
  report_description: { en: 'Describe what you observed', hi: 'वर्णन करें कि आपने क्या देखा' },
  report_photo: { en: 'Attach Photo', hi: 'फोटो संलग्न करें' },
  report_location: { en: 'Capture Location', hi: 'स्थान कैप्चर करें' },
  report_submit: { en: 'Submit Report', hi: 'रिपोर्ट जमा करें' },
  report_success: {
    en: 'Report submitted. We cross-checked it against system flags.',
    hi: 'रिपोर्ट जमा हुई। हमने इसे सिस्टम झंडों के साथ क्रॉस-चेक किया।',
  },

  // Field Verification
  field_title: { en: 'Field Verification — Work', hi: 'फील्ड सत्यापन — कार्य' },
  field_matchesClaim: { en: 'Does the work match the claim?', hi: 'क्या कार्य दावे से मेल खाता है?' },
  field_notes: { en: 'Verification notes', hi: 'सत्यापन नोट्स' },
  field_submit: { en: 'Log Verification', hi: 'सत्यापन लॉग करें' },

  // Admin Config
  config_title: { en: 'Scoring Configuration', hi: 'स्कोरिंग कॉन्फ़िगरेशन' },
  config_weights: { en: 'Ensemble Weights', hi: 'एनसेंबल भार' },
  config_cutoffs: { en: 'Risk Tier Cutoffs', hi: 'जोखिम स्तर कटऑफ' },
  config_preview: { en: 'Preview Re-score on Sample', hi: 'नमूने पर पुनः स्कोर पूर्वावलोकन' },
  config_save: { en: 'Apply Configuration', hi: 'कॉन्फ़िगरेशन लागू करें' },

  // Model Metrics
  metrics_title: { en: 'Model Performance', hi: 'मॉडल प्रदर्शन' },
  metrics_perPattern: { en: 'Per-Fraud-Pattern Metrics', hi: 'प्रति-धोखाधड़ी-पैटर्न मेट्रिक्स' },
  metrics_rocCurve: { en: 'ROC Curve', hi: 'ROC वक्र' },
  metrics_prCurve: { en: 'Precision-Recall Curve', hi: 'परिशुद्धता-रिकॉल वक्र' },

  // System Health
  health_title: { en: 'System Health', hi: 'सिस्टम स्वास्थ्य' },
  health_apiLatency: { en: 'API Latency (p95)', hi: 'एपीआई विलंबता (p95)' },
  health_pipeline: { en: 'Pipeline Status', hi: 'पाइपलाइन स्थिति' },
  health_dbSize: { en: 'DB Size', hi: 'डीबी आकार' },
  health_uptime: { en: 'Uptime', hi: 'अपटाइम' },

  // Footer
  footer_note: {
    en: 'MPLAD Sentinel — built for SIH26102. Synthetic data for demo.',
    hi: 'एमपीलैड सेंटिनल — SIH26102 हेतु निर्मित। डेमो हेतु सिंथेटिक डेटा।',
  },
} as const;

export type DictKey = keyof typeof dict;

export function t(lang: Lang, key: DictKey): string {
  const entry = dict[key];
  if (!entry) return key as string;
  return entry[lang] ?? entry.en;
}
