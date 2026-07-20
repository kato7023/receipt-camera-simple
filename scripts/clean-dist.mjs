import { lstat, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputName = process.argv[2] ?? 'dist';
const outputPath = path.resolve(projectRoot, outputName);
const relativeOutputPath = path.relative(projectRoot, outputPath);

// プロジェクト外・プロジェクト全体・絶対パスは削除対象にしない。
if (
  !outputName ||
  path.isAbsolute(outputName) ||
  !relativeOutputPath ||
  relativeOutputPath === '..' ||
  relativeOutputPath.startsWith(`..${path.sep}`)
) {
  throw new Error(`安全確認に失敗しました。プロジェクト内の相対パスを指定してください: ${outputName}`);
}

try {
  const info = await lstat(outputPath);
  if (info.isSymbolicLink()) {
    throw new Error(`${outputName}がシンボリックリンクのため削除を中止しました。`);
  }

  await rm(outputPath, { recursive: true, force: true });
  console.log(`ビルド成果物を削除しました: ${outputPath}`);
} catch (error) {
  if (error?.code === 'ENOENT') {
    console.log('削除対象のdistはありません。');
  } else {
    console.error(`distの削除に失敗しました: ${error.message}`);
    process.exitCode = 1;
  }
}
