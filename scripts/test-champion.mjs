// בדיקה קריאה-בלבד: מה אלגוריתם ההכרעה המוקדמת אומר על השבוע הנוכחי (או WEEK_START) — אמור להתאים לאתר/לבוט
import { initAdmin, getJerusalemWindow } from './lib.mjs';
import { currentWeekDetail, clinchStatus } from './champion.mjs';
const { db } = initAdmin();
const w = getJerusalemWindow();
const weekStart = process.env.WEEK_START ? +process.env.WEEK_START : 41446;
const detail = await currentWeekDetail(db, weekStart);
console.log(detail.slice(0, 3).map(d => `${d.name}: ${d.points} pts, ${d.wins} wins`));
const st = clinchStatus(detail, weekStart, w.windowId, w.day, w.daySeconds);
console.log('decided:', st.decided, 'champion:', st.champion?.name);
process.exit(0);
