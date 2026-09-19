// שולח פוש "מילה חדשה" — רץ ב-cron תדיר (ר' new-word.yml), ומקבל את עצמו בטווח רחב
// סביב 10:00/22:00 כי גילינו בפועל שריצות ה-cron של GitHub Actions יכולות להתעכב שעות
// שלמות (לא רק כמה דקות) — בדיקת "בדיוק 10 או 22" גרמה לכל הריצות לדלג בשקט
import { initAdmin, getJerusalemWindow, getAllTokens, sendToTokens, getWeekStartWindowId, computeWeekStandings } from './lib.mjs';

// WINDOW_OVERRIDE + DRY_RUN מאפשרים לבדוק את זיהוי תחילת-השבוע/אלוף-השבוע מול Firestore אמיתי
// בלי לשלוח פוש אמיתי לאף אחד (למשל סימולציה של ריצת יום ראשון 10:00)
const isRealRun = !process.env.WINDOW_OVERRIDE;
const windowId = process.env.WINDOW_OVERRIDE ? parseInt(process.env.WINDOW_OVERRIDE, 10) : getJerusalemWindow().windowId;
const hour = process.env.WINDOW_OVERRIDE ? 10 : getJerusalemWindow().hour;

// טווח קבלה מורחב: חלון הבוקר (10:00) מתקבל עד 20:00, חלון הערב (22:00) עד 01:00 —
// windowId זוגי = חלון בוקר, אי-זוגי = חלון ערב (ר' getJerusalemWindow ב-lib.mjs)
const isMorningWindow = windowId % 2 === 0;
const inAcceptableRange = isMorningWindow ? (hour >= 10 && hour < 20) : (hour >= 22 || hour < 1);
if (process.env.FORCE !== '1' && !inAcceptableRange) {
    console.log(`Jerusalem hour is ${hour}, outside the acceptable window for windowId ${windowId} — skipping`);
    process.exit(0);
}

const { db, messaging } = initAdmin();

// הטווח המורחב עלול לתפוס כמה ריצות cron לאותו windowId — מונעים שליחה כפולה
const notifiedRef = db.collection('notified').doc(String(windowId));
if (isRealRun && process.env.FORCE !== '1') {
    const notifiedDoc = await notifiedRef.get();
    if (notifiedDoc.exists) {
        console.log(`already notified for windowId ${windowId} — skipping`);
        process.exit(0);
    }
}

let title = '🎯 וורדל חברים';
let body = 'מילה חדשה נכנסה! בוא תנחש לפני כולם';

// זו ריצת 10:00 של יום ראשון = תחילת שבוע חדש — מכריזים על אלוף/ת השבוע שהסתיים
const weekStart = getWeekStartWindowId(windowId);
let weeklyLeader = null;
if (weekStart === windowId) {
    // הדירוג כולל שוברי שוויון (נקודות -> ניצחונות -> ניצחונות בניסיון 1,2,3...) — ר' compareStandings ב-lib.mjs
    const standings = await computeWeekStandings(db, weekStart);
    weeklyLeader = standings[0] && standings[0].points > 0 ? standings[0] : null;
    if (weeklyLeader) {
        console.log(`weekly champion: ${weeklyLeader.username} (${weeklyLeader.points} pts)`);
        title = `🏆 ${weeklyLeader.username} אלוף/ת השבוע!`;
        body = 'מילה חדשה נכנסה לשבוע הבא — בוא תנסה להיות הבא בתור';
    }
}

if (process.env.DRY_RUN === '1') {
    console.log(`DRY RUN — would send: "${title}" / "${body}"`);
    process.exit(0);
}

// לא שולחים למי שכבר שיחק את המילה הזו (יש לו רשומת score לחלון הנוכחי) — מי שרק
// ביקר באתר בלי לשחק עדיין צריך לקבל את הפוש
const scoresSnap = await db.collection('scores').where('windowId', '==', windowId).get();
const playedUids = new Set(scoresSnap.docs.map(d => d.data().uid));

const tokens = (await getAllTokens(db)).filter(t => !playedUids.has(t.uid));
if (playedUids.size) console.log(`skipping ${playedUids.size} user(s) who already played this window`);
await sendToTokens(db, messaging, tokens, { title, body });

if (isRealRun) {
    await notifiedRef.set({ windowId, notifiedAt: new Date() });
    // נשמר רק בריצה אמיתית של שבוע חדש עם אלוף — מזין את היסטוריית "אלוף השבוע" לצורך
    // הצגת "כמה פעמים"/"כמה שבועות ברצף" באתר (public/app.js -> weeklyChampions)
    if (weekStart === windowId && weeklyLeader) {
        await db.collection('weeklyChampions').doc(String(weekStart)).set({
            uid: weeklyLeader.uid, username: weeklyLeader.username, points: weeklyLeader.points, decidedAt: new Date()
        });
        console.log(`recorded weeklyChampions/${weekStart}`);
    }
}
