import * as faceapi from '@vladmandic/face-api'

const MODEL_URL = '/models'
export const MATCH_THRESHOLD = 0.5

let modelsPromise = null
let modelsReady = false

export function areModelsReady() {
  return modelsReady
}

export async function loadFaceModels(onProgress) {
  if (modelsReady) return
  if (modelsPromise) return modelsPromise
  modelsPromise = (async () => {
    onProgress?.('Loading face detector (1/3)...')
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL)
    onProgress?.('Loading facial landmarks (2/3)...')
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
    onProgress?.('Loading face recognition (3/3)...')
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    modelsReady = true
  })().catch(err => {
    modelsPromise = null
    throw err
  })
  return modelsPromise
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load captured image'))
    img.src = dataUrl
  })
}

export async function computeFaceDescriptor(dataUrl) {
  await loadFaceModels()
  const img = await loadImage(dataUrl)
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 })
  const detection = await faceapi
    .detectSingleFace(img, options)
    .withFaceLandmarks()
    .withFaceDescriptor()
  if (!detection) {
    throw new Error('No face detected. Make sure the face is centered, well-lit, and looking at the camera.')
  }
  return Array.from(detection.descriptor)
}

export function euclideanDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i]
    sum += d * d
  }
  return Math.sqrt(sum)
}

export function normalizeDescriptor(d) {
  if (!d) return null
  if (Array.isArray(d)) return d
  if (typeof d === 'object') return Object.values(d)
  return null
}

export function compareDescriptors(stored, live, threshold = MATCH_THRESHOLD) {
  const s = normalizeDescriptor(stored)
  const l = normalizeDescriptor(live)
  const distance = euclideanDistance(s, l)
  const isMatch = distance < threshold
  const confidence = Number.isFinite(distance)
    ? Math.max(0, Math.min(1, 1 - distance / (threshold * 2)))
    : 0
  return { distance, isMatch, confidence, threshold }
}