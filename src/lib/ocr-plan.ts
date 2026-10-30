import type { OcrScript } from "./ocr-merge";
export type OcrMode = OcrScript | "auto" | "russian" | "kazakh" | "custom";
export type OcrScanRequest = OcrMode | readonly OcrScript[];

// Every bundled recognizer remains available. A recovery pass can target only
// models that failed without discarding completed results from the first pass.
export const AUTO_SCAN_ORDER: readonly OcrScript[] = ["latin", "cyrillic", "japanese", "chinese", "korean", "devanagari"];
// Keep the validated, pinned Russian/Kazakh ordering.
export const CYRILLIC_OCR_LANGUAGES = "kaz+rus" as const;

/** Never silently scan an unknown model or accept an empty recovery plan. */
export function ocrScanPlan(request: OcrScanRequest): OcrScript[] {
  if (typeof request !== "string") {
    const scripts = [...request];
    if (!scripts.length || new Set(scripts).size !== scripts.length ||
        scripts.some(script => !AUTO_SCAN_ORDER.includes(script))) {
      throw new Error("Invalid OCR scan plan");
    }
    return scripts;
  }
  if (request === "auto") return [...AUTO_SCAN_ORDER];
  if (request === "russian" || request === "kazakh") return ["cyrillic"];
  if (request === "custom") throw new Error("Select at least one OCR script");
  if (!AUTO_SCAN_ORDER.includes(request)) throw new Error("Invalid OCR scan plan");
  return [request];
}

/**
 * Prioritize unmistakable Unicode script evidence in already recognized
 * local text, but never drop an OCR model from the scan plan.
 * Han alone cannot reliably distinguish Chinese from Japanese.
 */
export function prioritizeRemainingOcrScripts(
  remaining: readonly OcrScript[], recognized: string,
  reportedLanguages: readonly string[] = [],
): OcrScript[] {
  const text = recognized.slice(0, 12000);
  const kana = (text.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []).length;
  const hangul = (text.match(/\p{Script=Hangul}/gu) ?? []).length;
  const devanagari = (text.match(/\p{Script=Devanagari}/gu) ?? []).length;
  const cyrillic = (text.match(/\p{Script=Cyrillic}/gu) ?? []).length;
  const latin = (text.match(/\p{Script=Latin}/gu) ?? []).length;
  const evidence: Partial<Record<OcrScript,number>> = {
    japanese:kana, korean:hangul, devanagari, cyrillic, latin,
  };

  // Only BCP-47 language tags returned by an already completed on-device
  // recognizer are treated as hints. Labels never prove page coverage:
  // EVERY model in 'remaining' is still attempted, in a stable order.
  for (const raw of reportedLanguages.slice(0,100)) {
    if (typeof raw !== "string" || raw.length > 32) continue;
    const lang=raw.trim().toLowerCase().replace(/_/gu,"-").split("-")[0];
    const model: OcrScript | undefined =
      lang === "ja" ? "japanese" : lang === "zh" ? "chinese" :
      lang === "ko" ? "korean" :
      ["hi","mr","ne","sa"].includes(lang) ? "devanagari" :
      ["ru","kk","uk"].includes(lang) ? "cyrillic" :
      ["en","fr","de","es"].includes(lang) ? "latin" : undefined;
    if (model) evidence[model]=(evidence[model] ?? 0)+4;
  }
  // A Han ideograph alone is shared by Japanese and Chinese; it never
  // increases either score without Kana or a genuinely reported tag.
  return remaining.map((script,index) => ({script,index,score:evidence[script] ?? 0}))
    .sort((a,b) => b.score - a.score || a.index - b.index)
    .map(item => item.script);
}

/** Camera and gallery must use the SAME stable OCR execution order.
 * Visual classification is an unverified hint (not ground truth), and even
 * a different JPEG encoding of the SAME photograph can change the hint.
 * Do not let the source/picker or detector change the engines' order.
 * Full-language fallback remains available through AUTO_SCAN_ORDER.
 */
export function completeAutomaticOcrPlan(_detectedScript?:string):OcrScript[] {
  return [...AUTO_SCAN_ORDER];
}

/** A scan with likely Cyrillic text must not silently auto-save corrupted
 * characters merely because a different OCR engine returned nonempty text.
 * Low-confidence readings go to the existing editable OCR review, not to
 * an unverified new note. This rule applies identically to both sources.
 */
export function automaticOcrRequiresReview(
  readings: readonly {script:OcrScript;text:string;confidence?:number}[],
  selectedText:string,
  detectedScript?:string,
):boolean {
  const cyr=readings.find(item=>item.script==="cyrillic");
  const count=(text:string)=>(text.match(/\p{Script=Cyrillic}/gu)??[]).length;
  const cyrLetters=count(cyr?.text??"");
  const mergedLetters=count(selectedText);
  if(cyrLetters>=12 && mergedLetters<Math.max(4,cyrLetters*0.25))return true;
  if(cyr && cyrLetters>=12 && typeof cyr.confidence==="number" &&
     Number.isFinite(cyr.confidence) && cyr.confidence<40)return true;
  if(detectedScript==="cyrillic" && mergedLetters<4 &&
     (selectedText.match(/\p{L}/gu)??[]).length>=16)return true;
  return false;
}

/** Manual native language selection, still exclusively from APK-bundled models.
 * Recovering an automatic failure uses both languages by default.
 */
