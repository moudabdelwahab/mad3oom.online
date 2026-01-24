// Firebase v12 modular Firestore helpers for the support system
// Exposes: initFirebase(), getCurrentUserSafe(), ensureUserProfile(),
// tickets API (list, listForAgent, listForUser, create, updateStatus, assignAgent, delete),
// roles API (getRole, setRole), activity API (addLog), feedback API (setFeedback)

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCroPjHS1_DuCQLAxOqD04Hb8oOgbEYrS8',
  authDomain: 'mahmoud-227b5.firebaseapp.com',
  projectId: 'mahmoud-227b5',
  appId: '1:453469562925:web:694fdc4e14a70d6d5bb0a4'
};

let app, auth, db;

export async function initFirebase(appName) {
  app = initializeApp(firebaseConfig, appName);
  auth = getAuth(app);
  db = getFirestore(app);
  await setPersistence(auth, browserLocalPersistence);
  return { app, auth, db };
}

export function getCurrentUserSafe() {
  try { return auth.currentUser || null; } catch (_) { return null; }
}

export async function onAuth(callback) { return onAuthStateChanged(auth, callback); }

// Roles: superAdmin, admin, agent, client
export async function getUserRole(uid) {
  const ref = doc(db, 'roles', uid);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data().role || 'client') : 'client';
}

export async function setUserRole(uid, role) {
  const ref = doc(db, 'roles', uid);
  await setDoc(ref, { role, updatedAt: serverTimestamp() }, { merge: true });
}

export async function ensureUserProfile(user) {
  if (!user) return;
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || '',
      createdAt: serverTimestamp()
    });
  }
}

// Tickets
function ticketsCol() { return collection(db, 'tickets'); }

export async function listAllTickets() {
  const q = query(ticketsCol(), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function listTicketsForUser(email) {
  const q = query(ticketsCol(), where('email', '==', email), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function listTicketsForAgent(uid) {
  const q = query(ticketsCol(), where('assigneeUid', '==', uid), orderBy('updatedAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createTicket({ title, description, priority, email, uid }) {
  const docRef = await addDoc(ticketsCol(), {
    title, description, priority, email, uid: uid || null,
    status: 'open',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    assigneeUid: null,
    feedback: null
  });
  await addLog(docRef.id, {
    type: 'created',
    by: uid || email,
    role: 'client',
    message: 'Ticket created'
  });
  return docRef.id;
}

export async function updateTicketStatus(ticketId, status, actor) {
  const ref = doc(db, 'tickets', ticketId);
  await updateDoc(ref, { status, updatedAt: serverTimestamp() });
  await addLog(ticketId, {
    type: 'status',
    by: actor?.uid || actor?.email || 'system',
    role: actor?.role || 'system',
    message: `Status changed to ${status}`
  });
}

export async function assignTicket(ticketId, assigneeUid, actor) {
  const ref = doc(db, 'tickets', ticketId);
  await updateDoc(ref, { assigneeUid, updatedAt: serverTimestamp() });
  await addLog(ticketId, {
    type: 'assign',
    by: actor?.uid || 'system',
    role: actor?.role || 'system',
    message: `Assigned to ${assigneeUid}`
  });
}

export async function deleteTicketDoc(ticketId) {
  await deleteDoc(doc(db, 'tickets', ticketId));
}

// Activity logs (subcollection)
export async function addLog(ticketId, { type, by, role, message }) {
  const ref = collection(db, 'tickets', ticketId, 'logs');
  await addDoc(ref, { type, by, role, message, createdAt: serverTimestamp() });
}

// Feedback when closed
export async function setTicketFeedback(ticketId, stars, comment) {
  const ref = doc(db, 'tickets', ticketId);
  await updateDoc(ref, { feedback: { stars, comment, createdAt: serverTimestamp() }, updatedAt: serverTimestamp() });
}

export { auth, db };


