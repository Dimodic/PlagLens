# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: specs\mobile\mobile-courses-list.spec.ts >> Mobile courses list @mobile >> no horizontal scroll on courses page
- Location: e2e\specs\mobile\mobile-courses-list.spec.ts:36:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: false
Received: true
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
        - generic [ref=e13]: консоль админа
      - button "Свернуть" [ref=e14] [cursor=pointer]:
        - img [ref=e15]
    - generic [ref=e18]:
      - img [ref=e20]
      - generic [ref=e23]: Поиск заданий, студентов, посылок…
      - generic [ref=e24]: ⌘K
    - generic [ref=e25]:
      - generic [ref=e26]:
        - generic [ref=e27]: Учреждение
        - generic [ref=e28]:
          - link "Обзор" [ref=e29] [cursor=pointer]:
            - /url: /admin/overview
            - img [ref=e31]
            - generic [ref=e36]: Обзор
          - link "Пользователи" [ref=e37] [cursor=pointer]:
            - /url: /admin/users
            - img [ref=e39]
            - generic [ref=e41]: Пользователи
          - link "Журнал" [ref=e42] [cursor=pointer]:
            - /url: /admin/audit
            - img [ref=e44]
            - generic [ref=e46]: Журнал
      - generic [ref=e47]:
        - generic [ref=e48]: Система
        - generic [ref=e49]:
          - link "Интеграции" [ref=e50] [cursor=pointer]:
            - /url: /admin/integrations
            - img [ref=e52]
            - generic [ref=e56]: Интеграции
          - link "Настройки учреждения" [ref=e57] [cursor=pointer]:
            - /url: /admin/system/settings
            - img [ref=e59]
            - generic [ref=e61]: Настройки учреждения
    - button "АД Админ Демов Администратор" [ref=e63] [cursor=pointer]:
      - generic [ref=e64]: АД
      - generic [ref=e65]:
        - generic [ref=e66]: Админ Демов
        - generic [ref=e67]: Администратор
      - img [ref=e69]
  - main [ref=e71]:
    - generic [ref=e72]:
      - generic: Курсы
      - generic [ref=e73]:
        - button "EN" [ref=e74] [cursor=pointer]
        - button "RU" [ref=e75] [cursor=pointer]
      - button "Переключить тему" [ref=e76] [cursor=pointer]:
        - img [ref=e77]
      - button [ref=e83]
    - generic [ref=e85]:
      - generic [ref=e86]:
        - generic [ref=e87]: ПЯТНИЦА · 8 МАЯ 2026
        - heading "Добрый день, Админ." [level=1] [ref=e88]
        - generic [ref=e89]: Здесь живут ваши курсы, последние проверки и события за ночь. Откройте задание, чтобы посмотреть посылки и запустить проверку.
      - generic [ref=e90]:
        - generic [ref=e91]:
          - generic: Ждут вердикта
          - generic: "0"
          - generic: Опубликованные задания
        - generic [ref=e92]:
          - generic: Идут проверки
          - generic: "0"
          - generic: Запущены сейчас
        - generic [ref=e93]:
          - generic: Заданий за неделю
          - generic: "0"
          - generic: Совокупно по курсам
        - generic [ref=e94]:
          - generic: Курсов
          - generic: "50"
          - generic: Доступно вам
      - generic [ref=e95]:
        - generic [ref=e96]:
          - img [ref=e98]
          - textbox "Поиск по курсам" [ref=e101]
        - generic [ref=e103]:
          - generic [ref=e104]: Все
          - generic [ref=e105]: Активные
          - generic [ref=e106]: Черновики
          - generic [ref=e107]: В архиве
        - link "Создать курс" [ref=e108] [cursor=pointer]:
          - /url: /courses/new
          - button "Создать курс" [ref=e109]:
            - img [ref=e110]
            - text: Создать курс
      - generic [ref=e111]:
        - generic [ref=e112]:
          - generic [ref=e113]:
            - generic [ref=e114]: Алгоритмы и структуры данных
            - generic [ref=e115]: algorithms-2026
            - generic [ref=e117]: Активен
          - link "Открыть курс Алгоритмы и структуры данных":
            - /url: /courses/algorithms-2026
          - generic [ref=e119]:
            - generic [ref=e120]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e121]:
              - text: Открыть курс
              - img [ref=e122]
        - generic [ref=e124]:
          - generic [ref=e125]:
            - generic [ref=e126]: Test Probe
            - generic [ref=e127]: e2e-test-probe
            - generic [ref=e129]: В архиве
          - link "Открыть курс Test Probe":
            - /url: /courses/e2e-test-probe
          - generic [ref=e131]:
            - generic [ref=e132]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e133]:
              - text: Открыть курс
              - img [ref=e134]
        - generic [ref=e136]:
          - generic [ref=e137]:
            - generic [ref=e138]: Test Probe (copy)
            - generic [ref=e139]: dup-test-1
            - generic [ref=e141]: Черновик
          - link "Открыть курс Test Probe (copy)":
            - /url: /courses/dup-test-1
          - generic [ref=e143]:
            - generic [ref=e144]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e145]:
              - text: Открыть курс
              - img [ref=e146]
        - generic [ref=e148]:
          - generic [ref=e149]:
            - generic [ref=e150]: E2E Course e2e-course-ae408b1c
            - generic [ref=e151]: e2e-course-ae408b1c
            - generic [ref=e153]: Черновик
          - link "Открыть курс E2E Course e2e-course-ae408b1c":
            - /url: /courses/e2e-course-ae408b1c
          - generic [ref=e155]:
            - generic [ref=e156]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e157]:
              - text: Открыть курс
              - img [ref=e158]
        - generic [ref=e160]:
          - generic [ref=e161]:
            - generic [ref=e162]: E2E Course e2e-course-9754a89f
            - generic [ref=e163]: e2e-course-9754a89f
            - generic [ref=e165]: Черновик
          - link "Открыть курс E2E Course e2e-course-9754a89f":
            - /url: /courses/e2e-course-9754a89f
          - generic [ref=e167]:
            - generic [ref=e168]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e169]:
              - text: Открыть курс
              - img [ref=e170]
        - generic [ref=e172]:
          - generic [ref=e173]:
            - generic [ref=e174]: E2E Course e2e-course-98654012
            - generic [ref=e175]: e2e-course-98654012
            - generic [ref=e177]: Черновик
          - link "Открыть курс E2E Course e2e-course-98654012":
            - /url: /courses/e2e-course-98654012
          - generic [ref=e179]:
            - generic [ref=e180]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e181]:
              - text: Открыть курс
              - img [ref=e182]
        - generic [ref=e184]:
          - generic [ref=e185]:
            - generic [ref=e186]: E2E Course e2e-course-328cb2ea
            - generic [ref=e187]: e2e-course-328cb2ea
            - generic [ref=e189]: Черновик
          - link "Открыть курс E2E Course e2e-course-328cb2ea":
            - /url: /courses/e2e-course-328cb2ea
          - generic [ref=e191]:
            - generic [ref=e192]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e193]:
              - text: Открыть курс
              - img [ref=e194]
        - generic [ref=e196]:
          - generic [ref=e197]:
            - generic [ref=e198]: E2E Course e2e-course-c0cf8efe
            - generic [ref=e199]: e2e-course-c0cf8efe
            - generic [ref=e201]: Черновик
          - link "Открыть курс E2E Course e2e-course-c0cf8efe":
            - /url: /courses/e2e-course-c0cf8efe
          - generic [ref=e203]:
            - generic [ref=e204]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e205]:
              - text: Открыть курс
              - img [ref=e206]
        - generic [ref=e208]:
          - generic [ref=e209]:
            - generic [ref=e210]: E2E Course e2e-course-3b40efb5
            - generic [ref=e211]: e2e-course-3b40efb5
            - generic [ref=e213]: Черновик
          - link "Открыть курс E2E Course e2e-course-3b40efb5":
            - /url: /courses/e2e-course-3b40efb5
          - generic [ref=e215]:
            - generic [ref=e216]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e217]:
              - text: Открыть курс
              - img [ref=e218]
        - generic [ref=e220]:
          - generic [ref=e221]:
            - generic [ref=e222]: E2E Course e2e-course-11340fae
            - generic [ref=e223]: e2e-course-11340fae
            - generic [ref=e225]: Черновик
          - link "Открыть курс E2E Course e2e-course-11340fae":
            - /url: /courses/e2e-course-11340fae
          - generic [ref=e227]:
            - generic [ref=e228]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e229]:
              - text: Открыть курс
              - img [ref=e230]
        - generic [ref=e232]:
          - generic [ref=e233]:
            - generic [ref=e234]: Idem idem-dbc1e3e7
            - generic [ref=e235]: idem-dbc1e3e7
            - generic [ref=e237]: Черновик
          - link "Открыть курс Idem idem-dbc1e3e7":
            - /url: /courses/idem-dbc1e3e7
          - generic [ref=e239]:
            - generic [ref=e240]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e241]:
              - text: Открыть курс
              - img [ref=e242]
        - generic [ref=e244]:
          - generic [ref=e245]:
            - generic [ref=e246]: A
            - generic [ref=e247]: idem-a-b126280a
            - generic [ref=e249]: Черновик
          - link "Открыть курс A":
            - /url: /courses/idem-a-b126280a
          - generic [ref=e251]:
            - generic [ref=e252]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e253]:
              - text: Открыть курс
              - img [ref=e254]
        - generic [ref=e256]:
          - generic [ref=e257]:
            - generic [ref=e258]: A
            - generic [ref=e259]: uniq-a-693fe1b1
            - generic [ref=e261]: Черновик
          - link "Открыть курс A":
            - /url: /courses/uniq-a-693fe1b1
          - generic [ref=e263]:
            - generic [ref=e264]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e265]:
              - text: Открыть курс
              - img [ref=e266]
        - generic [ref=e268]:
          - generic [ref=e269]:
            - generic [ref=e270]: B
            - generic [ref=e271]: uniq-b-725a3893
            - generic [ref=e273]: Черновик
          - link "Открыть курс B":
            - /url: /courses/uniq-b-725a3893
          - generic [ref=e275]:
            - generic [ref=e276]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e277]:
              - text: Открыть курс
              - img [ref=e278]
        - generic [ref=e280]:
          - generic [ref=e281]:
            - generic [ref=e282]: Dup
            - generic [ref=e283]: dup-8cc1bf9e
            - generic [ref=e285]: Черновик
          - link "Открыть курс Dup":
            - /url: /courses/dup-8cc1bf9e
          - generic [ref=e287]:
            - generic [ref=e288]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e289]:
              - text: Открыть курс
              - img [ref=e290]
        - generic [ref=e292]:
          - generic [ref=e293]:
            - generic [ref=e294]: E2E e2e-644a64af
            - generic [ref=e295]: e2e-644a64af
            - generic [ref=e297]: Черновик
          - link "Открыть курс E2E e2e-644a64af":
            - /url: /courses/e2e-644a64af
          - generic [ref=e299]:
            - generic [ref=e300]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e301]:
              - text: Открыть курс
              - img [ref=e302]
        - generic [ref=e304]:
          - generic [ref=e305]:
            - generic [ref=e306]: E2E e2e-4eb17640
            - generic [ref=e307]: e2e-4eb17640
            - generic [ref=e309]: Черновик
          - link "Открыть курс E2E e2e-4eb17640":
            - /url: /courses/e2e-4eb17640
          - generic [ref=e311]:
            - generic [ref=e312]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e313]:
              - text: Открыть курс
              - img [ref=e314]
        - generic [ref=e316]:
          - generic [ref=e317]:
            - generic [ref=e318]: E2E e2e-25d4c2f6
            - generic [ref=e319]: e2e-25d4c2f6
            - generic [ref=e321]: Черновик
          - link "Открыть курс E2E e2e-25d4c2f6":
            - /url: /courses/e2e-25d4c2f6
          - generic [ref=e323]:
            - generic [ref=e324]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e325]:
              - text: Открыть курс
              - img [ref=e326]
        - generic [ref=e328]:
          - generic [ref=e329]:
            - generic [ref=e330]: E2E Course e2e-course-fa2d9131
            - generic [ref=e331]: e2e-course-fa2d9131
            - generic [ref=e333]: Черновик
          - link "Открыть курс E2E Course e2e-course-fa2d9131":
            - /url: /courses/e2e-course-fa2d9131
          - generic [ref=e335]:
            - generic [ref=e336]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e337]:
              - text: Открыть курс
              - img [ref=e338]
        - generic [ref=e340]:
          - generic [ref=e341]:
            - generic [ref=e342]: E2E Course e2e-course-a9007d08
            - generic [ref=e343]: e2e-course-a9007d08
            - generic [ref=e345]: Черновик
          - link "Открыть курс E2E Course e2e-course-a9007d08":
            - /url: /courses/e2e-course-a9007d08
          - generic [ref=e347]:
            - generic [ref=e348]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e349]:
              - text: Открыть курс
              - img [ref=e350]
        - generic [ref=e352]:
          - generic [ref=e353]:
            - generic [ref=e354]: E2E Course e2e-course-1d1d61ab
            - generic [ref=e355]: e2e-course-1d1d61ab
            - generic [ref=e357]: Черновик
          - link "Открыть курс E2E Course e2e-course-1d1d61ab":
            - /url: /courses/e2e-course-1d1d61ab
          - generic [ref=e359]:
            - generic [ref=e360]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e361]:
              - text: Открыть курс
              - img [ref=e362]
        - generic [ref=e364]:
          - generic [ref=e365]:
            - generic [ref=e366]: E2E Course e2e-course-3db65bdc
            - generic [ref=e367]: e2e-course-3db65bdc
            - generic [ref=e369]: Черновик
          - link "Открыть курс E2E Course e2e-course-3db65bdc":
            - /url: /courses/e2e-course-3db65bdc
          - generic [ref=e371]:
            - generic [ref=e372]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e373]:
              - text: Открыть курс
              - img [ref=e374]
        - generic [ref=e376]:
          - generic [ref=e377]:
            - generic [ref=e378]: Idem idem-f761d145
            - generic [ref=e379]: idem-f761d145
            - generic [ref=e381]: Черновик
          - link "Открыть курс Idem idem-f761d145":
            - /url: /courses/idem-f761d145
          - generic [ref=e383]:
            - generic [ref=e384]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e385]:
              - text: Открыть курс
              - img [ref=e386]
        - generic [ref=e388]:
          - generic [ref=e389]:
            - generic [ref=e390]: A
            - generic [ref=e391]: uniq-a-d43e58e3
            - generic [ref=e393]: Черновик
          - link "Открыть курс A":
            - /url: /courses/uniq-a-d43e58e3
          - generic [ref=e395]:
            - generic [ref=e396]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e397]:
              - text: Открыть курс
              - img [ref=e398]
        - generic [ref=e400]:
          - generic [ref=e401]:
            - generic [ref=e402]: B
            - generic [ref=e403]: uniq-b-85f3850c
            - generic [ref=e405]: Черновик
          - link "Открыть курс B":
            - /url: /courses/uniq-b-85f3850c
          - generic [ref=e407]:
            - generic [ref=e408]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e409]:
              - text: Открыть курс
              - img [ref=e410]
        - generic [ref=e412]:
          - generic [ref=e413]:
            - generic [ref=e414]: A
            - generic [ref=e415]: idem-a-913aaaf5
            - generic [ref=e417]: Черновик
          - link "Открыть курс A":
            - /url: /courses/idem-a-913aaaf5
          - generic [ref=e419]:
            - generic [ref=e420]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e421]:
              - text: Открыть курс
              - img [ref=e422]
        - generic [ref=e424]:
          - generic [ref=e425]:
            - generic [ref=e426]: Dup
            - generic [ref=e427]: dup-03c72f82
            - generic [ref=e429]: Черновик
          - link "Открыть курс Dup":
            - /url: /courses/dup-03c72f82
          - generic [ref=e431]:
            - generic [ref=e432]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e433]:
              - text: Открыть курс
              - img [ref=e434]
        - generic [ref=e436]:
          - generic [ref=e437]:
            - generic [ref=e438]: <script>alert(1)</script>
            - generic [ref=e439]: xss-1778223792382
            - generic [ref=e441]: Черновик
          - link "Открыть курс <script>alert(1)</script>":
            - /url: /courses/xss-1778223792382
          - generic [ref=e443]:
            - generic [ref=e444]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e445]:
              - text: Открыть курс
              - img [ref=e446]
        - generic [ref=e448]:
          - generic [ref=e449]:
            - generic [ref=e450]: E2E e2e-1f628eb1
            - generic [ref=e451]: e2e-1f628eb1
            - generic [ref=e453]: Черновик
          - link "Открыть курс E2E e2e-1f628eb1":
            - /url: /courses/e2e-1f628eb1
          - generic [ref=e455]:
            - generic [ref=e456]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e457]:
              - text: Открыть курс
              - img [ref=e458]
        - generic [ref=e460]:
          - generic [ref=e461]:
            - generic [ref=e462]: E2E e2e-e6caa15a
            - generic [ref=e463]: e2e-e6caa15a
            - generic [ref=e465]: Черновик
          - link "Открыть курс E2E e2e-e6caa15a":
            - /url: /courses/e2e-e6caa15a
          - generic [ref=e467]:
            - generic [ref=e468]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e469]:
              - text: Открыть курс
              - img [ref=e470]
        - generic [ref=e472]:
          - generic [ref=e473]:
            - generic [ref=e474]: Idem idem-998136d3
            - generic [ref=e475]: idem-998136d3
            - generic [ref=e477]: Черновик
          - link "Открыть курс Idem idem-998136d3":
            - /url: /courses/idem-998136d3
          - generic [ref=e479]:
            - generic [ref=e480]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e481]:
              - text: Открыть курс
              - img [ref=e482]
        - generic [ref=e484]:
          - generic [ref=e485]:
            - generic [ref=e486]: A
            - generic [ref=e487]: idem-a-3074f409
            - generic [ref=e489]: Черновик
          - link "Открыть курс A":
            - /url: /courses/idem-a-3074f409
          - generic [ref=e491]:
            - generic [ref=e492]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e493]:
              - text: Открыть курс
              - img [ref=e494]
        - generic [ref=e496]:
          - generic [ref=e497]:
            - generic [ref=e498]: A
            - generic [ref=e499]: uniq-a-cc5e04a9
            - generic [ref=e501]: Черновик
          - link "Открыть курс A":
            - /url: /courses/uniq-a-cc5e04a9
          - generic [ref=e503]:
            - generic [ref=e504]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e505]:
              - text: Открыть курс
              - img [ref=e506]
        - generic [ref=e508]:
          - generic [ref=e509]:
            - generic [ref=e510]: B
            - generic [ref=e511]: uniq-b-b9914fc5
            - generic [ref=e513]: Черновик
          - link "Открыть курс B":
            - /url: /courses/uniq-b-b9914fc5
          - generic [ref=e515]:
            - generic [ref=e516]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e517]:
              - text: Открыть курс
              - img [ref=e518]
        - generic [ref=e520]:
          - generic [ref=e521]:
            - generic [ref=e522]: Dup
            - generic [ref=e523]: dup-924b6190
            - generic [ref=e525]: Черновик
          - link "Открыть курс Dup":
            - /url: /courses/dup-924b6190
          - generic [ref=e527]:
            - generic [ref=e528]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e529]:
              - text: Открыть курс
              - img [ref=e530]
        - generic [ref=e532]:
          - generic [ref=e533]:
            - generic [ref=e534]: E2E Course e2e-course-44b999b2
            - generic [ref=e535]: e2e-course-44b999b2
            - generic [ref=e537]: Активен
          - link "Открыть курс E2E Course e2e-course-44b999b2":
            - /url: /courses/e2e-course-44b999b2
          - generic [ref=e539]:
            - generic [ref=e540]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e541]:
              - text: Открыть курс
              - img [ref=e542]
        - generic [ref=e544]:
          - generic [ref=e545]:
            - generic [ref=e546]: Idem idem-6bc22b6a
            - generic [ref=e547]: idem-6bc22b6a
            - generic [ref=e549]: Черновик
          - link "Открыть курс Idem idem-6bc22b6a":
            - /url: /courses/idem-6bc22b6a
          - generic [ref=e551]:
            - generic [ref=e552]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e553]:
              - text: Открыть курс
              - img [ref=e554]
        - generic [ref=e556]:
          - generic [ref=e557]:
            - generic [ref=e558]: A
            - generic [ref=e559]: idem-a-2d452d05
            - generic [ref=e561]: Черновик
          - link "Открыть курс A":
            - /url: /courses/idem-a-2d452d05
          - generic [ref=e563]:
            - generic [ref=e564]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e565]:
              - text: Открыть курс
              - img [ref=e566]
        - generic [ref=e568]:
          - generic [ref=e569]:
            - generic [ref=e570]: A
            - generic [ref=e571]: uniq-a-cf1eadc2
            - generic [ref=e573]: Черновик
          - link "Открыть курс A":
            - /url: /courses/uniq-a-cf1eadc2
          - generic [ref=e575]:
            - generic [ref=e576]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e577]:
              - text: Открыть курс
              - img [ref=e578]
        - generic [ref=e580]:
          - generic [ref=e581]:
            - generic [ref=e582]: B
            - generic [ref=e583]: uniq-b-61c70f64
            - generic [ref=e585]: Черновик
          - link "Открыть курс B":
            - /url: /courses/uniq-b-61c70f64
          - generic [ref=e587]:
            - generic [ref=e588]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e589]:
              - text: Открыть курс
              - img [ref=e590]
        - generic [ref=e592]:
          - generic [ref=e593]:
            - generic [ref=e594]: Dup
            - generic [ref=e595]: dup-33f410f8
            - generic [ref=e597]: Черновик
          - link "Открыть курс Dup":
            - /url: /courses/dup-33f410f8
          - generic [ref=e599]:
            - generic [ref=e600]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e601]:
              - text: Открыть курс
              - img [ref=e602]
        - generic [ref=e604]:
          - generic [ref=e605]:
            - generic [ref=e606]: <script>alert(1)</script>
            - generic [ref=e607]: xss-1778224922441
            - generic [ref=e609]: Черновик
          - link "Открыть курс <script>alert(1)</script>":
            - /url: /courses/xss-1778224922441
          - generic [ref=e611]:
            - generic [ref=e612]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e613]:
              - text: Открыть курс
              - img [ref=e614]
        - generic [ref=e616]:
          - generic [ref=e617]:
            - generic [ref=e618]: Idem idem-9429a4d8
            - generic [ref=e619]: idem-9429a4d8
            - generic [ref=e621]: Черновик
          - link "Открыть курс Idem idem-9429a4d8":
            - /url: /courses/idem-9429a4d8
          - generic [ref=e623]:
            - generic [ref=e624]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e625]:
              - text: Открыть курс
              - img [ref=e626]
        - generic [ref=e628]:
          - generic [ref=e629]:
            - generic [ref=e630]: A
            - generic [ref=e631]: idem-a-d0bf3d38
            - generic [ref=e633]: Черновик
          - link "Открыть курс A":
            - /url: /courses/idem-a-d0bf3d38
          - generic [ref=e635]:
            - generic [ref=e636]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e637]:
              - text: Открыть курс
              - img [ref=e638]
        - generic [ref=e640]:
          - generic [ref=e641]:
            - generic [ref=e642]: A
            - generic [ref=e643]: uniq-a-0be749d5
            - generic [ref=e645]: Черновик
          - link "Открыть курс A":
            - /url: /courses/uniq-a-0be749d5
          - generic [ref=e647]:
            - generic [ref=e648]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e649]:
              - text: Открыть курс
              - img [ref=e650]
        - generic [ref=e652]:
          - generic [ref=e653]:
            - generic [ref=e654]: B
            - generic [ref=e655]: uniq-b-109f09a5
            - generic [ref=e657]: Черновик
          - link "Открыть курс B":
            - /url: /courses/uniq-b-109f09a5
          - generic [ref=e659]:
            - generic [ref=e660]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e661]:
              - text: Открыть курс
              - img [ref=e662]
        - generic [ref=e664]:
          - generic [ref=e665]:
            - generic [ref=e666]: Dup
            - generic [ref=e667]: dup-be7ef40e
            - generic [ref=e669]: Черновик
          - link "Открыть курс Dup":
            - /url: /courses/dup-be7ef40e
          - generic [ref=e671]:
            - generic [ref=e672]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e673]:
              - text: Открыть курс
              - img [ref=e674]
        - generic [ref=e676]:
          - generic [ref=e677]:
            - generic [ref=e678]: <script>alert(1)</script>
            - generic [ref=e679]: xss-1778225017337
            - generic [ref=e681]: Черновик
          - link "Открыть курс <script>alert(1)</script>":
            - /url: /courses/xss-1778225017337
          - generic [ref=e683]:
            - generic [ref=e684]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e685]:
              - text: Открыть курс
              - img [ref=e686]
        - generic [ref=e688]:
          - generic [ref=e689]:
            - generic [ref=e690]: Idem idem-20bd5eaf
            - generic [ref=e691]: idem-20bd5eaf
            - generic [ref=e693]: Черновик
          - link "Открыть курс Idem idem-20bd5eaf":
            - /url: /courses/idem-20bd5eaf
          - generic [ref=e695]:
            - generic [ref=e696]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e697]:
              - text: Открыть курс
              - img [ref=e698]
        - generic [ref=e700]:
          - generic [ref=e701]:
            - generic [ref=e702]: A
            - generic [ref=e703]: idem-a-0ed2ca03
            - generic [ref=e705]: Черновик
          - link "Открыть курс A":
            - /url: /courses/idem-a-0ed2ca03
          - generic [ref=e707]:
            - generic [ref=e708]: В этом курсе пока нет заданий.
            - button "Открыть курс" [ref=e709]:
              - text: Открыть курс
              - img [ref=e710]
