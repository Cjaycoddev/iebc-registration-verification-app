export const features = {
  camera: typeof navigator !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
  webauthn: typeof window !== 'undefined' && !!(window.PublicKeyCredential),
  haptics: typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function',
  secureContext: typeof window !== 'undefined' && (window.isSecureContext === true || window.location.hostname === 'localhost'),
}

export async function webauthnAvailable() {
  if (!features.webauthn) return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export function isIOS() {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isMobile() {
  if (typeof navigator === 'undefined') return false
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}
