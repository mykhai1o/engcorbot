// Defining numbers, punctuation and the alfabet of words (cyrillic or latin)
function getWordScript(word) {
    const cleanWord = word.trim().replace(/[\p{P}\p{S}\p{Extended_Pictographic}]/gu, "");

    if (!cleanWord) {
        return "punctuation";
    }

    if (/^\d+$/.test(cleanWord)) {
        return "number";
    }

    if (/[\u0400-\u04FF]/i.test(cleanWord)) {
        return "cyrillic";
    }

    if (/^[a-zà-öø-ÿā-žßäöüñéèàçíó]+$/i.test(cleanWord)) {
        return "latin";
    }

    return "unknown";
}

// Make a segmentation of the message on latin and cyrillic parts 
function segmentTextByScript(text) {
    const words = text.split(/(\s+)/);
    const segments = [];
    let currentSegment = null;

    for (const token of words) {
        if (!token.trim()) {
            // Adding the gaps to previous segment
            if (currentSegment) {
                currentSegment.text += token;
            }
            continue;
        }

        const alphabet = getWordScript(token);

        if (!currentSegment) {
            currentSegment = { alphabet: alphabet, text: token };
        } else if (
            currentSegment.alphabet === alphabet ||
            alphabet === "punctuation" ||
            alphabet === "number"
        ) {
            // Adding the punctuation and number to previous segment
            currentSegment.text += token;
        } else {
            segments.push(currentSegment);
            currentSegment = { alphabet: alphabet, text: token };
        }
    }

    if (currentSegment) {
        segments.push(currentSegment);
    }

    return segments;
}

// const MAIN_PROMPT = `
//         You are an expert multilingual linguistic assistant.Your task is to analyze the provided text segment and perform grammar and vocabulary checks.

//         Supported languages for verification: English, German, French, Spanish.

//         Instructions:
//             1. Determine the language of the input text segment.
//             2. If the text is in English, German, French, or Spanish:
//                 - Scan for any real grammar, spelling, or vocabulary errors.
//                 - Ignore stylistic preferences, informal language, slang, contractions, capitalization (including proper nouns and abbreviations), or punctuation - only changes.
//                 - Do not correct proper names, usernames, URLs, code, commands, or quoted text.
//             3. If there are errors, set "has_error" to true, and provide the "correction"(the fully corrected segment) and a short "explanation" in its original language.
//             4. If the text is in another language(e.g., Ukrainian) or contains no errors, set "has_error" to false, with empty string values for other fields.

//             Return strictly a JSON object matching the provided schema.No markdown wrapping.
// `;

// const PROMPT_SCHEMA = {
//     type: "object",
//     properties: {
//         detected_language: { type: "string", description: "The ISO 2-letter language code of the detected segment (e.g. en, de, fr, es, uk)" },
//         has_error: { type: "boolean" },
//         specific_error: { type: "string", description: "A specific error that needs to be corrected in text segment in its original language, or empty if no error" },
//         correction: { type: "string", description: "The corrected text segment in its original language, or empty if no error" },
//         explanation: { type: "string", description: "A brief, clear explanation of the errors and recommendations written in its original language" }
//     },
//     required: ["detected_language", "has_error", "specific_error", "correction", "explanation"]
// };

// const PROMPT_SCHEMA = {
//     type: "object",
//     properties: {
//         detected_language: {
//             type: "string",
//             description: "The ISO 2-letter language code of the detected segment (e.g. en, de, fr, es, uk)"
//         },

//         has_error: {
//             type: "boolean"
//         },

//         errors: {
//             type: "array",
//             description: "A list of all real grammar, spelling, or vocabulary errors found in the text segment. Empty if there are no errors.",
//             items: {
//                 type: "object",
//                 properties: {
//                     specific_error: {
//                         type: "string",
//                         description: "The specific incorrect word or phrase in the original text"
//                     },

//                     correction: {
//                         type: "string",
//                         description: "The corrected word or phrase in the original language"
//                     },

//                     explanation: {
//                         type: "string",
//                         description: "A brief, clear explanation of this error and its correction, written in the original language"
//                     }
//                 },