```

# Test source

```ts
  1  | /**
  2  |  * Mobile /courses list — single-column, no horizontal scroll.
  3  |  */
  4  | import { test, expect, devices } from '@playwright/test';
  5  | import { uiLoginAs } from '../../helpers/cross-cutting';
  6  | 
  7  | test.use({ ...devices['Pixel 5'] });
  8  | 
  9  | test.describe('Mobile courses list @mobile', () => {
  10 |   test('cards stack vertically on narrow viewport (>1 row)', async ({ page }) => {
  11 |     await uiLoginAs(page, 'admin');
  12 |     await page.goto('/courses');
  13 |     await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => null);
  14 |     const cards = page.locator('[data-testid^="course-card-"], .mantine-Card-root');
  15 |     const n = await cards.count();
  16 |     if (n >= 2) {
  17 |       const boxes = await Promise.all(
  18 |         Array.from({ length: n }).map(async (_, i) => cards.nth(i).boundingBox()),
  19 |       );
  20 |       const ys = boxes.map((b) => b?.y ?? -1).filter((y) => y >= 0);
  21 |       const widths = boxes.map((b) => b?.width ?? -1).filter((w) => w >= 0);
  22 |       // Cards must wrap into multiple rows. We're explicitly NOT prescribing a
  23 |       // column count — different breakpoints make different choices, and
  24 |       // the regression we care about is "cards overflow horizontally".
  25 |       if (ys.length > 1) {
  26 |         const distinctYs = new Set(ys.map((y) => Math.round(y / 8)));
  27 |         expect(distinctYs.size).toBeGreaterThan(1);
  28 |       }
  29 |       // Each card must fit inside the viewport (Pixel 5 = 393).
  30 |       for (const w of widths) {
  31 |         expect(w).toBeLessThanOrEqual(420);
  32 |       }
  33 |     }
  34 |   });
  35 | 
  36 |   test('no horizontal scroll on courses page', async ({ page }) => {
  37 |     await uiLoginAs(page, 'admin');
  38 |     await page.goto('/courses');
  39 |     await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => null);
  40 |     const overflow = await page.evaluate(
  41 |       () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  42 |     );
> 43 |     expect(overflow).toBe(false);
     |                      ^ Error: expect(received).toBe(expected) // Object.is equality
  44 |   });
  45 | 
  46 |   test('content area renders within viewport width', async ({ page }) => {
  47 |     await uiLoginAs(page, 'admin');
  48 |     await page.goto('/courses');
  49 |     const main = page.locator('main, [role="main"], #app, body > div').first();
  50 |     const bb = await main.boundingBox();
  51 |     if (bb) {
  52 |       expect(bb.width).toBeLessThanOrEqual(420);
  53 |     }
  54 |   });
  55 | });
  56 | 
```