// בודק אם יש פותרים חדשים במילה הנוכחית ושולח פוש לכל השאר
import { FieldValue } from 'firebase-admin/firestore';
import { initAdmin, getJerusalemWindow, getAllTokens, sendToTokens } from './lib.mjs';

const { db, messaging } = initAdmin();

// WINDOW_OVERRIDE מאפשר בדיקה ידנית על חלון ישן
const windowId = process.env.WINDOW_OVERRIDE
    ? parseInt(process.env.WINDOW_OVERRIDE, 10)
    : getJerusalemWindow().windowId;

const snap = await db.collection('scores').where('windowId', '==', windowId).get();
const winners = snap.docs.filter(d => d.data().status === 'WON' && !d.data().notifiedAt);

if (winners.length === 0) {
    console.log(`no new winners in window ${windowId}`);
    process.exit(0);
}

const tokens = await getAllTokens(db);
for (const docSnap of winners) {
    const s = docSnap.data();
    console.log(`new winner: ${s.username} (${s.attempts}/6)`);
    // שולחים לכולם חוץ מהפותר עצמו
    await sendToTokens(db, messaging, tokens.filter(t => t.uid !== s.uid), {
        title: `🏆 ${s.username} פתר את המילה!`,
        body: `ב-${s.attempts}/6 ניסיונות. תוכל יותר טוב?`
    });
    await docSnap.ref.update({ notifiedAt: FieldValue.serverTimestamp() });
}
