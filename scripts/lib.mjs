// כלים משותפים לסקריפטי ההתראות
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

export const SITE_URL = 'https://wordell-haverim-2026.web.app';

export function initAdmin() {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({ credential: cert(sa) });
    return { db: getFirestore(), messaging: getMessaging() };
}

// אותו חישוב חלון-זמן כמו באתר: מילה חדשה ב-10:00 וב-22:00 שעון ישראל
export function getJerusalemWindow() {
    const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Jerusalem', hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const parts = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
    const day = Math.floor(Date.UTC(+parts.year, +parts.month - 1, +parts.day) / 86400000);
    const hour = +parts.hour % 24;
    const daySeconds = hour * 3600 + (+parts.minute) * 60 + (+parts.second);
    const H10 = 36000, H22 = 79200;
    let windowId;
    if (daySeconds >= H10 && daySeconds < H22) windowId = day * 2;
    else if (daySeconds >= H22) windowId = day * 2 + 1;
    else windowId = (day - 1) * 2 + 1;
    return { windowId, hour };
}

export async function getAllTokens(db) {
    const snap = await db.collection('tokens').get();
    return snap.docs.map(d => ({ token: d.id, uid: d.data().uid }));
}

// שליחת התראה לרשימת טוקנים + ניקוי טוקנים מתים
export async function sendToTokens(db, messaging, tokens, notification) {
    if (!tokens.length) {
        console.log('no tokens to send to');
        return;
    }
    const res = await messaging.sendEachForMulticast({
        tokens: tokens.map(t => t.token),
        notification,
        webpush: {
            fcmOptions: { link: SITE_URL },
            notification: { icon: `${SITE_URL}/icon-192.png` }
        }
    });
    const cleanups = [];
    res.responses.forEach((r, i) => {
        if (!r.success) {
            const code = r.error?.code || '';
            console.log(`send failed for token #${i}: ${code}`);
            if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
                cleanups.push(db.collection('tokens').doc(tokens[i].token).delete().catch(() => {}));
            }
        }
    });
    await Promise.all(cleanups);
    console.log(`sent: ${res.successCount} ok, ${res.failureCount} failed, ${cleanups.length} dead tokens removed`);
}
