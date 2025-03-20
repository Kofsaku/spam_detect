"use client"

import type React from "react"

import { useState } from "react"
import { Upload, AlertTriangle, CheckCircle, Image, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { toast } from "@/components/ui/use-toast"

export default function SpamDetector() {
  const [activeTab, setActiveTab] = useState("text")
  const [text, setText] = useState("")
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [result, setResult] = useState<{
    isScam: boolean
    confidence: number
    reasons: string[]
    riskLevel: string
    details: {
      urgency: {
        detected: boolean
        examples: string[]
      }
      moneyRequest: {
        detected: boolean
        examples: string[]
      }
      personalInfo: {
        detected: boolean
        examples: string[]
      }
      unnaturalInvitation: {
        detected: boolean
        examples: string[]
      }
      fearAppeal: {
        detected: boolean
        examples: string[]
      }
      suspiciousUrl: {
        detected: boolean
        examples: string[]
      }
      suspiciousSender: {
        detected: boolean
        examples: string[]
      }
      otherRisks: {
        detected: boolean
        examples: string[]
      }
    }
  } | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      
      // ファイルサイズのチェック（4MB以下）
      if (file.size > 4 * 1024 * 1024) {
        toast({
          title: "エラー",
          description: "画像サイズは4MB以下にしてください",
          variant: "destructive",
        });
        return;
      }

      // ファイル形式のチェック
      if (!file.type.startsWith('image/')) {
        toast({
          title: "エラー",
          description: "画像ファイルを選択してください",
          variant: "destructive",
        });
        return;
      }

      setImage(file)

      // Create preview
      const reader = new FileReader()
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const analyzeContent = async (text: string, image?: string) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒のタイムアウト

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text, image }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      let data;
      try {
        const text = await response.text();
        try {
          data = JSON.parse(text);
        } catch (e) {
          console.error("JSON解析エラー:", text);
          throw new Error("APIからの応答を解析できませんでした");
        }
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") {
          throw new Error("リクエストがタイムアウトしました");
        }
        throw e;
      }

      if (!response.ok) {
        throw new Error(data.error || "分析中にエラーが発生しました");
      }

      if (!data || typeof data !== "object") {
        throw new Error("無効なレスポンス形式です");
      }

      return {
        isScam: data.isScam,
        confidence: data.confidence,
        reasons: data.reasons,
        riskLevel: data.riskLevel,
        details: data.details,
      };
    } catch (error) {
      console.error("分析エラー:", error);
      if (error instanceof Error) {
        throw new Error(error.message);
      }
      throw new Error("予期せぬエラーが発生しました");
    }
  };

  const handleAnalyze = async () => {
    if (activeTab === "text" && !text.trim()) {
      toast({
        title: "エラー",
        description: "テキストを入力してください",
        variant: "destructive",
      });
      return;
    }

    if (activeTab === "image" && !image) {
      toast({
        title: "エラー",
        description: "画像をアップロードしてください",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);
    try {
      let result;
      if (activeTab === "image" && image) {
        // 画像をBase64に変換
        const reader = new FileReader();
        const base64Image = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(image);
        });

        result = await analyzeContent("", base64Image);
      } else {
        result = await analyzeContent(text);
      }
      setResult(result);
    } catch (error) {
      console.error("分析エラー:", error);
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "分析中にエラーが発生しました",
        variant: "destructive",
      });
      setResult(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const resetAnalysis = () => {
    setResult(null)
    if (activeTab === "image") {
      setImage(null)
      setImagePreview(null)
    }
  }

  return (
    <div className="container mx-auto py-10 max-w-3xl">
      <h1 className="text-3xl font-bold text-center mb-8">詐欺検出アプリ</h1>
      <p className="text-center mb-8 text-muted-foreground">
        テキストや画像の詐欺の可能性を分析します。
      </p>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>コンテンツを分析</CardTitle>
          <CardDescription>テキストを入力するか、画像をアップロードしてください</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="text" value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="text" onClick={() => setActiveTab("text")}>
                <FileText className="mr-2 h-4 w-4" />
                テキスト
              </TabsTrigger>
              <TabsTrigger value="image" onClick={() => setActiveTab("image")}>
                <Image className="mr-2 h-4 w-4" />
                画像
              </TabsTrigger>
            </TabsList>

            <TabsContent value="text">
              <Textarea
                placeholder="分析したいテキストを入力してください..."
                className="min-h-[200px]"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </TabsContent>

            <TabsContent value="image">
              {!imagePreview ? (
                <div className="border-2 border-dashed rounded-lg p-12 text-center">
                  <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="mb-4 text-muted-foreground">画像をドラッグ＆ドロップするか、クリックしてアップロード</p>
                  <input
                    type="file"
                    id="image-upload"
                    className="hidden"
                    accept="image/*"
                    onChange={handleImageUpload}
                  />
                  <Button asChild>
                    <label htmlFor="image-upload">画像を選択</label>
                  </Button>
                </div>
              ) : (
                <div className="text-center">
                  <div className="relative w-full max-w-md mx-auto mb-4">
                    <img
                      src={imagePreview || "/placeholder.svg"}
                      alt="Uploaded content"
                      className="rounded-lg max-h-[300px] mx-auto"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => {
                        setImage(null)
                        setImagePreview(null)
                      }}
                    >
                      変更
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={resetAnalysis}>
            リセット
          </Button>
          <Button
            onClick={handleAnalyze}
            disabled={isAnalyzing || (activeTab === "text" && !text) || (activeTab === "image" && !image)}
          >
            {isAnalyzing ? "分析中..." : "分析する"}
          </Button>
        </CardFooter>
      </Card>

      {result && (
        <Alert variant={result.isScam ? "destructive" : "default"}>
          <div className="flex items-start">
            {result.isScam ? (
              <AlertTriangle className="h-5 w-5 mr-2 mt-0.5" />
            ) : (
              <CheckCircle className="h-5 w-5 mr-2 mt-0.5" />
            )}
            <div>
              <AlertTitle className="text-lg">
                {result.isScam
                  ? `詐欺の可能性が高いです (${Math.round(result.confidence * 100)}% の確率)`
                  : `詐欺の可能性は低いです (${Math.round((1 - result.confidence) * 100)}% の確率)`}
              </AlertTitle>
              <AlertDescription className="mt-2">
                <p className="font-medium mb-2">分析結果:</p>
                <ul className="list-disc pl-5 space-y-1">
                  {result.reasons.map((reason, index) => (
                    <li key={index}>{reason}</li>
                  ))}
                </ul>

                <div className="mt-4 p-3 bg-muted rounded-md">
                  <p className="font-medium mb-2">詳細な分析:</p>
                  <ul className="space-y-4">
                    {result.details.urgency.detected && (
                      <li>
                        <div className="flex items-center mb-1">
                          <AlertTriangle className="h-4 w-4 mr-2 text-yellow-500" />
                          <span className="font-medium">緊急性を煽る表現が検出されました</span>
                        </div>
                        <ul className="ml-6 list-disc text-sm text-muted-foreground">
                          {result.details.urgency.examples.map((example, index) => (
                            <li key={index}>{example}</li>
                          ))}
                        </ul>
                      </li>
                    )}
                    {result.details.moneyRequest.detected && (
                      <li>
                        <div className="flex items-center mb-1">
                          <AlertTriangle className="h-4 w-4 mr-2 text-yellow-500" />
                          <span className="font-medium">金銭の要求が検出されました</span>
                        </div>
                        <ul className="ml-6 list-disc text-sm text-muted-foreground">
                          {result.details.moneyRequest.examples.map((example, index) => (
                            <li key={index}>{example}</li>
                          ))}
                        </ul>
                      </li>
                    )}
                    {result.details.personalInfo.detected && (
                      <li>
                        <div className="flex items-center mb-1">
                          <AlertTriangle className="h-4 w-4 mr-2 text-yellow-500" />
                          <span className="font-medium">個人情報の要求が検出されました</span>
                        </div>
                        <ul className="ml-6 list-disc text-sm text-muted-foreground">
                          {result.details.personalInfo.examples.map((example, index) => (
                            <li key={index}>{example}</li>
                          ))}
                        </ul>
                      </li>
                    )}
                    {result.details.unnaturalInvitation.detected && (
                      <li>
                        <div className="flex items-center mb-1">
                          <AlertTriangle className="h-4 w-4 mr-2 text-yellow-500" />
                          <span className="font-medium">不自然な勧誘表現が検出されました</span>
                        </div>
                        <ul className="ml-6 list-disc text-sm text-muted-foreground">
                          {result.details.unnaturalInvitation.examples.map((example, index) => (
                            <li key={index}>{example}</li>
                          ))}
                        </ul>
                      </li>
                    )}
                    {result.details.fearAppeal.detected && (
                      <li>
                        <div className="flex items-center mb-1">
                          <AlertTriangle className="h-4 w-4 mr-2 text-yellow-500" />
                          <span className="font-medium">不安を煽る表現が検出されました</span>
                        </div>
                        <ul className="ml-6 list-disc text-sm text-muted-foreground">
                          {result.details.fearAppeal.examples.map((example, index) => (
                            <li key={index}>{example}</li>
                          ))}
                        </ul>
                      </li>
                    )}
                    {result.details.suspiciousUrl.detected && (
                      <li>
                        <div className="flex items-center mb-1">
                          <AlertTriangle className="h-4 w-4 mr-2 text-yellow-500" />
                          <span className="font-medium">不審なURLが検出されました</span>
                        </div>
                        <ul className="ml-6 list-disc text-sm text-muted-foreground">
                          {result.details.suspiciousUrl.examples.map((example, index) => (
                            <li key={index}>{example}</li>
                          ))}
                        </ul>
                      </li>
                    )}
                    {result.details.suspiciousSender.detected && (
                      <li>
                        <div className="flex items-center mb-1">
                          <AlertTriangle className="h-4 w-4 mr-2 text-yellow-500" />
                          <span className="font-medium">不審な送信元が検出されました</span>
                        </div>
                        <ul className="ml-6 list-disc text-sm text-muted-foreground">
                          {result.details.suspiciousSender.examples.map((example, index) => (
                            <li key={index}>{example}</li>
                          ))}
                        </ul>
                      </li>
                    )}
                    {result.details.otherRisks.detected && (
                      <li>
                        <div className="flex items-center mb-1">
                          <AlertTriangle className="h-4 w-4 mr-2 text-yellow-500" />
                          <span className="font-medium">その他の危険な要素が検出されました</span>
                        </div>
                        <ul className="ml-6 list-disc text-sm text-muted-foreground">
                          {result.details.otherRisks.examples.map((example, index) => (
                            <li key={index}>{example}</li>
                          ))}
                        </ul>
                      </li>
                    )}
                  </ul>
                </div>

                {result.isScam && (
                  <div className="mt-4 p-3 bg-destructive/10 rounded-md">
                    <p className="font-medium">注意事項:</p>
                    <p className="text-sm mt-1">
                      このコンテンツは詐欺の可能性が高いです。個人情報や金銭を要求されている場合は応じないでください。
                      不審なメールやメッセージは、該当する組織の公式連絡先に確認することをお勧めします。
                    </p>
                  </div>
                )}
              </AlertDescription>
            </div>
          </div>
        </Alert>
      )}
    </div>
  )
}

