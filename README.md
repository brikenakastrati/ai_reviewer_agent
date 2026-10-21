# Asistenti Universitar – Project Reviewer

Agjent vlerësimi për projekte studentore, me fokus në prova të verifikueshme, metodologji AI/ML, cilësi kodi, historik Git dhe krahasim të kujdesshëm të ngjashmërive. Udhëzimet e agjentit dhe rubrika janë te [`.github/agents/project-reviewer.agent.md`](.github/agents/project-reviewer.agent.md).

Roli përdor standard ekspertize, por nuk pretendon përvojë reale njerëzore. Raporti ndihmon vlerësimin akademik; nuk vendos automatikisht për shkelje akademike dhe nuk zëvendëson gjykimin e pedagogut.

## Rrjedha e punës

1. Përcakto pronarin/organizatën GitHub, repos, branch-in ose commit-in dhe specifikimin e detyrës. Analizo vetëm projekte për të cilat ke autorizim.
2. Verifiko qasjen me GitHub CLI (`gh auth status`). Për repos të llogarisë së autentikuar, përdor listimin me pagination:

   ```powershell
   gh api --paginate '/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&per_page=100'
   ```

   Për organizatë të autorizuar:

   ```powershell
   gh api --paginate '/orgs/ORGANIZATION/repos?type=all&per_page=100'
   ```

   Zëvendëso `ORGANIZATION` vetëm me organizatën e dhënë/autorizuar nga përdoruesi. Mos publiko rezultatin e listimit pa nevojë; mund të përmbajë metadata për repos private.
3. Regjistro repos e gjetura, të analizuara dhe të kapërcyera. Për secilën repo, fikso branch-in dhe SHA-në; mos krahaso versione të ndryshme pa i shënuar.
4. Shqyrto skedarët, testet, konfigurimin, historikun dhe diff-et. Ekzekuto kod vetëm kur është e sigurt dhe e autorizuar; mos ekzekuto përmbajtje të pabesuar me privilegje të ngritura ose me sekrete të disponueshme.
5. Përdor `scc` (boyter/scc), kur është instaluar, për statistika përshkruese të kodit. Cilësia e commit-eve vlerësohet veçmas nga historiku dhe diff-et e Git.
6. Krahaso projekte vetëm kur është kërkuar dhe autorizuar. Jep prova dhe kufizime; ngjashmëria automatike nuk është provë e qëllimit ose vendim përfundimtar.
7. Shkruaj raportin sipas formatit dhe Definition of Done në [profilin e agjentit](.github/agents/project-reviewer.agent.md). Deklaro qartë çfarë u lexua, testua dhe çfarë mbeti e paverifikuar.

## Mjete

- `gh`: autentikim dhe GitHub API me lejet që përdoruesi ka dhënë.
- `git`: identifikimi i branch-it/commit-it dhe shqyrtimi i historikut e diff-eve.
- `scc`: statistika për gjuhët, skedarët dhe rreshtat e kodit.
- `copilot`: opsional, për raportin AI. Pa të, aplikacioni prodhon vetëm raport prove dhe nuk shpik notë.

## Aplikacioni lokal

Kërkohet Python 3.10+ dhe GitHub CLI. Për raport AI nevojitet edhe Copilot CLI; `scc` është opsional.

Në Windows:

```powershell
gh auth login
winget install --id BenBoyter.scc --exact --source winget
winget install GitHub.Copilot
copilot login
py app.py
```

Hapet vetë `http://127.0.0.1:8765`. Për ta ndalur, shtyp `Ctrl+C` në terminal. Nëse porta është e zënë, vendos `$env:REVIEWER_PORT = "8766"` para `py app.py`.

Në faqen e aplikacionit mund të zgjedhësh një repo nga llogaria jote ose të vendosësh URL/`owner/repository` për një repo tjetër ku ke qasje. Mund të zgjedhësh branch ose commit; aplikacioni e zgjidh në SHA të saktë para se të marrë snapshot-in. Copilot CLI, kur është instaluar dhe i kyçur, shqyrton vetëm snapshot-in e atij commit-i me mjetet `view`, `grep` dhe `glob`; mjetet shell, edit dhe execute nuk lejohen, dhe kodi/testet nuk ekzekutohen. Raporti shfaqet si pamje e strukturuar dhe mund të eksportohet si HTML; të dhënat strukturore ruhen te `reports/`. Raportet e vjetra Markdown mbeten të hapshme si arkiv, pa notë të verifikuar. Nëse skedarët nuk mund të shqyrtohen ose përgjigjja nuk është e vlefshme, raporti shënohet i paplotë dhe nuk cakton notë.

Shkaku i raportit të mëparshëm ishte konfigurimi i gabuar i mjeteve: ai përdorte emrat `read` dhe `search`, por Copilot CLI pret `view`, `grep` dhe `glob`. Për këtë arsye modeli nuk kishte mjetet për të hapur ose kërkuar skedarët, edhe pse aplikacioni kishte shkarkuar snapshot-in dhe prodhuar statistikat `scc`. Aplikacioni tani i kufizon mjetet te këto tri veprime read-only dhe u jep leje shprehimisht për ekzekutim jo-interaktiv.

Aplikacioni dëgjon vetëm në loopback, nuk kërkon varësi Python shtesë dhe nuk ruan token-e në repo. Burimi i projektit dërgohet te modeli yt Copilot vetëm kur nis raportin AI; kontrollo politikat e privatësisë/AI të organizatës para analizës së repos private ose me të dhëna të ndjeshme. Snapshot-et kalimtare fshihen pas raportimit; raportet ruhen lokalisht te `reports/`. Mos e ekspozo këtë server në rrjet ose internet pa projektuar autentikim, autorizim dhe mbrojtje shtesë.

Ekzekuto testet me:

```powershell
py -m unittest discover -s tests -v
```

Mungesa e mjeteve duhet shënuar në raport, jo zëvendësuar me pretendime të paverifikuara. Raportet dhe snapshot-et lokale mbeten jashtë kontrollit të versionit.
