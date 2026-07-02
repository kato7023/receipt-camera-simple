import { useState, useEffect, useCallback } from 'react';
import {
  type Receipt,
  updateReceiptStatus,
  updateReceiptMemo,
  deleteReceipt,
} from '../db';

interface ReceiptDetailProps {
  receipt: Receipt;
  onClose: () => void;
  onUpdate: () => void;
}

export default function ReceiptDetail({
  receipt,
  onClose,
  onUpdate,
}: ReceiptDetailProps) {
  const [imageUrl, setImageUrl] = useState<string>('');
  const [memo, setMemo] = useState(receipt.memo || '');
  const [status, setStatus] = useState(receipt.status);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(receipt.image);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [receipt.image]);

  const handleShare = useCallback(async () => {
    if (!receipt.id) return;
    try {
      const file = new File(
        [receipt.image],
        `receipt_${receipt.id}.jpg`,
        { type: receipt.image.type || 'image/jpeg' }
      );

      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: '領収書',
          text: memo ? `領収書メモ: ${memo}` : '領収書',
          files: [file],
        });
        // 共有成功 → 送信済みにマーク
        await updateReceiptStatus(receipt.id, 'sent');
        setStatus('sent');
        onUpdate();
      } else {
        // Web Share API非対応の場合はダウンロード
        const a = document.createElement('a');
        a.href = imageUrl;
        a.download = `receipt_${receipt.id}.jpg`;
        a.click();
      }
    } catch (err) {
      // ユーザーが共有をキャンセルした場合は何もしない
      if ((err as Error).name !== 'AbortError') {
        console.error('共有に失敗:', err);
      }
    }
  }, [receipt, memo, imageUrl, onUpdate]);

  const handleStatusToggle = useCallback(async () => {
    if (!receipt.id) return;
    const newStatus = status === 'unsent' ? 'sent' : 'unsent';
    await updateReceiptStatus(receipt.id, newStatus);
    setStatus(newStatus);
    onUpdate();
  }, [receipt.id, status, onUpdate]);

  const handleMemoSave = useCallback(async () => {
    if (!receipt.id) return;
    await updateReceiptMemo(receipt.id, memo);
    onUpdate();
  }, [receipt.id, memo, onUpdate]);

  const handleDelete = useCallback(async () => {
    if (!receipt.id) return;
    setIsDeleting(true);
    try {
      await deleteReceipt(receipt.id);
      onUpdate();
      onClose();
    } catch (err) {
      console.error('削除に失敗:', err);
      setIsDeleting(false);
    }
  }, [receipt.id, onUpdate, onClose]);

  const formatDate = (date: Date) => {
    const d = new Date(date);
    return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <div className="receipt-detail-overlay" onClick={onClose}>
      <div
        className="receipt-detail"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="detail-header">
          <button
            className="detail-back-button"
            onClick={onClose}
            aria-label="戻る"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div className="detail-header-info">
            <span className="detail-date">
              {formatDate(receipt.createdAt)}
            </span>
            <span className={`status-badge ${status}`}>
              {status === 'unsent' ? '未送信' : '送信済み'}
            </span>
          </div>
        </div>

        {/* 画像 */}
        <div className="detail-image-container">
          {imageUrl && (
            <img
              src={imageUrl}
              alt="領収書"
              className="detail-image"
            />
          )}
        </div>

        {/* メモ */}
        <div className="detail-memo">
          <label className="memo-label" htmlFor="receipt-memo">メモ</label>
          <div className="memo-input-group">
            <input
              id="receipt-memo"
              type="text"
              className="memo-input"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              onBlur={handleMemoSave}
              placeholder="メモを入力..."
            />
          </div>
        </div>

        {/* アクションボタン */}
        <div className="detail-actions">
          <button
            className="action-button share-button"
            onClick={handleShare}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
            LINEで送信
          </button>

          <button
            className={`action-button status-toggle-button ${status}`}
            onClick={handleStatusToggle}
          >
            {status === 'unsent' ? (
              <>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                送信済みにする
              </>
            ) : (
              <>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                </svg>
                未送信に戻す
              </>
            )}
          </button>

          {showDeleteConfirm ? (
            <div className="delete-confirm">
              <span>本当に削除しますか？</span>
              <button
                className="action-button delete-yes"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? '削除中...' : '削除する'}
              </button>
              <button
                className="action-button delete-no"
                onClick={() => setShowDeleteConfirm(false)}
              >
                キャンセル
              </button>
            </div>
          ) : (
            <button
              className="action-button delete-button"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              削除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
