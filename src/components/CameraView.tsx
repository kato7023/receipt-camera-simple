import { useState, useRef, useCallback } from 'react';
import { saveReceipt } from '../db';

interface CameraViewProps {
  onCapture: () => void;
}

export default function CameraView({ onCapture }: CameraViewProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastCaptured, setLastCaptured] = useState<string | null>(null);
  const [captureCount, setCaptureCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCapture = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsProcessing(true);
      try {
        await saveReceipt(file);
        setCaptureCount((prev) => prev + 1);

        // プレビュー用のURLを作成
        const url = URL.createObjectURL(file);
        setLastCaptured(url);

        // 2秒後にプレビューを消す
        setTimeout(() => {
          setLastCaptured(null);
          URL.revokeObjectURL(url);
        }, 2000);

        onCapture();
      } catch (err) {
        console.error('保存に失敗しました:', err);
        alert('保存に失敗しました。もう一度お試しください。');
      } finally {
        setIsProcessing(false);
        // 同じファイルを再選択できるようにリセット
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [onCapture]
  );

  const triggerCapture = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="camera-view">
      {/* 隠しファイル入力 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCapture}
        className="camera-input-hidden"
        id="camera-input"
      />

      {/* メインコンテンツ */}
      <div className="camera-content">
        {/* ステータス表示 */}
        {captureCount > 0 && (
          <div className="capture-badge">
            <span className="capture-badge-icon">✓</span>
            <span>本日 {captureCount} 枚撮影</span>
          </div>
        )}

        {/* プレビュー or アイコン */}
        <div className="camera-preview-area">
          {lastCaptured ? (
            <div className="capture-success">
              <img
                src={lastCaptured}
                alt="撮影した領収書"
                className="capture-preview-img"
              />
              <div className="capture-success-overlay">
                <span className="capture-success-check">✓</span>
                <span>保存しました</span>
              </div>
            </div>
          ) : (
            <div className="camera-icon-area">
              <div className="camera-icon">
                <svg
                  width="64"
                  height="64"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
              </div>
              <p className="camera-hint">
                タップして領収書を撮影
              </p>
            </div>
          )}
        </div>

        {/* シャッターボタン */}
        <button
          className={`shutter-button ${isProcessing ? 'processing' : ''}`}
          onClick={triggerCapture}
          disabled={isProcessing}
          aria-label="撮影"
        >
          <div className="shutter-button-inner">
            {isProcessing ? (
              <div className="shutter-spinner" />
            ) : (
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                <circle cx="12" cy="13" r="3" fill="white" />
              </svg>
            )}
          </div>
        </button>
      </div>
    </div>
  );
}
