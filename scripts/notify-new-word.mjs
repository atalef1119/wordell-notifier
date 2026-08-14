// שולח פוש "מילה חדשה" — רץ ב-cron סביב 10:00 ו-22:00 שעון ישראל
import { initAdmin, getJerusalemWindow, getAllTokens, sendToTokens } from './lib.mjs';

const { hour } = getJerusalemWindow();

// ה-cron רץ גם ב-6,7 וגם ב-18,19 UTC כדי לכסות שעון קיץ/חורף —
// כאן בודקים את השעה בפועל בישראל ומדלגים אם זו לא שעת החלפת מילה
if (process.env.FORCE !== '1' && hour !== 10 && hour !== 22) {
    console.log(`Jerusalem hour is ${hour}, not a word-change hour — skipping`);
    process.exit(0);
}

const { db, messaging } = initAdmin();
const tokens = await getAllTokens(db);
await sendToTokens(db, messaging, tokens, {
    title: '🎯 וורדל חברים',
    body: 'מילה חדשה נכנסה! בוא תנחש לפני כולם'
});
