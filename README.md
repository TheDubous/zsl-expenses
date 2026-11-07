# ZSL Expenses

Mobilná aplikácia (Expo / React Native) pre **Sústredenia** a **Preteky**.

## Prvá verzia
- Profil trénerov a jazdcov; vytvorenie akcie s termínom, menou a zálohou
- Fotenie účteniek a hromadné nahrávanie z galérie
- Doplnenie bankových potvrdení **neskôr** (samostatné PDF/obrázky)
- Ručné spárovanie bankového potvrdenia s kartovou platbou
- Kontrola chýbajúcich údajov a potvrdení; hotovosť potvrdenie nevyžaduje
- Sumár čerpania zálohy a výdavkov po kategóriách; nafta aj AdBlue patria do Tankovania
- ZIP s jednotlivými účtenkami a potvrdeniami, CSV a zoznamom neúplných dokladov

## Spustenie
Nainštaluj Node.js 22+ a Expo Go vhodné pre používané Expo SDK.

```sh
npm install
npm test
npx expo start
```

Pre Android APK možno použiť Expo EAS Build po prihlásení a konfigurácii Expo účtu:

```sh
npx eas-cli login
npx eas-cli build:configure
npx eas-cli build --platform android --profile preview
```

APK zatiaľ **nebolo zostavené ani testované na telefóne**.

## Ešte neimplementované
AI rozpoznávanie textu účteniek; automatické párovanie z obsahu bankových potvrdení; export do originálneho Excelu ZSL; cloudové účty a synchronizácia; viacmenové účtovanie, diéty a kniha jázd.

## Bezpečnosť
**Len testovací prototyp.** Metadáta sú v lokálnom AsyncStorage bez šifrovania, prílohy v súkromnom priečinku aplikácie. ZIP export nie je šifrovaný. Nepridávaj zatiaľ skutočné bankové doklady ani citlivé údaje. Do GitHubu nedávaj účtenky, osobné údaje ani tajné API kľúče.

## Súbory
- `App.jsx`: obrazovky aplikácie, doklady, priraďovanie a ZIP export
- `src/domain.cjs`: výpočty a pravidlá úplnosti
- `tests/domain.test.cjs`: automatické testy
- `.github/workflows/ci.yml`: GitHub Actions testy