//                 required: [
//                     "specific_error",
//                     "correction",
//                     "explanation"
//                 ]
//             }
//         }
//     },

//     required: [
//         "detected_language",
//         "has_error",
//         "errors"
//     ]
// };

const MAIN_PROMPT = `
You are an expert multilingual linguistic assistant. Your task is to analyze multiple text segments and perform grammar, spelling, and vocabulary checks.

Supported languages for verification: English, German, French, Spanish.

The input contains multiple segments marked as [SEGMENT N].

Instructions:

1. Analyze each segment independently.

2. Determine the language of each segment.

3. If the segment is in English, German, French, or Spanish:
    - Scan the ENTIRE segment for ALL real grammar, spelling, and vocabulary errors.
    - Do not stop after finding the first error.
    - Return every detected error in the "errors" array.
    - Ignore stylistic preferences, informal language, slang, contractions, capitalization, punctuation-only changes.
    - Do not correct proper names, usernames, URLs, code, commands, or quoted text.
    - Do not invent errors.

4. If the segment is in another language:
    - Set "has_error" to false.
    - Return an empty "errors" array.

5. If the segment contains no errors:
    - Set "has_error" to false.
    - Return an empty "errors" array.

6. The "segment_id" must correspond exactly to the [SEGMENT N] number from the input.

7. For every detected error provide:
    - "specific_error": the incorrect word or phrase from the original text.
    - "correction": the corrected word or phrase.
    - "explanation": a short and clear explanation in the original language.

Return strictly a JSON object matching the provided schema. No markdown wrapping.
`;

const PROMPT_SCHEMA = {
    type: "object",
    properties: {
        segments: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    segment_id: {
                        type: "integer"
                    },

                    detected_language: {
                        type: "string",
                        description: "The ISO 2-letter language code of the detected segment (e.g. en, de, fr, es, uk)"
                    },

                    has_error: {
                        type: "boolean"
                    },

                    errors: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                specific_error: {
                                    type: "string",
                                    description: "A specific incorrect word or phrase from the original segment"
                                },

                                correction: {
                                    type: "string",
                                    description: "The corrected word or phrase in the original language"
                                },

                                explanation: {
                                    type: "string",
                                    description: "A brief, clear explanation of this error and its correction"
                                }
                            },
                            required: [
                                "specific_error",
                                "correction",
                                "explanation"
                            ]
                        }
                    }
                },

                required: [
                    "segment_id",
                    "detected_language",
                    "has_error",
                    "errors"
                ]
            }
        }
    },

    required: ["segments"]
};

const GROUP_TEST_ID = -1004467291256;
const THREAD_TEST_ID = 121;
const GROUP_ID_proj = -1003927786565;
const THREAD_ID_proj = 2;



async function askGemini(text, apiKey) {
    const model = "gemini-3.1-flash-lite";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            contents: [{ parts: [{ text: text }] }],
            systemInstruction: {
                parts: [{ text: MAIN_PROMPT }]
            },
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: PROMPT_SCHEMA
            }
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API Error: ${response.status} - ${errText}`);
    }

    const data = await response.json();

    try {
        const rawText = data.candidates[0].content.parts[0].text;
        return JSON.parse(rawText);
    } catch (e) {
        throw new Error("Can`t parse response from Gemini: " + e.message);
    }
}


async function sendMessage(chatId, text, replyToMessageId, botToken) {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: "HTML",
            reply_parameters: {
                message_id: replyToMessageId
            }
        })
    });

    const data = await response.json();
    if (!data.ok) {
        console.error("Message sending error to Telegram:", data.description);
    }
}



