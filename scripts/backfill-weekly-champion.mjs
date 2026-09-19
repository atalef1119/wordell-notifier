// כלי חד-פעמי: מחשב ורושם את אלוף/ת השבוע עבור שבוע שכבר הסתיים (למשל לפני שהפיצ'ר נבנה,
// או כדי לתקן רשומה אחרי שינוי בשוברי השוויון). משתמש באותו חישוב בדיוק כמו notify-new-word.mjs
import { initAdmin, computeWeekStandings } from './lib.mjs';

const { db } = initAdmin();
const weekStart = Number(process.env.WEEK_START);
const write = process.env.WRITE === '1';
if (!Number.isInteger(weekStart)) {
    console.log('missing/invalid WEEK_START env var');
    process.exit(1);
}

const standings = await computeWeekStandings(db, weekStart);
console.log(`standings for the week that ended at windowId ${weekStart}:`);
standings.forEach((u, i) => {
    console.log(`${i + 1}. ${u.username} — ${u.points} pts, ${u.wins} wins, by attempt: [${u.attemptCounts.slice(1).join(',')}]`);
});

const leader = standings[0];
if (!leader || leader.points <= 0) {
    console.log('no winner this week — nothing to record');
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
