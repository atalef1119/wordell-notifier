// שולח פוש "מילה חדשה" — רץ ב-cron סביב 10:00 ו-22:00 שעון ישראל
import { initAdmin, getJerusalemWindow, getAllTokens, sendToTokens, getWeekStartWindowId } from './lib.mjs';

// WINDOW_OVERRIDE + DRY_RUN מאפשרים לבדוק את זיהוי תחילת-השבוע/אלוף-השבוע מול Firestore אמיתי
// בלי לשלוח פוש אמיתי לאף אחד (למשל סימולציה של ריצת יום ראשון 10:00)
const windowId = process.env.WINDOW_OVERRIDE ? parseInt(process.env.WINDOW_OVERRIDE, 10) : getJerusalemWindow().windowId;
const hour = process.env.WINDOW_OVERRIDE ? 10 : getJerusalemWindow().hour;

// ה-cron רץ גם ב-6,7 וגם ב-18,19 UTC כדי לכסות שעון קיץ/חורף —
// כאן בודקים את השעה בפועל בישראל ומדלגים אם זו לא שעת החלפת מילה
if (process.env.FORCE !== '1' && hour !== 10 && hour !== 22) {
    console.log(`Jerusalem hour is ${hour}, not a word-change hour — skipping`);
    process.exit(0);
}

const { db, messaging } = initAdmin();

let title = '🎯 וורדל חברים';
let body = 'מילה חדשה נכנסה! בוא תנחש לפני כולם';

// זו ריצת 10:00 של יום ראשון = תחילת שבוע חדש — מכריזים על אלוף/ת השבוע שהסתיים
const weekStart = getWeekStartWindowId(windowId);
if (weekStart === windowId) {
    const snap = await db.collection('scores').where('windowId', '>=', weekStart - 14).get();
    const byUser = {};
    snap.docs.forEach(d => {
        const s = d.data();
        if (s.windowId >= weekStart || s.status !== 'WON') return; // רק השבוע שהסתיים, רק ניצחונות
        if (!byUser[s.uid]) byUser[s.uid] = { username: s.username, points: 0 };
        byUser[s.uid].points += Math.max(0, 7 - s.attempts);
    });

    // ניקוד סיבובי בונוס (שלישי/שבת) של אותו שבוע שהסתיים — bonusWindowId הוא ביחידת "יום",
    // ולכן windowId/2 (ראו computeWeeklyStandings ב-public/app.js של אתר הבונוס)
    const bonusSnap = await db.collection('bonusScores').where('bonusWindowId', '>=', weekStart / 2 - 7).get();
    bonusSnap.docs.forEach(d => {
        const s = d.data();
        if (s.bonusWindowId >= weekStart / 2) return; // רק השבוע שהסתיים
        if (!byUser[s.uid]) byUser[s.uid] = { username: s.username, points: 0 };
        byUser[s.uid].points += s.points;
    });

    const leader = Object.values(byUser).sort((a, b) => b.points - a.points)[0];
    if (leader) {
        console.log(`weekly champion: ${leader.username} (${leader.points} pts)`);
        title = `🏆 ${leader.username} אלוף/ת השבוע!`;
        body = 'מילה חדשה נכנסה לשבוע הבא — בוא תנסה להיות הבא בתור';
    }
}

if (process.env.DRY_RUN === '1') {
    console.log(`DRY RUN — would send: "${title}" / "${body}"`);
    process.exit(0);
}

// לא שולחים למי שכבר נכנס וראה את המילה הזו (למשל אם ה-cron התעכב והספיקו לשחק)
const seenSnap = await db.collection('seen').where('windowId', '==', windowId).get();
const seenUids = new Set(seenSnap.docs.map(d => d.data().uid));

const tokens = (await getAllTokens(db)).filter(t => !seenUids.has(t.uid));
if (seenUids.size) console.log(`skipping ${seenUids.size} user(s) who already saw this window`);
await sendToTokens(db, messaging, tokens, { title, body });
