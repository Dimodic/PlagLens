# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: specs\notifications\notification-sse-realtime.spec.ts >> SSE realtime >> triggering grade.assigned increments unread count over SSE (best-effort)
- Location: e2e\specs\notifications\notification-sse-realtime.spec.ts:38:3

# Error details

```
TimeoutError: locator.getAttribute: Timeout 10000ms exceeded.
Call log:
  - waiting for getByTestId('notif-unread-badge')

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary [ref=e4]:
    - generic [ref=e5]:
      - link "PlagLens" [ref=e6] [cursor=pointer]:
        - /url: /
        - img [ref=e8]
      - generic [ref=e11]:
        - generic [ref=e12]: PlagLens
        - generic [ref=e13]: кабинет студента
      - button "Свернуть" [ref=e14] [cursor=pointer]:
        - img [ref=e15]
    - generic [ref=e18]:
      - img [ref=e20]
      - generic [ref=e23]: Поиск заданий, студентов, посылок…
      - generic [ref=e24]: ⌘K
    - generic [ref=e26]:
      - generic [ref=e27]: Учёба
      - generic [ref=e28]:
        - link "Главная" [ref=e29] [cursor=pointer]:
          - /url: /me
          - img [ref=e31]
          - generic [ref=e36]: Главная
        - link "Задания" [ref=e37] [cursor=pointer]:
          - /url: /me/assignments
          - img [ref=e39]
          - generic [ref=e42]: Задания
        - link "Мои посылки" [ref=e43] [cursor=pointer]:
          - /url: /me/submissions
          - img [ref=e45]
          - generic [ref=e47]: Мои посылки
        - link "Уведомления" [ref=e48] [cursor=pointer]:
          - /url: /notifications
          - img [ref=e50]
          - generic [ref=e52]: Уведомления
    - button "ИП Иван Петров Студент" [ref=e54] [cursor=pointer]:
      - generic [ref=e55]: ИП
      - generic [ref=e56]:
        - generic [ref=e57]: Иван Петров
        - generic [ref=e58]: Студент
      - img [ref=e60]
  - main [ref=e62]:
    - generic [ref=e63]:
      - generic [ref=e64]: Уведомления
      - generic [ref=e65]:
        - button "EN" [ref=e66] [cursor=pointer]
        - button "RU" [ref=e67] [cursor=pointer]
      - button "Переключить тему" [ref=e68] [cursor=pointer]:
        - img [ref=e69]
      - button [ref=e75]
    - generic [ref=e77]:
      - generic [ref=e79]:
        - heading "Уведомления" [level=1] [ref=e80]
        - generic [ref=e81]:
          - link "Настройки" [ref=e82] [cursor=pointer]:
            - /url: /me/notifications/preferences
          - link "Web Push" [ref=e83] [cursor=pointer]:
            - /url: /me/notifications/web-push
          - button "Прочитать все" [ref=e84] [cursor=pointer]:
            - generic [ref=e85]:
              - img [ref=e87]
              - generic [ref=e89]: Прочитать все
      - generic [ref=e91]:
        - tablist [ref=e93]:
          - tab "Непрочитанные" [selected] [ref=e94] [cursor=pointer]:
            - generic [ref=e95]: Непрочитанные
          - tab "Все" [ref=e96] [cursor=pointer]:
            - generic [ref=e97]: Все
          - tab "Архив" [ref=e98] [cursor=pointer]:
            - generic [ref=e99]: Архив
        - generic [ref=e100]:
          - generic [ref=e102]:
            - textbox "Любая важность" [ref=e103] [cursor=pointer]
            - generic:
              - img
          - textbox "Тип события (event_type)" [ref=e106]
          - textbox "С даты (ISO)" [ref=e109]
        - generic [ref=e110]:
          - generic [ref=e112]:
            - button "Открыть" [ref=e113] [cursor=pointer]:
              - generic [ref=e114]:
                - img [ref=e116]
                - generic [ref=e119]:
                  - paragraph [ref=e120]: Уведомление PlagLens
                  - paragraph [ref=e121]: У вас новое уведомление.
                  - paragraph [ref=e122]: 08.05.2026 11:17
            - generic [ref=e123]:
              - button "Отметить прочитанным" [ref=e124] [cursor=pointer]:
                - img [ref=e126]
              - button "Архивировать" [ref=e128] [cursor=pointer]:
                - img [ref=e130]
          - generic [ref=e134]:
            - button "Открыть" [ref=e135] [cursor=pointer]:
              - generic [ref=e136]:
                - img [ref=e138]
                - generic [ref=e141]:
                  - paragraph [ref=e142]: Уведомление PlagLens
                  - paragraph [ref=e143]: У вас новое уведомление.
                  - paragraph [ref=e144]: 08.05.2026 11:17
            - generic [ref=e145]:
              - button "Отметить прочитанным" [ref=e146] [cursor=pointer]:
                - img [ref=e148]
              - button "Архивировать" [ref=e150] [cursor=pointer]:
                - img [ref=e152]
          - generic [ref=e156]:
            - button "Открыть" [ref=e157] [cursor=pointer]:
              - generic [ref=e158]:
                - img [ref=e160]
                - generic [ref=e163]:
                  - paragraph [ref=e164]: Уведомление PlagLens
                  - paragraph [ref=e165]: У вас новое уведомление.
                  - paragraph [ref=e166]: 08.05.2026 11:17
            - generic [ref=e167]:
              - button "Отметить прочитанным" [ref=e168] [cursor=pointer]:
                - img [ref=e170]
              - button "Архивировать" [ref=e172] [cursor=pointer]:
                - img [ref=e174]
          - generic [ref=e178]:
            - button "Открыть" [ref=e179] [cursor=pointer]:
              - generic [ref=e180]:
                - img [ref=e182]
                - generic [ref=e185]:
                  - paragraph [ref=e186]: Уведомление PlagLens
                  - paragraph [ref=e187]: У вас новое уведомление.
                  - paragraph [ref=e188]: 08.05.2026 11:17
            - generic [ref=e189]:
              - button "Отметить прочитанным" [ref=e190] [cursor=pointer]:
                - img [ref=e192]
              - button "Архивировать" [ref=e194] [cursor=pointer]:
                - img [ref=e196]
          - generic [ref=e200]:
            - button "Открыть" [ref=e201] [cursor=pointer]:
              - generic [ref=e202]:
                - img [ref=e204]
                - generic [ref=e207]:
                  - paragraph [ref=e208]: Уведомление PlagLens
                  - paragraph [ref=e209]: У вас новое уведомление.
                  - paragraph [ref=e210]: 08.05.2026 11:17
            - generic [ref=e211]:
              - button "Отметить прочитанным" [ref=e212] [cursor=pointer]:
                - img [ref=e214]
              - button "Архивировать" [ref=e216] [cursor=pointer]:
                - img [ref=e218]
          - generic [ref=e222]:
            - button "Открыть" [ref=e223] [cursor=pointer]:
              - generic [ref=e224]:
                - img [ref=e226]
                - generic [ref=e229]:
                  - paragraph [ref=e230]: Уведомление PlagLens
                  - paragraph [ref=e231]: У вас новое уведомление.
                  - paragraph [ref=e232]: 08.05.2026 11:17
            - generic [ref=e233]:
              - button "Отметить прочитанным" [ref=e234] [cursor=pointer]:
                - img [ref=e236]
              - button "Архивировать" [ref=e238] [cursor=pointer]:
                - img [ref=e240]
          - generic [ref=e244]:
            - button "Открыть" [ref=e245] [cursor=pointer]:
              - generic [ref=e246]:
                - img [ref=e248]
                - generic [ref=e251]:
                  - paragraph [ref=e252]: Уведомление PlagLens
                  - paragraph [ref=e253]: У вас новое уведомление.
                  - paragraph [ref=e254]: 08.05.2026 11:17
            - generic [ref=e255]:
              - button "Отметить прочитанным" [ref=e256] [cursor=pointer]:
                - img [ref=e258]
              - button "Архивировать" [ref=e260] [cursor=pointer]:
                - img [ref=e262]
          - generic [ref=e266]:
            - button "Открыть" [ref=e267] [cursor=pointer]:
              - generic [ref=e268]:
                - img [ref=e270]
                - generic [ref=e273]:
                  - paragraph [ref=e274]: Уведомление PlagLens
                  - paragraph [ref=e275]: У вас новое уведомление.
                  - paragraph [ref=e276]: 08.05.2026 11:17
            - generic [ref=e277]:
              - button "Отметить прочитанным" [ref=e278] [cursor=pointer]:
                - img [ref=e280]
              - button "Архивировать" [ref=e282] [cursor=pointer]:
                - img [ref=e284]
          - generic [ref=e288]:
            - button "Открыть" [ref=e289] [cursor=pointer]:
              - generic [ref=e290]:
                - img [ref=e292]
                - generic [ref=e295]:
                  - paragraph [ref=e296]: Уведомление PlagLens
                  - paragraph [ref=e297]: У вас новое уведомление.
                  - paragraph [ref=e298]: 08.05.2026 11:17
            - generic [ref=e299]:
              - button "Отметить прочитанным" [ref=e300] [cursor=pointer]:
                - img [ref=e302]
              - button "Архивировать" [ref=e304] [cursor=pointer]:
                - img [ref=e306]
          - generic [ref=e310]:
            - button "Открыть" [ref=e311] [cursor=pointer]:
              - generic [ref=e312]:
                - img [ref=e314]
                - generic [ref=e317]:
                  - paragraph [ref=e318]: Уведомление PlagLens
                  - paragraph [ref=e319]: У вас новое уведомление.
                  - paragraph [ref=e320]: 08.05.2026 11:17
            - generic [ref=e321]:
              - button "Отметить прочитанным" [ref=e322] [cursor=pointer]:
                - img [ref=e324]
              - button "Архивировать" [ref=e326] [cursor=pointer]:
                - img [ref=e328]
          - generic [ref=e332]:
            - button "Открыть" [ref=e333] [cursor=pointer]:
              - generic [ref=e334]:
                - img [ref=e336]
                - generic [ref=e339]:
                  - paragraph [ref=e340]: Уведомление PlagLens
                  - paragraph [ref=e341]: У вас новое уведомление.
                  - paragraph [ref=e342]: 08.05.2026 11:17
            - generic [ref=e343]:
              - button "Отметить прочитанным" [ref=e344] [cursor=pointer]:
                - img [ref=e346]
              - button "Архивировать" [ref=e348] [cursor=pointer]:
                - img [ref=e350]
          - generic [ref=e354]:
            - button "Открыть" [ref=e355] [cursor=pointer]:
              - generic [ref=e356]:
                - img [ref=e358]
                - generic [ref=e361]:
                  - paragraph [ref=e362]: Уведомление PlagLens
                  - paragraph [ref=e363]: У вас новое уведомление.
                  - paragraph [ref=e364]: 08.05.2026 11:17
            - generic [ref=e365]:
              - button "Отметить прочитанным" [ref=e366] [cursor=pointer]:
                - img [ref=e368]
              - button "Архивировать" [ref=e370] [cursor=pointer]:
                - img [ref=e372]
          - generic [ref=e376]:
            - button "Открыть" [ref=e377] [cursor=pointer]:
              - generic [ref=e378]:
                - img [ref=e380]
                - generic [ref=e383]:
                  - paragraph [ref=e384]: Уведомление PlagLens
                  - paragraph [ref=e385]: У вас новое уведомление.
                  - paragraph [ref=e386]: 08.05.2026 11:17
            - generic [ref=e387]:
              - button "Отметить прочитанным" [ref=e388] [cursor=pointer]:
                - img [ref=e390]
              - button "Архивировать" [ref=e392] [cursor=pointer]:
                - img [ref=e394]
          - generic [ref=e398]:
            - button "Открыть" [ref=e399] [cursor=pointer]:
              - generic [ref=e400]:
                - img [ref=e402]
                - generic [ref=e405]:
                  - paragraph [ref=e406]: Уведомление PlagLens
                  - paragraph [ref=e407]: У вас новое уведомление.
                  - paragraph [ref=e408]: 08.05.2026 11:17
            - generic [ref=e409]:
              - button "Отметить прочитанным" [ref=e410] [cursor=pointer]:
                - img [ref=e412]
              - button "Архивировать" [ref=e414] [cursor=pointer]:
                - img [ref=e416]
          - generic [ref=e420]:
            - button "Открыть" [ref=e421] [cursor=pointer]:
              - generic [ref=e422]:
                - img [ref=e424]
                - generic [ref=e427]:
                  - paragraph [ref=e428]: Уведомление PlagLens
                  - paragraph [ref=e429]: У вас новое уведомление.
                  - paragraph [ref=e430]: 08.05.2026 11:17
            - generic [ref=e431]:
              - button "Отметить прочитанным" [ref=e432] [cursor=pointer]:
                - img [ref=e434]
              - button "Архивировать" [ref=e436] [cursor=pointer]:
                - img [ref=e438]
          - generic [ref=e442]:
            - button "Открыть" [ref=e443] [cursor=pointer]:
              - generic [ref=e444]:
                - img [ref=e446]
                - generic [ref=e449]:
                  - paragraph [ref=e450]: Уведомление PlagLens
                  - paragraph [ref=e451]: У вас новое уведомление.
                  - paragraph [ref=e452]: 08.05.2026 11:17
            - generic [ref=e453]:
              - button "Отметить прочитанным" [ref=e454] [cursor=pointer]:
                - img [ref=e456]
              - button "Архивировать" [ref=e458] [cursor=pointer]:
                - img [ref=e460]
          - generic [ref=e464]:
            - button "Открыть" [ref=e465] [cursor=pointer]:
              - generic [ref=e466]:
                - img [ref=e468]
                - generic [ref=e471]:
                  - paragraph [ref=e472]: Уведомление PlagLens
                  - paragraph [ref=e473]: У вас новое уведомление.
                  - paragraph [ref=e474]: 08.05.2026 11:17
            - generic [ref=e475]:
              - button "Отметить прочитанным" [ref=e476] [cursor=pointer]:
                - img [ref=e478]
              - button "Архивировать" [ref=e480] [cursor=pointer]:
                - img [ref=e482]
          - generic [ref=e486]:
            - button "Открыть" [ref=e487] [cursor=pointer]:
              - generic [ref=e488]:
                - img [ref=e490]
                - generic [ref=e493]:
                  - paragraph [ref=e494]: Уведомление PlagLens
                  - paragraph [ref=e495]: У вас новое уведомление.
                  - paragraph [ref=e496]: 08.05.2026 11:16
            - generic [ref=e497]:
              - button "Отметить прочитанным" [ref=e498] [cursor=pointer]:
                - img [ref=e500]
              - button "Архивировать" [ref=e502] [cursor=pointer]:
                - img [ref=e504]
          - generic [ref=e508]:
            - button "Открыть" [ref=e509] [cursor=pointer]:
              - generic [ref=e510]:
                - img [ref=e512]
                - generic [ref=e515]:
                  - paragraph [ref=e516]: Уведомление PlagLens
                  - paragraph [ref=e517]: У вас новое уведомление.
                  - paragraph [ref=e518]: 08.05.2026 11:16
            - generic [ref=e519]:
              - button "Отметить прочитанным" [ref=e520] [cursor=pointer]:
                - img [ref=e522]
              - button "Архивировать" [ref=e524] [cursor=pointer]:
                - img [ref=e526]
          - generic [ref=e530]:
            - button "Открыть" [ref=e531] [cursor=pointer]:
              - generic [ref=e532]:
                - img [ref=e534]
                - generic [ref=e537]:
                  - paragraph [ref=e538]: Уведомление PlagLens
                  - paragraph [ref=e539]: У вас новое уведомление.
                  - paragraph [ref=e540]: 08.05.2026 11:16
            - generic [ref=e541]:
              - button "Отметить прочитанным" [ref=e542] [cursor=pointer]:
                - img [ref=e544]
              - button "Архивировать" [ref=e546] [cursor=pointer]:
                - img [ref=e548]
          - generic [ref=e552]:
            - button "Открыть" [ref=e553] [cursor=pointer]:
              - generic [ref=e554]:
                - img [ref=e556]
                - generic [ref=e559]:
                  - paragraph [ref=e560]: Уведомление PlagLens
                  - paragraph [ref=e561]: У вас новое уведомление.
                  - paragraph [ref=e562]: 08.05.2026 11:16
            - generic [ref=e563]:
              - button "Отметить прочитанным" [ref=e564] [cursor=pointer]:
                - img [ref=e566]
              - button "Архивировать" [ref=e568] [cursor=pointer]:
                - img [ref=e570]
          - generic [ref=e574]:
            - button "Открыть" [ref=e575] [cursor=pointer]:
              - generic [ref=e576]:
                - img [ref=e578]
                - generic [ref=e581]:
                  - paragraph [ref=e582]: Уведомление PlagLens
                  - paragraph [ref=e583]: У вас новое уведомление.
                  - paragraph [ref=e584]: 08.05.2026 11:15
            - generic [ref=e585]:
              - button "Отметить прочитанным" [ref=e586] [cursor=pointer]:
                - img [ref=e588]
              - button "Архивировать" [ref=e590] [cursor=pointer]:
                - img [ref=e592]
          - generic [ref=e596]:
            - button "Открыть" [ref=e597] [cursor=pointer]:
              - generic [ref=e598]:
                - img [ref=e600]
                - generic [ref=e603]:
                  - paragraph [ref=e604]: Уведомление PlagLens
                  - paragraph [ref=e605]: У вас новое уведомление.
                  - paragraph [ref=e606]: 08.05.2026 11:15
            - generic [ref=e607]:
              - button "Отметить прочитанным" [ref=e608] [cursor=pointer]:
                - img [ref=e610]
              - button "Архивировать" [ref=e612] [cursor=pointer]:
                - img [ref=e614]
          - generic [ref=e618]:
            - button "Открыть" [ref=e619] [cursor=pointer]:
              - generic [ref=e620]:
                - img [ref=e622]
                - generic [ref=e625]:
                  - paragraph [ref=e626]: Уведомление PlagLens
                  - paragraph [ref=e627]: У вас новое уведомление.
                  - paragraph [ref=e628]: 08.05.2026 11:15
            - generic [ref=e629]:
              - button "Отметить прочитанным" [ref=e630] [cursor=pointer]:
                - img [ref=e632]
              - button "Архивировать" [ref=e634] [cursor=pointer]:
                - img [ref=e636]
          - generic [ref=e640]:
            - button "Открыть" [ref=e641] [cursor=pointer]:
              - generic [ref=e642]:
                - img [ref=e644]
                - generic [ref=e647]:
                  - paragraph [ref=e648]: Уведомление PlagLens
                  - paragraph [ref=e649]: У вас новое уведомление.
                  - paragraph [ref=e650]: 08.05.2026 11:15
            - generic [ref=e651]:
              - button "Отметить прочитанным" [ref=e652] [cursor=pointer]:
                - img [ref=e654]
              - button "Архивировать" [ref=e656] [cursor=pointer]:
                - img [ref=e658]
          - generic [ref=e662]:
            - button "Открыть" [ref=e663] [cursor=pointer]:
              - generic [ref=e664]:
                - img [ref=e666]
                - generic [ref=e669]:
                  - paragraph [ref=e670]: Уведомление PlagLens
                  - paragraph [ref=e671]: У вас новое уведомление.
                  - paragraph [ref=e672]: 08.05.2026 11:14
            - generic [ref=e673]:
              - button "Отметить прочитанным" [ref=e674] [cursor=pointer]:
                - img [ref=e676]
              - button "Архивировать" [ref=e678] [cursor=pointer]:
                - img [ref=e680]
          - generic [ref=e684]:
            - button "Открыть" [ref=e685] [cursor=pointer]:
              - generic [ref=e686]:
                - img [ref=e688]
                - generic [ref=e691]:
                  - paragraph [ref=e692]: Уведомление PlagLens
                  - paragraph [ref=e693]: У вас новое уведомление.
                  - paragraph [ref=e694]: 08.05.2026 11:13
            - generic [ref=e695]:
              - button "Отметить прочитанным" [ref=e696] [cursor=pointer]:
                - img [ref=e698]
              - button "Архивировать" [ref=e700] [cursor=pointer]:
                - img [ref=e702]
          - generic [ref=e706]:
            - button "Открыть" [ref=e707] [cursor=pointer]:
              - generic [ref=e708]:
                - img [ref=e710]
                - generic [ref=e713]:
                  - paragraph [ref=e714]: Уведомление PlagLens
                  - paragraph [ref=e715]: У вас новое уведомление.
                  - paragraph [ref=e716]: 08.05.2026 11:13
            - generic [ref=e717]:
              - button "Отметить прочитанным" [ref=e718] [cursor=pointer]:
                - img [ref=e720]
              - button "Архивировать" [ref=e722] [cursor=pointer]:
                - img [ref=e724]
          - generic [ref=e728]:
            - button "Открыть" [ref=e729] [cursor=pointer]:
              - generic [ref=e730]:
                - img [ref=e732]
                - generic [ref=e735]:
                  - paragraph [ref=e736]: Уведомление PlagLens
                  - paragraph [ref=e737]: У вас новое уведомление.
                  - paragraph [ref=e738]: 08.05.2026 11:13
            - generic [ref=e739]:
              - button "Отметить прочитанным" [ref=e740] [cursor=pointer]:
                - img [ref=e742]
              - button "Архивировать" [ref=e744] [cursor=pointer]:
                - img [ref=e746]
          - generic [ref=e750]:
            - button "Открыть" [ref=e751] [cursor=pointer]:
              - generic [ref=e752]:
                - img [ref=e754]
                - generic [ref=e757]:
                  - paragraph [ref=e758]: Уведомление PlagLens
                  - paragraph [ref=e759]: У вас новое уведомление.
                  - paragraph [ref=e760]: 08.05.2026 11:13
            - generic [ref=e761]:
              - button "Отметить прочитанным" [ref=e762] [cursor=pointer]:
                - img [ref=e764]
              - button "Архивировать" [ref=e766] [cursor=pointer]:
                - img [ref=e768]
          - generic [ref=e772]:
            - button "Открыть" [ref=e773] [cursor=pointer]:
              - generic [ref=e774]:
                - img [ref=e776]
                - generic [ref=e779]:
                  - paragraph [ref=e780]: Уведомление PlagLens
                  - paragraph [ref=e781]: У вас новое уведомление.
                  - paragraph [ref=e782]: 08.05.2026 11:13
            - generic [ref=e783]:
              - button "Отметить прочитанным" [ref=e784] [cursor=pointer]:
                - img [ref=e786]
              - button "Архивировать" [ref=e788] [cursor=pointer]:
                - img [ref=e790]
          - generic [ref=e794]:
            - button "Открыть" [ref=e795] [cursor=pointer]:
              - generic [ref=e796]:
                - img [ref=e798]
                - generic [ref=e801]:
                  - paragraph [ref=e802]: Уведомление PlagLens
                  - paragraph [ref=e803]: У вас новое уведомление.
                  - paragraph [ref=e804]: 08.05.2026 11:13
            - generic [ref=e805]:
              - button "Отметить прочитанным" [ref=e806] [cursor=pointer]:
                - img [ref=e808]
              - button "Архивировать" [ref=e810] [cursor=pointer]:
                - img [ref=e812]
          - generic [ref=e816]:
            - button "Открыть" [ref=e817] [cursor=pointer]:
              - generic [ref=e818]:
                - img [ref=e820]
                - generic [ref=e823]:
                  - paragraph [ref=e824]: Уведомление PlagLens
                  - paragraph [ref=e825]: У вас новое уведомление.
                  - paragraph [ref=e826]: 08.05.2026 11:13
            - generic [ref=e827]:
              - button "Отметить прочитанным" [ref=e828] [cursor=pointer]:
                - img [ref=e830]
              - button "Архивировать" [ref=e832] [cursor=pointer]:
                - img [ref=e834]
          - generic [ref=e838]:
            - button "Открыть" [ref=e839] [cursor=pointer]:
              - generic [ref=e840]:
                - img [ref=e842]
                - generic [ref=e845]:
                  - paragraph [ref=e846]: Уведомление PlagLens
                  - paragraph [ref=e847]: У вас новое уведомление.
                  - paragraph [ref=e848]: 08.05.2026 11:13
            - generic [ref=e849]:
              - button "Отметить прочитанным" [ref=e850] [cursor=pointer]:
                - img [ref=e852]
              - button "Архивировать" [ref=e854] [cursor=pointer]:
                - img [ref=e856]
          - generic [ref=e860]:
            - button "Открыть" [ref=e861] [cursor=pointer]:
              - generic [ref=e862]:
                - img [ref=e864]
                - generic [ref=e867]:
                  - paragraph [ref=e868]: Уведомление PlagLens
                  - paragraph [ref=e869]: У вас новое уведомление.
                  - paragraph [ref=e870]: 08.05.2026 11:10
            - generic [ref=e871]:
              - button "Отметить прочитанным" [ref=e872] [cursor=pointer]:
                - img [ref=e874]
              - button "Архивировать" [ref=e876] [cursor=pointer]:
                - img [ref=e878]
          - generic [ref=e882]:
            - button "Открыть" [ref=e883] [cursor=pointer]:
              - generic [ref=e884]:
                - img [ref=e886]
                - generic [ref=e889]:
                  - paragraph [ref=e890]: Уведомление PlagLens
                  - paragraph [ref=e891]: У вас новое уведомление.
                  - paragraph [ref=e892]: 08.05.2026 11:09
            - generic [ref=e893]:
              - button "Отметить прочитанным" [ref=e894] [cursor=pointer]:
                - img [ref=e896]
              - button "Архивировать" [ref=e898] [cursor=pointer]:
                - img [ref=e900]
          - generic [ref=e904]:
            - button "Открыть" [ref=e905] [cursor=pointer]:
              - generic [ref=e906]:
                - img [ref=e908]
                - generic [ref=e911]:
                  - paragraph [ref=e912]: Уведомление PlagLens
                  - paragraph [ref=e913]: У вас новое уведомление.
                  - paragraph [ref=e914]: 08.05.2026 11:09
            - generic [ref=e915]:
              - button "Отметить прочитанным" [ref=e916] [cursor=pointer]:
                - img [ref=e918]
              - button "Архивировать" [ref=e920] [cursor=pointer]:
                - img [ref=e922]
          - generic [ref=e926]:
            - button "Открыть" [ref=e927] [cursor=pointer]:
              - generic [ref=e928]:
                - img [ref=e930]
                - generic [ref=e933]:
                  - paragraph [ref=e934]: Уведомление PlagLens
                  - paragraph [ref=e935]: У вас новое уведомление.
                  - paragraph [ref=e936]: 08.05.2026 11:09
            - generic [ref=e937]:
              - button "Отметить прочитанным" [ref=e938] [cursor=pointer]:
                - img [ref=e940]
              - button "Архивировать" [ref=e942] [cursor=pointer]:
                - img [ref=e944]
          - generic [ref=e948]:
            - button "Открыть" [ref=e949] [cursor=pointer]:
              - generic [ref=e950]:
                - img [ref=e952]
                - generic [ref=e955]:
                  - paragraph [ref=e956]: Уведомление PlagLens
                  - paragraph [ref=e957]: У вас новое уведомление.
                  - paragraph [ref=e958]: 08.05.2026 11:09
            - generic [ref=e959]:
              - button "Отметить прочитанным" [ref=e960] [cursor=pointer]:
                - img [ref=e962]
              - button "Архивировать" [ref=e964] [cursor=pointer]:
                - img [ref=e966]
          - generic [ref=e970]:
            - button "Открыть" [ref=e971] [cursor=pointer]:
              - generic [ref=e972]:
                - img [ref=e974]
                - generic [ref=e977]:
                  - paragraph [ref=e978]: Уведомление PlagLens
                  - paragraph [ref=e979]: У вас новое уведомление.
                  - paragraph [ref=e980]: 08.05.2026 11:08
            - generic [ref=e981]:
              - button "Отметить прочитанным" [ref=e982] [cursor=pointer]:
                - img [ref=e984]
              - button "Архивировать" [ref=e986] [cursor=pointer]:
                - img [ref=e988]
          - generic [ref=e992]:
            - button "Открыть" [ref=e993] [cursor=pointer]:
              - generic [ref=e994]:
                - img [ref=e996]
                - generic [ref=e999]:
                  - paragraph [ref=e1000]: Уведомление PlagLens
                  - paragraph [ref=e1001]: У вас новое уведомление.
                  - paragraph [ref=e1002]: 08.05.2026 11:08
            - generic [ref=e1003]:
              - button "Отметить прочитанным" [ref=e1004] [cursor=pointer]:
                - img [ref=e1006]
              - button "Архивировать" [ref=e1008] [cursor=pointer]:
                - img [ref=e1010]
          - generic [ref=e1014]:
            - button "Открыть" [ref=e1015] [cursor=pointer]:
              - generic [ref=e1016]:
                - img [ref=e1018]
                - generic [ref=e1021]:
                  - paragraph [ref=e1022]: Уведомление PlagLens
                  - paragraph [ref=e1023]: У вас новое уведомление.
                  - paragraph [ref=e1024]: 08.05.2026 11:08
            - generic [ref=e1025]:
              - button "Отметить прочитанным" [ref=e1026] [cursor=pointer]:
                - img [ref=e1028]
              - button "Архивировать" [ref=e1030] [cursor=pointer]:
                - img [ref=e1032]
          - generic [ref=e1036]:
            - button "Открыть" [ref=e1037] [cursor=pointer]:
              - generic [ref=e1038]:
                - img [ref=e1040]
                - generic [ref=e1043]:
                  - paragraph [ref=e1044]: Уведомление PlagLens
                  - paragraph [ref=e1045]: У вас новое уведомление.
                  - paragraph [ref=e1046]: 08.05.2026 11:08
            - generic [ref=e1047]:
              - button "Отметить прочитанным" [ref=e1048] [cursor=pointer]:
                - img [ref=e1050]
              - button "Архивировать" [ref=e1052] [cursor=pointer]:
                - img [ref=e1054]
          - generic [ref=e1058]:
            - button "Открыть" [ref=e1059] [cursor=pointer]:
              - generic [ref=e1060]:
                - img [ref=e1062]
                - generic [ref=e1065]:
                  - paragraph [ref=e1066]: Уведомление PlagLens
                  - paragraph [ref=e1067]: У вас новое уведомление.
                  - paragraph [ref=e1068]: 08.05.2026 11:00
            - generic [ref=e1069]:
              - button "Отметить прочитанным" [ref=e1070] [cursor=pointer]:
                - img [ref=e1072]
              - button "Архивировать" [ref=e1074] [cursor=pointer]:
                - img [ref=e1076]
          - generic [ref=e1080]:
            - button "Открыть" [ref=e1081] [cursor=pointer]:
              - generic [ref=e1082]:
                - img [ref=e1084]
                - generic [ref=e1087]:
                  - paragraph [ref=e1088]: Уведомление PlagLens
                  - paragraph [ref=e1089]: У вас новое уведомление.
                  - paragraph [ref=e1090]: 08.05.2026 11:00
            - generic [ref=e1091]:
              - button "Отметить прочитанным" [ref=e1092] [cursor=pointer]:
                - img [ref=e1094]
              - button "Архивировать" [ref=e1096] [cursor=pointer]:
                - img [ref=e1098]
          - generic [ref=e1102]:
            - button "Открыть" [ref=e1103] [cursor=pointer]:
              - generic [ref=e1104]:
                - img [ref=e1106]
                - generic [ref=e1109]:
                  - paragraph [ref=e1110]: Уведомление PlagLens
                  - paragraph [ref=e1111]: У вас новое уведомление.
                  - paragraph [ref=e1112]: 08.05.2026 11:00
            - generic [ref=e1113]:
              - button "Отметить прочитанным" [ref=e1114] [cursor=pointer]:
                - img [ref=e1116]
              - button "Архивировать" [ref=e1118] [cursor=pointer]:
                - img [ref=e1120]
          - generic [ref=e1124]:
            - button "Открыть" [ref=e1125] [cursor=pointer]:
              - generic [ref=e1126]:
                - img [ref=e1128]
                - generic [ref=e1131]:
                  - paragraph [ref=e1132]: Уведомление PlagLens
                  - paragraph [ref=e1133]: У вас новое уведомление.
                  - paragraph [ref=e1134]: 08.05.2026 10:59
            - generic [ref=e1135]:
              - button "Отметить прочитанным" [ref=e1136] [cursor=pointer]:
                - img [ref=e1138]
              - button "Архивировать" [ref=e1140] [cursor=pointer]:
                - img [ref=e1142]
          - generic [ref=e1146]:
            - button "Открыть" [ref=e1147] [cursor=pointer]:
              - generic [ref=e1148]:
                - img [ref=e1150]
                - generic [ref=e1153]:
                  - paragraph [ref=e1154]: Уведомление PlagLens
                  - paragraph [ref=e1155]: У вас новое уведомление.
                  - paragraph [ref=e1156]: 08.05.2026 10:59
            - generic [ref=e1157]:
              - button "Отметить прочитанным" [ref=e1158] [cursor=pointer]:
                - img [ref=e1160]
              - button "Архивировать" [ref=e1162] [cursor=pointer]:
                - img [ref=e1164]
          - generic [ref=e1168]:
            - button "Открыть" [ref=e1169] [cursor=pointer]:
              - generic [ref=e1170]:
                - img [ref=e1172]
                - generic [ref=e1175]:
                  - paragraph [ref=e1176]: Уведомление PlagLens
                  - paragraph [ref=e1177]: У вас новое уведомление.
                  - paragraph [ref=e1178]: 08.05.2026 10:47
            - generic [ref=e1179]:
              - button "Отметить прочитанным" [ref=e1180] [cursor=pointer]:
                - img [ref=e1182]
              - button "Архивировать" [ref=e1184] [cursor=pointer]:
                - img [ref=e1186]
          - generic [ref=e1190]:
            - button "Открыть" [ref=e1191] [cursor=pointer]:
              - generic [ref=e1192]:
                - img [ref=e1194]
                - generic [ref=e1197]:
                  - paragraph [ref=e1198]: Уведомление PlagLens
                  - paragraph [ref=e1199]: У вас новое уведомление.
                  - paragraph [ref=e1200]: 08.05.2026 10:47
            - generic [ref=e1201]:
              - button "Отметить прочитанным" [ref=e1202] [cursor=pointer]:
                - img [ref=e1204]
              - button "Архивировать" [ref=e1206] [cursor=pointer]:
                - img [ref=e1208]
          - paragraph [ref=e1211]: Есть ещё. Загрузка следующих будет добавлена позже.
```

