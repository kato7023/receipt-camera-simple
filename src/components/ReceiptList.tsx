import { useState, useEffect, useCallback, useRef } from 'react';
import { cloneBlob, db, updateReceiptGroupComment, updateReceiptStatus, updateReceiptSaved, deleteReceipts, type Receipt } from '../db';

interface ReceiptListProps {
  onSelect: (receipt: Receipt) => void;
  refreshKey: number;
}

type FilterType = 'unsent' | 'unsaved' | 'sent' | 'all';

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[\s　]/g, '');
}

export default function ReceiptList({ onSelect, refreshKey }: ReceiptListProps) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [allReceipts, setAllReceipts] = useState<Receipt[]>([]);
  const [filter, setFilter] = useState<FilterType>('unsent');
  const [searchText, setSearchText] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [groupCommentFilter, setGroupCommentFilter] = useState<string[]>([]);
  const [includeUngrouped, setIncludeUngrouped] = useState(false);
  const [thumbnailUrls, setThumbnailUrls] = useState<Map<number, string>>(
    new Map()
  );
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchComment, setBatchComment] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const loadSequence = useRef(0);

  const loadReceipts = useCallback(async () => {
    const sequence = ++loadSequence.current;
    const query = db.receipts.orderBy('createdAt').reverse();
    const all = await query.toArray();
    if (sequence !== loadSequence.current) return;
    setAllReceipts(all);

    let filtered: Receipt[];
    switch (filter) {
      case 'unsent':
        filtered = all.filter((r) => r.status === 'unsent');
        break;
      case 'unsaved':
        filtered = all.filter((r) => !r.saved);
        break;
      case 'sent':
        filtered = all.filter((r) => r.status === 'sent');
        break;
      default:
        filtered = all;
    }

    const search = normalizeSearch(searchText);
    if (search) {
      filtered = filtered.filter((receipt) => {
        const searchable = normalizeSearch([
          receipt.memo,
          receipt.groupComment,
          receipt.status === 'unsent' ? '未送信' : '送信済',
          receipt.saved ? '保存済' : '未保存',
          new Date(receipt.createdAt).toLocaleDateString('ja-JP'),
        ].join(' '));
        return searchable.includes(search);
      });
    }
    if (groupCommentFilter.length > 0 || includeUngrouped) {
      filtered = filtered.filter((receipt) => (
        receipt.groupComment
          ? groupCommentFilter.includes(receipt.groupComment)
          : includeUngrouped
      ));
    }
    setReceipts(filtered);

    // サムネイルURLを生成
    const urls = new Map<number, string>();
    for (const receipt of filtered) {
      if (receipt.id !== undefined) {
        const thumbnail = await cloneBlob(receipt.thumbnail);
        const url = URL.createObjectURL(thumbnail);
        urls.set(receipt.id, url);
      }
    }
    setThumbnailUrls((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return urls;
    });
  }, [filter, groupCommentFilter, includeUngrouped, searchText]);

  useEffect(() => {
    loadReceipts();
  }, [loadReceipts, refreshKey]);

  useEffect(() => {
    return () => {
      thumbnailUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [thumbnailUrls]);

  useEffect(() => {
    setSelectedIds(new Set());
    setShowDeleteConfirm(false);
  }, [filter, groupCommentFilter, includeUngrouped, searchText]);

  // 選択モードを切り替え
  const toggleSelectMode = () => {
    if (selectMode) {
      setSelectedIds(new Set());
      setBatchComment('');
      setShowDeleteConfirm(false);
    }
    setSelectMode(!selectMode);
  };

  // 個別の選択切り替え
  const toggleSelection = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setShowDeleteConfirm(false);
  };

  // 表示中の全件を選択
  const selectAll = () => {
    const ids = receipts
      .filter((r) => r.id !== undefined)
      .map((r) => r.id as number);
    setSelectedIds(new Set(ids));
  };

  // まとめてLINE送信
  const handleBatchShare = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setIsSharing(true);

    try {
      const selectedReceipts = receipts.filter(
        (r) => r.id !== undefined && selectedIds.has(r.id)
      );

      const files: File[] = selectedReceipts.map(
        (r, i) =>
          new File([r.image], `receipt_${r.id || i}.jpg`, {
            type: r.image.type || 'image/jpeg',
          })
      );

      const memoText = selectedReceipts
        .map((receipt) => `領収書メモ：${receipt.memo || ''}`)
        .join('\n');
      const text = [
        `領収書 ${files.length}枚を送信します。`,
        batchComment.trim(),
        memoText,
      ].filter(Boolean).join('\n');

      if (navigator.share && navigator.canShare({ files })) {
        await navigator.share({
          title: `領収書 ${files.length}枚`,
          text,
          files,
        });

        for (const id of selectedIds) {
          await updateReceiptStatus(id, 'sent');
        }
        if (batchComment.trim()) {
          await updateReceiptGroupComment(Array.from(selectedIds), batchComment.trim());
        }
        setSelectedIds(new Set());
        setBatchComment('');
        setSelectMode(false);
        loadReceipts();
      } else {
        alert('このブラウザでは複数ファイルの共有に対応していません');
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('共有に失敗:', err);
      }
    } finally {
      setIsSharing(false);
    }
  }, [batchComment, selectedIds, receipts, loadReceipts]);

  // カメラロールに保存（Web Share API経由）
  const handleSaveToPhotos = useCallback(async () => {
    if (selectedIds.size === 0) return;

    const selectedReceipts = receipts.filter(
      (r) => r.id !== undefined && selectedIds.has(r.id)
    );

    const files: File[] = selectedReceipts.map(
      (r) =>
        new File([r.image], `receipt_${r.id}.jpg`, {
          type: r.image.type || 'image/jpeg',
        })
    );

    try {
      if (navigator.share && navigator.canShare({ files })) {
        await navigator.share({
          title: `領収書 ${files.length}枚を保存`,
          files,
        });

        // 共有シートが正常に完了 → 保存済みにマーク
        for (const id of selectedIds) {
          await updateReceiptSaved(id, true);
        }
        setSelectedIds(new Set());
        setSelectMode(false);
        loadReceipts();
      } else {
        alert('このブラウザではファイルの共有に対応していません');
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('保存に失敗:', err);
      }
    }
  }, [selectedIds, receipts, loadReceipts]);

  // 一括削除
  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    await deleteReceipts(Array.from(selectedIds));
    setSelectedIds(new Set());
    setBatchComment('');
    setSelectMode(false);
    setShowDeleteConfirm(false);
    loadReceipts();
  }, [selectedIds, loadReceipts]);

  const formatDate = (date: Date) => {
    const d = new Date(date);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${month}/${day} ${hours}:${minutes}`;
  };

  const groupComments = Array.from(
    new Set(allReceipts.map((receipt) => receipt.groupComment).filter(Boolean))
  ).sort();
  const hasAdvancedFilter = groupCommentFilter.length > 0 || includeUngrouped;
  const clearAdvancedFilters = () => {
    setGroupCommentFilter([]);
    setIncludeUngrouped(false);
  };

  // カウント（全データから）
  const unsentCount = allReceipts.filter((r) => r.status === 'unsent').length;
  const unsavedCount = allReceipts.filter((r) => !r.saved).length;
  const sentCount = allReceipts.filter((r) => r.status === 'sent').length;

  return (
    <div className="receipt-list">
      {/* ヘッダーアクション */}
      <div className="list-header">
        <button
          className={`select-mode-button ${selectMode ? 'active' : ''}`}
          onClick={toggleSelectMode}
        >
          {selectMode ? '完了' : '選択'}
        </button>
        {selectMode && (
          <button
            className="select-all-button"
            onClick={selectAll}
          >
            全選択
          </button>
        )}
      </div>

      {/* 検索・絞り込み */}
      <div className="list-search-row">
        <div className="list-search-input-wrap">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" />
          </svg>
          <input
            type="search"
            className="list-search-input"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="領収書を検索"
            aria-label="領収書を検索"
          />
          {searchText && (
            <button className="list-search-clear" onClick={() => setSearchText('')} aria-label="検索をクリア">×</button>
          )}
        </div>
        <button
          className={`list-filter-button ${showAdvancedFilters || hasAdvancedFilter ? 'active' : ''}`}
          onClick={() => setShowAdvancedFilters((value) => !value)}
        >
          絞り込み
        </button>
      </div>

      {(searchText || hasAdvancedFilter) && (
        <div className="active-filter-chips">
          {searchText && (
            <span className="active-filter-chip">
              検索: {searchText}
              <button onClick={() => setSearchText('')} aria-label="検索条件を削除">×</button>
            </span>
          )}
          {groupCommentFilter.length > 0 && (
            <span className="active-filter-chip">
              全体コメント: {groupCommentFilter.join('・')}
              <button onClick={() => setGroupCommentFilter([])} aria-label="全体コメント条件を削除">×</button>
            </span>
          )}
          {includeUngrouped && (
            <span className="active-filter-chip">
              全体コメントなし
              <button onClick={() => setIncludeUngrouped(false)} aria-label="未設定条件を削除">×</button>
            </span>
          )}
          <button className="clear-filters-button" onClick={() => { setSearchText(''); clearAdvancedFilters(); }}>すべて解除</button>
        </div>
      )}

      {showAdvancedFilters && (
        <div className="advanced-filter-panel">
          <label>
            全体コメント（複数選択）
            <select multiple value={groupCommentFilter} onChange={(e) => setGroupCommentFilter(Array.from(e.target.selectedOptions, (option) => option.value))}>
              {groupComments.map((comment) => <option key={comment} value={comment}>{comment}</option>)}
            </select>
            <span className="filter-checkbox">
              <input type="checkbox" checked={includeUngrouped} onChange={(e) => setIncludeUngrouped(e.target.checked)} />
              全体コメントなしを含む
            </span>
          </label>
        </div>
      )}

      {/* フィルタータブ */}
      <div className="filter-tabs">
        <button
          className={`filter-tab ${filter === 'unsent' ? 'active' : ''}`}
          onClick={() => setFilter('unsent')}
        >
          未送信
          <span className="filter-count unsent">{unsentCount}</span>
        </button>
        <button
          className={`filter-tab ${filter === 'unsaved' ? 'active' : ''}`}
          onClick={() => setFilter('unsaved')}
        >
          未保存
          <span className="filter-count unsaved">{unsavedCount}</span>
        </button>
        <button
          className={`filter-tab ${filter === 'sent' ? 'active' : ''}`}
          onClick={() => setFilter('sent')}
        >
          送信済
          <span className="filter-count sent">{sentCount}</span>
        </button>
        <button
          className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          すべて
          <span className="filter-count">{allReceipts.length}</span>
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
                : filter === 'unsaved'
                  ? '未保存の領収書はありません'
                  : '送信済みの領収書はありません'}
          </p>
          <p className="empty-hint">カメラタブから撮影してください</p>
        </div>
      ) : (
        <div className="receipt-grid">
          {receipts.map((receipt) => (
            <button
              key={receipt.id}
              className={`receipt-card ${selectMode && selectedIds.has(receipt.id!) ? 'selected' : ''}`}
              onClick={() => {
                if (selectMode) {
                  toggleSelection(receipt.id!);
                } else {
                  onSelect(receipt);
                }
              }}
            >
              <div className="receipt-card-image">
                <img
                  src={thumbnailUrls.get(receipt.id!) || ''}
                  alt={`領収書 ${receipt.id}`}
                  loading="lazy"
                />
                {selectMode ? (
                  <span
                    className={`select-checkbox ${selectedIds.has(receipt.id!) ? 'checked' : ''}`}
                  >
                    {selectedIds.has(receipt.id!) && '✓'}
                  </span>
                ) : (
                  <div className="card-badges">
                    <span className={`status-badge ${receipt.status}`}>
                      {receipt.status === 'unsent' ? '未送信' : '送信済'}
                    </span>
                    {!receipt.saved && (
                      <span className="status-badge unsaved">未保存</span>
                    )}
                  </div>
                )}
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
                {receipt.groupComment && (
                  <span className="receipt-group-comment-preview">
                    {receipt.groupComment}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 一括アクションバー */}
      {selectMode && selectedIds.size > 0 && (
        <div className="batch-action-bar">
          <span className="batch-count">{selectedIds.size}枚 選択中</span>
          <textarea
            className="batch-comment-input"
            value={batchComment}
            onChange={(e) => setBatchComment(e.target.value)}
            placeholder="全体コメントを入力..."
            rows={2}
          />
          <div className="batch-buttons">
            {showDeleteConfirm ? (
              <>
                <button
                  className="batch-button delete-confirm-button"
                  onClick={handleBatchDelete}
                >
                  削除する
                </button>
                <button
                  className="batch-button cancel-button"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  取消
                </button>
              </>
            ) : (
              <>
                <button
                  className="batch-button delete-button"
                  onClick={() => setShowDeleteConfirm(true)}
                  title="削除"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
                <button
                  className="batch-button save-button"
                  onClick={handleSaveToPhotos}
                  title="カメラロールに保存"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  保存
                </button>
                <button
                  className="batch-button share-button"
                  onClick={handleBatchShare}
                  disabled={isSharing}
                >
                  {isSharing ? (
                    <div className="shutter-spinner small" />
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                      <polyline points="16 6 12 2 8 6" />
                      <line x1="12" y1="2" x2="12" y2="15" />
                    </svg>
                  )}
                  LINE送信
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
