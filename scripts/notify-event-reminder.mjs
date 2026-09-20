// תזכורת פוש לאירוע "מרוץ חי", שעה לפני. ה-cron של GitHub Actions יכול להתעכב שעות, ולכן אי אפשר לתזמן
// ריצה אחת על 11:00 בדיוק. במקום זה כמה ריצות מתוזמנות מוקדם בבוקר, כל אחת ממתינה בתוך הג'וב עד
// הרגע המדויק ואז שולחת; רק הראשונה שמצליחה ליצור את מסמך הסימון notified/event-reminder-<start> שולחת בפועל,
// האחרות מסיימות בשקט. נתוני האירוע והטקסט מגיעים מה-workflow (env), כך שאירוע הבא דורש עריכה שם בלבד.
//
// MODE: scheduled (ברירת מחדל) | dry (מדפיס תכנית בלי לשלוח) | test (שולח רק למשתמש TEST_NICKNAME) | now (שולח מיד לכולם)
import { initAdmin, getAllTokens, sendToTokens } from './lib.mjs';

const MODE = process.env.MODE || 'scheduled';
// TEST_NICKNAME מגביל את הנמענים למכשירים של משתמש אחד (גם בריצה המתוזמנת המלאה) ומסמן את ההודעה כבדיקה
const TEST_NICKNAME = process.env.TEST_NICKNAME || '';
const startMs = Date.parse(process.env.EVENT_START_ISO);
if (!Number.isFinite(startMs)) {
    console.log('missing/invalid EVENT_START_ISO');
    process.exit(1);
}
const leadMs = Number(process.env.LEAD_MINUTES || 60) * 60000;
const targetMs = startMs - leadMs;
const title = process.env.REMINDER_TITLE || '🎉 האירוע הגדול היום!';
const body = process.env.REMINDER_BODY || 'כולם משחקים יחד באותה מילה, בזמן אמת — בואו לא תפספסו!';

const MAX_SLEEP_MS = 5.5 * 3600 * 1000;      // ג'וב מוגבל ל-6 שעות; ריצה מוקדמת מדי משאירה את המלאכה לריצה מאוחרת יותר
const CUTOFF_BEFORE_START_MS = 5 * 60 * 1000; // מ-5 דקות לפני ההתחלה כבר אין טעם בתזכורת

const fmt = (ms) => new Date(ms).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'medium' });
const now = Date.now();
console.log(`mode=${MODE} | event start (Israel): ${fmt(startMs)} | planned send (Israel): ${fmt(targetMs)} | now (Israel): ${fmt(now)}`);

if (MODE === 'dry') {
    console.log(`DRY RUN — would ${now > startMs - CUTOFF_BEFORE_START_MS ? 'skip (too late)' : targetMs - now > MAX_SLEEP_MS ? 'skip (too early for this run)' : 'wait and send'}: "${title}" / "${body}"`);
    process.exit(0);
}

const { db, messaging } = initAdmin();
async function pickTokens() {
    const all = await getAllTokens(db);
    if (!TEST_NICKNAME) return all;
    // לא מדפיסים שום פרט מזהה מלבד ספירות
    const profiles = await db.collection('profiles').where('nickname', '==', TEST_NICKNAME).get();
    const uids = new Set(profiles.docs.map(d => d.id));
    return all.filter(t => uids.has(t.uid));
}
const messageTitle = TEST_NICKNAME ? `בדיקה — ${title}` : title;

if (MODE === 'test') {
    if (!TEST_NICKNAME) { console.log('test mode needs TEST_NICKNAME'); process.exit(1); }
    const testTokens = await pickTokens();
    console.log(`test push to ${testTokens.length} device(s)`);
    await sendToTokens(db, messaging, testTokens, { title: messageTitle, body });
    process.exit(0);
}

if (MODE === 'scheduled') {
    if (now > startMs - CUTOFF_BEFORE_START_MS) {
        console.log('too late — the event is about to start or already started; skipping');
        process.exit(0);
    }
    if (targetMs - now > MAX_SLEEP_MS) {
        console.log('too early for this run to wait; a later scheduled run will handle it');
        process.exit(0);
    }
    while (Date.now() < targetMs) {
        await new Promise(r => setTimeout(r, Math.min(30000, targetMs - Date.now())));
    }
    console.log(`reached planned send time (${fmt(Date.now())})`);

    // סימון אטומי: create() נכשל אם המסמך כבר קיים — כך שרק ריצה אחת שולחת, גם אם כמה ממתינות במקביל
    try {
        await db.collection('notified').doc(`event-reminder${TEST_NICKNAME ? '-test' : ''}-${startMs}`).create({ sentAt: new Date(), startMs });
    } catch (e) {
        if (e.code === 6 || /ALREADY_EXISTS/.test(String(e.message))) {
            console.log('another run already sent this reminder — nothing to do');
            process.exit(0);
        }
        throw e;
    }
}

const tokens = await pickTokens();
console.log(`sending to ${tokens.length} device(s)`);
await sendToTokens(db, messaging, tokens, { title: messageTitle, body });
