import Dexie, { type Table } from 'dexie';

export interface Receipt {
  id?: number;
  image: Blob;
  thumbnail: Blob;
  createdAt: Date;
  status: 'unsent' | 'sent';
  saved: boolean;
  memo: string;
}

class ReceiptDB extends Dexie {
  receipts!: Table<Receipt>;

  constructor() {
    super('ReceiptCameraDB');
    this.version(1).stores({
      receipts: '++id, createdAt, status',
    });
    this.version(2).stores({
      receipts: '++id, createdAt, status, saved',
    }).upgrade((tx) => {
      return tx.table('receipts').toCollection().modify((receipt) => {
        if (receipt.saved === undefined) {
          receipt.saved = false;
        }
      });
    });
    this.version(3).stores({
      receipts: '++id, createdAt, status, saved',
    });
  }
}

export const db = new ReceiptDB();

/**
 * 画像Blobからサムネイルを生成する
 */
export async function createThumbnail(
  imageBlob: Blob,
  maxSize = 200
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(imageBlob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const ratio = Math.min(maxSize / img.width, maxSize / img.height);
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Thumbnail generation failed'));
        },
        'image/jpeg',
        0.7
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image load failed'));
    };
    img.src = url;
  });
}

/**
 * 領収書を保存する
 */
export async function saveReceipt(imageBlob: Blob): Promise<number> {
  const thumbnail = await createThumbnail(imageBlob);
  const id = await db.receipts.add({
    image: imageBlob,
    thumbnail,
    createdAt: new Date(),
    status: 'unsent',
    saved: false,
    memo: '',
  });
  return id as number;
}

/**
 * 領収書のステータスを更新する
 */
export async function updateReceiptStatus(
  id: number,
  status: 'unsent' | 'sent'
): Promise<void> {
  await updateReceiptFields([id], { status });
}

/**
 * 領収書のメモを更新する
 */
export async function updateReceiptMemo(
  id: number,
  memo: string
): Promise<void> {
  await updateReceiptFields([id], { memo });
}

/**
 * Safari/WebKitでは、IndexedDBから読み出したBlobを含むレコードを
 * update()で直接書き戻すとBlobハンドルが壊れることがある。メタ情報の
 * 更新時も画像を実バイト列から再構築して保存し、撮影画像を保全する。
 */
async function updateReceiptFields(
  ids: number[],
  changes: Partial<Omit<Receipt, 'id' | 'image' | 'thumbnail'>>
): Promise<void> {
  const prepared: Receipt[] = [];
  for (const id of ids) {
    const receipt = await db.receipts.get(id);
    if (!receipt) continue;

    const [imageBuffer, thumbnailBuffer] = await Promise.all([
      receipt.image.arrayBuffer(),
      receipt.thumbnail.arrayBuffer(),
    ]);
    prepared.push({
      ...receipt,
      ...changes,
      image: new Blob([imageBuffer], { type: receipt.image.type }),
      thumbnail: new Blob([thumbnailBuffer], { type: receipt.thumbnail.type }),
    });
  }

  await db.transaction('rw', db.receipts, async () => {
    for (const receipt of prepared) {
      await db.receipts.put(receipt);
    }
  });
}

/**
 * 領収書の保存状態を更新する
 */
export async function updateReceiptSaved(
  id: number,
  saved: boolean
): Promise<void> {
  await updateReceiptFields([id], { saved });
}

/**
 * 領収書を削除する
 */
export async function deleteReceipt(id: number): Promise<void> {
  await db.receipts.delete(id);
}

/**
 * 領収書を一括削除する
 */
export async function deleteReceipts(ids: number[]): Promise<void> {
  await db.receipts.bulkDelete(ids);
}
