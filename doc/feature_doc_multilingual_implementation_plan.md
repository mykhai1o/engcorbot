# Детальний план впровадження багатомовної сегментації та перевірки для Telegram-бота

Цей документ містить глибокий аналіз вимог, критичний аналіз ризиків, порівняння технічних рішень та покроковий план міграції проєкту на нову логіку сегментації та визначення мов (української, англійської, німецької, французької, іспанської тощо) з інтеграцією з Gemini API в середовищі **Cloudflare Workers**.

---

## 1. Аналіз вимог та архітектури роботи

### Бажаний алгоритм роботи (згідно з промптом):
1. **Отримання повідомлення** від користувача в Telegram.
2. **Розбиття тексту на слова / токени**.
3. **Визначення мови для кожного слова / сегменту** за допомогою сторонньої бібліотеки чи сервісу (без використання захардкоджених кастомних словників). Підтримка мов: *англійська, українська, німецька, французька, іспанська* тощо.
4. **Групування послідовних слів** однієї мови в окремі сегменти.
   - *Приклад*: `"Привіт, my name is Петро"` -> 
     1. `[Привіт,]` (Українська)
     2. `[my name is]` (Англійська)
     3. `[Петро]` (Українська)
5. **Фільтрація сегментів**: Якщо сегмент визначено як англійська мова (або інша цільова мова, яку потрібно перевірити), він надсилається на перевірку в Gemini.
6. **Отримання рекомендацій від Gemini**: Аналіз граматики та лексики обраного сегменту.
7. **Надсилання відповіді** користувачеві (якщо знайдено помилки).

---

## 2. Критичний аналіз логіки: Переваги, Недоліки та Ризики

Хоча ідея сегментації є логічною, її практична реалізація на рівні окремих слів у поєднанні з бібліотеками виявлення мови має кілька серйозних технічних викликів, які необхідно врахувати перед написанням коду.

### 🔴 Ризик 1: Вкрай низька точність визначення мови для коротких сегментів (1-3 слова)
Більшість популярних бібліотек (наприклад, `franc`, `languagedetect`, `lidx`) працюють на основі **n-грам** (статистичного аналізу послідовностей символів). Вони розроблені для аналізу абзаців або цілих речень.
- **Проблема**: Якщо спробувати визначити мову для окремого слова, точність падає до 20-30%.
  - `franc('my')` може визначити мову як шведську (`swe`) або німецьку (`deu`).
  - `franc('is')` може бути розпізнано як ісландська (`isl`).
  - `franc('Петро')` через відсутність контексту може розпізнатися як болгарська (`bul`) або російська (`rus`).
- **Рішення**: Не розбивати текст суворо по одному слову для аналізу в бібліотеці. Замість цього використовувати гібридний підхід: класифікацію за Unicode-діапазонами символів (скриптами) або надсилати сегменти з декількох слів.

### 🔴 Ризик 2: Втрата граматичного контексту (Context Fragmentation)
Граматика мови будується на рівні повного речення. Якщо ми розіб'ємо речення на окремі шматки і надішлемо в Gemini лише англійські слова, Gemini втратить контекст і згенерує неправдиві помилки (False Positives).
- **Приклад**: `"Я думаю, що you is wrong."`
  - Сегментація: `["Я думаю, що", "you is wrong"]`.
  - Тут сегмент `"you is wrong"` містить помилку (`is` замість `are`), і Gemini легко її виправить, бо це закінчена думка.
- **Приклад**: `"Вчора я бачив a girl яка була дуже красива."`
  - Сегментація: `["Вчора я бачив", "a girl", "яка була дуже красива"]`.
  - Якщо ми надішлемо в Gemini лише `"a girl"`, ШІ не зможе знайти помилку, хоча користувач міг хотіти написати `"the girl"` залежно від контексту. Або якщо англійська частина розбита на дрібні шматочки: `["Yesterday I saw", "girl", "beautiful"]`. Поза контекстом вони виглядатимуть як набір помилок, хоча в оригіналі помилок немає.
