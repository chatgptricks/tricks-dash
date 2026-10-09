import { readFile, writeFile } from 'node:fs/promises';

// Fixed file selection prevents local .env secrets from entering this public
// download. Store ZIP entries with a fixed timestamp so builds are repeatable.
const files = ['.env.example', '.gitignore', 'README.md', 'README.en.md', 'client.js', 'index.html', 'server.mjs', 'server.test.mjs', 'styles.css'];
const root = new URL('../', import.meta.url);
const localEntries = [];
const centralEntries = [];
let offset = 0;

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

for (const filename of files) {
  const bytes = await readFile(new URL(`examples/media-kit/${filename}`, root));
  const name = Buffer.from(`media-kit-example/${filename}`);
  const crc = crc32(bytes);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x21, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(bytes.length, 18);
  local.writeUInt32LE(bytes.length, 22);
  local.writeUInt16LE(name.length, 26);
  localEntries.push(local, name, bytes);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x21, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(bytes.length, 20);
  central.writeUInt32LE(bytes.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  centralEntries.push(central, name);
  offset += local.length + name.length + bytes.length;
}

const directory = Buffer.concat(centralEntries);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);
await writeFile(new URL('public/media-kit-example.zip', root), Buffer.concat([...localEntries, directory, end]));
console.log(`Packaged ${files.length} website example files without local secrets.`);
