// כלי חד-פעמי: מחשב ורושם את אלוף/ת השבוע עבור שבוע שכבר הסתיים לפני שהפיצ'ר הזה נבנה
// (weeklyChampions לא היה קיים אז, אז אף אחד לא נרשם עבור אותו שבוע בזמן אמת)
import { initAdmin } from './lib.mjs';

const { db } = initAdmin();
const weekStart = Number(process.env.WEEK_START);
const write = process.env.WRITE === '1';
if (!Number.isInteger(weekStart)) {
    console.log('missing/invalid WEEK_START env var');
    process.exit(1);
}

const byUser = {};
const snap = await db.collection('scores')
    .where('windowId', '>=', weekStart - 14).where('windowId', '<', weekStart).get();
snap.docs.forEach(d => {
    const s = d.data();
    if (s.status !== 'WON') return;
    if (!byUser[s.uid]) byUser[s.uid] = { uid: s.uid, username: s.username, points: 0 };
    byUser[s.uid].points += Math.max(0, 7 - s.attempts);
});

const bonusSnap = await db.collection('bonusScores')
    .where('bonusWindowId', '>=', weekStart / 2 - 7).where('bonusWindowId', '<', weekStart / 2).get();
bonusSnap.docs.forEach(d => {
    const s = d.data();
    if (!byUser[s.uid]) byUser[s.uid] = { uid: s.uid, username: s.username, points: 0 };
    byUser[s.uid].points += s.points;
});

const standings = Object.values(byUser).sort((a, b) => b.points - a.points);
console.log(`standings for week starting windowId ${weekStart - 14} (real week that already ended):`);
standings.forEach((u, i) => console.log(`${i + 1}. ${u.username} — ${u.points} pts`));

const leader = standings[0];
if (!leader) {
    console.log('no players this week — nothing to record');
    process.exit(0);
}

if (write) {
    await db.collection('weeklyChampions').doc(String(weekStart)).set({
        uid: leader.uid, username: leader.username, points: leader.points, decidedAt: new Date(), backfilled: true
    });
    console.log(`wrote weeklyChampions/${weekStart} = ${leader.username}`);
} else {
    console.log(`(dry run — pass WRITE=1 to actually save weeklyChampions/${weekStart} = ${leader.username})`);
}
