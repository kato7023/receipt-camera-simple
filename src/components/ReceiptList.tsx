import { useState, useEffect, useCallback } from 'react';
import { db, type Receipt } from '../db';

interface ReceiptListProps {
  onSelect: (receipt: Receipt) => void;
  refreshKey: number;
}

type FilterType = 'all' | 'unsent' | 'sent';

export default function ReceiptList({ onSelect, refreshKey }: ReceiptListProps) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [thumbnailUrls, setThumbnailUrls] = useState<Map<number, string>>(
    new Map()
  );

  const loadReceipts = useCallback(async () => {
    let query = db.receipts.orderBy('createdAt').reverse();
    const allReceipts = await query.toArray();
    const filtered =
      filter === 'all'
        ? allReceipts
        : allReceipts.filter((r) => r.status === filter);
    setReceipts(filtered);

    // サムネイルURLを生成
    const urls = new Map<number, string>();
    for (const receipt of filtered) {
      if (receipt.id !== undefined) {
        const url = URL.createObjectURL(receipt.thumbnail);
        urls.set(receipt.id, url);
      }
    }
    // 前回のURLをクリーンアップ
    setThumbnailUrls((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return urls;
    });
  }, [filter]);

  useEffect(() => {
    loadReceipts();
  }, [loadReceipts, refreshKey]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      thumbnailUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const formatDate = (date: Date) => {
    const d = new Date(date);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${month}/${day} ${hours}:${minutes}`;
  };

  const unsentCount = receipts.filter((r) => r.status === 'unsent').length;
  const sentCount = receipts.filter((r) => r.status === 'sent').length;

  return (
    <div className="receipt-list">
      {/* フィルタータブ */}
      <div className="filter-tabs">
        <button
          className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          すべて
          <span className="filter-count">{receipts.length}</span>
        </button>
        <button
          className={`filter-tab ${filter === 'unsent' ? 'active' : ''}`}
          onClick={() => setFilter('unsent')}
        >
          未送信
          <span className="filter-count unsent">{unsentCount}</span>
        </button>
        <button
          className={`filter-tab ${filter === 'sent' ? 'active' : ''}`}
          onClick={() => setFilter('sent')}
        >
          送信済み
          <span className="filter-count sent">{sentCount}</span>
        </button>
      </div>

      {/* 領収書グリッド */}
      {receipts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
          <p className="empty-text">
            {filter === 'all'
              ? '領収書がまだありません'
              : filter === 'unsent'
                ? '未送信の領収書はありません'
                : '送信済みの領収書はありません'}
          </p>
          <p className="empty-hint">カメラタブから撮影してください</p>
        </div>
      ) : (
        <div className="receipt-grid">
          {receipts.map((receipt) => (
            <button
              key={receipt.id}
              className="receipt-card"
              onClick={() => onSelect(receipt)}
            >
              <div className="receipt-card-image">
                <img
                  src={thumbnailUrls.get(receipt.id!) || ''}
                  alt={`領収書 ${receipt.id}`}
                  loading="lazy"
                />
                <span
                  className={`status-badge ${receipt.status}`}
                >
                  {receipt.status === 'unsent' ? '未送信' : '送信済み'}
                </span>
              </div>
              <div className="receipt-card-info">
                <span className="receipt-date">
                  {formatDate(receipt.createdAt)}
                </span>
                {receipt.memo && (
                  <span className="receipt-memo-preview">
                    {receipt.memo}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
