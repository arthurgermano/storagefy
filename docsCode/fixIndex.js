import fs from 'fs';
import path from 'path';

const htmlPath = path.resolve('./dist/index.html');

if (!fs.existsSync(htmlPath)) {
  console.error('HTML file not found');
  process.exit(1);
}

let html = fs.readFileSync(htmlPath, 'utf-8');

html = html
  .replace(/(href=["'])\/favicon\.svg/g, '$1/storagefy/favicon.svg')
  .replace(/(src=["'])\/(_astro|assets)/g, '$1/storagefy/$2');

fs.writeFileSync(htmlPath, html);
console.log('HTML paths updated successfully');