async function handleUpdate(update, env) {
    const message = update.message;

    if (!message || typeof message.text !== "string") {
        return;
    }

    // Checking threds in groups
    if (message.chat.id === GROUP_TEST_ID && message.message_thread_id !== THREAD_TEST_ID) {
        return;
    }
    if (message.chat.id === GROUP_ID_proj) {
        // if (message.chat.id === GROUP_ID_proj && message.message_thread_id !== THREAD_ID_proj) {
        return;
    }
    if (message.forward_origin) {
        return;
    }

    // Checking heshtegs to avoid requests
    const ignoredHashtags = ["#en"];

    // const hasIgnoredHashtag = ignoredHashtags.some(hashtag =>
    //     new RegExp(`(^|\\s)${hashtag}(?=\\s|$)`, "i").test(message.text)
    // );
    const hasIgnoredHashtag = ignoredHashtags.some(hashtag =>
        new RegExp(`${hashtag}`, "i").test(message.text)
    );

    if (hasIgnoredHashtag) {
        console.log("Message was skipped because of hashtag");
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
            console.error("ERROR: needed to check GEMINI_API_KEY or TELEGRAM_BOT_TOKEN");
            return;
        }

        // Spliting message on segments
        const segments = segmentTextByScript(message.text);

        // Saving only latin segments
        const latinSegments = segments.filter(seg => seg.alphabet === "latin");

        if (latinSegments.length === 0) {
            return;
        }

        // Gathering all errors from text 
        const errors = [];
        // Choose a working language
        // const enabledLanguages = ["en", "de", "fr", "es"];
        const enabledLanguages = ["en"];

        // Gathering all latin segments 
        const combinedText = latinSegments
            .map((segment, index) => {
                return `[SEGMENT ${index + 1}]\n${segment.text.trim()}`;
            })
            .join("\n\n");



        // Sending group of segments to llm

        const answer = await askGemini(combinedText, geminiKey);
        console.log(`Analyzing segments: `, JSON.stringify(answer));

        //Geting errors from anwer
        for (const segment of answer.segments) {

            if (
                !segment.has_error ||
                !enabledLanguages.includes(segment.detected_language)
            ) {
                continue;
            }

            for (const error of segment.errors) {
                errors.push({
                    language: segment.detected_language,
                    segment: segment.segment_id,
                    specificError: error.specific_error,
                    correction: error.correction,
                    explanation: error.explanation
                });
            }
        }

        // Cheking separate segments

        // [test]
        // for (const segment of latinSegments) {
        //     const cleanSegmentText = segment.text.trim();

        //     // Ignore small segments
        //     if (cleanSegmentText.length < 3) {
        //         continue;
        //     }

        //     const answer = await askGemini(cleanSegmentText, geminiKey);
        //     console.log(`Аналіз сегменту "${cleanSegmentText}": `, JSON.stringify(answer));





        //     if (
        //         answer.has_error &&
        //         enabledLanguages.includes(answer.detected_language)
        //     ) {
        //         for (const error of answer.errors) {
        //             errors.push({
        //                 language: answer.detected_language,
        //                 segment: cleanSegmentText,
        //                 specificError: error.specific_error,
        //                 correction: error.correction,
        //                 explanation: error.explanation
        //             });
        //         }
        //     }


        // }

        if (errors.length === 0) {
            return;
        }

        // Creating response message
        let responseText = "";

        for (const error of errors) {
            responseText +=
                // `<b>[${error.language}]</b>\n` +
                // `Maybe you mean:\n` +
                `<b><s>${error.specificError}</s></b> ➩ <b>${error.correction}</b>\n`
            // + `✅ <i>${error.explanation}</i>\n\n` +
            // `────────────\n\n`;
        }

        // Sending one  answer with corrections 
        await sendMessage(
            message.chat.id,
            responseText,
            message.message_id,
            botToken
        );
    } catch (e) {
        console.error("Message processing error:", e.message);
    }
}




// Export Cloudflare Worker queries
export default {
    async fetch(request, env, ctx) {
        // Resiving only POST queries
        if (request.method !== "POST") {
            return new Response("Bot is worcking! Webhook is active.", {
                status: 200,
                headers: { "Content-Type": "text/plain; charset=utf-8" }
            });
        }

        try {
            // Parsing the JSON, which was getting from Telegram
            const update = await request.json();

            // Launching asynchronized message processing
            // Using ctx.waitUntil, to make Worker keep going processe while query is sending to Gemini and Telegram.
            ctx.waitUntil(handleUpdate(update, env));

            // Immediately getting back Telegram status 200 OK, to avoid sending the same message 
            return new Response("OK", { status: 200 });
        } catch (err) {
            console.error("Помилка обробника вебхука:", err.message);
            return new Response("Internal Server Error", { status: 500 });
        }
    }


};
