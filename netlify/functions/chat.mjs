
const SYSTEM_INSTRUCTION = `
あなたは、生徒が一年を振り返り、自分を表す漢字一文字を見つけるためのインタビュアーです。

【進め方】
- 最初は今年の出来事を幅広く思い出せる質問を一つしてください。
- 必ず一度に一つの質問だけをしてください。
- 一つの出来事を深掘りしすぎず、話題を次々に変えてください。
- 回答が短くても否定せず、次の質問へ進んでください。
- 思い出せないと言われたら、別のテーマに切り替えてください。
- 生徒が話していない出来事を作らないでください。
- 十分な数の出来事が集まるまで漢字の候補を出さないでください。
- 答えたくない話題は追及しないでください。
- 家庭内の事情や個人的な私生活について質問しないでください。
- 個人情報や連絡先を尋ねないでください。

【質問するテーマ】
学校行事、クラスでの出来事、友達との思い出、部活動、勉強、頑張ったこと、挑戦したこと、失敗や悔しかったこと、うれしかったこと、新しくできるようになったこと、趣味、遊び、旅行、去年と比べて変わったことなど。
一つのテーマに偏らないようにしてください。

【漢字を考える段階】
十分な出来事が集まったら、話してくれた内容を整理してください。
その後、一年を表す漢字を5つ程度、理由と具体的な出来事を添えて提案してください。
最後に選ぶのは生徒本人です。候補以外の漢字でも構いません。

【最後のまとめ】
①選んだ漢字一文字
②選んだ理由と具体的な出来事
③今年の自分を一言で表すと
④来年はどんな一年にしたいか

親しみやすく、短い日本語で会話してください。
`;

export default async (request) => {
  if (request.method !== "POST") {
    return Response.json({ error: "利用できません。" }, { status: 405 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "サーバー設定を確認してください。" }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "送信内容を読み取れません。" }, { status: 400 });
  }

  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 30) {
    return Response.json({ error: "会話を最初からやり直してください。" }, { status: 400 });
  }

  const contents = [];
  let totalChars = 0;

  for (const item of messages) {
    if (!item || !["user", "model"].includes(item.role) || typeof item.text !== "string") {
      return Response.json({ error: "送信内容に問題があります。" }, { status: 400 });
    }
    const text = item.text.trim();
    if (!text || text.length > 1200) {
      return Response.json({ error: "文章が長すぎます。" }, { status: 400 });
    }
    totalChars += text.length;
    contents.push({ role: item.role, parts: [{ text }] });
  }

  if (totalChars > 18000) {
    return Response.json({ error: "会話が長くなったため、最初からやり直してください。" }, { status: 400 });
  }

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SYSTEM_INSTRUCTION }]
          },
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 650
          }
        })
      }
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("Gemini API error:", response.status);
      if (response.status === 429) {
        return Response.json({ error: "利用が集中しています。少し待ってください。" }, { status: 429 });
      }
      return Response.json({ error: "AIとの通信に失敗しました。先生に知らせてください。" }, { status: 502 });
    }

    const reply = result?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

    if (!reply) {
      return Response.json({ error: "AIから返事がありませんでした。" }, { status: 502 });
    }

    return Response.json({ reply });
  } catch (error) {
    console.error("Function error:", error?.message || "unknown");
    return Response.json({ error: "通信に失敗しました。もう一度試してください。" }, { status: 500 });
  }
};
