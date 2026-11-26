import { useEffect, useRef, useState } from 'react'
import * as faceapi from '@vladmandic/face-api'
import { loadFaceModels, compareDescriptors } from '../lib/faceMatch'

const DETECT_INTERVAL_MS = 500
const STABLE_FRAMES_TO_CAPTURE = 3
const SCORE_THRESHOLD = 0.55
const NO_MATCH_TIMEOUT_MS = 10000

export default function FaceCapture({
  open,
  onClose,
  onCapture,
  storedDescriptor,
  onMatch,
  matchThreshold = 0.5,
  title = 'Face Capture',
}) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const loopRef = useRef(null)
  const stableRef = useRef(0)
  const capturedRef = useRef(false)
  const noMatchStartRef = useRef(null)
  const onMatchRef = useRef(null)
  const onCaptureRef = useRef(null)
  const fireMatchRef = useRef(null)
  const captureRegistrationRef = useRef(null)

  const isVerifyMode = !!storedDescriptor

  const [error, setError] = useState(null)
  const [ready, setReady] = useState(false)
  const [captured, setCaptured] = useState(false)
  const [status, setStatus] = useState('starting')
  const [faceDetected, setFaceDetected] = useState(false)
  const [progress, setProgress] = useState(0)
  const [liveConfidence, setLiveConfidence] = useState(null)
  const [liveDistance, setLiveDistance] = useState(null)
  const [matched, setMatched] = useState(false)

  useEffect(() => { onMatchRef.current = onMatch }, [onMatch])
  useEffect(() => { onCaptureRef.current = onCapture }, [onCapture])

  useEffect(() => {
    if (!open) return
    let cancelled = false

    async function start() {
      try {
        setError(null); setStatus('starting'); setProgress(0)
        setMatched(false); setLiveConfidence(null); setLiveDistance(null)
        capturedRef.current = false; setCaptured(false)
        stableRef.current = 0; noMatchStartRef.current = null

        await loadFaceModels()
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        const v = videoRef.current
        if (v) {
          v.srcObject = stream
          await v.play()
          setReady(true)
          setStatus(isVerifyMode ? 'scanning' : 'searching')
        }
      } catch (e) {
        const msg = e?.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow camera access and reload.'
          : e?.name === 'NotFoundError'
          ? 'No camera detected on this device.'
          : 'Could not start camera: ' + (e?.message || 'unknown')
        setError(msg)
      }
    }

    start()
    return () => {
      cancelled = true
      clearInterval(loopRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      setReady(false)
    }
  }, [open, isVerifyMode])

  function captureToDataUrl() {
    const v = videoRef.current, c = canvasRef.current
    if (!v || !c || !v.videoWidth) return null
    c.width = v.videoWidth
    c.height = v.videoHeight
    const ctx = c.getContext('2d')
    ctx.translate(c.width, 0); ctx.scale(-1, 1)
    ctx.drawImage(v, 0, 0)
    return c.toDataURL('image/jpeg', 0.88)
  }

  function stopStream() {
    clearInterval(loopRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  function markCaptured() {
    capturedRef.current = true
    setCaptured(true)
  }

  // ---- Registration mode: auto-capture when face is stable ----
  function captureRegistration() {
    if (capturedRef.current) return
    markCaptured()
    setStatus('captured')
    const dataUrl = captureToDataUrl()
    if (!dataUrl) {
      setStatus('searching')
      capturedRef.current = false
      setCaptured(false)
      return
    }
    stopStream()
    setTimeout(() => {
      onCaptureRef.current?.(dataUrl)
      onClose?.()
    }, 500)
  }

  // ---- Verification mode: fire match callback with explicit values ----
  function fireMatch(success, confidence, distance) {
    if (capturedRef.current) return
    markCaptured()
    const dataUrl = captureToDataUrl()
    stopStream()
    setTimeout(() => {
      onMatchRef.current?.({ success, confidence, distance, dataUrl })
      onClose?.()
    }, 500)
  }

  useEffect(() => {
    fireMatchRef.current = fireMatch
    captureRegistrationRef.current = captureRegistration
  })

  useEffect(() => {
    if (!ready || !open) return
    clearInterval(loopRef.current)
    loopRef.current = setInterval(async () => {
      const v = videoRef.current
      if (!v || capturedRef.current) return
      if (v.readyState < 2 || !v.videoWidth) return

      try {
        const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: SCORE_THRESHOLD })
        const det = await faceapi.detectSingleFace(v, options)
          .withFaceLandmarks()
          .withFaceDescriptor()

        if (!det || det.detection.score < SCORE_THRESHOLD) {
          stableRef.current = 0
          noMatchStartRef.current = null
          setFaceDetected(false)
          setProgress(0)
          setLiveConfidence(null)
          setLiveDistance(null)
          setStatus(isVerifyMode ? 'scanning' : 'searching')
          return
        }

        setFaceDetected(true)

        if (isVerifyMode) {
          const liveDesc = Array.from(det.descriptor)
          const comparison = compareDescriptors(storedDescriptor, liveDesc, matchThreshold)
          setLiveDistance(comparison.distance)
          setLiveConfidence(comparison.confidence)

          if (comparison.isMatch) {
            setStatus('matched')
            setMatched(true)
            fireMatchRef.current?.(true, comparison.confidence, comparison.distance)
          } else {
            setStatus('scanning')
            if (!noMatchStartRef.current) noMatchStartRef.current = Date.now()
            const elapsed = Date.now() - noMatchStartRef.current
            if (elapsed > NO_MATCH_TIMEOUT_MS) setStatus('no-match')
          }
        } else {
          stableRef.current++
          setProgress(Math.min(100, (stableRef.current / STABLE_FRAMES_TO_CAPTURE) * 100))
          setStatus('holding')
          if (stableRef.current >= STABLE_FRAMES_TO_CAPTURE) captureRegistrationRef.current?.()
        }
      } catch { /* swallow transient errors */ }
    }, DETECT_INTERVAL_MS)
    return () => clearInterval(loopRef.current)
  }, [ready, open, isVerifyMode, storedDescriptor, matchThreshold])

  function manualCapture() {
    if (!ready || capturedRef.current) return
    if (isVerifyMode) {
      const v = videoRef.current
      if (!v) return
      faceapi.detectSingleFace(v, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: SCORE_THRESHOLD }))
        .withFaceLandmarks()
        .withFaceDescriptor()
        .then(det => {
          if (!det) return
          const liveDesc = Array.from(det.descriptor)
          const comp = compareDescriptors(storedDescriptor, liveDesc, matchThreshold)
          setLiveConfidence(comp.confidence)
          setLiveDistance(comp.distance)
          fireMatch(comp.isMatch, comp.confidence, comp.distance)
        })
        .catch(() => {})
    } else {
      captureRegistration()
    }
  }

  function reportMismatch() {
    fireMatch(false, liveConfidence, liveDistance)
  }

  if (!open) return null

  const statusText = (() => {
    if (status === 'starting') return 'Starting camera...'
    if (status === 'searching') return 'Center your face in the oval'
    if (status === 'holding') return 'Hold still...'
    if (status === 'captured') return 'Captured!'
    if (status === 'scanning') return faceDetected ? 'Verifying... keep looking at the camera' : 'Center your face in the oval'
    if (status === 'matched') return 'Match found'
    if (status === 'no-match') return 'No match yet  hold still or report mismatch'
    return ''
  })()

  const confidencePct = typeof liveConfidence === 'number'
    ? Math.round(liveConfidence * 100)
    : null

  return (
    <div className="face-capture-backdrop" role="dialog" aria-modal="true">
      <div className={'face-capture face-capture-live' + (matched ? ' is-matched' : '')}>
        <header>
          <h3>{title}</h3>
          <button onClick={onClose} aria-label="Close">x</button>
        </header>

        {error ? (
          <div className="face-capture__error">{error}</div>
        ) : (
          <div className="face-capture__stage">
            <video ref={videoRef} muted playsInline autoPlay />
            <div className={'face-oval' + (faceDetected ? ' is-detected' : '') + (matched ? ' is-matched' : '')} aria-hidden="true" />

            {faceDetected && (
              <div className="face-detected-badge">
                <span className="face-detected-dot" />
                <span>{isVerifyMode ? 'Analysing face' : 'Face detected'}</span>
              </div>
            )}

            {isVerifyMode && confidencePct !== null && !matched && (
              <div className={'face-confidence' + (confidencePct >= 70 ? ' is-high' : confidencePct >= 50 ? ' is-mid' : ' is-low')}>
                Match: {confidencePct}%
              </div>
            )}

            <div className="face-status">{statusText}</div>

            {!isVerifyMode && progress > 0 && status !== 'captured' && (
              <div className="face-progress">
                <div className="face-progress-bar" style={{ width: progress + '%' }} />
              </div>
            )}

            {matched && (
              <div className="face-match-flash">
                <svg viewBox="0 0 52 52" className="tick" aria-hidden="true">
                  <circle className="tick-circle" cx="26" cy="26" r="24" />
                  <path className="tick-check" d="M14 27 L23 36 L39 18" />
                </svg>
              </div>
            )}
          </div>
        )}

        <canvas ref={canvasRef} hidden />

        <footer>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          {isVerifyMode && status === 'no-match' && (
            <button className="btn-primary btn-danger" onClick={reportMismatch}>Report Mismatch</button>
          )}
          <button className="btn-primary" onClick={manualCapture} disabled={!ready || captured}>
            {isVerifyMode ? 'Force Match Check' : 'Capture Now'}
          </button>
        </footer>
      </div>
    </div>
  )
}