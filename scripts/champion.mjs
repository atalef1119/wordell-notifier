// הכרעה מוקדמת של אלוף השבוע — אותו אלגוריתם כמו findClinchedChampion ב-public/app.js (ריפו נפרד) וכמו clinchStatus ב-whatsapp-claude-relay.
// המוביל מפסיד (מינוס 2) בכל סבב שנשאר לו, וכל מתחרה (וגם שחקן חדש) מנצח בניסיון 1 בכל סבב ובכל בונוס שנשארו לו.
// אם אף אחד לא יכול להדביק — האלוף הוכרע כבר עכשיו.
import { compareStandings, addRoundTablePoints, rtGameStillAhead } from './lib.mjs';
import { evalClinch, waiverOptions } from './clinch-core.mjs';

const DAILY_LOSS_PENALTY_FROM_WINDOW = 41446;
const isBonusDay = (d) => { const wd = ((d % 7) - 3 + 7) % 7; return wd === 2 || wd === 6; }; // שלישי ושבת

export async function currentWeekDetail(db, weekStart) {
    const byUser = {};
    const ensure = (s) => byUser[s.uid] ||= {
        uid: s.uid, name: s.username, points: 0, wins: 0, attemptCounts: [0, 0, 0, 0, 0, 0, 0],
        windowsPlayed: new Set(), bonusDaysPlayed: new Set(), lastTs: 0,
    };
    const touch = (u, s) => { const ts = s.timestamp ? s.timestamp.seconds : 0; if (ts >= u.lastTs) { u.lastTs = ts; u.name = s.username; } };
    const snap = await db.collection('scores').where('windowId', '>=', weekStart).where('windowId', '<', weekStart + 14).get();
    snap.docs.forEach(d => {
        const s = d.data(); const u = ensure(s); touch(u, s); u.windowsPlayed.add(s.windowId);
        if (s.status !== 'WON') { if (s.windowId >= DAILY_LOSS_PENALTY_FROM_WINDOW) u.points -= 2; return; }
        u.wins++; u.attemptCounts[s.attempts]++; u.points += Math.max(0, 7 - s.attempts);
    });
    const bsnap = await db.collection('bonusScores').where('bonusWindowId', '>=', weekStart / 2).where('bonusWindowId', '<', weekStart / 2 + 7).get();
    bsnap.docs.forEach(d => { const s = d.data(); const u = ensure(s); touch(u, s); u.points += s.points; u.bonusDaysPlayed.add(s.bonusWindowId); });
    await addRoundTablePoints(db, weekStart, weekStart + 14, (g, a) => { ensure({ uid: a.uid, username: a.username }).points += a.points; });
    return Object.values(byUser).sort(compareStandings);
}

// הלוגיקה ב-clinch-core.mjs (אותו קובץ כמו באתר ובבוט). waivers: { uid: {daily, bonus} } — ויתור של המוביל (championWaivers)
export function clinchCtxOf(detail, weekStart, nowWindow, todayDay, daySeconds) {
    return {
        standings: detail.map(u => ({ uid: u.uid, name: u.name, points: u.points, wins: u.wins, attemptCounts: u.attemptCounts, windowsPlayed: u.windowsPlayed, bonusDaysPlayed: u.bonusDaysPlayed })),
        weekStart, nowWindow, todayDay, daySeconds,
        rtBonus: rtGameStillAhead(weekStart, todayDay, daySeconds) ? 5 : 0,
        penaltyFrom: DAILY_LOSS_PENALTY_FROM_WINDOW,
    };
}
export function clinchStatus(detail, weekStart, nowWindow, todayDay, daySeconds, waivers = {}) {
    const leader = detail[0];
    if (!leader || leader.points <= 0) return { decided: false };
    const ctx = clinchCtxOf(detail, weekStart, nowWindow, todayDay, daySeconds);
    const wv = waivers[leader.uid] || null;
    const r = evalClinch(ctx, wv);
    const options = r.ok ? [] : waiverOptions(ctx, wv).options;
    return { decided: r.ok, champion: leader, options };
}
export async function loadWaivers(db, weekStart) {
    const snap = await db.collection('championWaivers').where('weekStart', '==', weekStart).get();
    return Object.fromEntries(snap.docs.map(d => [d.data().uid, { daily: d.data().daily === true, bonus: d.data().bonus === true }]));
}
