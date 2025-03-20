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
              content: `あなたはOCRの専門家です。
以下の点に注意して画像からテキストを抽出してください：
1. 画像内の全てのテキストを漏れなく抽出
2. レイアウトや改行を保持
3. 数字や記号も正確に抽出
4. 日本語テキストはそのまま抽出
5. 抽出したテキストはそのまま返してください（翻訳や説明は不要）`
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "この画像に含まれる全てのテキストを抽出してください。レイアウトや改行を保持し、可能な限り正確に抽出してください。"
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Data}`,
                    detail: "high"
                  }
                }
              ]
            }
          ],
          max_tokens: 1000 // OCRのトークン数をさらに増やす
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
        
        // 抽出されたテキストが空の場合のチェック
        if (!content) {
          return NextResponse.json(
            { error: "画像からテキストを抽出できませんでした" },
            { status: 500 }
          );
        }

        console.log("抽出されたテキスト:", content); // デバッグ用
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
テキストを分析し、詐欺の可能性を評価してください。以下のJSON形式で返してください：

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
- 全ての説明や理由は日本語で返してください
- 例文も日本語で返してください
- 技術用語は必要に応じて日本語に翻訳してください

テキスト：
${content}
`.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `あなたは高齢者向け詐欺を判定する専門家です。
以下の点に注意してください：
1. 全ての説明や理由は日本語で返してください
2. 例文も日本語で返してください
3. 技術用語は必要に応じて日本語に翻訳してください
4. 必ず有効なJSONのみを返してください
5. 余分な説明は不要です`
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
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
      
      // JSONの開始と終了を探す
      const jsonStart = cleanedResult.indexOf('{');
      const jsonEnd = cleanedResult.lastIndexOf('}') + 1;
      
      if (jsonStart === -1 || jsonEnd === 0) {
        throw new Error("JSONの形式が見つかりません");
      }
      
      // JSON部分のみを抽出
      const jsonStr = cleanedResult.slice(jsonStart, jsonEnd);
      analysis = JSON.parse(jsonStr);
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