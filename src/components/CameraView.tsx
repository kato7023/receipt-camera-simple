import { useState, useRef, useCallback, useEffect } from 'react';
import { db, saveReceipt } from '../db';

interface CameraViewProps {
  onCapture: () => void;
}

export default function CameraView({ onCapture }: CameraViewProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastCaptured, setLastCaptured] = useState<string | null>(null);
  const [captureCount, setCaptureCount] = useState(0);
  const [memo, setMemo] = useState('');
  const [memoHistory, setMemoHistory] = useState<string[]>([]);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);

  const loadMemoHistory = useCallback(async () => {
    const receipts = await db.receipts.orderBy('createdAt').reverse().toArray();
    const uniqueMemos: string[] = [];
    for (const receipt of receipts) {
      const value = receipt.memo.trim();
      if (value && !uniqueMemos.includes(value)) uniqueMemos.push(value);
      if (uniqueMemos.length >= 10) break;
    }
    setMemoHistory(uniqueMemos);
  }, []);

  useEffect(() => {
    void loadMemoHistory();
  }, [loadMemoHistory]);

  const handleCapture = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsProcessing(true);
      try {
        await saveReceipt(file, memo.trim());
        setCaptureCount((prev) => prev + 1);
        setMemo('');
        void loadMemoHistory();

        const url = URL.createObjectURL(file);
        setLastCaptured(url);
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
        if (cameraInputRef.current) cameraInputRef.current.value = '';
        if (albumInputRef.current) albumInputRef.current.value = '';
      }
    },
    [loadMemoHistory, memo, onCapture]
  );

  const triggerCameraCapture = () => cameraInputRef.current?.click();
  const triggerAlbumPick = () => albumInputRef.current?.click();

  return (
    <div className="camera-view">
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCapture}
        className="camera-input-hidden"
        id="camera-input"
      />
      <input
        ref={albumInputRef}
        type="file"
        accept="image/*"
        onChange={handleCapture}
        className="camera-input-hidden"
        id="album-input"
      />

      <div className="camera-content">
        {captureCount > 0 && (
          <div className="capture-badge">
            <span className="capture-badge-icon">✓</span>
            <span>本日 {captureCount} 枚撮影</span>
          </div>
        )}

        <button
          type="button"
          className={`camera-preview-area ${isProcessing ? 'processing' : ''}`}
          onClick={triggerCameraCapture}
          disabled={isProcessing}
          aria-label="領収書を撮影"
        >
          {lastCaptured ? (
            <div className="capture-success">
              <img src={lastCaptured} alt="撮影した領収書" className="capture-preview-img" />
              <div className="capture-success-overlay">
                <span className="capture-success-check">✓</span>
                <span>保存しました</span>
              </div>
            </div>
          ) : (
            <div className="camera-icon-area">
              {isProcessing ? (
                <div className="shutter-spinner" />
              ) : (
                <>
                  <div className="camera-icon">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                      <circle cx="12" cy="13" r="3" />
                    </svg>
                  </div>
                  <p className="camera-hint">タップして領収書を撮影</p>
                </>
              )}
            </div>
          )}
        </button>

        <button
          type="button"
          className="album-button"
          onClick={triggerAlbumPick}
          disabled={isProcessing}
          aria-label="アルバムから選択"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <span>アルバムから選択</span>
        </button>

        <div className="camera-memo-section">
          <input
            id="camera-memo"
            type="text"
            className="memo-input"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="メモを入力..."
            aria-label="メモ"
          />
          {memoHistory.length > 0 && (
            <div className="memo-history" aria-label="最近使ったメモ">
              {memoHistory.map((item) => (
                <button type="button" className="memo-history-button" key={item} onClick={() => setMemo(item)}>
                  {item}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
