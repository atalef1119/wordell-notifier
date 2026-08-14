# wordell-notifier

שולח התראות פוש למשחק [וורדל חברים](https://wordell-haverim-2026.web.app) דרך GitHub Actions:

- **notify-new-word** — רץ סביב 10:00 ו-22:00 שעון ישראל ומודיע לכולם שנכנסה מילה חדשה.
- **check-winners** — רץ כל 10 דקות; כשמישהו פותר את המילה, כל שאר השחקנים מקבלים התראה.

ההרשאות (Firebase Service Account) שמורות ב-GitHub Secrets ולא בקוד.
