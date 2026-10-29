/** One UMP check per app session. Google persists the consent, not us. */
async function fetchConsent() {
  const { AdMob, AdmobConsentStatus } = await import("@capacitor-community/admob");
  let info = await AdMob.requestConsentInfo();
  if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) {
    info = await AdMob.showConsentForm();
  }
  return info;
}
let consentForSession: ReturnType<typeof fetchConsent> | null = null;
let sdkForSession: Promise<void> | null = null;
export function requestConsentForSession(): ReturnType<typeof fetchConsent> {
  if (!consentForSession) consentForSession = fetchConsent().catch((error: unknown) => {
    consentForSession = null;
    throw error;
  });
  return consentForSession;
}
export function invalidateConsentForSession(): void {
  consentForSession = null;
  // The user may revoke ads. Every currently displayed native view must
  // be destroyed before the next ad request checks Google's revised choice.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("wave-admob-consent-changed"));
  }
}
export function initializeMobileAdsForSession(): Promise<void> {
  if (!sdkForSession) sdkForSession = import("@capacitor-community/admob")
    .then(({AdMob}) => AdMob.initialize())
    .then(() => undefined)
    .catch((error: unknown) => {sdkForSession = null; throw error;});
  return sdkForSession;
}
