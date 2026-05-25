export async function readStdin() {
  let text = '';
  process.stdin.setEncoding('utf-8');
  for await (const chunk of process.stdin) {
    text += chunk;
  }
  return text;
}

export async function readStdinJson({ emptyValue = {} } = {}) {
  const text = (await readStdin()).trim();
  if (!text) return emptyValue;
  try {
    return JSON.parse(text);
  } catch (err) {
    err.message = `invalid hook JSON on stdin: ${err.message}`;
    throw err;
  }
}
