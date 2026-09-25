function getWordLanguage(word) {
    const cleanWord = word
        .toLowerCase()
        .replace(/[.,!?;:()"']/g, "");

    if (!cleanWord) {
        return "unknown";
    }

    // Якщо є українські специфічні символи
    if (/^[а-щьюяєіїґ]+$/i.test(cleanWord)) {
        return "uk";
    }

    // Якщо слово містить тільки латиницю
    if (/^[a-z]+$/i.test(cleanWord)) {
        return "en";
    }

    return "unknown";
}

function splitIntoWords(text) {
    return text.split(/\s+/);
}

function analyzeWords(text) {
    const words = splitIntoWords(text);

    return words.map(word => ({
        word,
        language: getWordLanguage(word)
    }));
}


function groupWordsByLanguage(words) {
    const groups = [];

    for (const item of words) {

        const lastGroup = groups[groups.length - 1];

        if (
            lastGroup &&
            lastGroup.language === item.language
        ) {
            lastGroup.text += " " + item.word;
        } else {
            groups.push({
                language: item.language,
                text: item.word
            });
        }
    }

    return groups;
}


const words = analyzeWords(
    // "Привіт, my name is Петро"
    "Якщо це LLM models (типу чату gpt) то напевно у нього в інструкція жорстко прописано відповідати лише на англійську мову."
);
// console.log(words)

// [
//     { word: 'Привіт,', language: 'uk' },
//     { word: 'my', language: 'en' },
//     { word: 'name', language: 'en' },
//     { word: 'is', language: 'en' },
//     { word: 'Петро', language: 'uk' }
// ]

const groups = groupWordsByLanguage(words);

console.log(groups);

// [
//     { language: 'uk', text: 'Привіт,' },
//     { language: 'en', text: 'my name is' },
//     { language: 'uk', text: 'Петро' }
// ]