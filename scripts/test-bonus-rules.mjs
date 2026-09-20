// בדיקה חד-פעמית של חוקי bonusScores אחרי הוספת timeSeconds: נכנסים כמשתמש-בדיקה (לא אמיתי) דרך
// client SDK (שמפעיל את חוקי האבטחה, בניגוד ל-Admin) וממציאים כתיבות תקינות ולא תקינות.
// המסמכים נכתבים ל-bonusWindowId ישנים מאוד (1..5) כדי לא להשפיע על שום טבלה, ונמחקים בסוף.
import { initAdmin } from './lib.mjs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';

// מפתח ה-API מוגבל לדומיין האתר (הקשחת אבטחה) ולכן דורש Referer — דפדפן אמיתי שולח אותו לבד,
// כאן מוסיפים אותו ידנית לכל קריאת fetch כדי לדמות דפדפן
const origFetch = globalThis.fetch;
globalThis.fetch = (url, init = {}) => {
    const headers = new Headers(init.headers || {});
    headers.set('Referer', 'https://wordell-haverim-2026.web.app/');
    return origFetch(url, { ...init, headers });
};

const { db: adminDb } = initAdmin();
const testUid = 'rules-test-bonus-user';
const customToken = await getAdminAuth().createCustomToken(testUid);

const app = initializeApp({
    apiKey: 'AIzaSyB8qOqgL5Ern8ai6GzVyhks2v7LSjbUXFI',
    authDomain: 'wordell-haverim-2026.firebaseapp.com',
    projectId: 'wordell-haverim-2026',
    appId: '1:623442493236:web:3319be6c01bfca9826af61'
}, 'bonus-rules-test');
await signInWithCustomToken(getAuth(app), customToken);
const clientDb = getFirestore(app);

const base = (id) => ({
    uid: testUid, username: 'בדיקה', bonusWindowId: id, status: 'WON', attempts: 3, points: 5, timestamp: serverTimestamp()
});
const cases = [
    { id: 1, label: 'valid with timeSeconds=47', expect: true, data: { ...base(1), timeSeconds: 47 } },
    { id: 2, label: 'legacy client without timeSeconds', expect: true, data: base(2) },
    { id: 3, label: 'timeSeconds=121 (too big)', expect: false, data: { ...base(3), timeSeconds: 121 } },
    { id: 4, label: 'timeSeconds as string', expect: false, data: { ...base(4), timeSeconds: '47' } },
    { id: 5, label: 'unknown extra field', expect: false, data: { ...base(5), timeSeconds: 10, hack: 1 } },
];

let failures = 0;
try {
    for (const c of cases) {
        let ok;
        try {
            await setDoc(doc(clientDb, 'bonusScores', `${c.id}_${testUid}`), c.data);
            ok = true;
        } catch (e) {
            ok = false;
        }
        const pass = ok === c.expect;
        if (!pass) failures++;
        console.log(`${pass ? 'PASS' : 'FAIL'} — ${c.label}: write ${ok ? 'allowed' : 'rejected'} (expected ${c.expect ? 'allowed' : 'rejected'})`);
    }
} finally {
    await Promise.all(cases.map(c => adminDb.collection('bonusScores').doc(`${c.id}_${testUid}`).delete()));
    console.log('cleaned up test docs');
}
console.log(failures ? `${failures} FAILURE(S)` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
