# תהליך שחרור גרסה

מדריך למי שמריץ בפועל שחרור (release) — לא חלק מזרימת הפיתוח הרגילה. רקע:
[`CHANGELOG.md`](CHANGELOG.md) (מדיניות הגרסאות), [`docs/TASKS.md` P12-T8](docs/TASKS.md#p12).

## לפני שמתחילים

- [ ] `main` ירוק ב-CI, בשלוש הפלטפורמות (P0-T5).
- [ ] `pnpm build && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test:coverage` נקיים מקומית.
- [ ] `node apps/cli/scripts/smoke-test.mjs` עובר (אחרי `pnpm build`) — ההוכחה שההפעלה בפקודה אחת עובדת.
- [ ] קובץ [`LICENSE`](LICENSE) קיים ומעודכן (החלטת בעל הפרויקט — ראו הערה בתחתית).

## שלבים

1. **בחרו את מספר הגרסה** לפי [Semantic Versioning](https://semver.org/lang/he/) — `MAJOR.MINOR.PATCH`.
   v1.0.0 מסמן "מוכן לשימוש כללי", לא רק "יש קוד".
2. **עדכנו את כל ה-`package.json`-ים יחד:**
   ```bash
   pnpm bump-version 1.0.0
   ```
   בודק את התוצאה (`git diff`) — כל חבילות ה-`workspace:*` ל-`@ao/*` אמורות להישאר כפי שהן;
   רק שדה `version` בכל package.json אמור להשתנות.
3. **עדכנו את [`CHANGELOG.md`](CHANGELOG.md):** הזיזו את תוכן `## [Unreleased]` לסעיף חדש
   `## [1.0.0] - YYYY-MM-DD`, והשאירו `## [Unreleased]` ריק למעלה בשביל הפיתוח הבא.
4. **בנו ובדקו סופית:**
   ```bash
   pnpm build && node apps/cli/scripts/smoke-test.mjs
   ```
5. **commit + tag:**
   ```bash
   git add -A
   git commit -m "release: v1.0.0"
   git tag -a v1.0.0 -m "v1.0.0"
   git push origin main --tags
   ```
6. **פרסום ל-npm** (מתוך `apps/cli/`, אחרי `pnpm build` מהשורש):
   ```bash
   cd apps/cli
   npm publish
   ```
   `prepack`/`postpack` (`apps/cli/scripts/`) מסירים את ה-`devDependencies` (ה-`workspace:*` שלא
   אומרים כלום מחוץ למונורפו) מהחבילה שמתפרסמת, ומחזירים את `package.json` המקומי בדיוק כפי שהיה
   מיד אחרי — ראו ההערה ב-[P12-T1](docs/TASKS.md#p12).
   ⚠️ `apps/cli/package.json` חייב **לא** לשאת `"private": true` בזמן הפרסום עצמו — npm מסרב לפרסם
   חבילה `private`. זו הסרה מכוונת וידנית ברגע הפרסום, לא ברירת מחדל — כדי שאף `pnpm publish -r`
   רחב לא יפרסם את זה בטעות באמצע פיתוח רגיל.
7. **GitHub Release** — צרו release מה-tag שנוצר, עם התוכן מ-`CHANGELOG.md`'s הסעיף החדש.

## מה עדיין ידני (לא מתוזמן/מאוטמט)

אין עדיין workflow שמריץ את זה אוטומטית על push של tag — כל השלבים למעלה ידניים בכוונה, כדי
שהחלטה בלתי-הפיכה (פרסום ל-npm) תעבור תמיד דרך מישהו שמריץ אותה במפורש. אוטומציה עתידית (GitHub
Actions על `push: tags: ['v*']`) היא שיפור סביר, לא נבנתה כחלק מ-P12.

## הערה: רישיון

הפרויקט עדיין **ללא** קובץ `LICENSE`. זו החלטה עסקית/משפטית של בעל הפרויקט (MIT/Apache-2.0/קנייני/
אחר) — לא הוחלט כאן, ולא יוחלט על ידי כלי אוטומטי. עד שתיבחר, `npm publish` יעבוד טכנית אבל ישאיר
את זכויות השימוש בחבילה מעורפלות ("כל הזכויות שמורות" כברירת מחדל ברוב השיפוטים) — מומלץ לסגור
לפני שחרור פומבי אמיתי.
