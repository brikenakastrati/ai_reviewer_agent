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

Në Windows instalo `scc` nga burimi winget me `winget install --id BenBoyter.scc --exact --source winget`. Mjetet janë opsionale; mungesa e tyre duhet shënuar në raport, jo zëvendësuar me pretendime të paverifikuara. Nuk kërkohen varësi aplikacioni ose token-e të ruajtura në repo. Raportet dhe kopjet lokale të projekteve mbeten jashtë kontrollit të versionit.