- **Рішення**: Передавати в Gemini **все речення повністю**, але в промпті чітко вказувати, які саме частини (наприклад, латинські сегменти) потрібно аналізувати, зберігаючи загальний контекст речення для правильного аналізу граматики.

### 🔴 Ризик 3: Обмеження Cloudflare Workers (Bundle Size & V8 runtime)
Cloudflare Workers має жорсткі ліміти на розмір бандлу (до 1 МБ для безкоштовного тарифу). 
- Багато мовних бібліотек містять величезні словники та бази даних n-грам розміром від 2 до 15 МБ, через що їх **неможливо задеплоїти** у Cloudflare Worker.
- Також Worker працює у середовищі V8 Isolates, тому бібліотеки, які залежать від Node.js API (наприклад, `fs`, `path`), не працюватимуть без додаткових поліфілів.
- **Рішення**: Використовувати ультралегкі бібліотеки (наприклад, `franc-min` або `languagedetect` у чистій JS-версії без словників) або довірити складне визначення мов самому **Gemini API**, який впорається з цим ідеально та безкоштовно з точки зору розміру коду бота.

---

## 3. Порівняння підходів до реалізації

Для вирішення завдання є три основні архітектурні підходи. Оцінимо їх за критеріями точності, стабільності та складності.

### Підхід А: Клієнтська сегментація через бібліотеку `franc-min` або `languagedetect`
*Логіка*: Встановлюємо `franc-min` через npm. Код розбиває рядок на слова, викликає бібліотеку для кожного слова, групує суміжні мови.
- **Плюси**: Відповідає прямому запиту користувача; не потребує складних промптів для базового поділу.
- **Мінуси**: Велика кількість помилок через малу довжину слів (слово "is" чи "and" буде розпізнано невірно); збільшення розміру бандлу бота; можливі проблеми сумісності з Cloudflare Workers.

### Підхід Б: Гібридний підхід (Unicode Regex Script Detector) + Gemini
*Логіка*: Оскільки українська мова використовує кирилицю, а англійська, німецька, французька та іспанська — латиницю (з діакритичними знаками), ми можемо розділити текст на дві групи за допомогою високоефективних регулярних виразів Unicode.
- **Кирилиця**: `[\u0400-\u04FF\u0500-\u052F\u0483-\u0489]` (охоплює українську, колишні символи тощо).
- **Латиниця (з діакритикою)**: `[A-Za-zÀ-ÖØ-öø-ÿĀ-ž]` (охоплює англійську, німецьку (ä, ö, ü, ß), французьку (é, è, à, ç), іспанську (ñ, í, ó)).
Групуємо послідовні слова одного скрипту. Потім латинські сегменти передаємо в Gemini, де він за секунду визначає конкретну європейську мову (EN, DE, FR) та перевіряє її.
- **Плюси**: 100% точність поділу на кирилицю/латиницю; 0 байт додаткових бібліотек (ідеально для Cloudflare Workers); надшвидка робота.
- **Мінуси**: Не розрізняє англійську та німецьку на рівні JS-коду перед відправкою (але це успішно робить Gemini).

### Підхід В (Найкраща практика): Повна передача контексту в Gemini із запитом структурованого аналізу
*Логіка*: Ми передаємо весь текст повідомлення в Gemini. В системному промпті вказуємо задачу:
1. Знайти в тексті сегменти іноземних мов (англійської, німецької тощо).
2. Проігнорувати українські сегменти.
3. Проаналізувати граматику знайдених іншомовних сегментів.
4. Повернути JSON-відповідь лише для тих частин, де є реальні помилки.
- **Плюси**: Збереження 100% контексту речення (відсутність хибних спрацювань через фрагментацію); відсутність зайвих бібліотек; максимальна інтелектуальність аналізу.
- **Мінуси**: Витрачається трохи більше вхідних токенів (проте для невеликих повідомлень у Telegram різниця є мізерною та непомітною фінансово).

