// בודק אם יש פותרים חדשים במילה הנוכחית ושולח פוש לכל השאר
import { FieldValue } from 'firebase-admin/firestore';
import { initAdmin, getJerusalemWindow, getAllTokens, sendToTokens } from './lib.mjs';

const { db, messaging } = initAdmin();

// WINDOW_OVERRIDE מאפשר בדיקה ידנית על חלון ישן
const windowId = process.env.WINDOW_OVERRIDE
    ? parseInt(process.env.WINDOW_OVERRIDE, 10)
    : getJerusalemWindow().windowId;

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
