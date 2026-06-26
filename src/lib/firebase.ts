import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import type { Student } from '../types'

type FirebaseRuntime = {
  app: FirebaseApp
  db: Firestore
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const requiredConfig = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.appId,
]

const firebaseEnabled = requiredConfig.every(Boolean)
let runtime: FirebaseRuntime | null = null

export function isFirebaseEnabled() {
  return firebaseEnabled
}

export function getFirebaseRuntime() {
  if (!firebaseEnabled) return null
  if (!runtime) {
    const app = initializeApp(firebaseConfig)
    runtime = {
      app,
      db: getFirestore(app),
    }
  }
  return runtime
}

export function subscribeCurrentUser(callback: (user: User | null) => void) {
  const currentRuntime = getFirebaseRuntime()
  if (!currentRuntime) {
    callback(null)
    return () => undefined
  }

  return onAuthStateChanged(getAuth(currentRuntime.app), callback)
}

function makeGoogleProvider() {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ hd: 'mail2.smes.tyc.edu.tw', prompt: 'select_account' })
  return provider
}

export async function signInWithGoogle() {
  const currentRuntime = getFirebaseRuntime()
  if (!currentRuntime) throw new Error('Firebase is not configured')
  return signInWithPopup(getAuth(currentRuntime.app), makeGoogleProvider())
}

export async function signInWithGoogleRedirect() {
  const currentRuntime = getFirebaseRuntime()
  if (!currentRuntime) throw new Error('Firebase is not configured')
  return signInWithRedirect(getAuth(currentRuntime.app), makeGoogleProvider())
}

export async function getGoogleRedirectResult(): Promise<{ errorMessage: string } | null> {
  const currentRuntime = getFirebaseRuntime()
  if (!currentRuntime) return null
  try {
    await getRedirectResult(getAuth(currentRuntime.app))
    return null
  } catch (error) {
    const msg = (error as { message?: string }).message ?? String(error)
    console.error('[Auth] getRedirectResult error:', msg)
    return { errorMessage: msg }
  }
}

export async function signOutFirebase() {
  const currentRuntime = getFirebaseRuntime()
  if (!currentRuntime) return
  await signOut(getAuth(currentRuntime.app))
}

export async function checkIsAdmin() {
  const currentRuntime = getFirebaseRuntime()
  if (!currentRuntime) return false

  const user = getAuth(currentRuntime.app).currentUser
  if (!user) return false

  try {
    const snapshot = await getDoc(doc(currentRuntime.db, 'admins', user.uid))
    return snapshot.exists()
  } catch {
    return false
  }
}

export async function loadFirebaseStudents() {
  const currentRuntime = getFirebaseRuntime()
  if (!currentRuntime) return []

  const snapshot = await getDocs(collection(currentRuntime.db, 'students'))
  return snapshot.docs.map((studentDoc) => {
    const data = studentDoc.data()
    return {
      id: studentDoc.id,
      studentNo: String(data.studentNo ?? ''),
      grade: Number(data.grade ?? 0),
      classNo: Number(data.classNo ?? 0),
      className: String(data.className ?? ''),
      classCode: String(data.classCode ?? ''),
      seatNo: String(data.seatNo ?? ''),
      name: String(data.name ?? ''),
      gender: String(data.gender ?? ''),
      updatedAt: String(data.updatedAt ?? ''),
    } satisfies Student
  })
}

// 用 REST API 載入學生（不需要登入）—— allow read: if true 時可直接呼叫
type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { timestampValue: string }

function readField(v: FirestoreValue | undefined): string | number {
  if (!v) return ''
  if ('stringValue' in v) return v.stringValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('timestampValue' in v) return v.timestampValue
  return ''
}

export async function loadStudentsPublic(): Promise<Student[]> {
  const projectId = firebaseConfig.projectId
  const apiKey = firebaseConfig.apiKey
  if (!projectId || !apiKey) return []

  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/students`
  const students: Student[] = []
  let pageToken = ''

  do {
    const url = `${base}?key=${apiKey}&pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Firestore REST ${res.status}`)
    const json = await res.json() as {
      documents?: Array<{ name: string; fields: Record<string, FirestoreValue> }>
      nextPageToken?: string
    }
    for (const docEntry of json.documents ?? []) {
      const f = docEntry.fields ?? {}
      const id = docEntry.name.split('/').pop() ?? ''
      students.push({
        id,
        studentNo: String(readField(f.studentNo) ?? ''),
        grade: Number(readField(f.grade) ?? 0),
        classNo: Number(readField(f.classNo) ?? 0),
        className: String(readField(f.className) ?? ''),
        classCode: String(readField(f.classCode) ?? ''),
        seatNo: String(readField(f.seatNo) ?? ''),
        name: String(readField(f.name) ?? ''),
        gender: String(readField(f.gender) ?? ''),
        updatedAt: String(readField(f.updatedAt) ?? ''),
      } satisfies Student)
    }
    pageToken = json.nextPageToken ?? ''
  } while (pageToken)

  return students
}

export async function saveFirebaseStudents(students: Student[], sourceFile: string) {
  const currentRuntime = getFirebaseRuntime()
  if (!currentRuntime) {
    throw new Error('Firebase is not configured')
  }

  const chunkSize = 450
  for (let index = 0; index < students.length; index += chunkSize) {
    const batch = writeBatch(currentRuntime.db)
    students.slice(index, index + chunkSize).forEach((student) => {
      const ref = doc(currentRuntime.db, 'students', student.id)
      batch.set(ref, {
        ...student,
        sourceFile,
        updatedAt: serverTimestamp(),
      })
    })
    await batch.commit()
  }

  await setDoc(doc(currentRuntime.db, 'studentDatabaseMeta', 'current'), {
    sourceFile,
    studentCount: students.length,
    updatedAt: serverTimestamp(),
  })
}