export function cyrillicLanguageForScan(request: OcrScanRequest): "rus" | "kaz" | typeof CYRILLIC_OCR_LANGUAGES {
  return request === "russian" ? "rus" :
    request === "kazakh" ? "kaz" : CYRILLIC_OCR_LANGUAGES;
}


/** A user-selected group of installed models. Reject invalid requests rather
 * than silently omit a language. Keep a stable order to allow reproducible OCR.
 */
export function selectedOcrScanPlan(selection: readonly OcrScript[]): OcrScript[] {
  if (!selection.length || new Set(selection).size !== selection.length ||
      selection.some(script => !AUTO_SCAN_ORDER.includes(script))) {
    throw new Error("Invalid OCR scan plan");
  }
  return AUTO_SCAN_ORDER.filter(script => selection.includes(script));
}


/** Small local-only preference. The automatic full-language scan remains the
 * default on first install; explicitly chosen models persist across launches.
 */
const OCR_PREFERENCE_KEY = "wave.ocr.scan-preferences.v1";
export type OcrScanPreferences = { mode: OcrMode; scripts: OcrScript[] };
type PreferenceStore = Pick<Storage,"getItem"|"setItem">;
function preferencesStorage(): PreferenceStore | null {
  try { return typeof window !== "undefined" ? window.localStorage : null; }
  catch { return null; }
}
export function readOcrScanPreferences(
  target: PreferenceStore | null = preferencesStorage(),
): OcrScanPreferences {
  const fallback: OcrScanPreferences = {mode:"auto",scripts:["latin","cyrillic"]};
  try {
    const raw=target?.getItem(OCR_PREFERENCE_KEY);
    if (!raw || raw.length > 1000) return fallback;
    const value: unknown=JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
    const data=value as Record<string,unknown>;
    if (typeof data.mode !== "string" || !["auto","custom","russian","kazakh",...AUTO_SCAN_ORDER].includes(data.mode) ||
        !Array.isArray(data.scripts)) return fallback;
    const scripts=selectedOcrScanPlan(data.scripts as OcrScript[]);
    return {mode:data.mode as OcrMode,scripts};
  } catch { return fallback; }
}
export function saveOcrScanPreferences(
  value: OcrScanPreferences,
  target: PreferenceStore | null = preferencesStorage(),
): boolean {
  if (!target || !["auto","custom","russian","kazakh",...AUTO_SCAN_ORDER].includes(value.mode)) return false;
  try {
    const scripts=selectedOcrScanPlan(value.scripts);
    target.setItem(OCR_PREFERENCE_KEY,JSON.stringify({mode:value.mode,scripts}));
    return true;
  } catch { return false; }
}


/** Conservative fast path after already-loaded offline recognizers. A
 * single-language page with strong script evidence stops additional models;
 * unclear/mixed pages still use more recognizers, without downloads.
 * Recognizer-produced letters are evidence, NOT a standalone language model.
 */
export function confidentOcrPrimaryScript(
  readings: readonly {script:OcrScript;text:string;confidence?:number}[],
): OcrScript | null {
  if (!readings.length) return null;
  const count=(text:string,regex:RegExp)=> (text.match(regex)??[]).length;
  const total=readings.map(r=>r.text.slice(0,8000));
  const all=total.join("\n");
  const latin=count(all,/\p{Script=Latin}/gu);
  const cyrillic=count(all,/\p{Script=Cyrillic}/gu);
  const kana=count(all,/[\p{Script=Hiragana}\p{Script=Katakana}]/gu);
  const han=count(all,/\p{Script=Han}/gu);
  const hangul=count(all,/\p{Script=Hangul}/gu);
  const deva=count(all,/\p{Script=Devanagari}/gu);
  const letters=latin+cyrillic+kana+han+hangul+deva;
  if(letters<16)return null;
  const scriptCounts:Record<OcrScript,number>={
    latin,cyrillic,japanese:kana,chinese:han,korean:hangul,devanagari:deva,
  };
  // Non-Latin recognizers sometimes produce false ASCII-looking strings.
  // Never trust Latin until the Cyrillic scan has had its chance.
  const haveCyrillic=readings.some(r=>r.script==="cyrillic");
  if(!haveCyrillic)return null;
  const best=readings
    .filter(r=> (r.confidence??100)>=45)
    .map(r=>r.script)
    .filter((v,i,arr)=>arr.indexOf(v)===i)
    .filter(script=>{
      const own=scriptCounts[script];
      if(script==="japanese")return kana>=5 && (kana+han)/letters>.8;
      if(script==="chinese")return han>=12 && kana===0 && han/letters>.85;
      if(script==="latin")return latin>=40 && latin/letters>.92
        && (all.match(/\b[\p{Script=Latin}]{3,}\b/gu)??[]).length>=5;
      return own>=20 && own/letters>.9;
    });
  return best.length===1?best[0]:null;
}


/** Image-first hint from VisualScriptDetector, before text recognition.
 * Unknown or unreliable results keep the original six-engine OCR fallback.
 * Han glyphs can be Chinese OR Japanese, so both are always checked.
 * Latin/Cyrillic share letter shapes, so verify using BOTH recognizers.
 * Native visual hints never turn off manual review of suspicious results.
 */
export function visualOcrScanPlan(script: string): OcrScript[] | null {
  switch(script) {
    case "latin": return ["latin","cyrillic"];
    case "cyrillic": return ["cyrillic","latin"];
    case "japanese": return ["japanese","chinese"];
    case "han": return ["chinese","japanese"];
    case "korean": return ["korean"];
    case "devanagari": return ["devanagari"];
    default: return null;
  }
}
