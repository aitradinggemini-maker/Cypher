import fs from 'fs';
import path from 'path';
import https from 'https';

// Directories
const publicDir = path.resolve('./public');
const tesseractDir = path.resolve('./public/tesseract');

console.log('Starting offline resources setup...');

// Ensure directories exist
fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(tesseractDir, { recursive: true });

// 1. Copy Argon2 WebAssembly files
const argon2SrcDir = path.resolve('./node_modules/argon2-browser/dist');
const argon2Files = ['argon2.wasm', 'argon2-simd.wasm'];

argon2Files.forEach(subFile => {
  const src = path.join(argon2SrcDir, subFile);
  const dest = path.join(publicDir, subFile);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied Argon2 file: ${subFile} to public root.`);
  } else {
    console.warn(`Argon2 source not found: ${src}`);
  }
});

// 2. Copy Tesseract.js worker and core files
const tesseractJsSrc = path.resolve('./node_modules/tesseract.js/dist/worker.min.js');
const tesseractCoreDir = path.resolve('./node_modules/tesseract.js-core');

if (fs.existsSync(tesseractJsSrc)) {
  fs.copyFileSync(tesseractJsSrc, path.join(tesseractDir, 'worker.min.js'));
  console.log('Copied Tesseract worker.min.js');
} else {
  console.warn('Tesseract worker source not found.');
}

// Copy LSTM WebAssembly wrapping files
const tesseractCoreFiles = [
  'tesseract-core-lstm.js',
  'tesseract-core-lstm.wasm',
  'tesseract-core-lstm.wasm.js',
  'tesseract-core.js',
  'tesseract-core.wasm'
];

tesseractCoreFiles.forEach(file => {
  const src = path.join(tesseractCoreDir, file);
  const dest = path.join(tesseractDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied Tesseract Core: ${file}`);
  }
});

// 3. Download eng.traineddata and eng.traineddata.gz for local OCR execution
const downloadFile = (url, destPath) => {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Handle redirect
        downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download: status ${res.statusCode}`));
        return;
      }
      const stream = fs.createWriteStream(destPath);
      res.pipe(stream);
      stream.on('finish', () => {
        stream.close();
        console.log(`Successfully downloaded: ${path.basename(destPath)}`);
        resolve();
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
};

const trainDataGzUrl = 'https://tessdata.projectnaptha.com/4.0.0_fast/eng.traineddata.gz';
const trainDataUrl = 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata';

const setupTrainData = async () => {
  try {
    const gzDest = path.join(tesseractDir, 'eng.traineddata.gz');
    console.log(`Downloading English language model from ${trainDataGzUrl}...`);
    await downloadFile(trainDataGzUrl, gzDest);
  } catch (error) {
    console.warn('Gzipped training data download failed, trying raw training data instead...', error.message);
    try {
      const dest = path.join(tesseractDir, 'eng.traineddata');
      await downloadFile(trainDataUrl, dest);
    } catch (fallbackError) {
      console.error('Failed to download training language models!', fallbackError.message);
    }
  }
};

setupTrainData().then(() => {
  console.log('Offline resources setup complete.');
});
