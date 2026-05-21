import JSZip from 'jszip';

interface ManifestFile {
  src: string;
  dest: string;
}

interface Manifest {
  cursor: ManifestFile[];
  claude: ManifestFile[];
  codex: ManifestFile[];
}

export async function downloadAIConfigs(
  platforms: string[],
  baseUrl: string,
): Promise<void> {
  const manifestRes = await fetch(`${baseUrl}ai/manifest.json`);
  if (!manifestRes.ok) throw new Error('Failed to load manifest');
  const manifest: Manifest = await manifestRes.json();

  const filesToInclude: ManifestFile[] = [];
  for (const platform of platforms) {
    const files = manifest[platform as keyof Manifest];
    if (files) filesToInclude.push(...files);
  }

  if (filesToInclude.length === 0) return;

  const zip = new JSZip();
  const fetchPromises = filesToInclude.map(async (file) => {
    const res = await fetch(`${baseUrl}ai/${file.src}`);
    if (!res.ok) return;
    const content = await res.text();
    zip.file(file.dest, content);
  });
  await Promise.all(fetchPromises);

  const blob = await zip.generateAsync({type: 'blob', compression: 'DEFLATE'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rhino-ai-${platforms.join('-')}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
