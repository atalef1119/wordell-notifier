// שולח פוש "מילה חדשה" — רץ ב-cron סביב 10:00 ו-22:00 שעון ישראל
import { initAdmin, getJerusalemWindow, getAllTokens, sendToTokens, getWeekStartWindowId } from './lib.mjs';

const { windowId, hour } = getJerusalemWindow();

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
    const leader = Object.values(byUser).sort((a, b) => b.points - a.points)[0];
    if (leader) {
        console.log(`weekly champion: ${leader.username} (${leader.points} pts)`);
        title = `🏆 ${leader.username} אלוף/ת השבוע!`;
        body = 'מילה חדשה נכנסה לשבוע הבא — בוא תנסה להיות הבא בתור';
    }
}

const tokens = await getAllTokens(db);
await sendToTokens(db, messaging, tokens, { title, body });