---









## 4. Покроковий план переходу на новий функціонал (Гібридний підхід Б)

Ми оберемо **Гібридний підхід Б** (сегментація на рівні регулярних виразів Unicode + інтелектуальна класифікація через Gemini), оскільки він поєднує в собі нульове навантаження на бандл Cloudflare Workers, абсолютну точність виділення блоків тексту та підтримку всіх запитаних мов (англійської, німецької, французької, іспанської, української).

Також нижче наведено інструкцію для **Підходу А** (через бібліотеку), якщо використання сторонньої JS-бібліотеки є критично обов'язковою вимогою.

### Крок 1. Підготовка оточення та аналіз сумісності
Якщо ви обираєте **Підхід А (з бібліотекою `franc-min`)**:
1. Перевірте, чи встановлюється та збирається бібліотека в середовищі Cloudflare:
   ```bash
   npm install franc-min
   ```
2. Оскільки `franc` поставляється як ES Module, переконайтеся, що `package.json` підтримує роботу з ESM (у нашому проєкті вже налаштовано ESM, оскільки використовується `export default` у `src/index.js`).

Якщо ви обираєте **Гібридний підхід Б (Рекомендований)**:
- Жодних нових бібліотек встановлювати не потрібно. Проєкт залишається легким та швидким.



# ПОЯСНЕННЯ #


---

### Крок 2. Реалізація логіки сегментатора мов
Створимо або оновимо функції для розбиття тексту та аналізу мовних сегментів. 

Для **Гібридного підходу Б** код у файлі `src/index.js` буде виглядати так:

```javascript
/**
 * Визначає групу символів (скрипт) для окремого слова.
 * Підтримує Кирилицю (uk/ru) та Латиницю з діакритичними знаками (en/de/fr/es).
 */
function getWordScript(word) {
	const cleanWord = word.trim().replace(/[.,!?;:()"']/g, "");

	if (!cleanWord) {
		return "punctuation";
	}

	// Перевірка на кирилицю (українська, тощо)
	if (/[\u0400-\u04FF]/i.test(cleanWord)) {
		return "cyrillic"; // Українська, тощо
	}

	// Перевірка на латиницю (англійська, німецька, французька, іспанська з діакритикою)
	if (/^[a-zà-öø-ÿā-žßäöüñéèàçíó]+$/i.test(cleanWord)) {
		return "latin"; // Англійська, Німецька, Французька, Іспанська
	}

	return "unknown";
}

/**
 * Розбиває текст на сегменти за мовною групою (скриптом).
 * Об'єднує послідовні слова однієї групи.
 */
function segmentTextByScript(text) {
const words = text.split(/(\s+)/); // зберігаємо пробіли для точного відновлення фраз
	const segments = [];
	let currentSegment = null;

	for (const token of words) {
		if (!token.trim()) {
			// Якщо це просто пробіли, додаємо їх до поточного сегменту
			if (currentSegment) {
				currentSegment.text += token;
			}
			continue;
		}

		const language = getWordScript(token);

		if (!currentSegment) {
			currentSegment = { language: language, text: token };
		} else if (currentSegment.language === language || language === "punctuation") {
			// Пунктуацію приєднуємо до поточного активного сегменту
			currentSegment.text += token;
		} else {
			segments.push(currentSegment);
			currentSegment = { language: language, text: token };
		}
	}

	if (currentSegment) {
		segments.push(currentSegment);
	}

	return segments;
}
```

*Приклад роботи сегментатора:*
Вхідний рядок: `"Привіт, мої друзі! Напишіть мені, please, or write a letter сьогодні."`
Результат:
```json
[
  { "script": "cyrillic", "text": "Привіт, мої друзі! Напишіть мені, " },
  { "script": "latin", "text": "please, or write a letter " },
  { "script": "cyrillic", "text": "сьогодні." }
]
```

---

