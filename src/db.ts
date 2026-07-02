import Dexie, { type Table } from 'dexie';

export interface Receipt {
  id?: number;
  image: Blob;
  thumbnail: Blob;
  createdAt: Date;
  status: 'unsent' | 'sent';
  memo: string;
}

class ReceiptDB extends Dexie {
  receipts!: Table<Receipt>;

  constructor() {
    super('ReceiptCameraDB');
    this.version(1).stores({
      receipts: '++id, createdAt, status',
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
  await db.receipts.update(id, { status });
}

/**
 * 領収書のメモを更新する
 */
export async function updateReceiptMemo(
  id: number,
  memo: string
): Promise<void> {
  await db.receipts.update(id, { memo });
}

/**
 * 領収書を削除する
 */
export async function deleteReceipt(id: number): Promise<void> {
  await db.receipts.delete(id);
}
