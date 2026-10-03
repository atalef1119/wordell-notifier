// בדיקה מול השרת האמיתי של חוקי championSeen (סימון "ראה את הכרזת אלוף השבוע"): נכנסים כמשתמש-בדיקה דרך client SDK
// (שמפעיל את חוקי האבטחה, בניגוד ל-Admin) וממציאים כתיבות תקינות ולא תקינות. נכתב ל-weekStart 999999 (לא משפיע על כלום), ונמחק בסוף.
// הרצה מקומית: FIREBASE_SERVICE_ACCOUNT='<json>' node scripts/test-champion-seen-rules.mjs
import { initAdmin } from './lib.mjs';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';

// מפתח ה-API מוגבל לדומיין האתר ולכן דורש Referer (ר' test-bonus-rules.mjs); ייבוא דינמי אחרי ה-patch
const origFetch = globalThis.fetch;
globalThis.fetch = (url, init = {}) => {
    const headers = new Headers(init.headers || {});
    headers.set('Referer', 'https://wordell-haverim-2026.web.app/');
    return origFetch(url, { ...init, headers });
};
const { initializeApp } = await import('firebase/app');
const { getAuth, signInWithCustomToken } = await import('firebase/auth');
const { getFirestore, doc, setDoc, getDoc, serverTimestamp } = await import('firebase/firestore');

const { db: adminDb } = initAdmin();
const me = 'rules-test-champion-user', other = 'rules-test-someone-else';
const WEEK = 999999;
const app = initializeApp({
    apiKey: 'AIzaSyB8qOqgL5Ern8ai6GzVyhks2v7LSjbUXFI', authDomain: 'wordell-haverim-2026.firebaseapp.com',
    projectId: 'wordell-haverim-2026', appId: '1:623442493236:web:3319be6c01bfca9826af61'
}, 'champion-seen-test');
await signInWithCustomToken(getAuth(app), await getAdminAuth().createCustomToken(me));
const clientDb = getFirestore(app);

const good = (w = WEEK) => ({ uid: me, weekStart: w, seenAt: serverTimestamp() });
const cases = [
    { label: 'valid: own doc id weekStart_uid', id: `${WEEK}_${me}`, data: good(), expect: true },
    { label: 'second write of the same doc (update) is blocked', id: `${WEEK}_${me}`, data: good(), expect: false },
    { label: "someone else's doc id", id: `${WEEK + 1}_${other}`, data: { uid: other, weekStart: WEEK + 1, seenAt: serverTimestamp() }, expect: false },
    { label: 'uid field does not match the signed-in user', id: `${WEEK + 2}_${me}`, data: { uid: other, weekStart: WEEK + 2, seenAt: serverTimestamp() }, expect: false },
    { label: 'unknown extra field', id: `${WEEK + 3}_${me}`, data: { ...good(WEEK + 3), hack: 1 }, expect: false },
    { label: 'weekStart as a string', id: `${WEEK + 4}_${me}`, data: { uid: me, weekStart: String(WEEK + 4), seenAt: serverTimestamp() }, expect: false },
    { label: 'doc id does not match weekStart', id: `${WEEK + 6}_${me}`, data: good(WEEK + 5), expect: false },
];
let failures = 0;
try {
    for (const c of cases) {
        let ok;
        try { await setDoc(doc(clientDb, 'championSeen', c.id), c.data); ok = true; } catch (e) { ok = false; }
        const pass = ok === c.expect; if (!pass) failures++;
        console.log(`${pass ? 'PASS' : 'FAIL'} ${c.label}: write ${ok ? 'allowed' : 'denied'} (expected ${c.expect ? 'allowed' : 'denied'})`);
    }
    let readOk; try { await getDoc(doc(clientDb, 'championSeen', `${WEEK}_${me}`)); readOk = true; } catch (e) { readOk = false; }
    if (readOk) failures++;
    console.log(`${!readOk ? 'PASS' : 'FAIL'} client read is blocked (admin-only): read ${readOk ? 'allowed' : 'denied'}`);
} finally {
    for (let i = 0; i <= 6; i++) for (const u of [me, other]) await adminDb.collection('championSeen').doc(`${WEEK + i}_${u}`).delete().catch(() => {});
    console.log('test docs cleaned up');
}
console.log(failures ? `${failures} FAILURES` : 'ALL RULE CHECKS PASSED');
process.exit(failures ? 1 : 0);
