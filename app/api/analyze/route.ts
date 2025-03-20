import { NextResponse } from "next/server";
import OpenAI from "openai";

// タイムアウトを60秒に設定
export const maxDuration = 60;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 55000, // OpenAI APIのタイムアウトを55秒に設定
});

// レート制限のための変数
let lastRequestTime = 0;
const RATE_LIMIT_DELAY = 1000; // 1秒

export const dynamic = 'force-dynamic'; // キャッシュを無効化
export const revalidate = 0; // キャッシュを無効化

// Edge Runtimeの設定を削除
// export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    // レート制限のチェック
    const now = Date.now();
    if (now - lastRequestTime < RATE_LIMIT_DELAY) {
      return NextResponse.json(
        { error: "リクエストが多すぎます。少し待ってから再試行してください。" },
        { status: 429 }
      );
    }
    lastRequestTime = now;

    const { text, image } = await req.json();

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI APIキーが設定されていません。" },
        { status: 500 }
      );
    }

    let content = text;
    let messages = [];

    // 画像が提供された場合、画像からテキストを抽出
    if (image) {
      try {
        // Base64データからヘッダー部分を削除
        const base64Data = image.split(',')[1];
        
        const imageResponse = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: `あなたは画像からテキストを抽出する専門家です。
以下の点に注意してテキストを抽出してください：
1. 画像内の全てのテキストを漏れなく抽出
2. 日本語テキストはそのまま、他言語は日本語に翻訳
3. レイアウトや改行を保持
4. 数字や記号も正確に抽出
5. 画像の品質が低い場合でも可能な限り正確に抽出

テキストの抽出のみを行い、説明や分析は不要です。`
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "この画像に含まれるテキストを全て抽出してください。レイアウトや改行を保持し、可能な限り正確に抽出してください。"
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Data}`,
                    detail: "high" // 高解像度モードを有効化
                  }
                }
              ]
            }
          ],
          max_tokens: 2000 // トークン数を増やして長いテキストにも対応
        });

        const extractedText = imageResponse.choices[0].message.content;
        if (!extractedText) {
          return NextResponse.json(
            { error: "画像からテキストを抽出できませんでした" },
            { status: 500 }
          );
        }

        // 抽出されたテキストを整形
        content = extractedText.trim();
      } catch (error) {
        console.error("画像分析エラー:", error);
        if (error instanceof OpenAI.APIError) {
          return NextResponse.json(
            { error: `画像の分析中にエラーが発生しました: ${error.message}` },
            { status: 500 }
          );
        }
        return NextResponse.json(
          { error: "画像の分析中にエラーが発生しました" },
          { status: 500 }
        );
      }
    }

    // テキストの検証
    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "テキストが正しく提供されていません。" },
        { status: 400 }
      );
    }

    const prompt = `
以下のテキストを分析し、高齢者向けの詐欺の可能性があるかどうかを評価してください。
以下の基準で詳細に評価してください：

1. 緊急性を煽る表現
   - 「今すぐ」「期限切れ」「即座に」などの緊急性を強調する表現
   - 時間的制約を設ける表現
   - 焦りを煽る表現

2. 高額な金銭の要求
   - 具体的な金額の提示
   - 支払い方法の指定
   - 手数料や税金の要求
   - 投資や儲け話の提案

3. 個人情報の要求
   - 銀行口座情報
   - クレジットカード情報
   - 身分証明書情報
   - 住所や電話番号
   - パスワードや認証情報

4. 不自然な勧誘
   - 過度に親しみやすい表現
   - 不自然な敬語の使用
   - 不適切な謝罪や恐縮の表現
   - 不自然な日本語の使用

5. 不安を煽る表現
   - 脅迫的な表現
   - 不安をあおる表現
   - 罰則や法的措置の脅し
   - 家族や知人への影響を暗示

6. URLやリンクの分析
   - 不自然なドメイン名
   - 短縮URLの使用
   - 公式サイトを装ったURL
   - セキュリティ証明書の有無

7. 送信元の分析
   - 不自然なメールアドレス
   - 送信元の偽装
   - 組織名の不自然な使用
   - 署名の不自然さ

8. その他の危険な要素
   - 添付ファイルの有無
   - 不自然な画像やロゴの使用
   - 不適切なフォントやレイアウト
   - 不自然な改行や空白

テキスト：
${content}

以下のJSON形式で結果を返してください：
{
  "isScam": boolean,
  "confidence": number (0-1),
  "reasons": string[],
  "riskLevel": "high" | "medium" | "low",
  "details": {
    "urgency": {
      "detected": boolean,
      "examples": string[]
    },
    "moneyRequest": {
      "detected": boolean,
      "examples": string[]
    },
    "personalInfo": {
      "detected": boolean,
      "examples": string[]
    },
    "unnaturalInvitation": {
      "detected": boolean,
      "examples": string[]
    },
    "fearAppeal": {
      "detected": boolean,
      "examples": string[]
    },
    "suspiciousUrl": {
      "detected": boolean,
      "examples": string[]
    },
    "suspiciousSender": {
      "detected": boolean,
      "examples": string[]
    },
    "otherRisks": {
      "detected": boolean,
      "examples": string[]
    }
  }
}

各要素について、検出された場合は具体的な該当文章を配列で返してください。
例：
{
  "urgency": {
    "detected": true,
    "examples": ["今すぐ対応が必要です", "期限切れまであと1時間です"]
  }
}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `あなたは高齢者向け詐欺の専門家です。テキストを分析し、詐欺の可能性を評価してください。
以下の点に特に注意して分析してください：
1. 不自然な日本語表現や敬語の使用
2. 緊急性を過度に強調する表現
3. 個人情報や金銭の要求
4. 不安を煽る表現
5. 不自然なURLやリンク
6. 送信元の不自然さ
7. 全体的な不自然さや違和感

必ず以下の形式のJSONで返してください：
{
  "isScam": boolean,
  "confidence": number (0-1),
  "reasons": string[],
  "riskLevel": "high" | "medium" | "low",
  "details": {
    "urgency": { "detected": boolean, "examples": string[] },
    "moneyRequest": { "detected": boolean, "examples": string[] },
    "personalInfo": { "detected": boolean, "examples": string[] },
    "unnaturalInvitation": { "detected": boolean, "examples": string[] },
    "fearAppeal": { "detected": boolean, "examples": string[] },
    "suspiciousUrl": { "detected": boolean, "examples": string[] },
    "suspiciousSender": { "detected": boolean, "examples": string[] },
    "otherRisks": { "detected": boolean, "examples": string[] }
  }
}

注意事項：
- 必ず有効なJSON形式で返してください
- 余分な説明やコメントは含めないでください
- 各フィールドは必ず含めてください
- examples配列は空でも構いませんが、必ず配列として返してください`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 800,
    });

    const result = completion.choices[0].message.content;
    if (!result) {
      return NextResponse.json(
        { error: "分析結果が空でした" },
        { status: 500 }
      );
    }

    let analysis;
    try {
      // 文字列の前後の空白を削除し、JSONとして解析
      const cleanedResult = result.trim();
      console.log("API応答:", cleanedResult); // デバッグ用
      analysis = JSON.parse(cleanedResult);
    } catch (e) {
      console.error("JSON解析エラー:", result);
      return NextResponse.json(
        { error: "分析結果の解析に失敗しました", raw: result },
        { status: 500 }
      );
    }

    // 必要なフィールドの検証
    const requiredFields = [
      "isScam",
      "confidence",
      "reasons",
      "riskLevel",
      "details"
    ];

    const requiredDetailFields = [
      "urgency",
      "moneyRequest",
      "personalInfo",
      "unnaturalInvitation",
      "fearAppeal",
      "suspiciousUrl",
      "suspiciousSender",
      "otherRisks"
    ];

    const missingFields = requiredFields.filter(field => !(field in analysis));
    if (missingFields.length > 0) {
      console.error("必須フィールドが不足:", missingFields);
      return NextResponse.json(
        { error: "分析結果に必須フィールドが不足しています", missingFields },
        { status: 500 }
      );
    }

    const missingDetailFields = requiredDetailFields.filter(field => !(field in analysis.details));
    if (missingDetailFields.length > 0) {
      console.error("必須の詳細フィールドが不足:", missingDetailFields);
      return NextResponse.json(
        { error: "分析結果に必須の詳細フィールドが不足しています", missingDetailFields },
        { status: 500 }
      );
    }

    // 型の検証
    if (typeof analysis.isScam !== "boolean" || 
        typeof analysis.confidence !== "number" || 
        !Array.isArray(analysis.reasons) || 
        !["high", "medium", "low"].includes(analysis.riskLevel)) {
      console.error("型が不正:", analysis);
      return NextResponse.json(
        { error: "分析結果の型が不正です" },
        { status: 500 }
      );
    }

    return NextResponse.json(analysis);
  } catch (error) {
    console.error("分析エラー:", error);
    if (error instanceof OpenAI.APIError) {
      return NextResponse.json(
        { error: "OpenAI APIエラー: " + error.message },
        { status: 500 }
      );
    }
    if (error instanceof Error) {
      return NextResponse.json(
        { error: "分析中にエラーが発生しました: " + error.message },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "予期せぬエラーが発生しました" },
      { status: 500 }
    );
  }
} 