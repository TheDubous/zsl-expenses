# ZSL Expenses · Lokální PWA (bez databázového serveru)

## v0.8.1 – oprava finančního zápisu do originálního ZSL Excelu

Předchozí export mohl stáhnout XLSX, do kterého se dopsali pouze sportovci, zatímco všechny účtenky byly přeskočeny. Příčina:
- čekání na bankovní potvrzení chybně blokovalo zápis i správně rozpoznané částky;
- palivo a strava bez vybrané sekce byly tiše vynechány;
- oficiální ZSL v20250430 má jinak posunuté řádky než uživatelův variantní soubor \`s.5 - kniha jázd_Kufel_2\`.

**Oprava v aplikaci:**
- **Náhled → Zařazení účtenek do původního Excelu** nyní ukazuje u KAŽDÉ účtenky původního dodavatele, částku, správnou volbu sekce ZSL, důvod vynechání a případná upozornění. Sekci lze změnit přímo zde jedním výběrem.
- Chybějící potvrzení platby kartou je **varování**, nikoli blokace zápisu účetní částky. Potvrzení se stále vyžaduje před předáním kompletních PDF příloh.
- **Oficiální šablona ZSL v20250430**: \`s.3 - výdavky\` doprava řádky **6–10**, vozidlo ZSL **26–35**, ubytování **40–44**, ostatní vedlejší náklady **49–55**. Soukromá starší variantní šablona používá dopravu 6–8, vozidlo 24–33, ubytování 38–42 a ostatní 47–59. **Tato volba je automatická podle skutečně načtené varianty XLSX.**
- Při více položkách, než má příslušná sekce volných řádků, se částka **nikdy nezapíše pod výpočtový řádek**.
- Export výslovně uvádí **počet skutečně zapsaných účtenek a jejich celkovou částku**, nikoli jen počet změněných buněk. Pokud by se zapisovala jen jména a žádný výdaj, export se odmítne s důvodem, aby se neodeslal neúplný výkaz.
- Přesné testy používají skutečný veřejný ZSL XLSX (při GitHub Actions buildu) s částkami **127,78 EUR tankování**, **315 EUR ubytování**, **650 EUR ostatní** a **55,84 EUR zahraniční strava**, celkem **1 148,62 EUR**. Kontroluje se, že jsou hodnoty opravdu uvnitř správných sekcí a pod jejich originálními vzorci.
- Všechny formule a původní formátování zůstávají zachované. **Po otevření staženého XLSX v Microsoft Excelu je třeba nechat přepočítat vzorce.** Rychlý náhled v aplikaci Soubory na iPhonu nemusí zobrazit čerstvé výsledky vzorců. Před finálním odesláním porovnej i list \`s.3 - výdavky\` a částku v náhledu aplikace.

**Bezpečnost:** žádná databáze ani přenos účtenek na GitHub. Starší místní uložená data zůstávají beze změny. Doporučuje se Kompletní ZIP záloha před testem.

---

## v0.8 – vestavěná šablona ZSL + spolehlivější čtení úzkých účtenek

**ZSL Excel se už nemusí nahrávat.** Při nasazení GitHub Pages se stáhne veřejně vydaná oficiální šablona [ZSL, soubor v20250430](https://www.zvazslovenskeholyzovania.sk/wp-content/uploads/ZSL-Cestovny-prikaz-sablona-v20250430.xlsx). Její přesný SHA-256 se kontroluje během sestavení a výsledný XLSX se zahrne do offline PWA. Při prvním otevření aplikace se kopie uloží do IndexedDB na iPhonu. Aplikace pak vytváří kopii tohoto skutečného XLSX, ne nový formulář.

**Pozor na rozdíl šablon:** uživatelem dodaná soukromá jedenáctilistová verze má \`s.5 - kniha jázd_Kufel_2\`. Oficiální veřejná jedenáctilistová verze obsahuje místo ní \`s.2 - súhlas MV\`. Abychom nezveřejňovali osobní údaje a nebyla potřeba žádná ruční nahrávka, vestavěná je **veřejná oficiální** verze. Ostatních deset společných listů a jejich standardní oblasti pro zápis aplikace podporuje. Pokud již máš v aplikaci nahranou vlastní verzi, zůstane zachovaná a nepřepíše se. Pokud ji potřebuješ zvolit jako zdroj místo oficiální verze, stále můžeš použít volitelný import **Použít vlastní upravený XLSX**.

V originální oficiální šabloně jsou některé statické texty v jinak finančních sloupcích a vzorce. **Nejde o předchozí vyúčtování.** Nyní se rozlišují od skutečných zadaných výdajů. Původní hodnoty ani vzorce se přesto nepřepisují.

**OCR příkladu \`IMG_7834.jpeg\`:** účtenka GUTMANN GMBH / DISK Tankstelle má správnou částku **127,78 EUR**, datum **03. 11. 2026**, platbu **kartou** a diesel. Pro světlý úzký termopapír na dřevěném pozadí přibyla detekce hranic papíru, zvětšení pouze jeho obsahu a několik OCR průchodů; parser rozpoznává i rozdělený nápis **G E S A M T BETRAG** a nezamění cenu za DPH/STE UERANTEIL nebo \`Ihre Ersparnis\`. Fotografie se zpracovává lokálně. Pravidla a výřezy jsou otestované na syntetických vzorcích; úspěšnost přímo na fyzickém iPhonu **není zatím garantovaná**. V aplikaci u problematické účtenky vyber **Doklady → Důkladné → Přečíst znovu** a výsledek ručně potvrď.

Výstupy zůstávají oddělené: **vyplněný originální XLSX** a **samostatné PDF příloh**.

---

## v0.7 – PŘESNÝ ORIGINÁLNÍ XLSX + SAMOSTATNÉ PDF PŘÍLOH

**Zásadní změna proti v0.6:** aplikace už pro vyúčtování negeneruje neodpovídající vlastní PDF formulář. Místo toho upraví kopii **skutečného souboru ZSL-Cestovny-prikaz.xlsx**, který jí uživatel jednorázově vybere z aplikace Soubory. Doklady exportuje do samostatného PDF.

### Postup na iPhonu
1. **Před aktualizací si ulož Kompletní zálohu ZIP** z původní aplikace. Instalační ikonu ani její data nemaž.
2. V aplikaci **Náhled → Vybrat originální XLSX ZSL**. Vyber původní Excel z iPhone **Soubory**. Původní soubor poslaný do chatu se automaticky do telefonu nepřenese.
3. Otevři jednotlivé účtenky v **Doklady → Upravit**. **Ručně potvrď rozpoznaný obchod, datum a částku.** U paliva vyber sekci vozidla ZSL; u jídla pro zahraniční stravné vyber **s.4 – stravné zahr.**; u každé platby kartou připoj individuální bankovní potvrzení.
4. V **Přehled** nebo **Náhled** vyber **Stáhnout vyplněný původní XLSX** a následně **Stáhnout PDF příloh**.
5. Otevři vyplněný XLSX v Microsoft Excelu a zkontroluj částky na listu `s.1 - pokyn`. **Excel musí soubor přepočítat**, protože jsou v něm originální vzorce. Pokud chceš **také PDF samotného výkazu se zachovanou vizuální podobou**, exportuj jej ze staženého XLSX přes funkci Excelu *Export do PDF*. PWA zatím neumí zaručeně věrný tisk všech listů do PDF zcela offline na iPhonu.

### Co je zachované
- **Všech 11 původních listů**, původní formátování, vzorce, existující obrázky, ostatní XML části XLSX a prefillované údaje o vozidlech nebo služebních cestách.
- **Nikdy nepřepisujeme neprázdnou buňku ani existující vzorec**. Pokud jsou určité řádky už obsazené, aplikace hledá další skutečně prázdný řádek v přesně definované části listu.
- **Kontrolní protokol** vypíše všechny zapsané buňky a všechny doklady, které nešlo bezpečně zařadit či vložit. Vývoz nemá „vymyšlené“ položky.
- Ukládání originálu probíhá jen v IndexedDB v telefonu pod identifikátorem `zsl-original-xlsx-template`. Originál je součástí Kompletní ZIP zálohy i obnovy, stejně jako účtenky.
- Zdrojový Excel vybraný v PWA **nenahráváme do GitHubu**. Repo obsahuje pouze programový kód a syntetické testy bez osobních dat.

### Ochrana před smícháním dvou vyúčtování
Když vybereš **již vyplněný** Colere příklad (nebo jiný soubor obsahující staré termíny a výdaje), aplikace zobrazí varování a **zablokuje běžný export**. Při novém soustředění zvol čistý originální formulář ZSL. Jen pokud jde skutečně o **stejnou rozpracovanou cestu**, lze v záložce Náhled zaškrtnout výslovné potvrzení „chci doplniť existujúci výkaz“. Stávající buňky a vzorce ani tehdy nepřepíše.

Předvyplněné informace o autech v obou knihách jízd se zachovávají i při použití čisté šablony. Výraz „předvyplněné údaje zachovat“ se **nesmí** zaměňovat za automatické přenášení starých výdajů do nové akce.

### Přesná mapa z vyplněného Colere vzoru
- `s.1 - pokyn`: osobní údaje trenéra, termíny, místa, účastníci, případně `I30` pro zálohu; součtové vzorce `I32:I40` zůstávají původní.
- `s.3 - výdavky`: doprava **řádky 6–8**, tankování vozidla ZSL **24–33 (C,F,H)**, ubytování **38–42 (C,F,H)**, jiné výdaje **47–59 (C,F,H)**.
- `s.4 - stravné zahr.`: konkrétní potvrzené doklady za jídlo **řádky 74–107 (B,C,F,I,J)**. Stravné a diety se automaticky NEODHADUJÍ.
- `s.6 - správa`: zpráva z cesty a účastníci, pokud jsou bezpečně dostupné prázdné buňky.
- Soukromé a firemní vozidlo vyžaduje kilometry, spotřebu a další vstupy pro originální vzorce; pouhá účtenka s částkou tam **nesmí přepsat vypočítané buňky**.

### Oprava OCR
- **„Summe“ / „Gesamtbetrag“ jsou celkové částky**.
- **„Ihre Ersparnis“ / sleva / ušetřeno** se už nikdy nesmějí považovat za celkovou zaplacenou částku, ani když jsou vypsané na samostatném řádku.
- Když OCR selže, částku vždy **napiš ručně podle originálu**. Automatické čtení není garance přesnosti a položka se bez potvrzení nesmí bezpečně zapsat do XLSX.

### PDF příloh
Samostatný PDF obsahuje přehled akce a u každého výdaje jeho účtenku, poté **příslušné bankovní potvrzení konkrétní platby kartou**. Jestliže příloha chybí nebo je nečitelná, zůstane výslovné upozornění. Obrázky JPG/PNG/HEIC se připravují v telefonu a PDF potvrzení z banky se připojují se zachováním všech jejich stran. Pro alternativní formáty či nepodporované HEIC může být nutný původní ZIP.

**Citlivé údaje:** XLSX, PDF i záložní ZIP obsahují případné osobní/bankovní údaje, nejsou automaticky šifrované. Neposílej je veřejně.

---

## Verze v0.6: přesné názvy ZSL a celý kontrolní PDF výkaz

- Na stránce **Přehled** přibyl souhrn **Zúčtovanie oprávnených výdavkov** s přesnými položkami z listu `s.1 - pokyn`: **Cestovné, Ubytovanie, Ostatné, Stravné tuzemsko, Stravné zahraničie, Príspevok na stravu tuzemsko, Príspevok na stravu zahraničie, Výdavok celkom, Doplatok / Preplatok**.
- Stravné, diety, amortizace a nárokové částky nejsou vypočítány. Označujeme je **NEVYPOČÍTANÉ**, místo abychom tvrdili, že jsou nulové nebo schválené.
- Záložka **Náhled** teď zobrazuje názvy a pracovní obsah sedmi viditelných listů originální šablony: `s.1 - pokyn`, `s.3 - výdavky`, tuzemské a zahraniční stravné z `s.4`, `s.5 - kniha jázd` a `s.6 - správa`.
- Tlačítko **Stáhnout PDF celého výkazu** v Přehledu i Náhledu sestaví **vícestránkový PDF kontrolní výkaz** přímo v telefonu, včetně profilu trenéra/IBAN, účastníků, všech zaevidovaných výdajů, záloh, oddílů ZSL a kontrolního seznamu. PDF má výrazné označení, že **nejde o originální XLSX ZSL ani o schválený cestovní příkaz**.
- U každého výdaje můžeš nyní vybrat **přesnou sekci listu s.3 – výdavky**. U paliva zvol, zda patří pod soukromé vozidlo, vozidlo právnické osoby nebo vozidlo ZSL, a můžeš doplnit značku a EČV. **Aplikace vlastníka vozidla nikdy automaticky nehádá.**
- V editoru akce jde doplnit také **SPRÁVA Z PRACOVNEJ CESTY**, která se projeví v PDF.
- Stávající export ZIP zůstává a do CSV nově zahrnuje také sekci ZSL a vozidlo. **Fotografie a bankovní potvrzení nejsou vloženy přímo do PDF**; zůstávají ke stažení v ZIPu.
- Při měně jiné než EUR je na místech označených *Suma v EUR* uvedeno, že **přepočet není vypočítaný** – aplikace neodhaduje kurzy.
- PDF se generuje **lokálně** pomocí pdfmake s vloženým fontem podporujícím slovenštinu/češtinu. Není potřeba účet, databáze ani nahrání osobních údajů na server.
- PDF soubor obsahuje osobní/bankovní údaje a **není chráněn heslem**. Ukládej jej mimo veřejná místa a sdílej pouze oprávněným osobám.
- Tato verze používá stejné lokální IndexedDB jako předchozí. **Před aktualizací vytvoř kompletní ZIP zálohu.** Instalovanou ikonu na iPhonu nemaž.

## Vylepšení OCR v0.5 – důkladné čtení účtenek

Novým výchozím nastavením je **Důkladné rozpoznávání**. Jedna fotka se čte postupně vícekrát pomocí různých nastavení obrazu a OCR segmentace. Samostatný průchod horní částí účtenky se zaměřuje na **dodavatele**; když je nejasná částka, může přibýt další průchod spodní částí. Rychlý režim zůstává dostupný v rozbalovacím výběru na záložce **Doklady**.

- OCR používá jeden pracovní proces, rozpoznávání angličtiny a němčiny (pokud se jejich modely načtou), předzpracování kontrastu a více průchodů. Na slabším telefonu může být důkladné čtení znatelně pomalejší; nemusí zvýšit úspěšnost u každé fotografie.
- U starších účtenek použij **Přečíst znovu**. Původní fotografie a ručně potvrzené údaje zůstanou zachované; nové návrhy najdeš v **Upravit**.
- Detail dokladu nyní nabízí **možné dodavatele** a alternativní částky. Klepnutím na návrh vyplníš pole, ale správnost je stále nutné ověřit na originální fotografii.
- Pokud se jednotlivé průchody neshodnou na částce či obchodníkovi, aplikace výsledek označí jako nejistý místo automatického rozhodnutí.
- Pro OCR fotografií první spuštění vyžaduje internet ke stažení jazykových modelů. Fotografie jsou analyzované místně v telefonu. PDF OCR stále nepodporujeme.
- **Před aktualizací doporučujeme Kompletní zálohu ZIP.** Tato verze zachovává stejné IndexedDB úložiště a nevyžaduje jeho výmaz.

## Novinky v0.4: náhled formuláře, lokální OCR a soupiska

- **Náhled → s.1 – Pokyn / s.3 – Výdavky / Kontrola**: mobilní pracovní náhled polí původního ZSL formuláře. Ukazuje, co je vyplněné a chybí. **Zatím nejde o skutečné úpravy či export originálního XLSX.** ZIP nadále obsahuje CSV a fotografické doklady.
- **Trenéři**: jméno, titul, funkce, oddělení ZSL, trvalá adresa, telefon, e-mail, IBAN, volitelně BIC a banka. Staré uložené profily lze doplnit a nebudou smazané.
- **Sústredenie / Preteky**: můžeš kdykoliv upravit datum, čas, místo odchodu a návratu, destinaci/stát, účel a číslo zálohy.
- **OCR přímo v telefonu (Tesseract.js)**: po nahrání fotografie se pokusí navrhnout částku, datum, obchodníka, kategorii a způsob platby. Jazykový model a pracovní moduly OCR se **při prvním použití stahují z CDN**, proto první OCR vyžaduje internet; pozdější offline OCR na iPhonu není garantováno. Fotografie se kvůli OCR neodesílají na server. Rozpoznané hodnoty vždy ručně zkontroluj – mohou být nepřesné.
- OCR zatím funguje pro **fotografie**, ne pro PDF. U dříve nahrané fotografie použij **Přečíst znovu**. Fotografie a PDF mají vlastní **Náhled dokladu**.
- **Aktuální soupiska**: jezdce lze přidat i odebrat po vytvoření akce, historie změn se zachová. Globální **Archivovat** skryje jezdce z nových akcí, starší evidence zůstává.
- Lokální IndexedDB se **nevytváří znovu** – v0.4 používá stejné tabulky a soubory jako v0.3. Přesto je vhodné vytvořit úplnou ZIP zálohu před aktualizací a po ní.

**Aktuální doporučená varianta.** PWA pro iPhone, Android i počítač. Účtenky, bankovní potvrzení, profily, jezdci a finanční záznamy ukládá **přímo do IndexedDB v tomto zařízení**. Nepotřebuje Supabase, login ani vlastní server. V kořeni repozitáře zůstává starší Expo verze.

## Co již funguje
- Aplikace s ikonou na ploše telefonu (Safari → Sdílet → Přidat na plochu)
- Profily více trenérů a databáze jezdců
- Nové **Sústredenie** nebo **Preteky**: trenér, jezdci, termín, měna a počáteční záloha
- Další zálohy / vklady a vrácení peněz, zůstatek a graf kategorií
- Hromadné nahrání účtenek / focení; ruční doplnění obchodníka, sumy, data, kategorie a způsobu platby
- **Pozdější** přidání jednoho bankovního potvrzení k jednotlivé platbě kartou, hotovost bez potvrzení
- Nafta, benzín a AdBlue patří společně do kategorie Tankování
- ZIP konkrétního vyúčtování: doklady + potvrzení + CSV + kontrola chybějících dokladů
- **Kompletní záloha ZIP a obnova**: všechna soustředění, profily i původní přílohy
- Bez internetového připojení fungují lokální operace **po prvním úspěšném načtení a uložení PWA pro offline použití**

## Co ještě není hotové
Automatické rozpoznání účtenek (AI OCR), hromadné automatické párování bankovních potvrzení podle částky, oficiální ZSL Excel, více měn během jedné akce a komplexní účetní výpočty. Offline chování ještě musí projít testem na skutečném iPhonu.

## Lokální vývoj
```bash
cd web
npm install
npm test
npm run build
npm run dev
```
Na počítači se otevře adresa, kterou Vite vypíše. Kód PWA nevyžaduje žádné .env soubory.

## Jak zpřístupnit aplikaci přes HTTPS
**Důležité:** GitHub repozitář obsahuje zdrojový kód, ale jeho adresa není URL hotové webové aplikace. PWA potřebuje jednorázově zveřejnit své statické soubory na HTTPS hostingu.

### Jednoduchá možnost – Vercel
1. Na https://vercel.com/new importuj repo `TheDubous/zsl-expenses`.
2. Vyber větev `feature/pwa-supabase` (dokud není změna sloučena do `main`).
3. **Root Directory** nastav na `web`.
4. Framework `Vite`, Build Command `npm run build`, Output Directory `dist`.
5. **Žádné environment variables** nejsou potřeba; deploy a otevři dodanou HTTPS adresu.
6. Na iPhonu ji otevři v **Safari → Sdílet → Přidat na plochu → Otevřít jako webovou aplikaci**.
7. **Začni pracovat přímo v ikoně na ploše.** Data vytvořená v Safari mohou mít odlišné úložiště než data PWA spuštěné z plochy.

### Volitelně – GitHub Pages
Připravený workflow `.github/workflows/deploy-pwa-pages.yml` umožní statické nasazení do `https://TheDubous.github.io/zsl-expenses/`. Je třeba v GitHub Settings → Pages nastavit Source na GitHub Actions a spustit workflow. **Pozor:** GitHub Free podporuje Pages pouze ve veřejných repozitářích; soukromé repozitáře vyžadují oprávněný placený plán. Není nutné repozitář zveřejňovat; Vercel umí deploy i ze soukromého repozitáře.

