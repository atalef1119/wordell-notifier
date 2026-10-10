// בדיקה קריאה-בלבד: מה אלגוריתם ההכרעה המוקדמת אומר על השבוע הנוכחי (או WEEK_START) — אמור להתאים לאתר/לבוט
import { initAdmin, getJerusalemWindow, getWeekStartWindowId } from './lib.mjs';
import { currentWeekDetail, clinchStatus, loadWaivers } from './champion.mjs';
const { db } = initAdmin();
const w = getJerusalemWindow();
const weekStart = process.env.WEEK_START ? +process.env.WEEK_START : getWeekStartWindowId(w.windowId);
const detail = await currentWeekDetail(db, weekStart);
console.log(detail.slice(0, 3).map(d => `${d.name}: ${d.points} pts, ${d.wins} wins`));
const waivers = await loadWaivers(db, weekStart);
const st = clinchStatus(detail, weekStart, w.windowId, w.day, w.daySeconds, waivers);
console.log('decided:', st.decided, 'champion:', st.champion?.name, 'waiver options:', st.options);
process.exit(0);
