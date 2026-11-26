import { useEffect } from 'react'

export default function VerifyResult({ result, onClose, autoCloseMs = 2400 }) {
  useEffect(() => {
    if (!result || autoCloseMs <= 0) return
    const t = setTimeout(() => onClose?.(), autoCloseMs)
    return () => clearTimeout(t)
  }, [result, autoCloseMs, onClose])

  if (!result) return null
  const { success, message, voterName } = result

  return (
    <div className="verify-overlay" role="dialog" aria-modal="true" onClick={() => onClose?.()}>
      <div className={'verify-card ' + (success ? 'is-success' : 'is-fail')}
           onClick={e => e.stopPropagation()}>
        <div className="verify-icon">
          {success ? (
            <svg viewBox="0 0 52 52" className="tick" aria-hidden="true">
              <circle className="tick-circle" cx="26" cy="26" r="24" />
              <path   className="tick-check"  d="M14 27 L23 36 L39 18" />
            </svg>
          ) : (
            <svg viewBox="0 0 52 52" className="cross" aria-hidden="true">
              <circle className="cross-circle" cx="26" cy="26" r="24" />
              <path   className="cross-line cross-1" d="M17 17 L35 35" />
              <path   className="cross-line cross-2" d="M35 17 L17 35" />
            </svg>
          )}
        </div>
        <h2>{success ? 'Verification Successful' : 'Verification Failed'}</h2>
        {voterName && <p className="verify-name">{voterName}</p>}
        {message   && <p className="verify-msg">{message}</p>}
      </div>
    </div>
  )
}