// כלים משותפים לסקריפטי ההתראות
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

export const SITE_URL = 'https://wordell-haverim-2026.web.app';

export function initAdmin() {
    // מנקה BOM/רווחים שעלולים להידבק ל-secret בהעברה
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT.replace(/^﻿/, '').trim());
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

// אותה נוסחה בדיוק קיימת גם ב-public/app.js באתר (ריפו נפרד) — לשמור מסונכרן
// השבוע מתחיל ביום ראשון 10:00 שעון ישראל; day הוא אינדקס ימים מאז 1.1.1970 (יום חמישי)
export function getWeekStartWindowId(windowId) {
    const day = Math.floor(windowId / 2);
    const offset = ((day % 7) - 3 + 7) % 7; // 0=ראשון..6=שבת
    return (day - offset) * 2;
}

// סדר הדירוג השבועי — אותו חוק בדיוק כמו computeWeeklyStandings ב-public/app.js (ריפו נפרד, לשמור מסונכרן):
// 1) יותר נקודות  2) יותר ניצחונות  3) יותר ניצחונות בניסיון 1, ואם שווה — בניסיון 2, וכך הלאה עד 6
// 4) (כמעט בלתי אפשרי להגיע לכאן) uid — רק כדי שהתוצאה תהיה דטרמיניסטית ואותה תוצאה בכל מקום
export function compareStandings(a, b) {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    for (let n = 1; n <= 6; n++) {
        if (b.attemptCounts[n] !== a.attemptCounts[n]) return b.attemptCounts[n] - a.attemptCounts[n];
    }
    return a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0;
}

// דירוג השבוע שהסתיים ממש לפני weekStart (הטווח [weekStart-14, weekStart)).
// ניצחונות וספירת-ניסיונות נלקחים רק מהמשחקים היומיים; סיבוב בונוס תורם נקודות בלבד (כמו באתר)
export async function computeWeekStandings(db, weekStart) {
    const byUser = {};
    const ensure = (s) => {
        if (!byUser[s.uid]) {
            byUser[s.uid] = { uid: s.uid, username: s.username, points: 0, wins: 0, attemptCounts: [0, 0, 0, 0, 0, 0, 0], lastTs: 0 };
        }
        return byUser[s.uid];
    };
    const touchName = (u, s) => {
        const ts = s.timestamp ? s.timestamp.seconds : 0;
        if (ts >= u.lastTs) { u.lastTs = ts; u.username = s.username; }
    };

    const snap = await db.collection('scores')
        .where('windowId', '>=', weekStart - 14).where('windowId', '<', weekStart).get();
    snap.docs.forEach(d => {
        const s = d.data();
        const u = ensure(s);
        touchName(u, s);
        if (s.status !== 'WON') return;
        u.wins++;
        u.attemptCounts[s.attempts]++;
        u.points += Math.max(0, 7 - s.attempts);
    });

    // bonusWindowId הוא ביחידת "יום", ולכן weekStart/2
    const bonusSnap = await db.collection('bonusScores')
        .where('bonusWindowId', '>=', weekStart / 2 - 7).where('bonusWindowId', '<', weekStart / 2).get();
    bonusSnap.docs.forEach(d => {
        const s = d.data();
        const u = ensure(s);
        touchName(u, s);
        u.points += s.points;
    });

    return Object.values(byUser).sort(compareStandings);
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
