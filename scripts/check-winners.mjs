// בודק אם יש פותרים חדשים במילה הנוכחית ושולח פוש לכל השאר
import { FieldValue } from 'firebase-admin/firestore';
import { initAdmin, getJerusalemWindow, getAllTokens, sendToTokens, getWeekStartWindowId, RT_FIRST_DAY, SITE_URL } from './lib.mjs';
import { currentWeekDetail, clinchStatus } from './champion.mjs';

const { db, messaging } = initAdmin();

// WINDOW_OVERRIDE מאפשר בדיקה ידנית על חלון ישן
const windowId = process.env.WINDOW_OVERRIDE
    ? parseInt(process.env.WINDOW_OVERRIDE, 10)
    : getJerusalemWindow().windowId;

// ── הכרעה מוקדמת של אלוף השבוע: פוש ברגע ההכרעה, רק למי שלא ראה את הכרזת האלוף באתר (championSeen) ──
// רצה לפני כל היציאות המוקדמות. סימון notified/champion-<weekStart> נוצר אטומית (create) — פוש אחד לשבוע, ושבוע שסומן "מדולג" לא יקבל פוש.
async function checkChampion() {
    const { windowId: nowWindow, day, daySeconds } = getJerusalemWindow();
    const weekStart = getWeekStartWindowId(process.env.WINDOW_OVERRIDE ? windowId : nowWindow);
    if (nowWindow < weekStart + 8) return; // הכרעה אפשרית רק בימים האחרונים של השבוע; חוסך קריאות
    const marker = db.collection('notified').doc(`champion-${weekStart}`);
    if ((await marker.get()).exists) return;
    // מדלגים על חישוב מלא אם לא נוסף שום משחק/בונוס מאז הבדיקה הקודמת (ספירה זולה)
    const stateRef = db.collection('notified').doc(`champion-state-${weekStart}`);
    const [sc, bc] = await Promise.all([
        db.collection('scores').where('windowId', '>=', weekStart).where('windowId', '<', weekStart + 14).count().get(),
        db.collection('bonusScores').where('bonusWindowId', '>=', weekStart / 2).where('bonusWindowId', '<', weekStart / 2 + 7).count().get(),
    ]);
    const sig = `${sc.data().count}/${bc.data().count}/${nowWindow}/${daySeconds >= 23 * 3600}`;
    const prev = await stateRef.get();
    if (prev.exists && prev.data().sig === sig) return;
    const detail = await currentWeekDetail(db, weekStart);
    const st = clinchStatus(detail, weekStart, nowWindow, day, daySeconds);
    await stateRef.set({ sig, at: new Date() });
    if (!st.decided) { console.log('champion not decided yet'); return; }
    const champ = st.champion;
    console.log(`champion decided early: ${champ.name} (${champ.points} pts)`);
    if (process.env.DRY_RUN === '1') { console.log('DRY RUN — no marker, no push'); return; }
    try {
        await marker.create({ pushed: true, uid: champ.uid, username: champ.name, points: champ.points, at: new Date() });
    } catch (e) { console.log('marker already exists — someone else handled it'); return; }
    const seen = new Set((await db.collection('championSeen').where('weekStart', '==', weekStart).get()).docs.map(d => d.data().uid));
    const tokens = (await getAllTokens(db)).filter(t => !seen.has(t.uid));
    console.log(`already saw the announcement: ${seen.size} user(s); sending to ${tokens.length} token(s)`);
    await sendToTokens(db, messaging, tokens, {
        title: `🏆 ${champ.name} אלוף/ת השבוע!`,
        body: 'אלוף השבוע הוכרע! היכנסו לראות'
    });
}
await checkChampion().catch(e => console.log('champion check failed:', e.message));

// ── וורדל שולחן עגול: פוש תזכורת חצי שעה לפני (רביעי 19:30). רץ כל 10 דק', אז חלון של 19:20–19:58 (ה-cron של GitHub מתעכב לפעמים);
// סימון notified/rt-reminder-<day> נוצר אטומית — פוש אחד בלבד ──
async function roundTableReminder() {
    const { day, daySeconds } = getJerusalemWindow();
    if (day % 7 !== 6 || day < RT_FIRST_DAY) return;           // רק ביום רביעי, מהמשחק הראשון
    if (daySeconds < 19 * 3600 + 20 * 60 || daySeconds >= 19 * 3600 + 58 * 60) return;
    if (process.env.DRY_RUN === '1') { console.log('DRY RUN — would send round-table reminder'); return; }
    try { await db.collection('notified').doc(`rt-reminder-${day}`).create({ at: new Date() }); }
    catch (e) { return; } // כבר נשלח
    const tokens = await getAllTokens(db);
    console.log(`round-table reminder to ${tokens.length} token(s)`);
    await sendToTokens(db, messaging, tokens, {
        title: '🎲 וורדל שולחן עגול בעוד חצי שעה!',
        body: 'היום ב-20:00. חדר ההמתנה נפתח ב-19:55, בואו לשבת ליד השולחן'
    }, `${SITE_URL}/roundtable.html`);
}
await roundTableReminder().catch(e => console.log('round-table reminder failed:', e.message));

// מתריעים רק על הפותר הראשון בכל חלון, לא על כל מי שפותר
const snap = await db.collection('scores')
    .where('windowId', '==', windowId)
    .where('status', '==', 'WON')
    .get();

if (snap.empty) {
    console.log(`no winners in window ${windowId}`);
    process.exit(0);
}

const winners = snap.docs.sort(
    (a, b) => (a.data().timestamp?.toMillis() ?? 0) - (b.data().timestamp?.toMillis() ?? 0)
);
const [first, ...rest] = winners;

// מסמנים פותרים מאוחרים יותר כ"טופלו" בלי לשלוח להם התראה, כדי שלא ייבדקו שוב
await Promise.all(
    rest.filter(d => !d.data().notifiedAt).map(d => d.ref.update({ notifiedAt: FieldValue.serverTimestamp() }))
);

if (first.data().notifiedAt) {
    console.log(`first winner already notified in window ${windowId}`);
    process.exit(0);
}

const s = first.data();
console.log(`first winner: ${s.username} (${s.attempts}/6)`);
const tokens = await getAllTokens(db);
// שולחים לכולם חוץ מהפותר עצמו
await sendToTokens(db, messaging, tokens.filter(t => t.uid !== s.uid), {
    title: `🏆 ${s.username} פתר ראשון את המילה!`,
    body: `ב-${s.attempts}/6 ניסיונות. תוכל להיות הבא?`
});
await first.ref.update({ notifiedAt: FieldValue.serverTimestamp() });
