// כלי אבחון חד-פעמי: מדמה בדיוק את saveEventProgress() דרך client SDK אמיתי (לא Admin,
// שעוקף את חוקי האבטחה) כדי לראות את שגיאת ה-rules המדויקת, אם יש
import { initAdmin } from './lib.mjs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';

const { db: adminDb } = initAdmin();

// לוקחים uid אמיתי קיים מתוך liveEvent כדי לדמות בדיוק את אותו משתמש
const snap = await adminDb.collection('liveEvent').limit(1).get();
if (snap.empty) {
    console.log('no liveEvent docs found');
    process.exit(0);
}
const sampleDoc = snap.docs[0];
const testUid = sampleDoc.id;
const existing = sampleDoc.data();
console.log('testing as uid:', testUid, 'username:', existing.username);

const customToken = await getAdminAuth().createCustomToken(testUid);

const firebaseConfig = {
    apiKey: 'AIzaSyB8qOqgL5Ern8ai6GzVyhks2v7LSjbUXFI',
    authDomain: 'wordell-haverim-2026.firebaseapp.com',
    projectId: 'wordell-haverim-2026',
    storageBucket: 'wordell-haverim-2026.firebasestorage.app',
    messagingSenderId: '623442493236',
    appId: '1:623442493236:web:3319be6c01bfca9826af61'
};
const app = initializeApp(firebaseConfig, 'client-test');
const clientAuth = getAuth(app);
const clientDb = getFirestore(app);

await signInWithCustomToken(clientAuth, customToken);
console.log('signed in as:', clientAuth.currentUser.uid, '== testUid?', clientAuth.currentUser.uid === testUid);

// מדמה בדיוק את saveEventProgress(): merge עם אותם שדות
const data = {
    uid: testUid,
    username: existing.username,
    status: 'PLAYING',
    currentAttempt: 1,
    attemptColors: [['absent', 'present', 'correct', 'absent', 'absent']],
};

try {
    await setDoc(doc(clientDb, 'liveEvent', testUid), data, { merge: true });
    console.log('UPDATE SUCCEEDED');
    const after = await getDoc(doc(clientDb, 'liveEvent', testUid));
    console.log('doc after update:', JSON.stringify(after.data()));
} catch (e) {
    console.log('UPDATE FAILED:', e.code, '|', e.message);
}

process.exit(0);
