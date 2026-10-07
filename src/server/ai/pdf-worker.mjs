// Executed in a disposable, memory/time-bounded subprocess; no output of parser logs.
import { getDocumentProxy } from "unpdf";
console.log = console.warn = console.error = () => {};
try {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > 20 * 1048576) throw new Error();
    chunks.push(chunk);
  }
  const pdf = await getDocumentProxy(new Uint8Array(Buffer.concat(chunks)), {
    verbosity: 0,
    isEvalSupported: false,
    useSystemFonts: false,
  });
  if (pdf.numPages > 30) {
    process.stdout.write(JSON.stringify({ error: "too_large" }));
    await pdf.loadingTask.destroy();
    process.exit(0);
  }
  let text = "";
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    text +=
      content.items
        .map((item) =>
          "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
        )
        .join("") + "\n";
    page.cleanup();
    if (text.length > 18000) {
      process.stdout.write(JSON.stringify({ error: "too_large" }));
      await pdf.loadingTask.destroy();
      process.exit(0);
    }
  }
  await pdf.loadingTask.destroy();
  process.stdout.write(JSON.stringify({ text }));
} catch {
  process.stdout.write(JSON.stringify({ error: "unreadable" }));
}