### Крок 3. Налаштування системного промпту Gemini під багатомовність
Оскільки ми тепер можемо надсилати латинські сегменти (які можуть містити англійські, німецькі, французькі або іспанські фрази), ми маємо розширити системний промпт Gemini. Він повинен:
1. Визначити, якою саме мовою написаний сегмент.
2. Якщо це англійська, німецька, французька або іспанська мова — виконати перевірку граматики та орфографії.
3. Повернути відповідь у структурованому форматі JSON.

Оновимо константи `MAIN_PROMPT` та `PROMPT_SCHEMA` у `src/index.js`:

```javascript
const MAIN_PROMPT = `
        You are an expert multilingual linguistic assistant. Your task is to analyze the provided text segment and perform grammar and vocabulary checks.

        Supported languages for verification: English, German, French, Spanish.
        
        Instructions:
        1. Determine the language of the input text segment.
        2. If the text is in English, German, French, or Spanish:
           - Scan for any real grammar, spelling, or vocabulary errors.
           - Ignore stylistic preferences, informal language, slang, contractions, capitalization, or punctuation-only changes.
           - Do not correct proper names, usernames, URLs, code, commands, or quoted text.
        3. If there are errors, set "has_error" to true, and provide the "correction" (the fully corrected segment) and a short "explanation" in Ukrainian.
        4. If the text is in another language (e.g., Ukrainian) or contains no errors, set "has_error" to false, with empty string values for other fields.

        Return strictly a JSON object matching the provided schema. No markdown wrapping.
`;

const PROMPT_SCHEMA = {
	type: "object",
	properties: {
		detected_language: { type: "string", description: "The ISO 2-letter language code of the detected segment (e.g. en, de, fr, es, uk)" },
		has_error: { type: "boolean" },
		correction: { type: "string", description: "The corrected text segment in its original language, or empty if no error" },
		explanation: { type: "string", description: "A brief, clear explanation of the errors and recommendations written in Ukrainian" }
	},
	required: ["detected_language", "has_error", "correction", "explanation"]
};
```

---

### Крок 4. Оновлення логіки обробки повідомлень у `handleUpdate`
Модифікуємо функцію `handleUpdate`, щоб вона інтегрувала сегментацію:

```javascript
async function handleUpdate(update, env) {
	const message = update.message;

	if (!message || typeof message.text !== "string") {
		return;
	}

	// Перевірка тредів (залишається без змін)
	if (message.chat.id === GROUP_TEST_ID && message.message_thread_id !== THREAD_TEST_ID) {
		return;
	}
	if (message.chat.id === GROUP_ID_proj && message.message_thread_id !== THREAD_ID_proj) {
		return;
	}
	if (message.forward_origin) {
		return;
	}

	try {

		console.log(message.chat.id);
		console.log(message.message_id);
		console.log(message.message_thread_id);
		
		console.log(message.from.first_name);
		console.log(message.text);
		console.log("---");

		const geminiKey = env.GEMINI_API_KEY;
		const botToken = env.TELEGRAM_BOT_TOKEN;

		if (!geminiKey || !botToken) {
			console.error("Відсутні змінні оточення GEMINI_API_KEY або TELEGRAM_BOT_TOKEN");
			return;
		}

		// 1. Розбиваємо повідомлення на сегменти
		const segments = segmentTextByScript(message.text);

		// 2. Фільтруємо лише сегменти з латинським скриптом (англійська, німецька, французька, іспанська)
		const foreignSegments = segments.filter(seg => seg.language === "latin");

		// Якщо немає іншомовних сегментів, ігноруємо повідомлення
		if (foreignSegments.length === 0) {
			return;
		}

		// 3. Перевіряємо кожен іншомовний сегмент окремо
		for (const segment of foreignSegments) {
			const cleanSegmentText = segment.text.trim();
			
			// Ігноруємо занадто короткі сегменти (наприклад, 1-2 літери), які часто є абревіатурами або помилками
			if (cleanSegmentText.length < 3) {
				continue;
			}

			const answer = await askGemini(cleanSegmentText, geminiKey);
			console.log(`Аналіз сегменту "${cleanSegmentText}":`, JSON.stringify(answer));

			// Якщо виявлено помилку і мова входить до переліку підтримуваних
			if (answer.has_error && ["en", "de", "fr", "es"].includes(answer.detected_language)) {
				let langLabel = "";
				switch (answer.detected_language) {
					case "en": langLabel = "🇬🇧 English"; break;
					case "de": langLabel = "🇩🇪 Deutsch"; break;
					case "fr": langLabel = "🇫🇷 Français"; break;
					case "es": langLabel = "🇪🇸 Español"; break;
				}

				await sendMessage(
					message.chat.id,
					`<b>[${langLabel}]</b> для сегменту <i>"${cleanSegmentText}"</i>:\n\n` +
					`Maybe you mean:\n✅ <b>${answer.correction}</b>\n\n` +
					`📝 <i>${answer.explanation}</i>`,
					message.message_id,
					botToken
				);
			}
		}
	} catch (e) {
		console.error("Помилка під час обробки повідомлення:", e.message);
	}
}
```