Hosting slouží jen k doručení webové aplikace. **Doklady se na tento hosting neposílají.**

## Zálohování a ochrana dat
- Data v IndexedDB jsou v zařízení, nikoli v souborech viditelných v aplikaci Soubory. Smazání aplikace nebo jejích dat je může odstranit.
- Po každém dni a zejména po dokončení akce zvol **Záloha → Stáhnout kompletní zálohu ZIP** a ulož ZIP mimo aplikaci, například na iCloud Drive.
- Obnova ze ZIPu **nahradí všechny současné lokální záznamy** a znovu uloží všechny přílohy.
- Záložní ZIP není šifrovaný, nepředávej ho veřejně a ukládej ho bezpečně.
- Každé zařízení má vlastní databázi; trenéři mezi telefony nic automaticky nesdílejí.
- Bez vlastních účtů ani přihlášení: každý, kdo má odemčené dané zařízení a přístup k PWA, může otevřít uložené doklady.
- Pro první test používej fiktivní účetní doklady. S reálnými bankovními přílohami až po ověření na telefonu a zavedení zálohovacího postupu.

## Technické soubory
- `src/main.jsx`: mobilní rozhraní, soustředění/závody, doklady, grafy a zálohování
- `src/localdb.js`: IndexedDB tabulky a soubory
- `src/archive.js`: ZIP export, kompletní zálohování a obnova
- `src/utils.mjs`: kategorie, částky a výpočet zbývající zálohy
- `vite.config.js`: PWA, servisní pracovník a ikonky
- `tests/`: testy výpočtů a lokální databáze