# Test source

```ts
  1   | /**
  2   |  * E2E: SSE realtime delivery to the bell dropdown.
  3   |  *
  4   |  * The flow we want to assert:
  5   |  *   1. Student opens any authenticated page; AppShell mounts the bell.
  6   |  *   2. Frontend subscribes to /api/v1/notifications/stream (EventSource).
  7   |  *   3. We POST a feedback (visible_to_student=true) on a student's submission
  8   |  *      from a teacher token. This emits submission.feedback.added.v1, and
  9   |  *      Notification Service should push a SSE message.
  10  |  *   4. The unread badge increments on the student page WITHOUT manual reload.
  11  |  *
  12  |  * Because demo-data may have no submissions for student1, we make the
  13  |  * trigger best-effort and *also* assert the SSE network endpoint is hit.
  14  |  */
  15  | import { expect, test } from '../../setup/fixtures';
  16  | import { ApiClient } from '../../helpers/api';
  17  | 
  18  | test.describe('SSE realtime', () => {
  19  |   test('SSE stream URL is opened on login', async ({ studentPage }) => {
  20  |     let sseHit = false;
  21  |     studentPage.on('request', (req) => {
  22  |       if (req.url().includes('/notifications/stream')) sseHit = true;
  23  |     });
  24  |     await studentPage.goto('/me');
  25  |     await studentPage.waitForTimeout(2_000);
  26  |     expect(sseHit).toBeTruthy();
  27  |   });
  28  | 
  29  |   test('unread badge has a numeric data-attr (initial value)', async ({
  30  |     studentPage,
  31  |   }) => {
  32  |     await studentPage.goto('/me');
  33  |     const badge = studentPage.getByTestId('notif-unread-badge');
  34  |     const initial = await badge.getAttribute('data-unread-count');
  35  |     expect(initial).toMatch(/^\d+$/);
  36  |   });
  37  | 
  38  |   test('triggering grade.assigned increments unread count over SSE (best-effort)', async ({
  39  |     studentPage,
  40  |   }) => {
  41  |     await studentPage.goto('/notifications');
  42  |     const badge = studentPage.getByTestId('notif-unread-badge');
> 43  |     const initialAttr = await badge.getAttribute('data-unread-count');
      |                                     ^ TimeoutError: locator.getAttribute: Timeout 10000ms exceeded.
  44  |     const initial = Number(initialAttr ?? '0');
  45  | 
  46  |     // Best-effort find a submission of student1 to grade. We need a teacher
  47  |     // session for this.
  48  |     const c = await ApiClient.create();
  49  |     let triggered = false;
  50  |     try {
  51  |       await c.loginAs('teacher');
  52  |       const submissions = await c.get('/submissions?limit=1');
  53  |       if (submissions.ok()) {
  54  |         const j = await submissions.json();
  55  |         const sub = (j?.data ?? [])[0];
  56  |         if (sub?.id) {
  57  |           // Add a feedback visible to the student — this produces
  58  |           // submission.feedback.added.v1, which Notification Service maps
  59  |           // to an in-app + email notification for the student.
  60  |           const fb = await c.post(`/submissions/${sub.id}/feedback`, {
  61  |             body: 'E2E SSE-trigger feedback',
  62  |             visible_to_student: true,
  63  |           });
  64  |           triggered = fb.ok() || fb.status() === 201;
  65  |         }
  66  |       }
  67  |     } finally {
  68  |       await c.dispose();
  69  |     }
  70  | 
  71  |     if (!triggered) {
  72  |       test.skip(true, 'no submission available to trigger an event');
  73  |     }
  74  | 
  75  |     // Wait up to 10s for SSE to push and badge to bump.
  76  |     await expect
  77  |       .poll(
  78  |         async () => {
  79  |           const v = await badge.getAttribute('data-unread-count');
  80  |           return Number(v ?? '0');
  81  |         },
  82  |         { timeout: 10_000, intervals: [500, 1000, 1500] },
  83  |       )
  84  |       .toBeGreaterThanOrEqual(initial);
  85  |   });
  86  | 
  87  |   test('EventSource readyState is OPEN after page load', async ({
  88  |     studentPage,
  89  |   }) => {
  90  |     await studentPage.goto('/me');
  91  |     // Wait briefly for subscription to be established.
  92  |     await studentPage.waitForTimeout(2_000);
  93  |     // EventSource constants: CONNECTING=0, OPEN=1, CLOSED=2.
  94  |     const ready = await studentPage.evaluate(() => {
  95  |       // The SSEClient does not expose its EventSource on window, so we just
  96  |       // confirm EventSource API is available in the page context.
  97  |       return typeof EventSource !== 'undefined';
  98  |     });
  99  |     expect(ready).toBeTruthy();
  100 |   });
  101 | });
  102 | 
```