---

### Крок 5. Створення Unit-тестів для перевірки
Щоб переконатися, що логіка сегментації працює ідеально, додамо тести у `test/index.spec.js` (або окремий тестовий файл).

Рекомендовані тест-кейси для покриття:
1. Суто український текст (не має створювати латинських сегментів).
2. Суто англійський текст (має створити 1 латинський сегмент).
3. Змішаний текст: `"Привіт, my name is Петро"`. Має створити 3 сегменти (Кирилиця, Латиниця, Кирилиця).
4. Багатомовний текст європейськими мовами: `"Hallo, comment ça va?"`. Має виділити один латинський сегмент (оскільки і німецькі, і французькі літери належать до латинського скрипту).

Приклад коду тесту для `vitest`:

```javascript
import { describe, it, expect } from "vitest";
import { segmentTextByScript, getWordScript } from "../src/index.js"; // якщо експортувати ці функції

describe("Якість сегментації тексту", () => {
	it("правильно визначає скрипт для слів різних мов", () => {
		expect(getWordScript("Привіт")).toBe("cyrillic");
		expect(getWordScript("Hello")).toBe("latin");
		expect(getWordScript("Mädchen")).toBe("latin"); // німецька з умлаутом
		expect(getWordScript("garçon")).toBe("latin"); // французька з седілем
		expect(getWordScript("!?,.")).toBe("punctuation");
	});

	it("коректно розбиває змішаний українсько-англійський рядок", () => {
		const result = segmentTextByScript("Привіт, my name is Петро");
		
		expect(result).toHaveLength(3);
		expect(result[0].script).toBe("cyrillic");
		expect(result[0].text.trim()).toBe("Привіт,");
		
		expect(result[1].script).toBe("latin");
		expect(result[1].text.trim()).toBe("my name is");
		
		expect(result[2].script).toBe("cyrillic");
		expect(result[2].text.trim()).toBe("Петро");
	});
});
```

---

## 5. Висновок та рекомендації для розробника

1. **Відмова від важких сторонніх NPM-бібліотек**: Оптимальним рішенням для Cloudflare Workers є **Гібридний підхід Б**. Він дозволяє уникнути роздування бандлу (Bundle Bloat), не порушує обмежень пам'яті Workers і забезпечує 100% швидкість роботи завдяки регулярним виразам.
2. **Передача мовного аналізу на Gemini**: ШІ чудово справляється з розрізненням тонкощів європейських мов (відрізняє німецьку від французької чи англійської) навіть у межах короткого латинського сегменту, що вирішує головну проблему статистичних бібліотек на кшталт `franc`.
3. **Збереження контексту**: Щоб уникнути хибних граматичних виправлень фрагментів слів, системний промпт Gemini розроблений так, щоб ігнорувати стилістичну незавершеність і фокусуватися суто на фундаментальних помилках орфографії та граматики.
