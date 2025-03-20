import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// レート制限のための変数
let lastRequestTime = 0;
const RATE_LIMIT_DELAY = 1000; // 1秒

export const dynamic = 'force-dynamic'; // キャッシュを無効化
export const revalidate = 0; // キャッシュを無効化

// Edge Runtimeの設定を削除
// export const runtime = 'edge';
// export const maxDuration = 30;

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

    const { text } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "テキストが正しく提供されていません。" },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI APIキーが設定されていません。" },
        { status: 500 }
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
${text}

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

各危険要素について、具体的な該当文章を抽出して返してください。
必ず有効なJSON形式で返してください。`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
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
      analysis = JSON.parse(result.trim());
    } catch (e) {
      console.error("JSON解析エラー:", result);
      return NextResponse.json(
        { error: "分析結果の解析に失敗しました", raw: result },
        { status: 500 }
      );
    }

    // 必要なフィールドの検証
    if (!analysis.isScam || typeof analysis.confidence !== "number" || !Array.isArray(analysis.reasons) || !analysis.riskLevel || !analysis.details) {
      console.error("分析結果の形式が不正:", analysis);
      return NextResponse.json(
        { error: "分析結果の形式が不正です", raw: analysis },
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