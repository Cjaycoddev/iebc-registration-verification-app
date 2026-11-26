import { useEffect, useRef, useState } from 'react'

export default function FaceCapture({ open, onClose, onCapture, title = 'Capture Face' }) {
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const [error, setError]       = useState(null)
  const [ready, setReady]       = useState(false)
  const [snapshot, setSnapshot] = useState(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        const v = videoRef.current
        if (v) { v.srcObject = stream; await v.play(); setReady(true) }
      } catch (e) {
        setError(
          e.name === 'NotAllowedError'
            ? 'Camera permission denied. Enable camera access in your browser settings and reload.'
            : e.name === 'NotFoundError'
            ? 'No camera detected on this device.'
            : 'Could not start camera: ' + e.message
        )
      }
    }

    start()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      setReady(false); setSnapshot(null); setError(null)
    }
  }, [open])

  function capture() {
    const v = videoRef.current, c = canvasRef.current
    if (!v || !c || !v.videoWidth) return
    c.width = v.videoWidth; c.height = v.videoHeight
    const ctx = c.getContext('2d')
    ctx.translate(c.width, 0); ctx.scale(-1, 1)
    ctx.drawImage(v, 0, 0)
    setSnapshot(c.toDataURL('image/jpeg', 0.85))
  }

  if (!open) return null

  return (
    <div className="face-capture-backdrop" role="dialog" aria-modal="true">
      <div className="face-capture">
        <header>
          <h3>{title}</h3>
          <button onClick={onClose} aria-label="Close"></button>
        </header>

        {error ? (
          <div className="face-capture__error">{error}</div>
        ) : (
          <div className="face-capture__stage">
            {!snapshot ? (
              <>
                <video ref={videoRef} muted playsInline autoPlay />
                <div className="face-capture__oval" aria-hidden />
                {ready && (
                  <button className="face-capture__shutter" onClick={capture}
                          aria-label="Take photo" />
                )}
              </>
            ) : (
              <img src={snapshot} alt="Captured face" />
            )}
          </div>
        )}

        <canvas ref={canvasRef} hidden />

        <footer>
          {snapshot ? (
            <>
              <button className="btn btn-ghost" onClick={() => setSnapshot(null)}>Retake</button>
              <button className="btn btn-primary"
                      onClick={() => { onCapture(snapshot); onClose?.() }}>
                Use this photo
              </button>
            </>
          ) : (
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          )}
        </footer>
      </div>
    </div>
  )
}